/**
 * Matching-engine evaluation (§9.4) — runs on FROZEN fixtures, no database, no AI.
 *
 *     npm run evaluate
 *
 * Prints:
 *   1. every pair's score, terms and outcome
 *   2. precision / recall / F1 swept over thresholds 0.30 → 0.90 (step 0.05)
 *   3. threshold placement by rule: auto line = midpoint(best near-miss, worst true match),
 *      review floor = just above the best non-match — with both margins
 *   4. share of true pairs reaching ≥ 3 overlapping follow-up aspects (target ≥ 70 %)
 *   5. the NM08 outcome (is it vetoed by the release rule?)
 *   6. ablation: frozen only → + follow-ups → + location & time
 *   7. the 10 held-out pairs, separately
 */

import { CATEGORIES } from '../src/db/seed-data/questionSets/index.js';
import { RULES } from '../src/config/rules.js';
import { decideMatchStatus, evaluateReleaseRule } from '../src/modules/matching/releaseRule.js';
import { renormaliseWeights, scorePair } from '../src/modules/matching/scoring.js';
import { EVALUATION_PAIRS, HELD_OUT_PAIRS } from '../tests/fixtures/pairs.js';
import { side } from '../tests/helpers.js';

// ─────────────────────────────────────────────────────────────
//  Setup
// ─────────────────────────────────────────────────────────────

const QUESTION_SETS = new Map(
	CATEGORIES.map((category, index) => [
		category.slug,
		{ id: index + 1, questions: category.questions, aspects: category.aspects },
	]),
);

const fmt = (value) =>
	value === null || value === undefined ? '  —   ' : Number(value).toFixed(4);
const pct = (value) => `${(value * 100).toFixed(1)} %`;

/** Fails loudly if a fixture uses an option code that does not exist in the question set. */
function validateFixture(pairData) {
	const set = QUESTION_SETS.get(pairData.category);
	const problems = [];

	for (const sideName of ['found', 'lost']) {
		for (const [key, value] of Object.entries(pairData[sideName].answers)) {
			const question = set.questions.find((item) => item.key === key);

			if (!question) {
				problems.push(`${sideName}.${key}: unknown question`);
				continue;
			}

			if (Array.isArray(value)) {
				const allowed = new Set(question.options.map((option) => option.code));

				for (const code of value) {
					if (!allowed.has(code)) {
						problems.push(`${sideName}.${key}: "${code}" is not an option`);
					}
				}
			}
		}

		for (const [aspectKey, code] of pairData[sideName].followups) {
			const aspect = set.aspects.find((item) => item.key === aspectKey);

			if (!aspect) {
				problems.push(`${sideName} follow-up: unknown aspect "${aspectKey}"`);
				continue;
			}

			const special =
				['none', 'dont_remember'].includes(code) || String(code).startsWith('other:');

			if (!special && !aspect.values.some((value) => value.code === code)) {
				problems.push(`${sideName} follow-up ${aspectKey}: "${code}" is not a value`);
			}
		}
	}

	if (problems.length > 0) {
		throw new Error(`Fixture ${pairData.id} is invalid:\n  - ${problems.join('\n  - ')}`);
	}
}

function evaluatePair(pairData) {
	validateFixture(pairData);

	const questionSet = QUESTION_SETS.get(pairData.category);

	const result = scorePair({
		questionSet,
		found: side(questionSet, pairData.found),
		lost: side(questionSet, pairData.lost),
	});

	const rule = evaluateReleaseRule({
		score: result.score,
		foundStatus: 'stored',
		followups: result.followups,
		eligibleLostCount: 1,
	});

	return {
		...pairData,
		result,
		rule,
		status: decideMatchStatus(result.score, rule),
		positive: pairData.type === 'true_match',
	};
}

// ─────────────────────────────────────────────────────────────
//  Metrics
// ─────────────────────────────────────────────────────────────

function confusion(rows, predict) {
	let tp = 0;
	let fp = 0;
	let fn = 0;
	let tn = 0;

	for (const row of rows) {
		const predicted = predict(row);

		if (predicted && row.positive) tp++;
		else if (predicted && !row.positive) fp++;
		else if (!predicted && row.positive) fn++;
		else tn++;
	}

	const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
	const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
	const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

	return { tp, fp, fn, tn, precision, recall, f1 };
}

/** Score using only some terms (ablation), with the same renormalisation and coverage cap. */
function scoreWithTerms(result, names) {
	if (result.gate === 'failed') {
		return 0;
	}

	const terms = {};

	for (const name of ['rules', 'followups', 'cosine', 'location', 'temporal']) {
		terms[name] = names.includes(name) ? result.terms[name] : null;
	}

	const weights = renormaliseWeights(terms);

	let score = 0;

	for (const [name, weight] of Object.entries(weights)) {
		score += weight * terms[name];
	}

	if (result.coverage < RULES.minCoverage) {
		score = Math.min(score, RULES.coverageCap);
	}

	return score;
}

// ─────────────────────────────────────────────────────────────
//  Printing
// ─────────────────────────────────────────────────────────────

function printPairs(title, rows) {
	console.log(`\n${title}`);
	console.log('─'.repeat(118));
	console.log(
		'ID       TYPE         SCORE    rules    follow   locat    time     cover  aspects  conflict  OUTCOME        NOTE',
	);
	console.log('─'.repeat(118));

	for (const row of rows) {
		const r = row.result;

		console.log(
			[
				row.id.padEnd(8),
				row.type.padEnd(12),
				fmt(r.score),
				fmt(r.terms.rules),
				fmt(r.terms.followups),
				fmt(r.terms.location),
				fmt(r.terms.temporal),
				r.gate === 'failed' ? ' gate ' : pct(r.coverage).padStart(6),
				String(r.followups?.overlapping ?? 0).padStart(5),
				String(r.followups?.conflict ?? 0).padStart(8),
				`   ${(row.status ?? 'no match').padEnd(13)}`,
				row.note.slice(0, 40),
			].join(' '),
		);
	}
}

function printSweep(rows) {
	console.log(
		'\nThreshold sweep — "predicted match" = score ≥ threshold (score only, no release rule)',
	);
	console.log('─'.repeat(74));
	console.log('THRESH   TP  FP  FN  TN   PRECISION   RECALL     F1');
	console.log('─'.repeat(74));

	for (let threshold = 0.3; threshold <= 0.9001; threshold += 0.05) {
		const m = confusion(rows, (row) => row.result.score >= threshold);

		console.log(
			[
				threshold.toFixed(2).padEnd(6),
				String(m.tp).padStart(4),
				String(m.fp).padStart(3),
				String(m.fn).padStart(3),
				String(m.tn).padStart(3),
				m.precision.toFixed(3).padStart(11),
				m.recall.toFixed(3).padStart(8),
				m.f1.toFixed(3).padStart(7),
			].join(' '),
		);
	}
}

function printThresholds(rows) {
	const scores = (type) => rows.filter((row) => row.type === type).map((row) => row.result.score);

	const worstTrue = Math.min(...scores('true_match'));
	const bestNear = Math.max(...scores('near_miss'));
	const bestNon = Math.max(...scores('non_match'));

	const autoLine = (worstTrue + bestNear) / 2;

	console.log('\nThreshold placement (rule from §8.4)');
	console.log('─'.repeat(74));
	console.log(`  lowest true match            ${fmt(worstTrue)}`);
	console.log(`  highest near-miss            ${fmt(bestNear)}`);
	console.log(`  highest non-match            ${fmt(bestNon)}`);
	console.log(
		`  → suggested auto line        ${fmt(autoLine)}   (margin ±${fmt(Math.abs(worstTrue - bestNear) / 2)})`,
	);
	console.log(
		`  → suggested review floor     just above ${fmt(bestNon)}   (current: ${RULES.reviewThreshold})`,
	);

	if (worstTrue <= bestNear) {
		console.log(
			'  ⚠ true matches and near-misses OVERLAP on score alone — the release rule must separate them',
		);
	}

	console.log(`  current auto line in use     ${RULES.autoMatchThreshold}`);
}

function printReleaseOutcome(rows, label) {
	const auto = confusion(rows, (row) => row.status === 'auto_matched');
	const anyMatch = confusion(rows, (row) => row.status !== null);

	console.log(`\n${label}`);
	console.log('─'.repeat(74));
	console.log(`  AUTO-RELEASE (score ≥ ${RULES.autoMatchThreshold} AND release rule)`);
	console.log(
		`     TP ${auto.tp}  FP ${auto.fp}  FN ${auto.fn}  TN ${auto.tn}   precision ${auto.precision.toFixed(3)}  recall ${auto.recall.toFixed(3)}  F1 ${auto.f1.toFixed(3)}`,
	);
	console.log(`  ANY MATCH ROW (auto or review, score ≥ ${RULES.reviewThreshold})`);
	console.log(
		`     TP ${anyMatch.tp}  FP ${anyMatch.fp}  FN ${anyMatch.fn}  TN ${anyMatch.tn}   precision ${anyMatch.precision.toFixed(3)}  recall ${anyMatch.recall.toFixed(3)}  F1 ${anyMatch.f1.toFixed(3)}`,
	);

	const trues = rows.filter((row) => row.positive);
	const enoughAspects = trues.filter(
		(row) => (row.result.followups?.overlapping ?? 0) >= RULES.minOverlappingAspects,
	);

	console.log(
		`  true pairs with ≥ 3 overlapping aspects: ${enoughAspects.length}/${trues.length} (${pct(enoughAspects.length / trues.length)}; target ≥ 70 %)`,
	);
}

function printAblation(rows) {
	const steps = [
		['frozen answers only', ['rules']],
		['+ follow-ups', ['rules', 'followups']],
		['+ location & time', ['rules', 'followups', 'location', 'temporal']],
	];

	console.log('\nAblation (cosine term not available in frozen fixtures)');
	console.log('─'.repeat(74));
	console.log('STEP                      worst TM   best NM   gap       P@0.85  R@0.85');
	console.log('─'.repeat(74));

	for (const [label, names] of steps) {
		const scored = rows.map((row) => ({ ...row, ablated: scoreWithTerms(row.result, names) }));

		const worstTrue = Math.min(
			...scored.filter((row) => row.type === 'true_match').map((row) => row.ablated),
		);
		const bestNear = Math.max(
			...scored.filter((row) => row.type === 'near_miss').map((row) => row.ablated),
		);

		const m = confusion(scored, (row) => row.ablated >= RULES.autoMatchThreshold);

		console.log(
			[
				label.padEnd(24),
				fmt(worstTrue).padStart(9),
				fmt(bestNear).padStart(9),
				fmt(worstTrue - bestNear).padStart(9),
				m.precision.toFixed(3).padStart(8),
				m.recall.toFixed(3).padStart(7),
			].join(' '),
		);
	}
}

// ─────────────────────────────────────────────────────────────
//  Run
// ─────────────────────────────────────────────────────────────

const evaluation = EVALUATION_PAIRS.map(evaluatePair);
const heldOut = HELD_OUT_PAIRS.map(evaluatePair);

console.log('\nSmartFind — matching evaluation (Revision 2 score, frozen fixtures)');
console.log(
	`Weights: rules 0.50 · follow-ups 0.15 · cosine 0.10 · location 0.15 · time 0.10 (cosine dropped here)`,
);

printPairs(`Evaluation set (${evaluation.length} pairs)`, evaluation);
printSweep(evaluation);
printThresholds(evaluation);
printReleaseOutcome(evaluation, 'Outcome with the release rule — evaluation set');

const nm08 = evaluation.find((row) => row.id === 'NM08');

if (nm08) {
	console.log(
		`\nNM08: score ${fmt(nm08.result.score)} → ${nm08.status ?? 'no match'}  (release-rule failures: ${nm08.rule.failures.join(', ') || 'none'})`,
	);
}

printAblation(evaluation);

printPairs(`Held-out set (${heldOut.length} pairs — reported separately)`, heldOut);
printReleaseOutcome(heldOut, 'Outcome with the release rule — held-out set');

console.log('');
