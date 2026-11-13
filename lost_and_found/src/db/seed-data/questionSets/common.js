/**
 * Shared building blocks for the frozen question sets.
 *
 * A question:
 *     {
 *         key: 'body_colour',
 *         text: 'What is the main colour of the phone?',
 *         type: 'single_select' | 'multi_select' | 'brand' | 'text',
 *         canon: 'colour' | 'size' | 'material' | 'damage' | null,   ← which rules.v1 table
 *         match_weight: 0.06,                                          ← INTERNAL, never sent to clients
 *         options: [{ code: 'black', label: 'Black' }, …],
 *     }
 *
 * An aspect (for AI follow-up questions):
 *     {
 *         key: 'case',
 *         label: 'Case or cover',
 *         values: [{ code: 'clear_silicone', label: 'Clear silicone case' }, …],
 *     }
 *
 * Follow-up options MUST use codes from their aspect's `values`, so two different
 * AI-written questions about the same aspect can still be compared exactly.
 * "None", "Don't remember" and "Other (type it)" are added automatically.
 */

// ─────────────────────────────────────────────────────────────
//  Option helpers
// ─────────────────────────────────────────────────────────────

/** opt('dark_blue') → { code: 'dark_blue', label: 'Dark blue' } */
export function opt(code, label) {
	const autoLabel = code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' ');

	return { code, label: label ?? autoLabel };
}

export const DONT_KNOW_OPTION = opt('dont_know', "Don't know / not sure");

/** Every select question ends with "Don't know". */
export function withDontKnow(options) {
	return [...options, DONT_KNOW_OPTION];
}

// ─────────────────────────────────────────────────────────────
//  Option lists
// ─────────────────────────────────────────────────────────────

export const COLOUR_OPTIONS = [
	opt('black'),
	opt('white'),
	opt('grey'),
	opt('silver'),
	opt('navy'),
	opt('dark_blue'),
	opt('blue'),
	opt('light_blue'),
	opt('red'),
	opt('maroon'),
	opt('pink'),
	opt('rose_gold', 'Rose gold'),
	opt('purple'),
	opt('green'),
	opt('dark_green'),
	opt('yellow'),
	opt('gold'),
	opt('orange'),
	opt('brown'),
	opt('beige'),
	opt('multicolour', 'Multicolour / pattern'),
	opt('transparent', 'Transparent / clear'),
];

export const MATERIAL_OPTIONS = [
	opt('leather'),
	opt('faux_leather', 'Faux / synthetic leather'),
	opt('fabric', 'Fabric / cloth'),
	opt('nylon'),
	opt('canvas'),
	opt('plastic'),
	opt('silicone', 'Silicone / rubber'),
	opt('metal'),
];

export const SIZE_OPTIONS = [
	opt('small', 'Small (fits in a pocket)'),
	opt('medium', 'Medium (fits in a hand)'),
	opt('large', 'Large (needs a bag)'),
];

export const CONDITION_OPTIONS = [
	opt('new_looking', 'Looks new'),
	opt('lightly_used', 'Lightly used'),
	opt('worn', 'Clearly worn'),
	opt('damaged', 'Damaged'),
];

// ─────────────────────────────────────────────────────────────
//  Question builders
// ─────────────────────────────────────────────────────────────

export function brandQuestion(text, weight) {
	return {
		key: 'brand',
		text,
		type: 'brand',
		canon: null,
		match_weight: weight,
		options: [],
		placeholder: 'e.g. Samsung, Apple, JanSport — or leave empty if unsure',
	};
}

export function colourQuestion(key, text, weight, extraOptions = []) {
	return {
		key,
		text,
		type: 'single_select',
		canon: 'colour',
		match_weight: weight,
		options: withDontKnow([...extraOptions, ...COLOUR_OPTIONS]),
	};
}

export function selectQuestion(key, text, weight, options, canon = null) {
	return {
		key,
		text,
		type: 'single_select',
		canon,
		match_weight: weight,
		options: withDontKnow(options),
	};
}

export function multiQuestion(key, text, weight, options, canon = null) {
	return {
		key,
		text,
		type: 'multi_select',
		canon,
		match_weight: weight,
		options: withDontKnow(options),
	};
}

/** The free-text field every set has. Weight 0: compared by embedding, not by rules. */
export function distinctiveMarksQuestion(text) {
	return {
		key: 'distinctive_marks',
		text:
			text ??
			'Anything distinctive about it? (stickers, scratches, keychains, writing — but NO card or ID numbers)',
		type: 'text',
		canon: null,
		match_weight: 0,
		options: [],
		placeholder: 'e.g. small cartoon sticker near the camera, scratch on the left edge',
	};
}

// ─────────────────────────────────────────────────────────────
//  Aspect builder
// ─────────────────────────────────────────────────────────────

export function aspect(key, label, valueCodes) {
	return {
		key,
		label,
		values: valueCodes.map((value) => (typeof value === 'string' ? opt(value) : value)),
	};
}

/** Sanity check used by the seed and the admin editor: weights should sum to ~1.0. */
export function totalWeight(questions) {
	return questions.reduce((sum, question) => sum + Number(question.match_weight ?? 0), 0);
}
