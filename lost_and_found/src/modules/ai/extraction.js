/**
 * AI job 1 — PHOTO EXTRACTION (§7.2)
 *
 * One call with all photos inline → { category, prefilled answers, brand, marks }.
 * Everything returned is a SUGGESTION: the user confirms or edits every answer.
 */

import { z } from 'zod';

import { config } from '../../config/env.js';
import { AiError } from './aiErrors.js';
import { generateJson } from './geminiClient.js';
import { scrubPersonalData } from './piiFilter.js';
import { EXTRACTION_SYSTEM, extractionUserPrompt, promptHash } from './prompts.js';
import { runAiStep } from './runAiStep.js';

/**
 * @param {object} input
 * @param {Array}  input.images      [{ role, mimeType, data (base64) }]
 * @param {Array}  input.categories  [{ id, slug, name, questions }] — the active sets to choose from
 * @returns {Promise<object>} { categorySlug, confidence, brandText, answers, distinctiveMarks, model, slot, promptHash }
 */
export async function extractFromPhotos({ images, categories }) {
	const slugs = categories.map((category) => category.slug);

	const responseSchema = z.object({
		category: z.enum(slugs),
		confidence: z.number().min(0).max(1),
		brand_text: z.string(),
		distinctive_marks: z.string(),
		answers: z.array(
			z.object({
				key: z.string(),
				codes: z.array(z.string()),
			}),
		),
	});

	const userPrompt = extractionUserPrompt(
		categories,
		images.map((image) => image.role),
	);

	const parts = [
		{ text: userPrompt },
		...images.map((image) => ({
			inlineData: {
				mimeType: image.mimeType,
				data: image.data,
			},
		})),
	];

	const { result, model, slot } = await runAiStep({
		job: 'extraction',
		models: config.models.EXTRACTION,

		call: async ({ model: modelName, key, timeoutMs }) => {
			const raw = await generateJson({
				model: modelName,
				key,
				systemPrompt: EXTRACTION_SYSTEM,
				parts,
				jsonSchema: z.toJSONSchema(responseSchema),
				temperature: 0.1,
				timeoutMs,
			});

			const parsed = responseSchema.safeParse(raw);

			if (!parsed.success) {
				throw new AiError(
					'invalid_output',
					parsed.error.issues[0]?.message ?? 'schema mismatch',
				);
			}

			return parsed.data;
		},
	});

	const category = categories.find((item) => item.slug === result.category);

	return {
		categorySlug: category.slug,
		categoryId: category.id,
		confidence: result.confidence,
		brandText: scrubPersonalData(result.brand_text).trim().slice(0, 60),
		distinctiveMarks: scrubPersonalData(result.distinctive_marks).trim().slice(0, 300),
		answers: keepValidAnswers(category, result.answers),
		model,
		slot,
		promptHash: promptHash(EXTRACTION_SYSTEM, userPrompt),
	};
}

/**
 * Drops anything the model invented: unknown keys, unknown codes, and extra codes
 * on single_select questions. Returns { [key]: [codes] }.
 */
function keepValidAnswers(category, answers) {
	const result = {};

	for (const answer of answers) {
		const question = category.questions.find((item) => item.key === answer.key);

		if (!question || question.type === 'text' || question.type === 'brand') {
			continue;
		}

		const allowed = new Set(question.options.map((option) => option.code));

		let codes = [...new Set(answer.codes)].filter((code) => allowed.has(code));

		if (codes.length === 0) {
			continue;
		}

		if (question.type === 'single_select') {
			codes = [codes[0]];
		}

		result[question.key] = codes;
	}

	return result;
}
