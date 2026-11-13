/**
 * /api/v1/admin/users — registered accounts.
 *
 *   GET  /                      ?search&role&page&pageSize
 *   POST /:id/role              { role: 'student'|'admin', reason }   (A7: multiple admins)
 *   POST /:id/status            { isActive, reason }
 *   POST /:id/reset-password    { newPassword, reason }               (Q7: no email, so admins reset)
 */

import { Router } from 'express';
import { z } from 'zod';

import { query, withTransaction } from '../../db/pool.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { audit } from '../audit/audit.service.js';
import { hashPassword, toPublicUser } from '../auth/auth.service.js';
import { revokeAllForUser } from '../auth/tokens.js';
import { notify } from '../notifications/notifications.service.js';
import { adminActor, pagination, reason, uuidParam } from './common.js';

export const usersAdminRouter = Router();

export const listSchema = pagination.extend({
	search: z.string().trim().max(60).optional(),
	role: z.enum(['student', 'admin']).optional(),
});

export const roleSchema = z.object({
	role: z.enum(['student', 'admin']),
	reason,
});

export const statusSchema = z.object({
	isActive: z.boolean(),
	reason,
});

export const resetPasswordSchema = z.object({
	newPassword: z.string().min(8).max(128),
	reason,
});

usersAdminRouter.get('/', validateQuery(listSchema), async (req, res) => {
	const { search, role, page, pageSize } = req.validQuery;

	const { rows } = await query(
		`
		select u.*,
		       (select count(*) from reports r where r.user_id = u.id and r.status <> 'discarded') as report_count,
		       count(*) over () as total
		from users u
		where ($1::text is null or u.student_id ilike '%' || $1 || '%' or u.full_name ilike '%' || $1 || '%'
		       or u.email ilike '%' || $1 || '%')
		  and ($2::text is null or u.role = $2)
		order by u.created_at desc
		limit $3 offset $4
		`,
		[search || null, role ?? null, pageSize, (page - 1) * pageSize],
	);

	res.json({
		total: rows[0]?.total ?? 0,
		page,
		pageSize,
		users: rows.map((row) => ({
			...toPublicUser(row),
			isActive: row.is_active,
			lastLoginAt: row.last_login_at,
			reportCount: row.report_count,
		})),
	});
});

async function loadUser(client, id) {
	const { rows } = await client.query('select * from users where id = $1 for update', [id]);

	if (!rows[0]) {
		throw notFound('USER_NOT_FOUND', 'User not found.');
	}

	return rows[0];
}

usersAdminRouter.post('/:id/role', validateBody(roleSchema), async (req, res) => {
	const id = uuidParam(req, 'id', 'User');

	if (id === req.user.id) {
		throw badRequest('CANNOT_CHANGE_OWN_ROLE', 'You cannot change your own role.');
	}

	await withTransaction(async (client) => {
		const user = await loadUser(client, id);

		await client.query('update users set role = $2 where id = $1', [id, req.body.role]);

		await audit(client, {
			...adminActor(req),
			action: 'user.role_changed',
			entityType: 'user',
			entityId: id,
			reason: req.body.reason,
			details: { from: user.role, to: req.body.role },
		});
	});

	res.json({ ok: true });
});

usersAdminRouter.post('/:id/status', validateBody(statusSchema), async (req, res) => {
	const id = uuidParam(req, 'id', 'User');

	if (id === req.user.id) {
		throw badRequest('CANNOT_DISABLE_SELF', 'You cannot disable your own account.');
	}

	await withTransaction(async (client) => {
		await loadUser(client, id);

		await client.query('update users set is_active = $2 where id = $1', [
			id,
			req.body.isActive,
		]);

		if (!req.body.isActive) {
			await revokeAllForUser(client, id, 'disabled_by_admin');
		}

		await audit(client, {
			...adminActor(req),
			action: req.body.isActive ? 'user.enabled' : 'user.disabled',
			entityType: 'user',
			entityId: id,
			reason: req.body.reason,
		});
	});

	res.json({ ok: true });
});

usersAdminRouter.post(
	'/:id/reset-password',
	validateBody(resetPasswordSchema),
	async (req, res) => {
		const id = uuidParam(req, 'id', 'User');
		const passwordHash = await hashPassword(req.body.newPassword);

		await withTransaction(async (client) => {
			await loadUser(client, id);

			await client.query('update users set password_hash = $2 where id = $1', [
				id,
				passwordHash,
			]);

			// sign the user out everywhere
			await revokeAllForUser(client, id, 'password_reset_by_admin');

			await notify(client, id, {
				type: 'password_reset',
				title: 'Your password was reset',
				body: 'An administrator reset your password. If you did not ask for this, contact the admin desk.',
			});

			await audit(client, {
				...adminActor(req),
				action: 'user.password_reset',
				entityType: 'user',
				entityId: id,
				reason: req.body.reason,
			});
		});

		res.json({ ok: true });
	},
);
