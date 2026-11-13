/**
 * /api/v1/admin/matches — the review queue (§6.3).
 *
 *   GET  /               ?status=review (default) — highest score first
 *   GET  /:id            side-by-side: full breakdown + both sides' answers and follow-ups
 *   POST /:id/approve    { reason }  → match goes live; owner can get a collection OTP
 *   POST /:id/reject     { reason }  → both reports go back to stored / open
 *
 * When several lost reports are eligible for one item, none is released automatically;
 * the admin picks one here.
 */

import { Router } from 'express';
import { z } from 'zod';

import { query, withTransaction } from '../../db/pool.js';
import { conflict, notFound } from '../../lib/errors.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { audit } from '../audit/audit.service.js';
import { toAdminMatchView } from '../matching/matchView.js';
import { matchFoundItem, releaseMatch, runInBackground } from '../matching/matching.service.js';
import { notify } from '../notifications/notifications.service.js';
import { getReportView } from '../reports/reports.view.js';
import { adminActor, pagination, reasonBody, uuidParam } from './common.js';

export const reviewAdminRouter = Router();

export const listSchema = pagination.extend({
	status: z
		.enum([
			'review',
			'auto_matched',
			'approved',
			'otp_issued',
			'collected',
			'rejected',
			'expired',
			'all',
		])
		.default('review'),
});

reviewAdminRouter.get('/', validateQuery(listSchema), async (req, res) => {
	const { status, page, pageSize } = req.validQuery;

	const { rows } = await query(
		`
		select
			m.*,
			c.name as category_name,
			f.occurred_on as found_on, fz.name as found_zone, fl.label as locker_label,
			l.occurred_on as lost_on, lz.name as lost_zone,
			count(*) over () as total
		from matches m
		join reports f on f.id = m.found_report_id
		join reports l on l.id = m.lost_report_id
		left join categories c on c.id = f.category_id
		left join campus_zones fz on fz.id = f.zone_id
		left join campus_zones lz on lz.id = l.zone_id
		left join lockers fl on fl.id = f.locker_id
		where ($1 = 'all' or m.status = $1)
		order by m.score desc, m.created_at
		limit $2 offset $3
		`,
		[status, pageSize, (page - 1) * pageSize],
	);

	res.json({
		total: rows[0]?.total ?? 0,
		page,
		pageSize,
		matches: rows.map((row) => ({
			...toAdminMatchView(row),
			category: row.category_name,
			found: { occurredOn: row.found_on, zone: row.found_zone, locker: row.locker_label },
			lost: { occurredOn: row.lost_on, zone: row.lost_zone },
		})),
	});
});

reviewAdminRouter.get('/:id', async (req, res) => {
	const id = uuidParam(req, 'id', 'Match');

	const { rows } = await query('select * from matches where id = $1', [id]);

	if (!rows[0]) {
		throw notFound('MATCH_NOT_FOUND', 'Match not found.');
	}

	const [found, lost] = await Promise.all([
		getReportView(rows[0].found_report_id, { viewer: 'admin' }),
		getReportView(rows[0].lost_report_id, { viewer: 'admin' }),
	]);

	res.json({
		match: toAdminMatchView(rows[0]),
		found,
		lost,
	});
});

reviewAdminRouter.post('/:id/approve', validateBody(reasonBody), async (req, res) => {
	const id = uuidParam(req, 'id', 'Match');

	await withTransaction(async (client) => {
		const { rows } = await client.query('select * from matches where id = $1 for update', [id]);
		const match = rows[0];

		if (!match) {
			throw notFound('MATCH_NOT_FOUND', 'Match not found.');
		}

		if (match.status !== 'review') {
			throw conflict(
				'NOT_IN_REVIEW',
				`Only matches in review can be approved (this one is "${match.status}").`,
			);
		}

		const foundResult = await client.query('select * from reports where id = $1 for update', [
			match.found_report_id,
		]);
		const lostResult = await client.query('select * from reports where id = $1 for update', [
			match.lost_report_id,
		]);

		const found = foundResult.rows[0];
		const lost = lostResult.rows[0];

		// Case A: a normal review match → item must be stored, lost report open.
		// Case B: owner used all codes → both are already `matched` for THIS match.
		const normal = found.status === 'stored' && lost.status === 'open';
		const codesUsedUp = found.status === 'matched' && lost.status === 'matched';

		if (!normal && !codesUsedUp) {
			throw conflict(
				'CANNOT_APPROVE',
				`The item is "${found.status}" and the lost report is "${lost.status}", so this match cannot be approved now.`,
			);
		}

		if (codesUsedUp && match.collect_generations >= match.collect_generation_limit) {
			await client.query(
				'update matches set collect_generation_limit = collect_generation_limit + 5 where id = $1',
				[id],
			);
		}

		await releaseMatch(client, {
			match,
			found,
			status: 'approved',
			actor: adminActor(req),
			reason: req.body.reason,
		});
	});

	res.json({ ok: true });
});

reviewAdminRouter.post('/:id/reject', validateBody(reasonBody), async (req, res) => {
	const id = uuidParam(req, 'id', 'Match');

	let foundToRematch = null;

	await withTransaction(async (client) => {
		const { rows } = await client.query('select * from matches where id = $1 for update', [id]);
		const match = rows[0];

		if (!match) {
			throw notFound('MATCH_NOT_FOUND', 'Match not found.');
		}

		if (!['review', 'auto_matched', 'approved', 'otp_issued'].includes(match.status)) {
			throw conflict('CANNOT_REJECT', `A "${match.status}" match cannot be rejected.`);
		}

		const wasLive = match.status !== 'review';

		await client.query(
			`
			update matches
			set status = 'rejected', decided_by = $2, decision_reason = $3, decided_at = now(), hold_expires_at = null
			where id = $1
			`,
			[id, req.user.id, req.body.reason],
		);

		await client.query(
			`update otps set status = 'revoked' where match_id = $1 and status = 'active'`,
			[id],
		);

		// A live (or codes-used-up) match is undone: item back in storage, lost report open again.
		const lost = await client.query('select status, user_id from reports where id = $1', [
			match.lost_report_id,
		]);

		if (wasLive || lost.rows[0].status === 'matched') {
			await client.query(`update reports set status = 'stored' where id = $1`, [
				match.found_report_id,
			]);
			await client.query(`update reports set status = 'open' where id = $1`, [
				match.lost_report_id,
			]);

			foundToRematch = match.found_report_id;
		}

		await notify(client, lost.rows[0].user_id, {
			type: 'match_rejected',
			title: 'A possible match was not confirmed',
			body: 'After review, the stored item does not seem to be yours. Your report stays open.',
			link: `/reports/${match.lost_report_id}`,
		});

		await audit(client, {
			...adminActor(req),
			action: 'match.rejected',
			entityType: 'match',
			entityId: id,
			reason: req.body.reason,
			details: { previousStatus: match.status },
		});
	});

	if (foundToRematch) {
		runInBackground('rematch after reject', () => matchFoundItem(foundToRematch));
	}

	res.json({ ok: true });
});
