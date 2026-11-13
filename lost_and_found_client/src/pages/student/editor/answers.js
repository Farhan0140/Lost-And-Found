/**
 * Helpers for question-set answers (same rules as the backend's answers.js).
 *
 * Form shape (what the inputs edit):   { brand: { text: 'Samsung' }, body_colour: { codes: ['navy'] } }
 * Server shape adds source/aiCodes/…   { body_colour: { codes: ['navy'], aiCodes: ['navy'], source: 'ai' } }
 */

export const DONT_KNOW = 'dont_know';

export const SELECT_TYPES = ['single_select', 'multi_select'];

/** Server answers → form answers. */
export function toFormAnswers(serverAnswers = {}) {
	const result = {};

	for (const [key, value] of Object.entries(serverAnswers ?? {})) {
		if (Array.isArray(value?.codes)) {
			result[key] = { codes: value.codes };
		} else if (typeof value?.text === 'string') {
			result[key] = { text: value.text };
		}
	}

	return result;
}

/**
 * Click on an option → the new list of codes.
 *   single_select: pick it (click again = clear)
 *   multi_select:  toggle it; "don't know" can only stand alone
 */
export function toggleCode(question, currentCodes = [], code) {
	if (question.type === 'single_select') {
		return currentCodes[0] === code ? [] : [code];
	}

	if (currentCodes.includes(code)) {
		return currentCodes.filter((item) => item !== code);
	}

	if (code === DONT_KNOW) {
		return [DONT_KNOW];
	}

	return [...currentCodes.filter((item) => item !== DONT_KNOW), code];
}

/** Keys of select questions that have no answer yet ("don't know" counts). */
export function missingAnswers(questionSet, answers) {
	return (questionSet?.questions ?? [])
		.filter((question) => SELECT_TYPES.includes(question.type))
		.filter((question) => !(answers?.[question.key]?.codes?.length > 0))
		.map((question) => question.key);
}

/** "navy" → "Navy" using the question's own labels. */
export function optionLabel(question, code) {
	return question.options?.find((option) => option.code === code)?.label ?? code;
}

/** A readable one-line answer for the review step. */
export function describeAnswer(question, answer) {
	if (!answer) {
		return null;
	}

	if (answer.text !== undefined) {
		return answer.text || null;
	}

	return (answer.codes ?? []).map((code) => optionLabel(question, code)).join(', ') || null;
}

/** Light check for things that look like phone / ID numbers or emails (the server checks for real). */
export function looksPersonal(text) {
	return /\b\d{6,}\b/.test(text.replace(/[\s-]/g, ' ')) || /\S+@\S+\.\S+/.test(text);
}
