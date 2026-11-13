/**
 * /api/v1/admin/audit — the append-only, hash-chained audit log.
 *
 *   GET /           ?action&entityType&entityId&actorType&from&to&page&pageSize
 *   GET /verify     re-computes every hash and checks every link
 *   GET /head       newest entry (also exported daily outside the database)
 *   GET /actions    distinct action names (for the filter dropdown)
 */

import { Router } from 'express';
import { z } from 'zod';

import { query } from '../../db/pool.js';
import { validateQuery } from '../../middleware/validate.js';
import { getAuditHead, verifyAuditChain } from '../audit/audit.service.js';
import { pagination } from './common.js';

export const auditAdminRouter = Router();

export const listSchema = pagination.extend({
	action: z.string().max(60).optional(),
	entityType: z.string().max(40).optional(),
	entityId: z.string().max(80).optional(),
	actorType: z.enum(['user', 'admin', 'device', 'system']).optional(),
	from: z.iso.datetime().optional(),
	to: z.iso.datetime().optional(),
});

auditAdminRouter.get('/', validateQuery(listSchema), async (req, res) => {
	const filter = req.validQuery;

	const { rows } = await query(
		`
		select a.*, u.student_id as actor_student_id, u.full_name as actor_name,
		       count(*) over () as total
		from audit_log a
		left join users u on a.actor_type in ('user', 'admin') and u.id::text = a.actor_id
		where ($1::text is null or a.action ilike $1 || '%')
		  and ($2::text is null or a.entity_type = $2)
		  and ($3::text is null or a.entity_id = $3)
		  and ($4::text is null or a.actor_type = $4)
		  and ($5::timestamptz is null or a.at >= $5)
		  and ($6::timestamptz is null or a.at <= $6)
		order by a.id desc
		limit $7 offset $8
		`,
		[
			filter.action ?? null,
			filter.entityType ?? null,
			filter.entityId ?? null,
			filter.actorType ?? null,
			filter.from ?? null,
			filter.to ?? null,
			filter.pageSize,
			(filter.page - 1) * filter.pageSize,
		],
	);

	res.json({
		total: rows[0]?.total ?? 0,
		page: filter.page,
		pageSize: filter.pageSize,
		entries: rows.map(({ total, ...row }) => row),
	});
});

auditAdminRouter.get('/verify', async (req, res) => {
	res.json(await verifyAuditChain());
});

auditAdminRouter.get('/head', async (req, res) => {
	res.json({ head: await getAuditHead() });
});

auditAdminRouter.get('/actions', async (req, res) => {
	const { rows } = await query('select distinct action from audit_log order by action');

	res.json({ actions: rows.map((row) => row.action) });
});
