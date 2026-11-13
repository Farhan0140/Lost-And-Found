/**
 * /api/v1/admin/university-students — the DUMMY university database (§1).
 * Only admins can create, read, update and delete rows.
 *
 *   GET    /                ?search&page&pageSize
 *   POST   /                { studentId, nationalId, fullName, department, campusZoneId? }
 *   PUT    /:studentId      { fullName?, department?, campusZoneId?, nationalId? }
 *   DELETE /:studentId      { reason }
 *
 * The national ID is hashed immediately (HMAC) and can NEVER be read back — the list
 * only shows whether one is set.
 */

import { Router } from 'express';
import { z } from 'zod';

import { query } from '../../db/pool.js';
import { hashNationalId } from '../../lib/crypto.js';
import { conflict, notFound } from '../../lib/errors.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { audit } from '../audit/audit.service.js';
import { adminActor, pagination, reasonBody } from './common.js';

export const universityAdminRouter = Router();

const nationalId = z
	.string()
	.trim()
	.transform((value) => value.replace(/[\s-]/g, ''))
	.refine((value) => /^\d{10}$|^\d{13}$|^\d{17}$/.test(value), 'must be 10, 13 or 17 digits');

export const createSchema = z.object({
	studentId: z.string().trim().min(3).max(30),
	nationalId,
	fullName: z.string().trim().min(2).max(80),
	department: z.string().trim().min(2).max(60),
	campusZoneId: z.number().int().positive().nullable().optional(),
});

export const updateSchema = z.object({
	nationalId: nationalId.optional(),
	fullName: z.string().trim().min(2).max(80).optional(),
	department: z.string().trim().min(2).max(60).optional(),
	campusZoneId: z.number().int().positive().nullable().optional(),
});

export const listSchema = pagination.extend({
	search: z.string().trim().max(60).optional(),
});

function toView(row) {
	return {
		studentId: row.student_id,
		fullName: row.full_name,
		department: row.department,
		campusZoneId: row.campus_zone_id,
		zoneName: row.zone_name ?? null,
		hasNationalId: Boolean(row.national_id_hash),
		registered: row.registered ?? false,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

universityAdminRouter.get('/', validateQuery(listSchema), async (req, res) => {
	const { search, page, pageSize } = req.validQuery;

	const { rows } = await query(
		`
		select s.*, z.name as zone_name,
		       exists (select 1 from users u where lower(u.student_id) = lower(s.student_id)) as registered,
		       count(*) over () as total
		from university_students s
		left join campus_zones z on z.id = s.campus_zone_id
		where ($1::text is null
		       or s.student_id ilike '%' || $1 || '%'
		       or s.full_name ilike '%' || $1 || '%'
		       or s.department ilike '%' || $1 || '%')
		order by s.student_id
		limit $2 offset $3
		`,
		[search || null, pageSize, (page - 1) * pageSize],
	);

	res.json({
		total: rows[0]?.total ?? 0,
		page,
		pageSize,
		students: rows.map(toView),
	});
});

universityAdminRouter.post('/', validateBody(createSchema), async (req, res) => {
	const body = req.body;

	const exists = await query(
		'select 1 from university_students where lower(student_id) = lower($1)',
		[body.studentId],
	);

	if (exists.rowCount > 0) {
		throw conflict('STUDENT_EXISTS', `Student ${body.studentId} already exists.`);
	}

	const { rows } = await query(
		`
		insert into university_students (student_id, national_id_hash, full_name, department, campus_zone_id)
		values ($1, $2, $3, $4, $5)
		returning *
		`,
		[
			body.studentId,
			hashNationalId(body.nationalId),
			body.fullName,
			body.department,
			body.campusZoneId ?? null,
		],
	);

	await audit(null, {
		...adminActor(req),
		action: 'university_student.created',
		entityType: 'university_student',
		entityId: body.studentId,
	});

	res.status(201).json({ student: toView(rows[0]) });
});

universityAdminRouter.put('/:studentId', validateBody(updateSchema), async (req, res) => {
	const body = req.body;

	const { rows } = await query(
		`
		update university_students
		set national_id_hash = coalesce($2, national_id_hash),
		    full_name = coalesce($3, full_name),
		    department = coalesce($4, department),
		    campus_zone_id = case when $6 then $5 else campus_zone_id end
		where student_id = $1
		returning *
		`,
		[
			req.params.studentId,
			body.nationalId ? hashNationalId(body.nationalId) : null,
			body.fullName ?? null,
			body.department ?? null,
			body.campusZoneId ?? null,
			body.campusZoneId !== undefined,
		],
	);

	if (!rows[0]) {
		throw notFound('STUDENT_NOT_FOUND', 'Student not found.');
	}

	await audit(null, {
		...adminActor(req),
		action: 'university_student.updated',
		entityType: 'university_student',
		entityId: req.params.studentId,
		details: {
			changed: Object.keys(body).map((key) =>
				key === 'nationalId' ? 'nationalId (hashed)' : key,
			),
		},
	});

	res.json({ student: toView(rows[0]) });
});

universityAdminRouter.delete('/:studentId', validateBody(reasonBody), async (req, res) => {
	const { rowCount } = await query('delete from university_students where student_id = $1', [
		req.params.studentId,
	]);

	if (rowCount === 0) {
		throw notFound('STUDENT_NOT_FOUND', 'Student not found.');
	}

	await audit(null, {
		...adminActor(req),
		action: 'university_student.deleted',
		entityType: 'university_student',
		entityId: req.params.studentId,
		reason: req.body.reason,
	});

	res.json({ ok: true });
});
