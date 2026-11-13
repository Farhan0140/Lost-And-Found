/**
 * Thin wrapper around the Gemini REST API (no SDK — every request is visible here).
 *
 *   generateJson()  → generateContent with responseMimeType=application/json + JSON schema
 *   embedTexts()    → batchEmbedContents, 768 dimensions, re-normalised
 *   listModels()    → models the key can reach (used by scripts/list-models.js)
 *
 * Images are sent INLINE (base64) in the same request, never through the Files API:
 * a file uploaded with key #1 is invisible to key #2, which would break key rotation.
 */

import { config } from '../../config/env.js';
import { AiError, classifyHttpError } from './aiErrors.js';

const BASE_URL = config.ai.baseUrl;

export const EMBEDDING_DIMENSIONS = 768;

function modelPath(model) {
	return model.startsWith('models/') ? model : `models/${model}`;
}

// ─────────────────────────────────────────────────────────────
//  Low-level request
// ─────────────────────────────────────────────────────────────

async function request({ method = 'POST', path, key, body, timeoutMs }) {
	let response;

	try {
		response = await fetch(`${BASE_URL}/${path}`, {
			method,
			headers: {
				'content-type': 'application/json',
				'x-goog-api-key': key,
			},
			body: body ? JSON.stringify(body) : undefined,
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (error) {
		if (error.name === 'TimeoutError' || error.name === 'AbortError') {
			throw new AiError('timeout', `No answer within ${timeoutMs} ms`);
		}

		throw new AiError('network', error.cause?.code ?? error.message);
	}

	const text = await response.text();

	let json = null;

	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = null;
	}

	if (!response.ok) {
		throw classifyHttpError(response.status, json);
	}

	return json;
}

// ─────────────────────────────────────────────────────────────
//  Structured JSON generation
// ─────────────────────────────────────────────────────────────

/** JSON schema from zod has a "$schema" key Gemini does not need. */
function cleanSchema(schema) {
	const { $schema, ...rest } = schema;

	return rest;
}

const SAFETY_FINISH_REASONS = new Set([
	'SAFETY',
	'PROHIBITED_CONTENT',
	'BLOCKLIST',
	'SPII',
	'IMAGE_SAFETY',
	'RECITATION',
]);

/**
 * @param {object}   options
 * @param {string}   options.model
 * @param {string}   options.key
 * @param {string}   options.systemPrompt
 * @param {Array}    options.parts        [{ text }, { inlineData: { mimeType, data } }, …]
 * @param {object}   options.jsonSchema   JSON schema for the answer
 * @param {number}   options.temperature
 * @param {number}   options.timeoutMs
 * @returns {Promise<object>} the parsed JSON answer
 */
export async function generateJson({
	model,
	key,
	systemPrompt,
	parts,
	jsonSchema,
	temperature = 0.2,
	timeoutMs,
}) {
	const body = {
		systemInstruction: {
			parts: [{ text: systemPrompt }],
		},
		contents: [
			{
				role: 'user',
				parts,
			},
		],
		generationConfig: {
			temperature,
			responseMimeType: 'application/json',
			responseJsonSchema: cleanSchema(jsonSchema),
		},
	};

	const json = await request({
		path: `${modelPath(model)}:generateContent`,
		key,
		body,
		timeoutMs,
	});

	if (json?.promptFeedback?.blockReason) {
		throw new AiError('safety', `Prompt blocked: ${json.promptFeedback.blockReason}`);
	}

	const candidate = json?.candidates?.[0];

	if (!candidate) {
		throw new AiError('empty', 'No candidates in the answer');
	}

	if (SAFETY_FINISH_REASONS.has(candidate.finishReason)) {
		throw new AiError('safety', `Answer blocked: ${candidate.finishReason}`);
	}

	const text = (candidate.content?.parts ?? [])
		.map((part) => part.text ?? '')
		.join('')
		.trim();

	if (!text) {
		throw new AiError(
			'empty',
			`Empty answer (finishReason ${candidate.finishReason ?? 'none'})`,
		);
	}

	try {
		return JSON.parse(text);
	} catch {
		throw new AiError('invalid_output', 'The answer was not valid JSON');
	}
}

// ─────────────────────────────────────────────────────────────
//  Embeddings
// ─────────────────────────────────────────────────────────────

/**
 * gemini-embedding-001 only normalises its FULL 3072-dim output. When we ask for 768
 * dimensions we must normalise ourselves, otherwise cosine similarities are wrong.
 */
export function normalizeVector(vector) {
	const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

	if (length === 0) {
		return vector;
	}

	return vector.map((value) => value / length);
}

export async function embedTexts({ model, key, texts, timeoutMs }) {
	const json = await request({
		path: `${modelPath(model)}:batchEmbedContents`,
		key,
		timeoutMs,
		body: {
			requests: texts.map((text) => ({
				model: modelPath(model),
				content: { parts: [{ text }] },
				taskType: 'SEMANTIC_SIMILARITY',
				outputDimensionality: EMBEDDING_DIMENSIONS,
			})),
		},
	});

	const embeddings = json?.embeddings ?? [];

	if (embeddings.length !== texts.length) {
		throw new AiError('empty', `Expected ${texts.length} embeddings, got ${embeddings.length}`);
	}

	return embeddings.map((embedding) => {
		const values = embedding.values ?? [];

		if (values.length !== EMBEDDING_DIMENSIONS) {
			throw new AiError(
				'invalid_output',
				`Embedding has ${values.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
			);
		}

		return normalizeVector(values);
	});
}

// ─────────────────────────────────────────────────────────────
//  Model list
// ─────────────────────────────────────────────────────────────

export async function listModels({ key, timeoutMs = 15_000 }) {
	const models = [];

	let pageToken = '';

	do {
		const query = `models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`;

		const json = await request({ method: 'GET', path: query, key, timeoutMs });

		models.push(...(json?.models ?? []));
		pageToken = json?.nextPageToken ?? '';
	} while (pageToken);

	return models;
}
