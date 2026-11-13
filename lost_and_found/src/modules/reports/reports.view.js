/**
 * Builds the JSON a client sees for a report.
 *
 *   getReportView(reportId, { viewer: 'owner' })  → the reporter's own view
 *   getReportView(reportId, { viewer: 'admin' })  → everything (incl. match_weight, AI metadata)
 *   listOwnReports(userId, tab)                   → cards for "My reports"
 *
 * OTP CODES are never part of this view; they are fetched separately by their owner.
 */

import { RULES } from '../../config/rules.js';
import { query } from '../../db/pool.js';
import { toPublicQuestionSet } from '../questionSets/questionSet.schema.js';
import { toAdminMatchView, toStudentMatchView } from '../matching/matchView.js';
import { aiAccuracy } from './answers.js';

/** Plain-language "where it stopped and why" for the Drafts tab (§7.5 rework). */
function draftProgress(report, followupCount, answeredFollowups) {
	const steps = [
		{ key: 'start', label: 'Choose photos or manual' },
		{ key: 'answers', label: 'Answer the questions' },
		{ key: 'followups', label: 'Follow-up questions' },
		{ key: 'review', label: 'Review and submit' },
	];

	let current = 'start';

	if (report.question_set_id) {
		current = 'answers';
	}

	if (followupCount > 0) {
		current = answeredFollowups < followupCount ? 'followups' : 'review';
	}

	let stoppedBecause = null;

	if (report.ai_status === 'waiting') {
		const what =
			report.ai_waiting_step === 'extraction'
				? 'Photos could not be read'
				: 'Follow-up questions could not be generated';

		stoppedBecause = `${what} (${report.ai_error ?? 'AI unavailable'}).`;
	}

	return {
		steps,
		current,
		waitingForAi: report.ai_status === 'waiting',
		waitingStep: report.ai_waiting_step,
		stoppedBecause,
		failedAt: report.ai_failed_at,
		expiresAt: new Date(new Date(report.last_activity_at).getTime() + RULES.draftIdleExpiryMs),
	};
}

export async function getReportView(reportId, { viewer = 'owner' } = {}) {
	const { rows } = await query(
		`
		select
			r.*,
			c.name as category_name, c.slug as category_slug, c.icon as category_icon,
			z.name as zone_name, z.department as zone_department,
			l.label as locker_label,
			u.student_id as reporter_student_id, u.full_name as reporter_name
		from reports r
		left join categories c on c.id = r.category_id
		left join campus_zones z on z.id = r.zone_id
		left join lockers l on l.id = r.locker_id
		join users u on u.id = r.user_id
		where r.id = $1
		`,
		[reportId],
	);

	const report = rows[0];

	if (!report) {
		return null;
	}

	const isAdmin = viewer === 'admin';

	// ── question set ──
	let questionSet = null;

	if (report.question_set_id) {
		const result = await query('select * from question_sets where id = $1', [
			report.question_set_id,
		]);

		questionSet = isAdmin ? result.rows[0] : toPublicQuestionSet(result.rows[0]);
	}

	// ── follow-ups (private: reporter + admins only) ──
	const followupResult = await query(
		`
		select id, position, aspect, question_text, options, answer_kind, answer_code, answer_text,
		       ai_model, ai_key_slot, prompt_hash
		from report_followups
		where report_id = $1
		order by position
		`,
		[reportId],
	);

	const followups = followupResult.rows.map((row) => ({
		id: row.id,
		position: row.position,
		aspect: row.aspect,
		text: row.question_text,
		options: row.options,
		answer: row.answer_kind
			? { kind: row.answer_kind, code: row.answer_code, text: row.answer_text }
			: null,
		...(isAdmin
			? { model: row.ai_model, keySlot: row.ai_key_slot, promptHash: row.prompt_hash }
			: {}),
	}));

	// ── active OTP (without the code) ──
	const otpResult = await query(
		`
		select action, expires_at, generation
		from otps
		where report_id = $1 and status = 'active' and expires_at > now()
		order by created_at desc
		limit 1
		`,
		[reportId],
	);

	// ── matches ──
	const matchColumn = report.kind === 'found' ? 'found_report_id' : 'lost_report_id';

	const matchResult = await query(
		`
		select *
		from matches
		where ${matchColumn} = $1
		  and status not in ('superseded')
		order by score desc
		`,
		[reportId],
	);

	const questionTexts = new Map(
		(questionSet?.questions ?? []).map((question) => [question.key, question.text]),
	);

	let matches;

	if (isAdmin) {
		matches = matchResult.rows.map(toAdminMatchView);
	} else {
		// students do not see rejected/expired candidates or the review queue of a found item
		const visible = matchResult.rows.filter((match) =>
			report.kind === 'lost'
				? !['rejected', 'expired'].includes(match.status)
				: ['auto_matched', 'approved', 'otp_issued', 'collected'].includes(match.status),
		);

		matches = visible.map((match) =>
			toStudentMatchView(match, {
				role: report.kind === 'found' ? 'finder' : 'owner',
				questionTexts,
			}),
		);
	}

	const answeredFollowups = followups.filter((followup) => followup.answer).length;

	const view = {
		id: report.id,
		kind: report.kind,
		status: report.status,
		path: report.path,
		version: report.version,
		category: report.category_id
			? {
					id: report.category_id,
					name: report.category_name,
					slug: report.category_slug,
					icon: report.category_icon,
				}
			: null,
		questionSetId: report.question_set_id,
		questionSet,
		answers: report.answers,
		extraction: report.extraction
			? {
					categorySlug: report.extraction.categorySlug,
					confidence: report.extraction.confidence,
					suggestedKeys: Object.keys(report.extraction.suggestions ?? {}),
					...(isAdmin
						? {
								model: report.extraction.model,
								promptHash: report.extraction.promptHash,
							}
						: {}),
				}
			: null,
		photoCount: report.image_hashes.length,
		occurredOn: report.occurred_on,
		zone: report.zone_id
			? { id: report.zone_id, name: report.zone_name, department: report.zone_department }
			: null,
		placeNote: report.place_note,
		fitsInLocker: report.fits_in_locker,
		followups,
		draft:
			report.status === 'draft'
				? draftProgress(report, followups.length, answeredFollowups)
				: null,
		aiStatus: report.ai_status,
		embeddingStatus: report.embedding_status,
		locker: report.locker_label ? { label: report.locker_label } : null,
		activeOtp: otpResult.rows[0]
			? {
					action: otpResult.rows[0].action,
					expiresAt: otpResult.rows[0].expires_at,
					generation: otpResult.rows[0].generation,
				}
			: null,
		deposit:
			report.kind === 'found'
				? {
						generations: report.deposit_generations,
						generationLimit: report.deposit_generation_limit,
						queuedAt: report.queued_at,
						otpValidMinutes: RULES.depositOtpTtlMs / 60000,
					}
				: null,
		matches,
		storedAt: report.first_stored_at,
		collectedAt: report.collected_at,
		submittedAt: report.submitted_at,
		createdAt: report.created_at,
		updatedAt: report.updated_at,
	};

	if (isAdmin) {
		view.reporter = {
			id: report.user_id,
			studentId: report.reporter_student_id,
			fullName: report.reporter_name,
		};
		view.canonical = report.canonical;
		view.aiAccuracy = aiAccuracy(report.answers);
		view.closedReason = report.closed_reason;
	}

	return view;
}

const TABS = {
	drafts: ['draft'],
	active: [
		'awaiting_deposit',
		'awaiting_locker',
		'stored',
		'open',
		'matched',
		'awaiting_collection',
	],
	closed: ['collected', 'cancelled', 'abandoned', 'unclaimed_expired', 'overflow'],
};

export async function listOwnReports(userId, tab = 'active') {
	const statuses = TABS[tab] ?? TABS.active;

	const { rows } = await query(
		`
		select
			r.id, r.kind, r.status, r.path, r.draft_step, r.ai_status, r.ai_waiting_step, r.ai_error,
			r.occurred_on, r.created_at, r.updated_at, r.last_activity_at, r.submitted_at,
			r.answers->'distinctive_marks'->>'text' as distinctive_marks,
			c.name as category_name, c.icon as category_icon,
			z.name as zone_name,
			l.label as locker_label,
			(select m.status from matches m
			  where (m.lost_report_id = r.id or m.found_report_id = r.id)
			    and m.status in ('auto_matched', 'approved', 'otp_issued', 'review')
			  order by m.score desc limit 1) as match_status,
			(select o.expires_at from otps o
			  where o.report_id = r.id and o.status = 'active' and o.expires_at > now()
			  order by o.created_at desc limit 1) as otp_expires_at
		from reports r
		left join categories c on c.id = r.category_id
		left join campus_zones z on z.id = r.zone_id
		left join lockers l on l.id = r.locker_id
		where r.user_id = $1 and r.status = any($2)
		order by r.updated_at desc
		limit 100
		`,
		[userId, statuses],
	);

	return rows.map((row) => ({
		id: row.id,
		kind: row.kind,
		status: row.status,
		path: row.path,
		category: row.category_name ? { name: row.category_name, icon: row.category_icon } : null,
		zone: row.zone_name,
		occurredOn: row.occurred_on,
		summary: row.distinctive_marks,
		lockerLabel: row.locker_label,
		matchStatus: row.kind === 'lost' ? row.match_status : null,
		otpExpiresAt: row.otp_expires_at,
		draft:
			row.status === 'draft'
				? {
						step: row.draft_step,
						waitingForAi: row.ai_status === 'waiting',
						waitingStep: row.ai_waiting_step,
						reason: row.ai_error,
						expiresAt: new Date(
							new Date(row.last_activity_at).getTime() + RULES.draftIdleExpiryMs,
						),
					}
				: null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}));
}
