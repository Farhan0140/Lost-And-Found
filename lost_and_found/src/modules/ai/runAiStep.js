/**
 * Runs ONE AI step with key rotation, model fallback and a deadline (D4, §10.3).
 *
 *     const { result, model, slot } = await runAiStep({
 *         job: 'followups',
 *         models: config.models.FOLLOWUPS,          // e.g. ['gemini-3.1-flash-lite', 'gemini-2.5-flash']
 *         call: ({ model, key, timeoutMs }) => …,  // makes the request AND validates the answer
 *     });
 *
 * Order: model 1 on key #1, #2, … #10 → model 2 on key #1, #2, … → … until one works.
 * The whole step is limited by AI_STEP_DEADLINE_MS; each call by AI_TIMEOUT_MS.
 * If everything fails, throws AiStepFailedError — the caller keeps the report as a draft.
 */

import { config } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { AiError, AiStepFailedError, KIND_LABELS } from './aiErrors.js';
import {
	availableSlots,
	hasAnyKey,
	keyForSlot,
	recordFailure,
	recordStepFailed,
	recordSuccess,
} from './keyPool.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Error kinds that mean "this model is wrong", not "this key is wrong". */
const SKIP_MODEL_KINDS = new Set(['model_not_found', 'bad_request']);

/** Error kinds that refuse on content; we only try ONE more key for these. */
const REFUSAL_KINDS = new Set(['safety', 'empty']);

export async function runAiStep({ job, models, call }) {
	const deadline = Date.now() + config.ai.stepDeadlineMs;
	const attempts = [];

	let refusals = 0;

	if (!hasAnyKey()) {
		recordStepFailed();
		throw new AiStepFailedError(job, attempts, 'no GEMINI_API_KEY is configured in .env');
	}

	for (const model of models) {
		const slots = availableSlots();

		if (slots.length === 0) {
			break;
		}

		for (const { slot } of slots) {
			if (Date.now() >= deadline) {
				recordStepFailed();
				throw new AiStepFailedError(job, attempts, 'the time limit for this step ran out');
			}

			const outcome = await tryOneKey({ job, model, slot, deadline, call, attempts });

			if (outcome.ok) {
				return {
					result: outcome.result,
					model,
					slot,
				};
			}

			const error = outcome.error;

			if (SKIP_MODEL_KINDS.has(error.kind)) {
				logger.error('ai', `Model "${model}" cannot be used for ${job}: ${error.message}`, {
					hint: 'check the GEMINI_MODEL_* names in .env (npm run list-models)',
				});
				break;
			}

			if (REFUSAL_KINDS.has(error.kind)) {
				refusals++;

				if (refusals >= 2) {
					recordStepFailed();
					throw new AiStepFailedError(job, attempts, KIND_LABELS[error.kind]);
				}
			}
		}
	}

	recordStepFailed();

	const lastKind = attempts.at(-1)?.kind;
	const reason = lastKind
		? `every key failed (last: ${KIND_LABELS[lastKind] ?? lastKind})`
		: 'every key is resting or disabled';

	throw new AiStepFailedError(job, attempts, reason);
}

/**
 * One key, with at most ONE retry on the same key:
 *   timeout / server / network → after 1 s
 *   rate_limit with retry-after ≤ 2 s → after that delay
 *   invalid_output → regenerate immediately
 */
async function tryOneKey({ job, model, slot, deadline, call, attempts }) {
	const key = keyForSlot(slot);

	for (let attempt = 1; attempt <= 2; attempt++) {
		const timeoutMs = Math.min(config.ai.callTimeoutMs, deadline - Date.now());

		if (timeoutMs < 1000) {
			return { ok: false, error: new AiError('timeout', 'step deadline reached') };
		}

		const started = Date.now();

		try {
			const result = await call({ model, key, timeoutMs });

			logger.ai({ job, slot, model, durationMs: Date.now() - started, outcome: 'OK' });

			recordSuccess(slot);

			return { ok: true, result };
		} catch (thrown) {
			const error =
				thrown instanceof AiError ? thrown : new AiError('invalid_output', thrown.message);

			attempts.push({ model, slot, kind: error.kind, message: error.message });

			logger.ai({
				job,
				slot,
				model,
				durationMs: Date.now() - started,
				outcome: KIND_LABELS[error.kind] ?? error.kind,
				note: String(error.message).slice(0, 120),
			});

			const canRetry =
				attempt === 1 &&
				(['timeout', 'server', 'network', 'invalid_output'].includes(error.kind) ||
					(error.kind === 'rate_limit' && (error.retryAfterMs ?? Infinity) <= 2000));

			if (canRetry) {
				let wait = 1000;

				if (error.kind === 'rate_limit') {
					wait = error.retryAfterMs;
				}

				if (error.kind === 'invalid_output') {
					wait = 0;
				}

				await sleep(wait);
				continue;
			}

			// model problems are not the key's fault
			if (!SKIP_MODEL_KINDS.has(error.kind)) {
				recordFailure(slot, error);
			}

			return { ok: false, error };
		}
	}

	return { ok: false, error: new AiError('server', 'retry exhausted') };
}
