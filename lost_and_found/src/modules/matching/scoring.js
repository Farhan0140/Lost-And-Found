/**
 * The SmartFind score (§8.3) — PURE functions, no I/O, no AI.
 *
 *     score = 0.50 · rule_overlap           frozen answers
 *           + 0.15 · followup_agreement     follow-up answers matched by aspect
 *           + 0.10 · cosine_similarity      distinctive_marks embeddings
 *           + 0.15 · location_affinity      zone where found / lost
 *           + 0.10 · temporal_plausibility  days between the two dates
 *
 *     hard gate:  found.occurredOn >= lost.occurredOn − 1 day, otherwise score = 0
 *
 * A term that cannot be computed is DROPPED and the remaining weights are renormalised
 * so they still sum to 1.0. If the frozen answers cover less than 50 % of the set's
 * weight, the score is capped at 0.84 (thin evidence can never auto-release).
 */

import { RULES } from '../../config/rules.js';

export const WEIGHTS_VERSION = 'r2-w1';

export const WEIGHTS = Object.freeze({
	rules: 0.5,
	followups: 0.15,
	cosine: 0.1,
	location: 0.15,
	temporal: 0.1,
});

// ─────────────────────────────────────────────────────────────
//  Small maths helpers
// ─────────────────────────────────────────────────────────────

export function clamp(value, min = 0, max = 1) {
	return Math.min(max, Math.max(min, value));
}

export function round4(value) {
	return Math.round(value * 10000) / 10000;
}

export function jaccard(listA, listB) {
	const a = new Set(listA);
	const b = new Set(listB);

	const intersection = [...a].filter((item) => b.has(item)).length;
	const union = new Set([...a, ...b]).size;

	return union === 0 ? 0 : intersection / union;
}

export function cosineSimilarity(vectorA, vectorB) {
	if (!vectorA || !vectorB || vectorA.length !== vectorB.length || vectorA.length === 0) {
		return null;
	}

	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < vectorA.length; i++) {
		dot += vectorA[i] * vectorB[i];
		normA += vectorA[i] * vectorA[i];
		normB += vectorB[i] * vectorB[i];
	}

	if (normA === 0 || normB === 0) {
		return null;
	}

	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Cosine of two { model, vector } embeddings, or null when either is missing
 * or they come from DIFFERENT models (vectors from different models are never compared).
 */
export function embeddingCosine(embeddingA, embeddingB) {
	if (!embeddingA || !embeddingB) {
		return null;
	}

	if (embeddingA.model !== embeddingB.model) {
		return null;
	}

	return cosineSimilarity(embeddingA.vector, embeddingB.vector);
}

/** Whole days from date string A to date string B ("YYYY-MM-DD"). */
export function daysBetween(dateA, dateB) {
	const a = Date.parse(`${dateA}T00:00:00Z`);
	const b = Date.parse(`${dateB}T00:00:00Z`);

	return Math.round((b - a) / 86_400_000);
}

// ─────────────────────────────────────────────────────────────
//  Term 1 — rule_overlap (frozen answers)
// ─────────────────────────────────────────────────────────────

/**
 * For each question both sides answered:
 *   single_select / brand   equal → +w        different → −0.5w
 *   multi_select            overlap > 0 → +w × Jaccard        overlap = 0 → −0.5w
 *
 *   rule_overlap = clamp(sum / answered_weight)
 *   coverage     = answered_weight / total_set_weight
 */
export function computeRuleOverlap(questionSet, canonicalA, canonicalB) {
	let sum = 0;
	let answeredWeight = 0;
	let totalWeight = 0;

	const fields = [];

	for (const question of questionSet.questions) {
		const weight = Number(question.match_weight ?? 0);

		if (question.type === 'text' || weight <= 0) {
			continue;
		}

		totalWeight += weight;

		const tokensA = canonicalA?.values?.[question.key]?.tokens ?? null;
		const tokensB = canonicalB?.values?.[question.key]?.tokens ?? null;

		// Either side said "don't know" (or skipped) → contributes nothing.
		if (!tokensA || !tokensB) {
			fields.push({
				key: question.key,
				weight,
				a: tokensA,
				b: tokensB,
				result: 'missing',
				contribution: 0,
			});

			continue;
		}

		answeredWeight += weight;

		let result;
		let contribution;

		if (question.type === 'multi_select') {
			const overlap = jaccard(tokensA, tokensB);

			if (overlap > 0) {
				contribution = weight * overlap;
				result = overlap === 1 ? 'agree' : 'partial';
			} else {
				contribution = -0.5 * weight;
				result = 'conflict';
			}
		} else {
			// single_select and brand
			if (tokensA[0] === tokensB[0]) {
				contribution = weight;
				result = 'agree';
			} else {
				contribution = -0.5 * weight;
				result = 'conflict';
			}
		}

		sum += contribution;

		fields.push({
			key: question.key,
			weight,
			a: tokensA,
			b: tokensB,
			result,
			contribution: round4(contribution),
		});
	}

	const value = answeredWeight > 0 ? clamp(sum / answeredWeight) : 0;
	const coverage = totalWeight > 0 ? answeredWeight / totalWeight : 0;

	return {
		value: round4(value),
		coverage: round4(coverage),
		answeredWeight: round4(answeredWeight),
		totalWeight: round4(totalWeight),
		fields,
	};
}

// ─────────────────────────────────────────────────────────────
//  Term 2 — followup_agreement (by aspect)
// ─────────────────────────────────────────────────────────────

/**
 * Each side: [{ aspect, kind: 'option'|'other'|'none'|'dont_remember', code, embedding }]
 *
 * Per aspect answered by both sides ("don't remember" is skipped):
 *   option vs option    same code → agree,   different → conflict
 *   none vs none        agree
 *   none vs anything    conflict
 *   other vs other      cosine ≥ 0.80 agree · ≤ 0.40 conflict · between neutral
 *   option vs other     neutral (wording differs; cannot compare exactly)
 *
 *   value = clamp((agree − 0.5 × conflict) / overlapping)
 *   needs ≥ 3 overlapping aspects, otherwise the term is dropped (value = null)
 */
export function computeFollowupAgreement(followupsA, followupsB) {
	const byAspect = (list) => {
		const map = new Map();

		for (const item of list ?? []) {
			if (!item.kind || item.kind === 'dont_remember') {
				continue;
			}

			// first answered question per aspect wins
			if (!map.has(item.aspect)) {
				map.set(item.aspect, item);
			}
		}

		return map;
	};

	const mapA = byAspect(followupsA);
	const mapB = byAspect(followupsB);

	let agree = 0;
	let conflict = 0;
	let neutral = 0;

	const aspects = [];

	for (const [aspect, answerA] of mapA) {
		const answerB = mapB.get(aspect);

		if (!answerB) {
			continue;
		}

		const { result, similarity } = compareFollowupAnswers(answerA, answerB);

		if (result === 'agree') {
			agree++;
		} else if (result === 'conflict') {
			conflict++;
		} else {
			neutral++;
		}

		aspects.push({
			aspect,
			result,
			similarity: similarity === null ? null : round4(similarity),
			a: describeFollowupAnswer(answerA),
			b: describeFollowupAnswer(answerB),
		});
	}

	const overlapping = aspects.length;
	const enough = overlapping >= RULES.minOverlappingAspects;

	const value = enough ? round4(clamp((agree - 0.5 * conflict) / overlapping)) : null;

	return {
		value,
		overlapping,
		agree,
		conflict,
		neutral,
		aspects,
	};
}

function compareFollowupAnswers(answerA, answerB) {
	const kindA = answerA.kind;
	const kindB = answerB.kind;

	if (kindA === 'none' && kindB === 'none') {
		return { result: 'agree', similarity: null };
	}

	if (kindA === 'none' || kindB === 'none') {
		return { result: 'conflict', similarity: null };
	}

	if (kindA === 'option' && kindB === 'option') {
		return {
			result: answerA.code === answerB.code ? 'agree' : 'conflict',
			similarity: null,
		};
	}

	if (kindA === 'other' && kindB === 'other') {
		const similarity = embeddingCosine(answerA.embedding, answerB.embedding);

		if (similarity === null) {
			return { result: 'neutral', similarity: null };
		}

		if (similarity >= 0.8) {
			return { result: 'agree', similarity };
		}

		if (similarity <= 0.4) {
			return { result: 'conflict', similarity };
		}

		return { result: 'neutral', similarity };
	}

	// option vs other text
	return { result: 'neutral', similarity: null };
}

function describeFollowupAnswer(answer) {
	if (answer.kind === 'option') {
		return answer.code;
	}

	if (answer.kind === 'other') {
		return `other: ${answer.text ?? ''}`.trim();
	}

	return answer.kind;
}

// ─────────────────────────────────────────────────────────────
//  Terms 4 and 5 — location and time
// ─────────────────────────────────────────────────────────────

/** 1.0 same zone · 0.6 same department, different zone · 0.3 otherwise */
export function computeLocationAffinity(zoneA, zoneB) {
	if (!zoneA || !zoneB) {
		return 0.3;
	}

	if (zoneA.id === zoneB.id) {
		return 1.0;
	}

	if (zoneA.department && zoneA.department === zoneB.department) {
		return 0.6;
	}

	return 0.3;
}

/** 1.0 within 3 days, falling linearly to 0.2 at 30 days, then 0.2 */
export function computeTemporalPlausibility(foundOn, lostOn) {
	const days = Math.abs(daysBetween(lostOn, foundOn));

	if (days <= 3) {
		return 1.0;
	}

	if (days >= 30) {
		return 0.2;
	}

	return round4(1.0 - (0.8 * (days - 3)) / 27);
}

/** Hard gate: an item cannot be found more than 1 day BEFORE it was lost. */
export function passesDateGate(foundOn, lostOn) {
	return daysBetween(lostOn, foundOn) >= -RULES.dateToleranceDays;
}

// ─────────────────────────────────────────────────────────────
//  The full score
// ─────────────────────────────────────────────────────────────

/**
 * @param {object} input
 * @param {object} input.questionSet   { questions: [...] } — WITH match_weight
 * @param {object} input.found         side description (see below)
 * @param {object} input.lost          side description
 *
 * side = {
 *     canonical,            // output of canonicalize()
 *     followups,            // [{ aspect, kind, code, text, embedding }]
 *     distinctiveEmbedding, // { model, vector } or null
 *     zone,                 // { id, department }
 *     occurredOn,           // "YYYY-MM-DD"
 * }
 */
export function scorePair({ questionSet, found, lost }) {
	// ── hard gate ──
	if (!passesDateGate(found.occurredOn, lost.occurredOn)) {
		return {
			score: 0,
			gate: 'failed',
			weightsVersion: WEIGHTS_VERSION,
			terms: {},
			appliedWeights: {},
			droppedTerms: [],
			coverage: 0,
			coverageCapped: false,
			rules: null,
			followups: null,
			scoredWithoutEmbedding: false,
		};
	}

	// ── each term ──
	const rules = computeRuleOverlap(questionSet, found.canonical, lost.canonical);
	const followups = computeFollowupAgreement(found.followups, lost.followups);
	const cosine = embeddingCosine(found.distinctiveEmbedding, lost.distinctiveEmbedding);
	const location = computeLocationAffinity(found.zone, lost.zone);
	const temporal = computeTemporalPlausibility(found.occurredOn, lost.occurredOn);

	const terms = {
		rules: rules.value,
		followups: followups.value,
		cosine: cosine === null ? null : round4(clamp(cosine)),
		location,
		temporal,
	};

	// ── drop missing terms, renormalise the rest to 1.0 ──
	const appliedWeights = renormaliseWeights(terms);

	let score = 0;

	for (const [name, weight] of Object.entries(appliedWeights)) {
		score += weight * terms[name];
	}

	// ── thin evidence can never auto-release ──
	let coverageCapped = false;

	if (rules.coverage < RULES.minCoverage && score > RULES.coverageCap) {
		score = RULES.coverageCap;
		coverageCapped = true;
	}

	return {
		score: round4(clamp(score)),
		gate: 'passed',
		weightsVersion: WEIGHTS_VERSION,
		terms,
		appliedWeights,
		droppedTerms: Object.keys(WEIGHTS).filter((name) => !(name in appliedWeights)),
		coverage: rules.coverage,
		coverageCapped,
		rules,
		followups,
		scoredWithoutEmbedding: terms.cosine === null,
	};
}

/** { rules: 0.7, followups: null, … } → weights of the present terms, summing to 1.0 */
export function renormaliseWeights(terms) {
	const present = Object.keys(WEIGHTS).filter(
		(name) => terms[name] !== null && terms[name] !== undefined,
	);

	const total = present.reduce((sum, name) => sum + WEIGHTS[name], 0);

	const applied = {};

	for (const name of present) {
		applied[name] = WEIGHTS[name] / total;
	}

	return applied;
}
