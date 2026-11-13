/**
 * Gemini failover tests against a FAKE Gemini server (no real API calls, no database).
 *
 * Checks the §10.3 policy:
 *   - 429 → the key rests, next key
 *   - 5xx → one retry on the same key, then next key
 *   - invalid output (schema / aspect) → one regeneration on the same key
 *   - 404 model not found → skip the model on ALL keys, try the fallback model
 *   - everything failing → AiStepFailedError (the caller keeps the draft)
 *   - embeddings are re-normalised to length 1
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

// ─────────────────────────────────────────────────────────────
//  Fake Gemini server — behaviour is chosen per key and per model
// ─────────────────────────────────────────────────────────────

const calls = [];
let behaviour = () => ({ status: 500, body: { error: { message: 'not configured' } } });

const server = http.createServer((req, res) => {
	let raw = '';

	req.on('data', (chunk) => (raw += chunk));

	req.on('end', () => {
		const key = req.headers['x-goog-api-key'];
		const model = decodeURIComponent(req.url.split('/models/')[1]?.split(':')[0] ?? '');

		calls.push({ key, model, url: req.url });

		const { status, body } = behaviour({
			key,
			model,
			url: req.url,
			body: raw ? JSON.parse(raw) : null,
		});

		res.writeHead(status, { 'content-type': 'application/json' });
		res.end(JSON.stringify(body));
	});
});

const gemini = (object) => ({
	status: 200,
	body: {
		candidates: [
			{ content: { parts: [{ text: JSON.stringify(object) }] }, finishReason: 'STOP' },
		],
	},
});

const GOOD_FOLLOWUPS = {
	questions: [
		{
			aspect: 'case',
			text: 'What kind of case does it have?',
			options: [
				{ code: 'clear_silicone', label: 'Clear' },
				{ code: 'rugged', label: 'Rugged' },
			],
		},
		{
			aspect: 'sticker',
			text: 'Where is the sticker?',
			options: [
				{ code: 'on_phone_back', label: 'Back' },
				{ code: 'near_camera', label: 'Near camera' },
			],
		},
		{
			aspect: 'crack',
			text: 'Is anything cracked?',
			options: [
				{ code: 'screen_corner', label: 'Screen corner' },
				{ code: 'back_glass', label: 'Back glass' },
			],
		},
	],
};

const ASPECTS = [
	{
		key: 'case',
		label: 'Case',
		values: [
			{ code: 'clear_silicone', label: 'x' },
			{ code: 'rugged', label: 'x' },
		],
	},
	{
		key: 'sticker',
		label: 'Sticker',
		values: [
			{ code: 'on_phone_back', label: 'x' },
			{ code: 'near_camera', label: 'x' },
		],
	},
	{
		key: 'crack',
		label: 'Crack',
		values: [
			{ code: 'screen_corner', label: 'x' },
			{ code: 'back_glass', label: 'x' },
		],
	},
	{
		key: 'wear',
		label: 'Wear',
		values: [
			{ code: 'scuffed_corners', label: 'x' },
			{ code: 'faded_case', label: 'x' },
		],
	},
];

let generateFollowups;
let embed;
let AiStepFailedError;
let classifyHttpError;

before(async () => {
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

	const port = server.address().port;

	Object.assign(process.env, {
		DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
		JWT_SECRET: 'test-jwt-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		NID_HMAC_KEY: 'test-nid-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
		GEMINI_BASE_URL: `http://127.0.0.1:${port}/v1beta`,
		GEMINI_API_KEY1: 'key-one',
		GEMINI_API_KEY2: 'key-two',
		GEMINI_API_KEY3: 'key-three',
		GEMINI_MODEL_FOLLOWUPS: 'retired-model,good-model',
		GEMINI_MODEL_EMBEDDING: 'embed-model',
		AI_TIMEOUT_MS: '3000',
		AI_STEP_DEADLINE_MS: '20000',
		NO_COLOR: '1',
	});

	({ generateFollowups } = await import('../src/modules/ai/followups.js'));
	({ embed } = await import('../src/modules/ai/embeddings.js'));
	({ AiStepFailedError, classifyHttpError } = await import('../src/modules/ai/aiErrors.js'));
});

after(() => server.close());

const input = {
	kind: 'found',
	categoryName: 'Phone',
	aspects: ASPECTS,
	answerSummary: 'Brand: Samsung',
	distinctiveMarks: '',
};

describe('embeddings', () => {
	test('768-dim vectors are re-normalised to length 1', async () => {
		behaviour = ({ body }) => ({
			status: 200,
			body: {
				embeddings: body.requests.map(() => ({
					values: Array.from({ length: 768 }, () => 3),
				})),
			},
		});

		// Runs FIRST: later tests deliberately leave every key resting.
		const { model, vectors } = await embed(['a sticker', 'a scratch']);

		assert.equal(model, 'embed-model');
		assert.equal(vectors.length, 2);

		const length = Math.sqrt(vectors[0].reduce((sum, value) => sum + value * value, 0));

		assert.ok(Math.abs(length - 1) < 1e-9);
	});
});

describe('Gemini failover', () => {
	test('404 model → fallback model; 429 → next key; 5xx retried then next key; bad output regenerated', async () => {
		const invalidOnce = new Set();

		behaviour = ({ key, model }) => {
			if (model === 'retired-model') {
				return { status: 404, body: { error: { code: 404, message: 'model not found' } } };
			}

			if (key === 'key-one') {
				return {
					status: 429,
					body: {
						error: {
							code: 429,
							details: [
								{
									'@type': 'type.googleapis.com/google.rpc.RetryInfo',
									retryDelay: '30s',
								},
							],
						},
					},
				};
			}

			if (key === 'key-two') {
				return { status: 503, body: { error: { code: 503, message: 'overloaded' } } };
			}

			// key three: first answer uses an aspect that is not in the list → must regenerate
			if (!invalidOnce.has(key)) {
				invalidOnce.add(key);

				return gemini({
					questions: [
						{ aspect: 'wallpaper', text: 'What wallpaper?', options: [] },
						...GOOD_FOLLOWUPS.questions,
					],
				});
			}

			return gemini(GOOD_FOLLOWUPS);
		};

		calls.length = 0;

		const result = await generateFollowups(input);

		assert.equal(result.model, 'good-model');
		assert.equal(result.slot, 3);
		assert.equal(result.questions.length, 3);

		const retired = calls.filter((call) => call.model === 'retired-model');
		assert.equal(
			retired.length,
			1,
			'a 404 model is skipped on all keys after the first answer',
		);

		const keyTwoCalls = calls.filter((call) => call.key === 'key-two');
		assert.equal(keyTwoCalls.length, 2, '5xx is retried once on the same key');

		const keyThreeCalls = calls.filter(
			(call) => call.key === 'key-three' && call.model === 'good-model',
		);
		assert.equal(keyThreeCalls.length, 2, 'invalid output is regenerated once');
	});

	test('a resting key (after 429) is skipped on the next call', async () => {
		behaviour = ({ model }) =>
			model === 'retired-model'
				? { status: 404, body: { error: { message: 'gone' } } }
				: gemini(GOOD_FOLLOWUPS);

		calls.length = 0;

		const result = await generateFollowups(input);

		assert.ok(
			!calls.some((call) => call.key === 'key-one'),
			'key #1 is still resting for 30 s',
		);
		assert.equal(result.slot, 2);
	});

	test('personal data in a question is rejected', async () => {
		behaviour = ({ model }) =>
			model === 'retired-model'
				? { status: 404, body: { error: { message: 'gone' } } }
				: gemini({
						questions: [
							{
								...GOOD_FOLLOWUPS.questions[0],
								text: "What is the owner's phone number?",
							},
							...GOOD_FOLLOWUPS.questions.slice(1),
						],
					});

		await assert.rejects(() => generateFollowups(input), AiStepFailedError);
	});

	test('everything failing → AiStepFailedError (the draft is kept)', async () => {
		behaviour = () => ({ status: 500, body: { error: { message: 'down' } } });

		await assert.rejects(() => generateFollowups(input), AiStepFailedError);
	});
});

describe('error classification', () => {
	test('daily quota vs per-minute rate limit', () => {
		const daily = classifyHttpError(429, {
			error: {
				details: [
					{
						'@type': 'type.googleapis.com/google.rpc.QuotaFailure',
						violations: [{ quotaId: 'GenerateRequestsPerDayPerProject' }],
					},
				],
			},
		});

		const minute = classifyHttpError(429, {
			error: {
				details: [
					{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' },
				],
			},
		});

		assert.equal(daily.kind, 'quota');
		assert.equal(minute.kind, 'rate_limit');
		assert.equal(minute.retryAfterMs, 7000);
	});

	test('invalid key → auth (disabled), not retried on other models', () => {
		const error = classifyHttpError(400, {
			error: {
				message: 'API key not valid. Please pass a valid API key.',
				details: [{ reason: 'API_KEY_INVALID' }],
			},
		});

		assert.equal(error.kind, 'auth');
	});
});
