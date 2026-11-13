/**
 * AI job 3 — EMBEDDINGS (§10.1)
 *
 * One batched call per report: the `distinctive_marks` text + every free-text
 * ("other") follow-up answer. Exactly ONE embedding model (GEMINI_MODEL_EMBEDDING);
 * keys still rotate, but the model never falls back, because vectors from different
 * models must never be compared.
 */

import { config } from '../../config/env.js';
import { embedTexts } from './geminiClient.js';
import { runAiStep } from './runAiStep.js';

/**
 * @param {string[]} texts
 * @returns {Promise<{ model: string, vectors: number[][] }>}
 */
export async function embed(texts) {
	const model = config.models.EMBEDDING;

	const { result } = await runAiStep({
		job: 'embedding',
		models: [model],

		call: ({ model: modelName, key, timeoutMs }) =>
			embedTexts({
				model: modelName,
				key,
				texts,
				timeoutMs,
			}),
	});

	return { model, vectors: result };
}
