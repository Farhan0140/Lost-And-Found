/**
 * Every Gemini failure is turned into an `AiError` with a `kind`, so the failover
 * runner can decide what to do (§10.3):
 *
 *   kind               what happened                        runner action
 *   ─────────────────  ───────────────────────────────────  ─────────────────────────────────
 *   timeout            no answer within AI_TIMEOUT_MS       retry once after 1 s, then next key
 *   server             5xx from Google                      retry once after 1 s, then next key
 *   network            DNS / connection problem             retry once after 1 s, then next key
 *   rate_limit         429 per-minute limit                 wait if ≤ 2 s, else cool key, next key
 *   quota              429 daily quota used up              cool key for a long time, next key
 *   auth               bad / blocked key (400/401/403)      disable key until restart, next key
 *   model_not_found    404 — wrong model name in .env       skip this model on ALL keys
 *   bad_request        400 — our request is wrong           skip this model on ALL keys
 *   safety             blocked by Google's safety filter    next key once, then the step fails
 *   empty              no text in the answer                next key once, then the step fails
 *   invalid_output     schema / personal-data check failed  regenerate once, then next key
 */

export class AiError extends Error {
	constructor(kind, message, { status = null, retryAfterMs = null } = {}) {
		super(message);

		this.name = 'AiError';
		this.kind = kind;
		this.status = status;
		this.retryAfterMs = retryAfterMs;
	}
}

/** Thrown when every key and every model failed, or the step deadline ran out. */
export class AiStepFailedError extends Error {
	constructor(job, attempts, reason) {
		super(`AI step "${job}" failed: ${reason}`);

		this.name = 'AiStepFailedError';
		this.job = job;
		this.attempts = attempts;
		this.reason = reason;
	}
}

/** Short labels used in log lines and in the draft's "why it stopped" message. */
export const KIND_LABELS = {
	timeout: 'timed out',
	server: 'Google server error',
	network: 'network error',
	rate_limit: 'rate limited',
	quota: 'daily quota used up',
	auth: 'key rejected',
	model_not_found: 'model not found',
	bad_request: 'request rejected',
	safety: 'blocked by safety filter',
	empty: 'empty answer',
	invalid_output: 'answer failed validation',
};

// ─────────────────────────────────────────────────────────────
//  HTTP error → AiError
// ─────────────────────────────────────────────────────────────

/** "38s" / "1.5s" → milliseconds */
function parseDuration(value) {
	const match = /^([\d.]+)s$/.exec(String(value ?? ''));

	return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

/** Milliseconds until the next midnight in Pacific time (when Gemini daily quotas reset). */
export function msUntilPacificMidnight() {
	const now = new Date();

	const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
	const nextMidnight = new Date(pacific);

	nextMidnight.setHours(24, 0, 0, 0);

	return Math.max(60_000, nextMidnight.getTime() - pacific.getTime());
}

export function classifyHttpError(status, body) {
	const error = body?.error ?? {};
	const message = String(error.message ?? `HTTP ${status}`);
	const details = Array.isArray(error.details) ? error.details : [];

	// ── 429: per-minute rate limit vs daily quota ──
	if (status === 429) {
		const retryInfo = details.find((detail) => String(detail['@type']).endsWith('RetryInfo'));
		const quotaFailure = details.find((detail) =>
			String(detail['@type']).endsWith('QuotaFailure'),
		);

		const isDaily = (quotaFailure?.violations ?? []).some((violation) =>
			/PerDay/i.test(String(violation.quotaId ?? '')),
		);

		if (isDaily) {
			return new AiError('quota', 'Daily quota used up', {
				status,
				retryAfterMs: msUntilPacificMidnight(),
			});
		}

		return new AiError('rate_limit', 'Rate limited', {
			status,
			retryAfterMs: parseDuration(retryInfo?.retryDelay) ?? 30_000,
		});
	}

	// ── key problems ──
	const reasons = details.map((detail) => detail.reason).filter(Boolean);

	const keyProblem =
		status === 401 ||
		status === 403 ||
		reasons.includes('API_KEY_INVALID') ||
		/API key (not valid|expired)/i.test(message) ||
		/location is not supported/i.test(message);

	if (keyProblem) {
		return new AiError('auth', message, { status });
	}

	if (status === 404) {
		return new AiError('model_not_found', message, { status });
	}

	if (status === 400) {
		return new AiError('bad_request', message, { status });
	}

	if (status >= 500) {
		return new AiError('server', message, { status });
	}

	return new AiError('bad_request', message, { status });
}
