/**
 * Login rate limit (§5.2):
 *   5 failed attempts per (studentId, IP) within 15 minutes → exponential backoff
 *   (30 s, 60 s, 120 s, … up to 15 min).
 *
 * There is NO hard account lockout, so nobody can lock another student out by
 * failing their login on purpose. Kept in memory (resets when the server restarts).
 */

import { RULES } from '../../config/rules.js';
import { tooManyRequests } from '../../lib/errors.js';

const MAX_BACKOFF_MS = 15 * 60 * 1000;

/** key → { failures: number[] (timestamps), blockedUntil: number } */
const entries = new Map();

function keyFor(studentId, ip) {
	return `${String(studentId).toLowerCase()}|${ip}`;
}

function recentFailures(entry, now) {
	return entry.failures.filter((time) => now - time < RULES.loginWindowMs);
}

/** Throws 429 when this (studentId, IP) must wait. */
export function assertLoginAllowed(studentId, ip) {
	const entry = entries.get(keyFor(studentId, ip));

	if (!entry) {
		return;
	}

	const waitMs = entry.blockedUntil - Date.now();

	if (waitMs > 0) {
		const seconds = Math.ceil(waitMs / 1000);

		throw tooManyRequests(
			'TOO_MANY_LOGIN_ATTEMPTS',
			`Too many failed attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`,
			{ retryAfterSeconds: seconds },
		);
	}
}

export function recordLoginFailure(studentId, ip) {
	const key = keyFor(studentId, ip);
	const now = Date.now();

	const entry = entries.get(key) ?? { failures: [], blockedUntil: 0 };

	entry.failures = [...recentFailures(entry, now), now];

	const overLimit = entry.failures.length - RULES.loginFailuresBeforeBackoff;

	if (overLimit >= 0) {
		const backoff = Math.min(MAX_BACKOFF_MS, RULES.loginBackoffBaseMs * 2 ** overLimit);

		entry.blockedUntil = now + backoff;
	}

	entries.set(key, entry);
}

export function clearLoginFailures(studentId, ip) {
	entries.delete(keyFor(studentId, ip));
}

// Forget old entries every 10 minutes so memory does not grow.
setInterval(
	() => {
		const now = Date.now();

		for (const [key, entry] of entries) {
			if (recentFailures(entry, now).length === 0 && entry.blockedUntil < now) {
				entries.delete(key);
			}
		}
	},
	10 * 60 * 1000,
).unref();
