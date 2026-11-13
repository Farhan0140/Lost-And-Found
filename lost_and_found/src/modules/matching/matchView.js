/**
 * What each person may see of a match (§8.5).
 *
 *   ADMIN    full breakdown: every field, BOTH sides' values, follow-up answers, weights.
 *   STUDENT  only a score band (high / medium / low) and per-field agree / conflict /
 *            missing flags — NEVER the other side's values, so a match view cannot be
 *            used to learn what the finder wrote.
 */

import { RULES } from '../../config/rules.js';
import { scoreBand } from './releaseRule.js';

const RESULT_TO_FLAG = {
	agree: 'agree',
	partial: 'agree',
	conflict: 'conflict',
	missing: 'missing',
	neutral: 'missing',
};

/** @param questionTexts  Map questionKey → question text (from the public question set) */
export function toStudentMatchView(match, { role, questionTexts = new Map() }) {
	const breakdown = match.breakdown ?? {};

	const view = {
		id: match.id,
		status: match.status,
		band: scoreBand(Number(match.score)),
		createdAt: match.created_at,
	};

	// The finder only learns THAT the item was matched, nothing about the owner's report.
	if (role === 'finder') {
		return view;
	}

	const isLive = ['auto_matched', 'approved', 'otp_issued'].includes(match.status);

	return {
		...view,
		reviewNote: match.status === 'review' ? 'An admin is checking this possible match.' : null,
		fields: (breakdown.fields ?? []).map((field) => ({
			key: field.key,
			question: questionTexts.get(field.key) ?? field.key,
			flag: RESULT_TO_FLAG[field.result] ?? 'missing',
		})),
		followups: (breakdown.followups?.aspects ?? []).map((aspect) => ({
			aspect: aspect.aspect,
			flag: RESULT_TO_FLAG[aspect.result] ?? 'missing',
		})),
		holdExpiresAt: isLive ? match.hold_expires_at : null,
		collectGenerations: match.collect_generations,
		collectGenerationLimit: match.collect_generation_limit,
		canGetOtp: isLive && match.collect_generations < match.collect_generation_limit,
		otpWarning: `The collection code is valid for only ${RULES.collectOtpTtlMs / 60000} minutes — generate it when you are standing at the locker.`,
	};
}

/** Full view for the admin review screen. */
export function toAdminMatchView(match) {
	return {
		id: match.id,
		status: match.status,
		score: Number(match.score),
		band: scoreBand(Number(match.score)),
		breakdown: match.breakdown,
		weightsVersion: match.weights_version,
		scoredWithoutEmbedding: match.scored_without_embedding,
		releaseRuleMet: match.release_rule_met,
		reviewReason: match.review_reason,
		holdExpiresAt: match.hold_expires_at,
		collectGenerations: match.collect_generations,
		collectGenerationLimit: match.collect_generation_limit,
		decidedBy: match.decided_by,
		decisionReason: match.decision_reason,
		decidedAt: match.decided_at,
		foundReportId: match.found_report_id,
		lostReportId: match.lost_report_id,
		createdAt: match.created_at,
		updatedAt: match.updated_at,
	};
}
