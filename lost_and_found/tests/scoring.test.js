/**
 * The REQUIRED tests from §8.6 (non-negotiable), plus a few supporting ones.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { phoneAspects, phoneQuestions } from '../src/db/seed-data/questionSets/phone.js';
import { walletAspects, walletQuestions } from '../src/db/seed-data/questionSets/wallet.js';
import { toStudentMatchView } from '../src/modules/matching/matchView.js';
import { decideMatchStatus, evaluateReleaseRule } from '../src/modules/matching/releaseRule.js';
import {
	computeTemporalPlausibility,
	renormaliseWeights,
	scorePair,
	WEIGHTS,
} from '../src/modules/matching/scoring.js';
import { side, ZONES } from './helpers.js';

const PHONE = { id: 1, questions: phoneQuestions, aspects: phoneAspects };
const WALLET = { id: 2, questions: walletQuestions, aspects: walletAspects };

// ─────────────────────────────────────────────────────────────
//  Fixtures
// ─────────────────────────────────────────────────────────────

const phoneAnswers = {
	brand: 'Samsung',
	body_colour: ['navy'],
	case_type: ['clear_case'],
	case_colour: ['transparent'],
	screen_condition: ['cracked'],
	rear_cameras: ['three'],
	size: ['regular'],
	marks: ['sticker', 'scratches'],
	accessories: ['pop_socket'],
	back_material: ['glass'],
	distinctive_marks: 'Cartoon sticker inside the clear case',
};

const phoneFollowups = [
	['case', 'clear_silicone'],
	['sticker', 'inside_clear_case'],
	['crack', 'screen_corner'],
	['accessories', 'pop_socket'],
];

function phonePair({
	foundAnswers = {},
	lostAnswers = {},
	foundFollowups = phoneFollowups,
	lostFollowups = phoneFollowups,
	foundOn = '2026-11-10',
	lostOn = '2026-11-09',
	foundZone = ZONES.cseLab,
	lostZone = ZONES.cseLab,
} = {}) {
	return scorePair({
		questionSet: PHONE,
		found: side(PHONE, {
			answers: { ...phoneAnswers, ...foundAnswers },
			followups: foundFollowups,
			zone: foundZone,
			occurredOn: foundOn,
		}),
		lost: side(PHONE, {
			answers: { ...phoneAnswers, ...lostAnswers },
			followups: lostFollowups,
			zone: lostZone,
			occurredOn: lostOn,
		}),
	});
}

function statusFor(result, { eligible = 1 } = {}) {
	const rule = evaluateReleaseRule({
		score: result.score,
		foundStatus: 'stored',
		followups: result.followups,
		eligibleLostCount: eligible,
	});

	return decideMatchStatus(result.score, rule);
}

// ─────────────────────────────────────────────────────────────
//  §8.6 required tests
// ─────────────────────────────────────────────────────────────

describe('§8.6 required tests', () => {
	test('1. same object, colour worded differently ("navy" vs "dark blue") → MATCH', () => {
		const result = phonePair({
			foundAnswers: { body_colour: ['navy'] },
			lostAnswers: { body_colour: ['dark_blue'] },
		});

		const colour = result.rules.fields.find((field) => field.key === 'body_colour');

		assert.equal(
			colour.result,
			'agree',
			'navy and dark_blue must canonicalise to the same token',
		);
		assert.ok(result.score >= 0.85, `expected ≥ 0.85, got ${result.score}`);
		assert.equal(statusFor(result), 'auto_matched');
	});

	test('2. two black wallets differing on a discriminating field do NOT match', () => {
		const base = {
			brand: 'Unknown',
			main_colour: ['black'],
			material: ['leather'],
			style: ['bifold'],
			closure: ['no_closure'],
			size: ['small'],
			content_types: ['cash', 'cards'],
			condition: ['slightly_worn'],
			marks: ['none'],
		};

		const result = scorePair({
			questionSet: WALLET,
			found: side(WALLET, {
				answers: base,
				followups: [
					['stitching', 'contrast_colour'],
					['card_slots', 'four_to_six'],
					['coin_pocket', 'zip_coin_pocket'],
				],
				zone: ZONES.library,
				occurredOn: '2026-11-10',
			}),
			lost: side(WALLET, {
				answers: {
					...base,
					style: ['long_zip'],
					closure: ['zip'],
					marks: ['initials_engraved'],
				},
				followups: [
					['stitching', 'no_visible_stitching'],
					['card_slots', 'seven_plus'],
					['coin_pocket', 'zip_coin_pocket'],
				],
				zone: ZONES.library,
				occurredOn: '2026-11-10',
			}),
		});

		assert.ok(result.score < 0.85, `expected < 0.85, got ${result.score}`);
		assert.notEqual(statusFor(result), 'auto_matched');
	});

	test('3. found more than 1 day BEFORE lost → score exactly 0; exactly 1 day before → not 0', () => {
		const twoDaysBefore = phonePair({ foundOn: '2026-11-08', lostOn: '2026-11-10' });
		const oneDayBefore = phonePair({ foundOn: '2026-11-09', lostOn: '2026-11-10' });

		assert.equal(twoDaysBefore.score, 0);
		assert.equal(twoDaysBefore.gate, 'failed');

		assert.ok(oneDayBefore.score > 0);
		assert.equal(oneDayBefore.gate, 'passed');
	});

	test('4. with any terms dropped, the remaining weights sum to 1.0', () => {
		const names = Object.keys(WEIGHTS);

		// every subset except the empty one
		for (let mask = 1; mask < 2 ** names.length; mask++) {
			const terms = {};

			names.forEach((name, index) => {
				terms[name] = mask & (1 << index) ? 0.5 : null;
			});

			const applied = renormaliseWeights(terms);
			const total = Object.values(applied).reduce((sum, weight) => sum + weight, 0);

			assert.ok(Math.abs(total - 1) < 1e-9, `subset ${mask.toString(2)} sums to ${total}`);
		}

		// the spec's examples: drop cosine → ÷0.90, drop follow-ups → ÷0.85, both → ÷0.75
		const noCosine = renormaliseWeights({
			rules: 1,
			followups: 1,
			cosine: null,
			location: 1,
			temporal: 1,
		});
		assert.ok(Math.abs(noCosine.rules - 0.5 / 0.9) < 1e-9);

		const noFollowups = renormaliseWeights({
			rules: 1,
			followups: null,
			cosine: 1,
			location: 1,
			temporal: 1,
		});
		assert.ok(Math.abs(noFollowups.rules - 0.5 / 0.85) < 1e-9);

		const neither = renormaliseWeights({
			rules: 1,
			followups: null,
			cosine: null,
			location: 1,
			temporal: 1,
		});
		assert.ok(Math.abs(neither.rules - 0.5 / 0.75) < 1e-9);
	});

	test('5a. score ≥ 0.85 but fewer than 3 overlapping aspects → REVIEW, never auto', () => {
		const result = phonePair({
			foundFollowups: [
				['case', 'clear_silicone'],
				['sticker', 'inside_clear_case'],
			],
			lostFollowups: [
				['case', 'clear_silicone'],
				['sticker', 'inside_clear_case'],
			],
		});

		assert.ok(result.score >= 0.85, `setup: expected ≥ 0.85, got ${result.score}`);
		assert.equal(result.followups.overlapping, 2);
		assert.equal(statusFor(result), 'review');
	});

	test('5b. score ≥ 0.85 but a conflicting aspect → REVIEW, never auto', () => {
		const result = phonePair({
			lostFollowups: [
				['case', 'clear_silicone'],
				['sticker', 'inside_clear_case'],
				['crack', 'screen_corner'],
				['accessories', 'ring_holder'], // conflicts with pop_socket
			],
		});

		assert.ok(result.score >= 0.85, `setup: expected ≥ 0.85, got ${result.score}`);
		assert.equal(result.followups.conflict, 1);
		assert.equal(statusFor(result), 'review');
	});

	test('5c. several eligible lost reports for one item → REVIEW, never auto', () => {
		const result = phonePair();

		assert.equal(statusFor(result, { eligible: 2 }), 'review');
	});

	test('6. coverage below 50 % caps the score at 0.84', () => {
		// The owner only remembers brand, colour and size; everything else "don't know".
		const forgotten = Object.fromEntries(
			phoneQuestions
				.filter(
					(question) =>
						question.type === 'single_select' || question.type === 'multi_select',
				)
				.filter((question) => !['body_colour', 'size'].includes(question.key))
				.map((question) => [question.key, ['dont_know']]),
		);

		const result = phonePair({ lostAnswers: forgotten });

		assert.ok(result.coverage < 0.5, `setup: coverage should be < 0.5, got ${result.coverage}`);
		assert.ok(result.score <= 0.84, `expected ≤ 0.84, got ${result.score}`);
		assert.equal(result.coverageCapped, true);
		assert.notEqual(statusFor(result), 'auto_matched');
	});

	test('7. vectors from two different embedding models are never compared', () => {
		const vector = Array.from({ length: 768 }, (_, index) => Math.sin(index));

		const result = scorePair({
			questionSet: PHONE,
			found: side(PHONE, {
				answers: phoneAnswers,
				followups: phoneFollowups,
				zone: ZONES.cseLab,
				occurredOn: '2026-11-10',
				embedding: { model: 'gemini-embedding-001', vector },
			}),
			lost: side(PHONE, {
				answers: phoneAnswers,
				followups: phoneFollowups,
				zone: ZONES.cseLab,
				occurredOn: '2026-11-10',
				embedding: { model: 'some-other-embedding-model', vector },
			}),
		});

		assert.equal(result.terms.cosine, null);
		assert.ok(result.droppedTerms.includes('cosine'));
		assert.equal(result.scoredWithoutEmbedding, true);
	});

	test("8. a non-admin match view never returns the other side's values", () => {
		const result = phonePair();

		const match = {
			id: 'm1',
			status: 'auto_matched',
			score: result.score,
			breakdown: { fields: result.rules.fields, followups: result.followups },
			collect_generations: 0,
			collect_generation_limit: 5,
			hold_expires_at: null,
		};

		for (const role of ['owner', 'finder']) {
			const view = toStudentMatchView(match, { role });
			const json = JSON.stringify(view);

			assert.ok(!('score' in view), 'the exact score is admin-only');
			assert.ok(!json.includes('SAMSUNG'), 'canonical values must not leak');
			assert.ok(!json.includes('BLUE_DARK'), 'canonical values must not leak');
			assert.ok(!json.includes('clear_silicone'), 'follow-up answers must not leak');
			assert.ok(!json.includes('"a"') && !json.includes('"b"'), 'no per-side value fields');
		}
	});
});

// ─────────────────────────────────────────────────────────────
//  Supporting tests
// ─────────────────────────────────────────────────────────────

describe('scoring terms', () => {
	test('temporal plausibility: 1.0 within 3 days, 0.2 at 30+ days, linear between', () => {
		assert.equal(computeTemporalPlausibility('2026-11-10', '2026-11-07'), 1);
		assert.equal(computeTemporalPlausibility('2026-12-20', '2026-11-10'), 0.2);

		const mid = computeTemporalPlausibility('2026-11-26', '2026-11-10'); // 16 days

		assert.ok(mid < 1 && mid > 0.2);
	});

	test('location: same zone 1.0 > same department 0.6 > elsewhere 0.3', () => {
		const sameZone = phonePair({ foundZone: ZONES.cseLab, lostZone: ZONES.cseLab });
		const sameDept = phonePair({ foundZone: ZONES.cseLab, lostZone: ZONES.cseClass });
		const elsewhere = phonePair({ foundZone: ZONES.cseLab, lostZone: ZONES.parking });

		assert.equal(sameZone.terms.location, 1);
		assert.equal(sameDept.terms.location, 0.6);
		assert.equal(elsewhere.terms.location, 0.3);
	});

	test('follow-ups: "none" vs "none" agrees, "none" vs a value conflicts', () => {
		const result = phonePair({
			foundFollowups: [
				['case', 'none'],
				['sticker', 'none'],
				['crack', 'screen_corner'],
			],
			lostFollowups: [
				['case', 'none'],
				['sticker', 'on_phone_back'],
				['crack', 'screen_corner'],
			],
		});

		assert.equal(result.followups.agree, 2);
		assert.equal(result.followups.conflict, 1);
	});

	test('follow-ups: "don\'t remember" is skipped, not counted as conflict', () => {
		const result = phonePair({
			lostFollowups: [
				['case', 'clear_silicone'],
				['sticker', 'dont_remember'],
				['crack', 'screen_corner'],
				['accessories', 'pop_socket'],
			],
		});

		assert.equal(result.followups.overlapping, 3);
		assert.equal(result.followups.conflict, 0);
	});

	test('identical descriptions score close to 1', () => {
		const result = phonePair({ foundOn: '2026-11-10', lostOn: '2026-11-10' });

		assert.ok(result.score > 0.95, `got ${result.score}`);
	});
});
