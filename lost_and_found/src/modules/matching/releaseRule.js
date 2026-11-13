/**
 * Thresholds and the automatic-release rule (§8.4). PURE functions.
 *
 *   score ≥ 0.85 AND release rule met   → auto_matched (owner can tap "Get OTP")
 *   score ≥ 0.85 but rule NOT met       → review       (admin decides)
 *   0.50 ≤ score < 0.85                 → review
 *   score < 0.50                        → no match row
 *
 * Release rule — ALL must hold:
 *   1. score ≥ 0.85
 *   2. the found item is `stored` in a locker
 *   3. at least 3 follow-up aspects answered by both sides
 *   4. no conflict on any of those aspects
 *   5. exactly ONE eligible lost report for that found item
 *
 * Follow-ups can only VETO an automatic release — never create one on their own.
 */

import { RULES } from '../../config/rules.js';

export function evaluateReleaseRule({ score, foundStatus, followups, eligibleLostCount }) {
	const failures = [];

	if (score < RULES.autoMatchThreshold) {
		failures.push('score_below_auto_threshold');
	}

	if (foundStatus !== 'stored') {
		failures.push('found_item_not_stored');
	}

	if ((followups?.overlapping ?? 0) < RULES.minOverlappingAspects) {
		failures.push('fewer_than_3_overlapping_aspects');
	}

	if ((followups?.conflict ?? 0) > 0) {
		failures.push('followup_conflict');
	}

	if (eligibleLostCount !== 1) {
		failures.push('several_eligible_reports');
	}

	return {
		met: failures.length === 0,
		failures,
	};
}

/** Returns 'auto_matched', 'review' or null (no match row). */
export function decideMatchStatus(score, releaseRule) {
	if (score < RULES.reviewThreshold) {
		return null;
	}

	if (score >= RULES.autoMatchThreshold && releaseRule.met) {
		return 'auto_matched';
	}

	return 'review';
}

/** Human-readable reason for the admin review queue. */
export function describeReviewReason(score, releaseRule) {
	if (score < RULES.autoMatchThreshold) {
		return 'Score in the review band (0.50 – 0.85)';
	}

	const labels = {
		found_item_not_stored: 'found item is not in a locker yet',
		fewer_than_3_overlapping_aspects: 'fewer than 3 follow-up aspects answered by both sides',
		followup_conflict: 'a follow-up answer conflicts',
		several_eligible_reports: 'several lost reports are eligible for this item',
	};

	const reasons = releaseRule.failures
		.filter((failure) => labels[failure])
		.map((failure) => labels[failure]);

	return `High score, but ${reasons.join('; ')}`;
}

/** Colour band used by the clients (§14.3). */
export function scoreBand(score) {
	if (score >= RULES.autoMatchThreshold) {
		return 'high';
	}

	if (score >= RULES.reviewThreshold) {
		return 'medium';
	}

	return 'low';
}
