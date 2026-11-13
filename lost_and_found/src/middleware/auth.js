/**
 * requireAuth   — needs "Authorization: Bearer <access token>"
 * requireAdmin  — needs requireAuth first, and role = admin
 *
 * After requireAuth, `req.user` = { id, studentId, role, department, fullName }.
 * The user row is re-read on every request, so a disabled account or a role change
 * takes effect immediately (not only when the 7-day token expires).
 */

import jwt from 'jsonwebtoken';

import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export async function requireAuth(req, res, next) {
	const header = req.headers.authorization ?? '';
	const [scheme, token] = header.split(' ');

	if (scheme !== 'Bearer' || !token) {
		throw unauthorized('NOT_LOGGED_IN', 'Please log in first.');
	}

	let claims;

	try {
		claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
	} catch (error) {
		if (error.name === 'TokenExpiredError') {
			throw unauthorized('TOKEN_EXPIRED', 'Your session expired. Please log in again.');
		}

		throw unauthorized('INVALID_TOKEN', 'Your session is not valid. Please log in again.');
	}

	const { rows } = await query(
		`
		select id, student_id, role, department, full_name, is_active
		from users
		where id = $1
		`,
		[claims.sub],
	);

	const user = rows[0];

	if (!user) {
		throw unauthorized('INVALID_TOKEN', 'This account no longer exists.');
	}

	if (!user.is_active) {
		throw forbidden(
			'ACCOUNT_DISABLED',
			'This account has been disabled. Contact the admin desk.',
		);
	}

	req.user = {
		id: user.id,
		studentId: user.student_id,
		role: user.role,
		department: user.department,
		fullName: user.full_name,
	};

	next();
}

export function requireAdmin(req, res, next) {
	if (req.user?.role !== 'admin') {
		throw forbidden('ADMIN_ONLY', 'Only administrators can do this.');
	}

	next();
}
