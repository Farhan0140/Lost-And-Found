/**
 * /api/v1/admin/zones — campus zones (Q8: placeholders the admin can edit).
 *
 *   GET    /           all zones, including inactive ones
 *   POST   /           { name, department, building?, sortOrder? }
 *   PUT    /:id        { name?, department?, building?, sortOrder?, isActive? }
 *   DELETE /:id        { reason } — deactivates if reports use the zone, deletes otherwise
 */

import { Router } from 'express';
import { z } from 'zod';

import { query } from '../../db/pool.js';
import { conflict, notFound } from '../../lib/errors.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../audit/audit.service.js';
import { adminActor, intParam, reasonBody } from './common.js';

export const zonesAdminRouter = Router();

export const zoneSchema = z.object({
	name: z.string().trim().min(2).max(80),
	department: z.string().trim().min(2).max(60),
	building: z.string().trim().max(60).nullable().optional(),
	sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const updateSchema = zoneSchema.partial().extend({
	isActive: z.boolean().optional(),
});

zonesAdminRouter.get('/', async (req, res) => {
	const { rows } = await query(
		`
		select z.*,
		       (select count(*) from reports r where r.zone_id = z.id) as report_count
		from campus_zones z
		order by z.sort_order, z.name
		`,
	);

	res.json({ zones: rows });
});

zonesAdminRouter.post('/', validateBody(zoneSchema), async (req, res) => {
	const exists = await query('select 1 from campus_zones where lower(name) = lower($1)', [
		req.body.name,
	]);

	if (exists.rowCount > 0) {
		throw conflict('ZONE_EXISTS', `A zone called "${req.body.name}" already exists.`);
	}

	const { rows } = await query(
		`
		insert into campus_zones (name, department, building, sort_order)
		values ($1, $2, $3, $4)
		returning *
		`,
		[req.body.name, req.body.department, req.body.building ?? null, req.body.sortOrder ?? 0],
	);

	await audit(null, {
		...adminActor(req),
		action: 'zone.created',
		entityType: 'zone',
		entityId: rows[0].id,
		details: { name: req.body.name },
	});

	res.status(201).json({ zone: rows[0] });
});

zonesAdminRouter.put('/:id', validateBody(updateSchema), async (req, res) => {
	const id = intParam(req, 'id', 'Zone');
	const body = req.body;

	const { rows } = await query(
		`
		update campus_zones
		set name = coalesce($2, name),
		    department = coalesce($3, department),
		    building = case when $7 then $4 else building end,
		    sort_order = coalesce($5, sort_order),
		    is_active = coalesce($6, is_active)
		where id = $1
		returning *
		`,
		[
			id,
			body.name ?? null,
			body.department ?? null,
			body.building ?? null,
			body.sortOrder ?? null,
			body.isActive ?? null,
			body.building !== undefined,
		],
	);

	if (!rows[0]) {
		throw notFound('ZONE_NOT_FOUND', 'Zone not found.');
	}

	await audit(null, {
		...adminActor(req),
		action: 'zone.updated',
		entityType: 'zone',
		entityId: id,
		details: body,
	});

	res.json({ zone: rows[0] });
});

zonesAdminRouter.delete('/:id', validateBody(reasonBody), async (req, res) => {
	const id = intParam(req, 'id', 'Zone');

	const used = await query('select count(*) as count from reports where zone_id = $1', [id]);

	if (used.rows[0].count > 0) {
		await query('update campus_zones set is_active = false where id = $1', [id]);
	} else {
		const { rowCount } = await query('delete from campus_zones where id = $1', [id]);

		if (rowCount === 0) {
			throw notFound('ZONE_NOT_FOUND', 'Zone not found.');
		}
	}

	await audit(null, {
		...adminActor(req),
		action: used.rows[0].count > 0 ? 'zone.deactivated' : 'zone.deleted',
		entityType: 'zone',
		entityId: id,
		reason: req.body.reason,
	});

	res.json({
		ok: true,
		deactivatedInstead: used.rows[0].count > 0,
		message:
			used.rows[0].count > 0
				? 'Reports use this zone, so it was hidden instead of deleted.'
				: 'Zone deleted.',
	});
});
