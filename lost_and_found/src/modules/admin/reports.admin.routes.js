/**
 * /api/v1/admin/reports and /api/v1/admin/overflow
 *
 *   GET  /reports                       ?kind&status&search&page&pageSize
 *   GET  /reports/:id                   full report (answers, follow-ups, AI metadata)
 *   POST /reports/:id/grant-generations { reason } — finder gets 5 more deposit codes (Q2)
 *   GET  /overflow                      oversize items handed to the admin desk
 *   POST /overflow/:id/resolve          { reason }
 */

import { Router } from 'express';
import { z } from 'zod';

import { RULES } from '../../config/rules.js';
import { query, withTransaction } from '../../db/pool.js';
import { conflict, notFound } from '../../lib/errors.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { audit } from '../audit/audit.service.js';
import { notify } from '../notifications/notifications.service.js';
import { getReportView } from '../reports/reports.view.js';
import { adminActor, pagination, reasonBody, uuidParam } from './common.js';

export const reportsAdminRouter = Router();

export const listSchema = pagination.extend({
	kind: z.enum(['found', 'lost']).optional(),
	status: z.string().max(30).optional(),
	search: z.string().trim().max(60).optional(),
});

reportsAdminRouter.get('/reports', validateQuery(listSchema), async (req, res) => {
	const { kind, status, search, page, pageSize } = req.validQuery;

	const { rows } = await query(
		`
		select
			r.id, r.kind, r.status, r.path, r.occurred_on, r.created_at, r.submitted_at,
			r.ai_status, r.embedding_status, r.deposit_generations, r.deposit_generation_limit,
			c.name as category, z.name as zone, l.label as locker,
			u.student_id, u.full_name,
			count(*) over () as total
		from reports r
		join users u on u.id = r.user_id
		left join categories c on c.id = r.category_id
		left join campus_zones z on z.id = r.zone_id
		left join lockers l on l.id = r.locker_id
		where ($1::text is null or r.kind = $1)
		  and ($2::text is null or r.status = $2)
		  and ($3::text is null
		       or u.student_id ilike '%' || $3 || '%'
		       or u.full_name ilike '%' || $3 || '%'
		       or r.answers->'distinctive_marks'->>'text' ilike '%' || $3 || '%')
		order by r.created_at desc
		limit $4 offset $5
		`,
		[kind ?? null, status ?? null, search || null, pageSize, (page - 1) * pageSize],
	);

	res.json({
		total: rows[0]?.total ?? 0,
		page,
		pageSize,
		reports: rows.map(({ total, ...row }) => row),
	});
});

reportsAdminRouter.get('/reports/:id', async (req, res) => {
	const view = await getReportView(uuidParam(req, 'id', 'Report'), { viewer: 'admin' });

	if (!view) {
		throw notFound('REPORT_NOT_FOUND', 'Report not found.');
	}

	res.json({ report: view });
});

reportsAdminRouter.post(
	'/reports/:id/grant-generations',
	validateBody(reasonBody),
	async (req, res) => {
		const id = uuidParam(req, 'id', 'Report');

		await withTransaction(async (client) => {
			const { rows } = await client.query('select * from reports where id = $1 for update', [
				id,
			]);
			const report = rows[0];

			if (!report || report.kind !== 'found') {
				throw notFound('REPORT_NOT_FOUND', 'Found-item report not found.');
			}

			const allowed =
				report.status === 'abandoned' ||
				(['awaiting_deposit', 'awaiting_locker'].includes(report.status) &&
					report.deposit_generations >= report.deposit_generation_limit);

			if (!allowed) {
				throw conflict('NOT_NEEDED', 'This finder still has deposit codes left.');
			}

			await client.query(
				`
			update reports
			set status = 'awaiting_deposit',
			    deposit_generation_limit = deposit_generations + $2,
			    closed_reason = null,
			    last_activity_at = now()
			where id = $1
			`,
				[id, RULES.depositGenerationLimit],
			);

			await notify(client, report.user_id, {
				type: 'codes_granted',
				title: 'You can deposit the item again',
				body: `An admin gave you ${RULES.depositGenerationLimit} more deposit codes.`,
				link: `/reports/${id}`,
			});

			await audit(client, {
				...adminActor(req),
				action: 'report.deposit_codes_granted',
				entityType: 'report',
				entityId: id,
				reason: req.body.reason,
			});
		});

		res.json({ ok: true });
	},
);

// ─────────────────────────────────────────────────────────────
//  Overflow (oversize items)
// ─────────────────────────────────────────────────────────────

reportsAdminRouter.get('/overflow', async (req, res) => {
	const { rows } = await query(
		`
		select o.*, u.student_id, u.full_name, c.name as category, r.occurred_on, z.name as zone
		from overflow_reports o
		join users u on u.id = o.user_id
		join reports r on r.id = o.report_id
		left join categories c on c.id = r.category_id
		left join campus_zones z on z.id = r.zone_id
		order by (o.status = 'open') desc, o.created_at desc
		limit 200
		`,
	);

	res.json({ overflow: rows });
});

reportsAdminRouter.post('/overflow/:id/resolve', validateBody(reasonBody), async (req, res) => {
	const id = uuidParam(req, 'id', 'Overflow report');

	const { rowCount } = await query(
		`
		update overflow_reports
		set status = 'resolved', resolved_by = $2, resolution_note = $3, resolved_at = now()
		where id = $1 and status = 'open'
		`,
		[id, req.user.id, req.body.reason],
	);

	if (rowCount === 0) {
		throw notFound('NOT_FOUND', 'Open overflow report not found.');
	}

	await audit(null, {
		...adminActor(req),
		action: 'overflow.resolved',
		entityType: 'overflow_report',
		entityId: id,
		reason: req.body.reason,
	});

	res.json({ ok: true });
});
