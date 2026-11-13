/**
 * Health of each Gemini key slot (GEMINI_API_KEY1 … GEMINI_API_KEY10).
 *
 *   - Keys are tried in numeric order. A key that is cooling down or disabled is skipped.
 *   - Circuit breaker: 3 consecutive failures → the key rests for 60 s, then it is tried again.
 *   - 429 per-minute → rests for Google's retry delay. Daily quota → rests until reset.
 *   - Bad key (auth) → disabled until the server restarts (logged loudly).
 *
 * Keys themselves never leave this module except to make the HTTP call.
 * Logs and the admin dashboard only ever see the SLOT NUMBER.
 */

import { EventEmitter } from 'node:events';

import { config } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

const CIRCUIT_FAILURES = 3;
const CIRCUIT_REST_MS = 60_000;

/** Emits 'recovered' when an AI call succeeds after a step had failed completely. */
export const aiEvents = new EventEmitter();

const slots = new Map();

for (const { slot, key } of config.ai.keys) {
	slots.set(slot, {
		slot,
		key,
		cooldownUntil: 0,
		cooldownReason: null,
		disabled: false,
		disabledReason: null,
		consecutiveFailures: 0,
		successes: 0,
		failures: 0,
		lastError: null,
		lastErrorAt: null,
		lastSuccessAt: null,
	});
}

let lastStepFailedAt = null;
let lastSuccessAt = null;

// ─────────────────────────────────────────────────────────────
//  Reading
// ─────────────────────────────────────────────────────────────

export function hasAnyKey() {
	return slots.size > 0;
}

/** Slots that can be used right now, in numeric order. */
export function availableSlots() {
	const now = Date.now();

	return [...slots.values()]
		.filter((state) => !state.disabled && state.cooldownUntil <= now)
		.sort((a, b) => a.slot - b.slot);
}

export function keyForSlot(slot) {
	return slots.get(slot)?.key ?? null;
}

// ─────────────────────────────────────────────────────────────
//  Recording results
// ─────────────────────────────────────────────────────────────

export function recordSuccess(slot) {
	const state = slots.get(slot);

	if (!state) {
		return;
	}

	state.consecutiveFailures = 0;
	state.successes++;
	state.lastSuccessAt = new Date();

	lastSuccessAt = new Date();

	// AI is back after an outage → let the drafts module tell waiting users.
	if (lastStepFailedAt) {
		lastStepFailedAt = null;

		logger.info('ai', 'Gemini is answering again — waiting drafts can resume');
		aiEvents.emit('recovered');
	}
}

export function recordFailure(slot, error) {
	const state = slots.get(slot);

	if (!state) {
		return;
	}

	state.failures++;
	state.consecutiveFailures++;
	state.lastError = `${error.kind}: ${String(error.message).slice(0, 160)}`;
	state.lastErrorAt = new Date();

	if (error.kind === 'auth') {
		disableSlot(slot, error.message);
		return;
	}

	if (error.kind === 'quota') {
		coolDownSlot(slot, error.retryAfterMs, 'daily quota used up');
		return;
	}

	if (error.kind === 'rate_limit') {
		coolDownSlot(slot, error.retryAfterMs ?? 30_000, 'rate limited');
		return;
	}

	if (state.consecutiveFailures >= CIRCUIT_FAILURES) {
		coolDownSlot(slot, CIRCUIT_REST_MS, `${CIRCUIT_FAILURES} failures in a row`);
	}
}

export function coolDownSlot(slot, ms, reason) {
	const state = slots.get(slot);

	if (!state) {
		return;
	}

	state.cooldownUntil = Date.now() + ms;
	state.cooldownReason = reason;

	logger.warn('ai', `Key #${slot} resting for ${logger.formatDuration(ms)} — ${reason}`);
}

export function disableSlot(slot, reason) {
	const state = slots.get(slot);

	if (!state || state.disabled) {
		return;
	}

	state.disabled = true;
	state.disabledReason = reason;

	logger.error('ai', `Key #${slot} DISABLED until restart — ${reason}`, {
		hint: `check GEMINI_API_KEY${slot} in .env`,
	});
}

export function recordStepFailed() {
	lastStepFailedAt = new Date();
}

// ─────────────────────────────────────────────────────────────
//  Health summary for the admin dashboard
// ─────────────────────────────────────────────────────────────

export function getAiHealth() {
	const now = Date.now();

	const keys = [...slots.values()].map((state) => {
		let status = 'ready';

		if (state.disabled) {
			status = 'disabled';
		} else if (state.cooldownUntil > now) {
			status = 'resting';
		}

		return {
			slot: state.slot,
			status,
			restingForSeconds:
				status === 'resting' ? Math.ceil((state.cooldownUntil - now) / 1000) : 0,
			reason: state.disabledReason ?? (status === 'resting' ? state.cooldownReason : null),
			successes: state.successes,
			failures: state.failures,
			lastError: state.lastError,
			lastErrorAt: state.lastErrorAt,
			lastSuccessAt: state.lastSuccessAt,
		};
	});

	const ready = keys.filter((key) => key.status === 'ready').length;

	let overall = 'ok';

	if (keys.length === 0 || ready === 0) {
		overall = 'down';
	} else if (lastStepFailedAt || ready < keys.length) {
		overall = 'degraded';
	}

	return {
		overall,
		configuredKeys: keys.length,
		readyKeys: ready,
		lastSuccessAt,
		lastStepFailedAt,
		models: config.models,
		keys,
	};
}

/** True when at least one key is usable right now. */
export function isAiAvailable() {
	return availableSlots().length > 0;
}
