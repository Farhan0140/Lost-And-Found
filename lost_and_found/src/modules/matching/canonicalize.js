/**
 * canonicalize(questionSet, answers) — PURE function: no I/O, no AI. (§8.2)
 *
 * Input answers (as stored on a report):
 *
 *     {
 *         body_colour: { codes: ['navy'] },
 *         marks:       { codes: ['scratched', 'sticker'] },
 *         brand:       { text: 'iPhone' },
 *         distinctive_marks: { text: 'Small Spider-Man sticker near camera' },
 *     }
 *
 * Output (stored in reports.canonical):
 *
 *     {
 *         rulesVersion: 'v1',
 *         values: {
 *             body_colour: { type: 'single_select', tokens: ['BLUE_DARK'] },
 *             marks:       { type: 'multi_select',  tokens: ['SCRATCH', 'STICKER'] },
 *             brand:       { type: 'brand',         tokens: ['APPLE'] },
 *         },
 *         distinctiveMarks: 'Small Spider-Man sticker near camera',
 *     }
 *
 * "Don't know" answers become `tokens: null`, which the scorer treats as "not answered".
 */

import { BRAND_ALIASES, CANON_TABLES, RULES_VERSION, UNKNOWN_BRAND_WORDS } from './rules.v1.js';

export const DONT_KNOW = 'dont_know';

// ─────────────────────────────────────────────────────────────
//  Single values
// ─────────────────────────────────────────────────────────────

/** "Apple iPhone 13!" → "appleiphone13" */
function compactText(text) {
	return String(text ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

/**
 * Brand free text → canonical brand token, or null for "unknown".
 *   "iPhone 13"     → APPLE         (alias on the first word)
 *   "Galaxy Buds"   → SAMSUNG
 *   "Some Brand"    → OTHER:SOMEBRAND
 */
export function canonicalizeBrand(text) {
	const compact = compactText(text);

	if (UNKNOWN_BRAND_WORDS.has(compact)) {
		return null;
	}

	// 1. The whole string is an alias.
	if (BRAND_ALIASES[compact]) {
		return BRAND_ALIASES[compact];
	}

	// 2. Any single word is an alias ("my galaxy a54" → SAMSUNG).
	const words = String(text)
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);

	for (const word of words) {
		if (BRAND_ALIASES[word]) {
			return BRAND_ALIASES[word];
		}
	}

	// 3. The text starts with an alias ("americantouristerbag" → AMERICAN_TOURISTER).
	for (const [alias, brand] of Object.entries(BRAND_ALIASES)) {
		if (alias.length >= 4 && compact.startsWith(alias)) {
			return brand;
		}
	}

	return `OTHER:${compact.toUpperCase()}`;
}

/** One option code → canonical token using the question's `canon` table (or the code itself). */
function canonicalizeCode(code, canonType) {
	const table = CANON_TABLES[canonType];

	if (table && table[code]) {
		return table[code];
	}

	return String(code).toUpperCase();
}

// ─────────────────────────────────────────────────────────────
//  Whole answer set
// ─────────────────────────────────────────────────────────────

export function canonicalize(questionSet, answers) {
	const values = {};

	let distinctiveMarks = '';

	for (const question of questionSet.questions) {
		const answer = answers?.[question.key];

		// Free text: only `distinctive_marks` (weight 0) — compared by embedding, not by rules.
		if (question.type === 'text') {
			if (question.key === 'distinctive_marks') {
				distinctiveMarks = String(answer?.text ?? '').trim();
			}

			continue;
		}

		// Brand: free text normalised through the alias table.
		if (question.type === 'brand') {
			const brand = answer?.text ? canonicalizeBrand(answer.text) : null;

			values[question.key] = {
				type: 'brand',
				tokens: brand ? [brand] : null,
			};

			continue;
		}

		// single_select / multi_select
		const codes = Array.isArray(answer?.codes) ? answer.codes : [];

		const realCodes = codes.filter((code) => code !== DONT_KNOW);

		if (realCodes.length === 0) {
			values[question.key] = { type: question.type, tokens: null };
			continue;
		}

		const tokens = [
			...new Set(realCodes.map((code) => canonicalizeCode(code, question.canon))),
		];

		values[question.key] = {
			type: question.type,
			tokens: question.type === 'single_select' ? [tokens[0]] : tokens.sort(),
		};
	}

	return {
		rulesVersion: RULES_VERSION,
		values,
		distinctiveMarks,
	};
}
