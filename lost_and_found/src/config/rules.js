/**
 * Business rules in ONE place.
 *
 * Every timeout, limit and threshold from the spec lives here, so the numbers can be
 * printed in the report and changed without hunting through the code.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RULES = Object.freeze({
	// ── Auth (§5.2) ──────────────────────────────────────────
	accessTokenTtl: '7d',
	refreshTokenTtlMs: 15 * DAY,
	loginFailuresBeforeBackoff: 5,
	loginWindowMs: 15 * MINUTE,
	loginBackoffBaseMs: 30 * 1000,

	// ── Reports and drafts (§7.5 rework) ─────────────────────
	draftsPerDay: 10,
	maxUnfinishedDrafts: 3,
	draftIdleExpiryMs: 7 * DAY,
	draftExpiryWarningMs: 6 * DAY,
	extractionCacheMs: 24 * HOUR,
	minPhotos: 2,
	maxPhotos: 5,
	followupsMin: 3,
	followupsMax: 4,

	// ── Deposit OTP — finder (D3) ────────────────────────────
	depositOtpTtlMs: 30 * MINUTE,
	depositGenerationLimit: 5,

	// ── Collection OTP — owner (D3) ──────────────────────────
	collectOtpTtlMs: 5 * MINUTE,
	collectGenerationLimit: 5,
	matchHoldMs: 72 * HOUR,

	// ── Kiosk brute-force protection (corner case 17) ────────
	kioskWrongCodesLimit: 5,
	kioskWrongCodesWindowMs: 60 * 1000,
	kioskLockoutMs: 5 * MINUTE,

	// ── Lockers and devices ──────────────────────────────────
	doorOpenUnresolvedMs: 60 * 1000,
	unclaimedAfterMs: 10 * DAY,
	devicePollIntervalMs: 1000,
	deviceHeartbeatIntervalMs: 30 * 1000,
	deviceOfflineAfterMs: 3 * 30 * 1000,
	deviceLastSeenWriteMs: 5 * MINUTE,

	// ── Matching (§8) ────────────────────────────────────────
	autoMatchThreshold: 0.85,
	reviewThreshold: 0.5,
	coverageCap: 0.84,
	minCoverage: 0.5,
	minOverlappingAspects: 3,
	embeddingWaitMs: 10 * 1000,
	dateToleranceDays: 1,

	// ── Background sweeper ───────────────────────────────────
	sweepIntervalMs: 30 * 1000,
});

export const TIME = Object.freeze({ MINUTE, HOUR, DAY });
