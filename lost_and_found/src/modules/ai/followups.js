/**
 * AI job 2 — FOLLOW-UP QUESTIONS (D1b, §7.3)
 *
 * 3–4 questions per report, each tagged with an aspect from the category's frozen list.
 * Option codes MUST come from that aspect's value list, so two different questions
 * about the same aspect can be compared exactly later.
 *
 * Output is checked by the SAME zod schema and the personal-data filter before it
 * touches Postgres. Failing either → regenerate once, then the next key.
 */

import { z } from 'zod';

import { config } from '../../config/env.js';
import { RULES } from '../../config/rules.js';
import { AiError } from './aiErrors.js';
import { generateJson } from './geminiClient.js';
import { findPersonalData } from './piiFilter.js';
import { FOLLOWUPS_SYSTEM, followupsUserPrompt, promptHash } from './prompts.js';
import { runAiStep } from './runAiStep.js';

/**
 * @param {object} input
 * @param {'found'|'lost'} input.kind
 * @param {string} input.categoryName
 * @param {Array}  input.aspects          the category's frozen aspect list
 * @param {string} input.answerSummary    "Brand: Samsung\nScreen: cracked…"
 * @param {string} input.distinctiveMarks
 * @param {Array}  input.images           optional [{ mimeType, data }]
 * @returns {Promise<{ questions, model, slot, promptHash }>}
 */
export async function generateFollowups({
	kind,
	categoryName,
	aspects,
	answerSummary,
	distinctiveMarks,
	images = [],
}) {
	const aspectKeys = aspects.map((aspect) => aspect.key);

	const responseSchema = z.object({
		questions: z
			.array(
				z.object({
					aspect: z.enum(aspectKeys),
					text: z.string().min(8).max(200),
					options: z
						.array(
							z.object({
								code: z.string(),
								label: z.string().min(1).max(80),
							}),
						)
						.max(6),
				}),
			)
			.min(RULES.followupsMin)
			.max(RULES.followupsMax),
	});

	const userPrompt = followupsUserPrompt({
		kind,
		categoryName,
		aspects,
		answerSummary,
		distinctiveMarks,
		hasPhotos: images.length > 0,
	});

	const parts = [
		{ text: userPrompt },
		...images.map((image) => ({
			inlineData: { mimeType: image.mimeType, data: image.data },
		})),
	];

	const { result, model, slot } = await runAiStep({
		job: 'followups',
		models: config.models.FOLLOWUPS,

		call: async ({ model: modelName, key, timeoutMs }) => {
			const raw = await generateJson({
				model: modelName,
				key,
				systemPrompt: FOLLOWUPS_SYSTEM,
				parts,
				jsonSchema: z.toJSONSchema(responseSchema),
				temperature: 0.4,
				timeoutMs,
			});

			const parsed = responseSchema.safeParse(raw);

			if (!parsed.success) {
				throw new AiError(
					'invalid_output',
					parsed.error.issues[0]?.message ?? 'schema mismatch',
				);
			}

			return checkFollowups(parsed.data.questions, aspects);
		},
	});

	return {
		questions: result,
		model,
		slot,
		promptHash: promptHash(FOLLOWUPS_SYSTEM, userPrompt),
	};
}

/**
 * Rules the JSON schema cannot express:
 *   - one question per aspect
 *   - option codes must belong to the aspect's value list (unknown codes are dropped)
 *   - at least 2 valid options per question
 *   - no personal data anywhere
 */
function checkFollowups(questions, aspects) {
	const seen = new Set();
	const checked = [];

	for (const question of questions) {
		if (seen.has(question.aspect)) {
			throw new AiError('invalid_output', `two questions about aspect "${question.aspect}"`);
		}

		seen.add(question.aspect);

		const aspect = aspects.find((item) => item.key === question.aspect);
		const allowed = new Set(aspect.values.map((value) => value.code));

		const options = [];
		const usedCodes = new Set();

		for (const option of question.options) {
			if (allowed.has(option.code) && !usedCodes.has(option.code)) {
				options.push(option);
				usedCodes.add(option.code);
			}
		}

		if (options.length < 2) {
			throw new AiError(
				'invalid_output',
				`question about "${question.aspect}" has < 2 valid options`,
			);
		}

		const texts = [question.text, ...options.map((option) => option.label)];

		for (const text of texts) {
			const problem = findPersonalData(text);

			if (problem) {
				throw new AiError('invalid_output', `personal data filter: ${problem}`);
			}
		}

		checked.push({
			aspect: question.aspect,
			text: question.text.trim(),
			options,
		});
	}

	return checked;
}
