/**
 * zod schemas for a question set. Used to validate:
 *   - AI-drafted sets (scripts/generate-question-sets.js)
 *   - sets an admin edits in the dashboard
 *
 * `normalizeQuestionSet()` adds the automatic "Don't know" option and makes sure the
 * free-text `distinctive_marks` question exists with weight 0.
 */

import { z } from 'zod';

const SNAKE = /^[a-z][a-z0-9_]*$/;

export const optionSchema = z.object({
	code: z.string().regex(SNAKE, 'option codes must be lowercase snake_case'),
	label: z.string().min(1).max(80),
});

export const questionSchema = z.object({
	key: z.string().regex(SNAKE, 'question keys must be lowercase snake_case'),
	text: z.string().min(5).max(200),
	type: z.enum(['single_select', 'multi_select', 'brand', 'text']),
	canon: z.enum(['colour', 'size', 'material', 'damage']).nullable().default(null),
	match_weight: z.number().min(0).max(1),
	options: z.array(optionSchema).max(30).default([]),
	placeholder: z.string().max(120).optional(),
});

export const aspectSchema = z.object({
	key: z.string().regex(SNAKE),
	label: z.string().min(1).max(60),
	values: z.array(optionSchema).min(2).max(10),
});

export const questionSetSchema = z
	.object({
		questions: z.array(questionSchema).min(3).max(15),
		aspects: z.array(aspectSchema).min(4).max(12),
	})
	.superRefine((set, context) => {
		const keys = set.questions.map((question) => question.key);

		if (new Set(keys).size !== keys.length) {
			context.addIssue({ code: 'custom', message: 'question keys must be unique' });
		}

		const aspectKeys = set.aspects.map((aspect) => aspect.key);

		if (new Set(aspectKeys).size !== aspectKeys.length) {
			context.addIssue({ code: 'custom', message: 'aspect keys must be unique' });
		}

		for (const question of set.questions) {
			const isSelect = question.type === 'single_select' || question.type === 'multi_select';

			if (isSelect && question.options.length < 2) {
				context.addIssue({
					code: 'custom',
					message: `question "${question.key}" needs at least 2 options`,
				});
			}
		}
	});

/** A plain JSON schema for Gemini (generated from the zod schema — §10.2). */
export function questionSetJsonSchema() {
	return z.toJSONSchema(
		z.object({
			questions: z.array(
				z.object({
					key: z.string(),
					text: z.string(),
					type: z.enum(['single_select', 'multi_select', 'brand', 'text']),
					canon: z.enum(['colour', 'size', 'material', 'damage', 'none']),
					match_weight: z.number(),
					options: z.array(z.object({ code: z.string(), label: z.string() })),
				}),
			),
			aspects: z.array(
				z.object({
					key: z.string(),
					label: z.string(),
					values: z.array(z.object({ code: z.string(), label: z.string() })),
				}),
			),
		}),
	);
}

/**
 * Makes a set safe to store:
 *   - "none" canon → null
 *   - every select question ends with a "dont_know" option
 *   - a `distinctive_marks` text question exists, with weight 0
 *   - brand / text questions have no options
 */
export function normalizeQuestionSet(set) {
	const questions = set.questions.map((question) => {
		const canon = question.canon === 'none' ? null : (question.canon ?? null);

		if (question.type === 'text' || question.type === 'brand') {
			return {
				...question,
				canon: null,
				options: [],
				match_weight: question.type === 'text' ? 0 : question.match_weight,
			};
		}

		const options = question.options.filter((option) => option.code !== 'dont_know');

		options.push({ code: 'dont_know', label: "Don't know / not sure" });

		return { ...question, canon, options };
	});

	if (!questions.some((question) => question.key === 'distinctive_marks')) {
		questions.push({
			key: 'distinctive_marks',
			text: 'Anything distinctive about it? (stickers, scratches, keychains — but NO card or ID numbers)',
			type: 'text',
			canon: null,
			match_weight: 0,
			options: [],
		});
	}

	const aspects = set.aspects.map((aspect) => ({
		...aspect,
		values: aspect.values.filter(
			(value) => !['none', 'other', 'dont_remember'].includes(value.code),
		),
	}));

	return { questions, aspects };
}

/** Removes internal fields (match_weight, canon) before sending a set to students. */
export function toPublicQuestionSet(row) {
	return {
		id: row.id,
		categoryId: row.category_id,
		version: row.version,
		questions: row.questions.map((question) => ({
			key: question.key,
			text: question.text,
			type: question.type,
			options: question.options,
			placeholder: question.placeholder,
		})),
	};
}
