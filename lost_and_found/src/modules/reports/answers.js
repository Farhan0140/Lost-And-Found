/**
 * Frozen-answer handling for a report.
 *
 * Stored shape (reports.answers):
 *
 *     {
 *         screen_condition: {
 *             codes: ['cracked'],          ← the value the user CONFIRMED (value_codes)
 *             aiCodes: ['intact'],         ← what the AI suggested (ai_suggested_codes)
 *             source: 'ai_edited',         ← manual | ai_accepted | ai_edited
 *             corrected: true,
 *         },
 *         brand: { text: 'Samsung', aiText: 'Samsung', source: 'ai_accepted', corrected: false },
 *     }
 *
 * AI output is never ground truth: the delta between aiCodes and codes is a free
 * AI-accuracy metric (§7.2).
 */

import { badRequest } from '../../lib/errors.js';
import { findPersonalData } from '../ai/piiFilter.js';
import { DONT_KNOW } from '../matching/canonicalize.js';

const MAX_TEXT = { brand: 60, text: 300 };

function sameCodes(a = [], b = []) {
	return [...a].sort().join('|') === [...b].sort().join('|');
}

/** manual (no AI suggestion) · ai_accepted (kept as suggested) · ai_edited (changed) */
function answerSource(suggestion, sameAsSuggestion) {
	if (!suggestion) {
		return 'manual';
	}

	return sameAsSuggestion ? 'ai_accepted' : 'ai_edited';
}

/** AI suggestion for one question, from reports.extraction. */
function suggestionFor(question, extraction) {
	if (!extraction) {
		return null;
	}

	if (question.type === 'brand') {
		return extraction.brandText ? { text: extraction.brandText } : null;
	}

	if (question.type === 'text') {
		return extraction.distinctiveMarks ? { text: extraction.distinctiveMarks } : null;
	}

	const codes = extraction.suggestions?.[question.key];

	return codes?.length ? { codes } : null;
}

/** Builds the stored answer object from an extraction (all "ai_accepted"). */
export function answersFromExtraction(questionSet, extraction) {
	const answers = {};

	for (const question of questionSet.questions) {
		const suggestion = suggestionFor(question, extraction);

		if (!suggestion) {
			continue;
		}

		if (suggestion.codes) {
			answers[question.key] = {
				codes: suggestion.codes,
				aiCodes: suggestion.codes,
				source: 'ai_accepted',
				corrected: false,
			};
		} else {
			answers[question.key] = {
				text: suggestion.text,
				aiText: suggestion.text,
				source: 'ai_accepted',
				corrected: false,
			};
		}
	}

	return answers;
}

/**
 * Merges user changes into the stored answers, validating each one.
 * `incoming` = { [questionKey]: { codes: [...] } | { text: '...' } | null }
 */
export function applyAnswerChanges(questionSet, currentAnswers, incoming, extraction) {
	const answers = { ...(currentAnswers ?? {}) };

	for (const [key, value] of Object.entries(incoming ?? {})) {
		const question = questionSet.questions.find((item) => item.key === key);

		if (!question) {
			throw badRequest('UNKNOWN_QUESTION', `"${key}" is not a question in this category.`);
		}

		if (value === null) {
			delete answers[key];
			continue;
		}

		const suggestion = suggestionFor(question, extraction);

		if (question.type === 'brand' || question.type === 'text') {
			const text = String(value.text ?? '').trim();
			const limit = MAX_TEXT[question.type];

			if (text.length > limit) {
				throw badRequest(
					'ANSWER_TOO_LONG',
					`"${question.text}" must be at most ${limit} characters.`,
				);
			}

			if (findPersonalData(text)) {
				throw badRequest(
					'PERSONAL_DATA_NOT_ALLOWED',
					'Please do not type ID, card or phone numbers, names or emails. Describe how the item looks instead.',
				);
			}

			const source = answerSource(suggestion, suggestion?.text === text);

			answers[key] = {
				text,
				aiText: suggestion?.text ?? null,
				source,
				corrected: source === 'ai_edited',
			};

			continue;
		}

		// single_select / multi_select
		const codes = [...new Set(Array.isArray(value.codes) ? value.codes : [])];
		const allowed = new Set(question.options.map((option) => option.code));

		const invalid = codes.filter((code) => !allowed.has(code));

		if (invalid.length > 0) {
			throw badRequest(
				'INVALID_OPTION',
				`"${invalid[0]}" is not an option for "${question.text}".`,
			);
		}

		if (codes.length === 0) {
			delete answers[key];
			continue;
		}

		if (question.type === 'single_select' && codes.length > 1) {
			throw badRequest('ONE_OPTION_ONLY', `Pick only one option for "${question.text}".`);
		}

		if (codes.includes(DONT_KNOW) && codes.length > 1) {
			throw badRequest(
				'DONT_KNOW_ALONE',
				`"Don't know" cannot be combined with other options.`,
			);
		}

		const source = answerSource(suggestion, sameCodes(suggestion?.codes, codes));

		answers[key] = {
			codes,
			aiCodes: suggestion?.codes ?? null,
			source,
			corrected: source === 'ai_edited',
		};
	}

	return answers;
}

/** Keys of select questions that still have no answer ("don't know" counts as an answer). */
export function missingAnswers(questionSet, answers) {
	return questionSet.questions
		.filter((question) => question.type === 'single_select' || question.type === 'multi_select')
		.filter((question) => !(answers?.[question.key]?.codes?.length > 0))
		.map((question) => question.key);
}

/** "What does the screen look like?: Cracked in one area" — one line per answered question. */
export function summarizeAnswers(questionSet, answers) {
	const lines = [];

	for (const question of questionSet.questions) {
		const answer = answers?.[question.key];

		if (!answer || question.type === 'text') {
			continue;
		}

		if (question.type === 'brand') {
			if (answer.text) {
				lines.push(`${question.text}: ${answer.text}`);
			}

			continue;
		}

		const labels = (answer.codes ?? [])
			.filter((code) => code !== DONT_KNOW)
			.map((code) => question.options.find((option) => option.code === code)?.label ?? code);

		if (labels.length > 0) {
			lines.push(`${question.text}: ${labels.join(', ')}`);
		}
	}

	return lines.join('\n');
}

/** AI-accuracy metric for one report: how many AI suggestions the user changed. */
export function aiAccuracy(answers) {
	const suggested = Object.values(answers ?? {}).filter((answer) => answer.source !== 'manual');
	const corrected = suggested.filter((answer) => answer.corrected).length;

	return {
		suggested: suggested.length,
		corrected,
		accepted: suggested.length - corrected,
	};
}
