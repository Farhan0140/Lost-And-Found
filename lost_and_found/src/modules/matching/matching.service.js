/**
 * Matching engine — database side (§8). Makes NO AI call; uses stored data only.
 *
 *   matchFoundItem(foundId)   a found item became `stored` → score it against open lost reports
 *   matchLostReport(lostId)   a lost report was submitted  → score it against stored found items
 *   rescoreReport(reportId)   a late embedding arrived     → re-score pairs scored without it
 *
 * Only pairs built on the SAME question set (same id = same category + version) are compared.
 *
 * After scoring, `evaluateFoundItem()` applies the thresholds and the release rule for
 * one found item, looking at ALL its candidate lost reports together (rule 5: exactly
 * one eligible report).
 */

import { RULES } from '../../config/rules.js';
import { pool, withTransaction } from '../../db/pool.js';
import { addMs } from '../../lib/time.js';
import { logger } from '../../lib/logger.js';
import { audit, auditSystem } from '../audit/audit.service.js';
import { notify, notifyAdmins } from '../notifications/notifications.service.js';
import { describeReviewReason, evaluateReleaseRule } from './releaseRule.js';
import { RULES_VERSION } from './rules.v1.js';
import { scorePair } from './scoring.js';

const LIVE_STATUSES = ['auto_matched', 'approved', 'otp_issued'];
const FINAL_STATUSES = ['rejected', 'expired', 'collected'];

// ─────────────────────────────────────────────────────────────
//  Loading one side of a pair
// ─────────────────────────────────────────────────────────────

/** pgvector text "[0.1,0.2,…]" → number[] */
function parseVector(text) {
	return JSON.parse(text);
}

export async function loadSide(db, reportId) {
	const reportResult = await db.query(
		`
		select r.*, z.department as zone_department
		from reports r
		left join campus_zones z on z.id = r.zone_id
		where r.id = $1
		`,
		[reportId],
	);

	const report = reportResult.rows[0];

	if (!report) {
		return null;
	}

	const followupResult = await db.query(
		`
		select id, aspect, answer_kind, answer_code, answer_text
		from report_followups
		where report_id = $1
		order by position
		`,
		[reportId],
	);

	const embeddingResult = await db.query(
		`
		select field, model, embedding::text as vector
		from report_embeddings
		where report_id = $1
		`,
		[reportId],
	);

	const embeddings = new Map(
		embeddingResult.rows.map((row) => [
			row.field,
			{ model: row.model, vector: parseVector(row.vector) },
		]),
	);

	return {
		report,
		side: {
			canonical: report.canonical,
			occurredOn: report.occurred_on,
			zone: { id: report.zone_id, department: report.zone_department },
			distinctiveEmbedding: embeddings.get('distinctive_marks') ?? null,
			followups: followupResult.rows.map((row) => ({
				aspect: row.aspect,
				kind: row.answer_kind,
				code: row.answer_code,
				text: row.answer_text,
				embedding: embeddings.get(`followup:${row.id}`) ?? null,
			})),
		},
	};
}

async function loadQuestionSet(db, questionSetId) {
	const { rows } = await db.query(
		'select id, questions, aspects from question_sets where id = $1',
		[questionSetId],
	);

	return rows[0];
}

/** What we store in matches.breakdown (the full explanation of the score). */
function toBreakdown(result) {
	return {
		gate: result.gate,
		terms: result.terms,
		appliedWeights: result.appliedWeights,
		droppedTerms: result.droppedTerms,
		coverage: result.coverage,
		coverageCapped: result.coverageCapped,
		rulesVersion: RULES_VERSION,
		fields: result.rules?.fields ?? [],
		followups: result.followups
			? {
					overlapping: result.followups.overlapping,
					agree: result.followups.agree,
					conflict: result.followups.conflict,
					neutral: result.followups.neutral,
					aspects: result.followups.aspects,
				}
			: null,
	};
}

// ─────────────────────────────────────────────────────────────
//  Storing one scored pair
// ─────────────────────────────────────────────────────────────

/**
 * Inserts or updates the match row for a pair.
 *   score ≥ 0.50 → row in 'review' (evaluateFoundItem may promote it to auto_matched)
 *   score < 0.50 → no row; an existing review row is expired
 * Final rows (rejected / expired / collected) are never revived.
 *
 * Returns { match, isNew } or null.
 */
async function upsertMatch(client, { foundId, lostId, questionSetId, result }) {
	if (result.score < RULES.reviewThreshold) {
		await client.query(
			`
			update matches
			set status = 'expired',
			    review_reason = 'Score fell below 0.50 after re-scoring'
			where found_report_id = $1 and lost_report_id = $2 and status in ('review', 'superseded')
			`,
			[foundId, lostId],
		);

		return null;
	}

	const { rows } = await client.query(
		`
		insert into matches
			(found_report_id, lost_report_id, question_set_id, score, breakdown,
			 weights_version, scored_without_embedding, status)
		values
			($1, $2, $3, $4, $5, $6, $7, 'review')
		on conflict (found_report_id, lost_report_id) do update
			set score = excluded.score,
			    breakdown = excluded.breakdown,
			    weights_version = excluded.weights_version,
			    scored_without_embedding = excluded.scored_without_embedding,
			    status = case
			                 when matches.status = 'superseded' then 'review'
			                 else matches.status
			             end
			where matches.status not in ('rejected', 'expired', 'collected')
		returning *, (xmax = 0) as is_new
		`,
		[
			foundId,
			lostId,
			questionSetId,
			result.score,
			JSON.stringify(toBreakdown(result)),
			result.weightsVersion,
			result.scoredWithoutEmbedding,
		],
	);

	if (rows.length === 0) {
		return null;
	}

	return { match: rows[0], isNew: rows[0].is_new };
}

// ─────────────────────────────────────────────────────────────
//  Thresholds + release rule for one found item
// ─────────────────────────────────────────────────────────────

export async function evaluateFoundItem(client, foundId) {
	const foundResult = await client.query('select * from reports where id = $1 for update', [
		foundId,
	]);
	const found = foundResult.rows[0];

	if (!found || found.status !== 'stored') {
		return { outcome: 'not_stored' };
	}

	const live = await client.query(
		'select 1 from matches where found_report_id = $1 and status = any($2)',
		[foundId, LIVE_STATUSES],
	);

	if (live.rowCount > 0) {
		return { outcome: 'already_matched' };
	}

	const { rows: candidates } = await client.query(
		`
		select m.*, l.status as lost_status, l.user_id as owner_id
		from matches m
		join reports l on l.id = m.lost_report_id
		where m.found_report_id = $1
		  and m.status = 'review'
		  and l.status = 'open'
		order by m.score desc
		`,
		[foundId],
	);

	const eligible = candidates.filter((candidate) => candidate.score >= RULES.autoMatchThreshold);

	for (const candidate of candidates) {
		candidate.rule = evaluateReleaseRule({
			score: candidate.score,
			foundStatus: found.status,
			followups: candidate.breakdown.followups,
			eligibleLostCount: eligible.length,
		});
	}

	const winner = eligible.length === 1 && eligible[0].rule.met ? eligible[0] : null;

	if (winner) {
		const lostLock = await client.query('select status from reports where id = $1 for update', [
			winner.lost_report_id,
		]);

		if (lostLock.rows[0]?.status === 'open') {
			await releaseMatch(client, {
				match: winner,
				found,
				status: 'auto_matched',
				actor: { actorType: 'system', actorId: 'matching' },
			});

			return { outcome: 'auto_matched', matchId: winner.id };
		}
	}

	for (const candidate of candidates) {
		await client.query(
			`
			update matches
			set review_reason = $2, release_rule_met = false
			where id = $1
			`,
			[candidate.id, describeReviewReason(candidate.score, candidate.rule)],
		);
	}

	return { outcome: candidates.length > 0 ? 'review' : 'none' };
}

/**
 * Makes a match LIVE (auto_matched by the engine, or approved by an admin):
 * both reports become `matched`, the owner gets 72 h to tap "Get collection OTP",
 * and every other pending candidate of the two reports is superseded.
 */
export async function releaseMatch(client, { match, found, status, actor, reason = null }) {
	await client.query(
		`
		update matches
		set status = $2,
		    release_rule_met = $3,
		    review_reason = null,
		    hold_expires_at = $4,
		    decided_by = $5,
		    decision_reason = $6,
		    decided_at = case when $5::uuid is null then null else now() end
		where id = $1
		`,
		[
			match.id,
			status,
			status === 'auto_matched',
			addMs(new Date(), RULES.matchHoldMs),
			actor.actorType === 'admin' ? actor.actorId : null,
			reason,
		],
	);

	await client.query(`update reports set status = 'matched' where id = any($1)`, [
		[match.found_report_id, match.lost_report_id],
	]);

	await client.query(
		`
		update matches
		set status = 'superseded'
		where status = 'review'
		  and id <> $1
		  and (found_report_id = $2 or lost_report_id = $3)
		`,
		[match.id, match.found_report_id, match.lost_report_id],
	);

	const owner = await client.query('select user_id from reports where id = $1', [
		match.lost_report_id,
	]);

	await notify(client, owner.rows[0].user_id, {
		type: 'match_ready',
		title: 'We may have found your item!',
		body: 'A stored item matches your report. Go to the locker, then tap "Get collection OTP" (valid 5 minutes).',
		link: `/reports/${match.lost_report_id}`,
	});

	await notify(client, found.user_id, {
		type: 'found_item_matched',
		title: 'Your found item was matched',
		body: 'The item you deposited has been matched with its owner. Thank you for returning it!',
		link: `/reports/${found.id}`,
	});

	await audit(client, {
		...actor,
		action: `match.${status}`,
		entityType: 'match',
		entityId: match.id,
		reason,
		details: {
			score: match.score,
			foundId: match.found_report_id,
			lostId: match.lost_report_id,
		},
	});

	logger.info('matching', `Match ${status}: score ${Number(match.score).toFixed(4)}`, {
		match: match.id.slice(0, 8),
	});
}

// ─────────────────────────────────────────────────────────────
//  Entry points
// ─────────────────────────────────────────────────────────────

/** Scores one pair and stores it. Returns the upsert result. */
async function scoreAndStore(client, { foundSide, lostSide, questionSet }) {
	const result = scorePair({
		questionSet,
		found: foundSide.side,
		lost: lostSide.side,
	});

	return upsertMatch(client, {
		foundId: foundSide.report.id,
		lostId: lostSide.report.id,
		questionSetId: questionSet.id,
		result,
	});
}

/** Tells admins (and owners) about NEW pairs that ended up in the review queue. */
async function announceNewReviews(newMatchIds) {
	if (newMatchIds.length === 0) {
		return;
	}

	const { rows } = await pool.query(
		`
		select m.id, l.user_id as owner_id, l.id as lost_id
		from matches m
		join reports l on l.id = m.lost_report_id
		where m.id = any($1) and m.status = 'review'
		`,
		[newMatchIds],
	);

	if (rows.length === 0) {
		return;
	}

	await notifyAdmins(pool, {
		type: 'review_needed',
		title: 'Match needs review',
		body: `${rows.length} new possible match${rows.length > 1 ? 'es' : ''} in the review queue.`,
		link: '/admin/review',
	});

	for (const row of rows) {
		await notify(pool, row.owner_id, {
			type: 'match_in_review',
			title: 'A possible match is being checked',
			body: 'An admin is reviewing a stored item that may be yours. We will let you know.',
			link: `/reports/${row.lost_id}`,
		});
	}
}

export async function matchFoundItem(foundId) {
	const foundSide = await loadSide(pool, foundId);

	if (!foundSide || foundSide.report.status !== 'stored') {
		return;
	}

	const questionSet = await loadQuestionSet(pool, foundSide.report.question_set_id);

	const { rows: lostReports } = await pool.query(
		`
		select r.id
		from reports r
		where r.kind = 'lost'
		  and r.status = 'open'
		  and r.question_set_id = $1
		  and not exists (
		      select 1 from matches m
		      where m.found_report_id = $2 and m.lost_report_id = r.id and m.status = any($3)
		  )
		`,
		[questionSet.id, foundId, FINAL_STATUSES],
	);

	const newMatchIds = [];

	await withTransaction(async (client) => {
		for (const { id } of lostReports) {
			const lostSide = await loadSide(client, id);
			const stored = await scoreAndStore(client, { foundSide, lostSide, questionSet });

			if (stored?.isNew) {
				newMatchIds.push(stored.match.id);
			}
		}

		await evaluateFoundItem(client, foundId);
	});

	logger.info('matching', `Found item scored against ${lostReports.length} open lost report(s)`, {
		found: foundId.slice(0, 8),
	});

	await announceNewReviews(newMatchIds);
}

export async function matchLostReport(lostId) {
	const lostSide = await loadSide(pool, lostId);

	if (!lostSide || lostSide.report.status !== 'open') {
		return;
	}

	const questionSet = await loadQuestionSet(pool, lostSide.report.question_set_id);

	const { rows: foundItems } = await pool.query(
		`
		select r.id
		from reports r
		where r.kind = 'found'
		  and r.status = 'stored'
		  and r.question_set_id = $1
		  and not exists (
		      select 1 from matches m
		      where m.lost_report_id = $2 and m.found_report_id = r.id and m.status = any($3)
		  )
		`,
		[questionSet.id, lostId, FINAL_STATUSES],
	);

	const newMatchIds = [];

	for (const { id } of foundItems) {
		await withTransaction(async (client) => {
			const foundSide = await loadSide(client, id);
			const stored = await scoreAndStore(client, { foundSide, lostSide, questionSet });

			if (stored?.isNew) {
				newMatchIds.push(stored.match.id);
			}

			await evaluateFoundItem(client, id);
		});
	}

	logger.info('matching', `Lost report scored against ${foundItems.length} stored item(s)`, {
		lost: lostId.slice(0, 8),
	});

	await announceNewReviews(newMatchIds);
}

/**
 * A late embedding arrived: re-score every pair of this report that was scored
 * without it. A re-score may send an auto match back to review, but it NEVER
 * revokes an OTP that was already issued.
 */
export async function rescoreReport(reportId) {
	const { rows: matches } = await pool.query(
		`
		select *
		from matches
		where (found_report_id = $1 or lost_report_id = $1)
		  and scored_without_embedding
		  and status in ('review', 'auto_matched', 'approved', 'otp_issued')
		`,
		[reportId],
	);

	for (const match of matches) {
		await withTransaction(async (client) => {
			const foundSide = await loadSide(client, match.found_report_id);
			const lostSide = await loadSide(client, match.lost_report_id);
			const questionSet = await loadQuestionSet(client, match.question_set_id);

			const result = scorePair({ questionSet, found: foundSide.side, lost: lostSide.side });

			await client.query(
				`
				update matches
				set score = $2, breakdown = $3, scored_without_embedding = $4
				where id = $1
				`,
				[
					match.id,
					result.score,
					JSON.stringify(toBreakdown(result)),
					result.scoredWithoutEmbedding,
				],
			);

			if (match.status === 'auto_matched') {
				const rule = evaluateReleaseRule({
					score: result.score,
					foundStatus: 'stored',
					followups: result.followups,
					eligibleLostCount: 1,
				});

				if (!rule.met) {
					await client.query(
						`update matches set status = 'review', review_reason = $2, hold_expires_at = null where id = $1`,
						[
							match.id,
							`Re-scored with embedding: ${describeReviewReason(result.score, rule)}`,
						],
					);

					await client.query(`update reports set status = 'stored' where id = $1`, [
						match.found_report_id,
					]);
					await client.query(`update reports set status = 'open' where id = $1`, [
						match.lost_report_id,
					]);

					await notify(client, lostSide.report.user_id, {
						type: 'match_in_review',
						title: 'Your match needs a quick check',
						body: 'An admin will confirm the match before you can collect the item.',
						link: `/reports/${match.lost_report_id}`,
					});

					await auditSystem(
						client,
						'match.sent_to_review_after_rescore',
						'match',
						match.id,
						{
							score: result.score,
						},
					);
				}
			}

			if (match.status === 'review') {
				await evaluateFoundItem(client, match.found_report_id);
			}
		});
	}

	if (matches.length > 0) {
		logger.info('matching', `Re-scored ${matches.length} pair(s) after the embedding arrived`);
	}
}

/** Fire-and-forget wrapper: matching errors are logged, never crash a request. */
export function runInBackground(label, work) {
	Promise.resolve()
		.then(work)
		.catch((error) => logger.error('matching', `${label} failed: ${error.message}`));
}
