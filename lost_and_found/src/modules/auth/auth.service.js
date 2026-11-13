/**
 * Registration and login (§5.1, §5.2).
 *
 * Registration: studentId + nationalId + email + password.
 *   1. nid_hash = HMAC-SHA256(NID_HMAC_KEY, nationalId)
 *   2. verifyStudent(studentId, nid_hash) against the university database
 *   3. create the user with the HASH only — the raw national ID is never stored or logged
 */

import argon2 from 'argon2';

import { query, withTransaction } from '../../db/pool.js';
import { hashNationalId } from '../../lib/crypto.js';
import { conflict, forbidden, unauthorized } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { audit } from '../audit/audit.service.js';
import { verifyStudent } from '../university/verifyStudent.js';
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from './loginLimiter.js';
import { issueTokenPair } from './tokens.js';

const ARGON2_OPTIONS = { type: argon2.argon2id };

// A real hash of a random password, so a login for an unknown user takes the same time.
const DUMMY_HASH = await argon2.hash('timing-equaliser-not-a-real-password', ARGON2_OPTIONS);

/** The user object sent to clients. */
export function toPublicUser(row) {
	return {
		id: row.id,
		studentId: row.student_id,
		email: row.email,
		fullName: row.full_name,
		department: row.department,
		campusZoneId: row.campus_zone_id,
		role: row.role,
		createdAt: row.created_at,
	};
}

// ─────────────────────────────────────────────────────────────
//  Register
// ─────────────────────────────────────────────────────────────

export async function register({ studentId, nationalId, email, password }, { ip, userAgent }) {
	const existing = await query(
		`
		select
			exists (select 1 from users where lower(student_id) = lower($1)) as student_taken,
			exists (select 1 from users where lower(email) = lower($2)) as email_taken
		`,
		[studentId, email],
	);

	if (existing.rows[0].student_taken) {
		throw conflict(
			'ALREADY_REGISTERED',
			'This student ID already has an account. Please log in.',
		);
	}

	if (existing.rows[0].email_taken) {
		throw conflict('EMAIL_TAKEN', 'This email is already used by another account.');
	}

	const nationalIdHash = hashNationalId(nationalId);

	const student = await verifyStudent({ studentId, nationalIdHash });

	if (!student) {
		logger.warn('auth', 'Registration rejected: university records do not match', {
			studentId,
		});

		throw forbidden(
			'STUDENT_NOT_VERIFIED',
			'The student ID and national ID do not match the university records.',
		);
	}

	const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

	return withTransaction(async (client) => {
		const { rows } = await client.query(
			`
			insert into users
				(student_id, email, password_hash, nid_hash, full_name, department, campus_zone_id, role)
			values
				($1, $2, $3, $4, $5, $6, $7, 'student')
			returning *
			`,
			[
				student.studentId,
				email.trim(),
				passwordHash,
				nationalIdHash,
				student.fullName,
				student.department,
				student.campusZoneId,
			],
		);

		const user = rows[0];

		await audit(client, {
			actorType: 'user',
			actorId: user.id,
			action: 'user.registered',
			entityType: 'user',
			entityId: user.id,
			details: { studentId: user.student_id },
		});

		const tokens = await issueTokenPair(client, user, { ip, userAgent });

		logger.info('auth', `New student registered: ${user.student_id} (${user.department})`);

		return { user: toPublicUser(user), ...tokens };
	});
}

// ─────────────────────────────────────────────────────────────
//  Login
// ─────────────────────────────────────────────────────────────

export async function login({ studentId, password }, { ip, userAgent }) {
	assertLoginAllowed(studentId, ip);

	const { rows } = await query('select * from users where lower(student_id) = lower($1)', [
		studentId,
	]);

	const user = rows[0];

	const passwordOk = await argon2.verify(user?.password_hash ?? DUMMY_HASH, password);

	if (!user || !passwordOk) {
		recordLoginFailure(studentId, ip);

		throw unauthorized('INVALID_CREDENTIALS', 'Wrong student ID or password.');
	}

	if (!user.is_active) {
		throw forbidden(
			'ACCOUNT_DISABLED',
			'This account has been disabled. Contact the admin desk.',
		);
	}

	clearLoginFailures(studentId, ip);

	return withTransaction(async (client) => {
		await client.query('update users set last_login_at = now() where id = $1', [user.id]);

		const tokens = await issueTokenPair(client, user, { ip, userAgent });

		return { user: toPublicUser(user), ...tokens };
	});
}

// ─────────────────────────────────────────────────────────────
//  Current user
// ─────────────────────────────────────────────────────────────

export async function getMe(userId) {
	const { rows } = await query(
		`
		select
			u.*,
			(select count(*) from notifications n where n.user_id = u.id and n.read_at is null) as unread
		from users u
		where u.id = $1
		`,
		[userId],
	);

	return {
		user: toPublicUser(rows[0]),
		unreadNotifications: rows[0].unread,
	};
}

export async function changePassword(userId, { currentPassword, newPassword }) {
	const { rows } = await query('select password_hash from users where id = $1', [userId]);

	const ok = await argon2.verify(rows[0].password_hash, currentPassword);

	if (!ok) {
		throw unauthorized('WRONG_PASSWORD', 'Your current password is not correct.');
	}

	const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);

	await withTransaction(async (client) => {
		await client.query('update users set password_hash = $2 where id = $1', [
			userId,
			passwordHash,
		]);

		await audit(client, {
			actorType: 'user',
			actorId: userId,
			action: 'user.password_changed',
			entityType: 'user',
			entityId: userId,
		});
	});
}

export async function hashPassword(password) {
	return argon2.hash(password, ARGON2_OPTIONS);
}
