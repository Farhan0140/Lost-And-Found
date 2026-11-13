/**
 * AI job 4 — QUESTION-SET DRAFTING (admin time only, D1)
 *
 * Uses the capable model tier (GEMINI_MODEL_QUESTIONS). The result is saved as a
 * DRAFT. A human must review and activate it — it is never auto-activated.
 */

import { config } from '../../config/env.js';
import { AiError } from './aiErrors.js';
import { generateJson } from './geminiClient.js';
import { QUESTION_SET_SYSTEM, questionSetUserPrompt } from './prompts.js';
import { runAiStep } from './runAiStep.js';
import {
	normalizeQuestionSet,
	questionSetJsonSchema,
	questionSetSchema,
} from '../questionSets/questionSet.schema.js';
import { findPersonalData } from './piiFilter.js';

export async function draftQuestionSet(categoryName) {
	const { result, model, slot } = await runAiStep({
		job: 'questions',
		models: config.models.QUESTIONS,

		call: async ({ model: modelName, key, timeoutMs }) => {
			const raw = await generateJson({
				model: modelName,
				key,
				systemPrompt: QUESTION_SET_SYSTEM,
				parts: [{ text: questionSetUserPrompt(categoryName) }],
				jsonSchema: questionSetJsonSchema(),
				temperature: 0.3,
				timeoutMs,
			});

			const normalized = normalizeQuestionSet(raw);
			const parsed = questionSetSchema.safeParse(normalized);

			if (!parsed.success) {
				throw new AiError(
					'invalid_output',
					parsed.error.issues[0]?.message ?? 'schema mismatch',
				);
			}

			for (const question of parsed.data.questions) {
				const problem = findPersonalData(question.text);

				if (problem) {
					throw new AiError('invalid_output', `personal data filter: ${problem}`);
				}
			}

			return parsed.data;
		},
	});

	return { ...result, model, slot };
}
