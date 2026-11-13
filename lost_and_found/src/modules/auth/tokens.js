/**
 * Access and refresh tokens (§5.2).
 *
 *   Access token   JWT (HS256), 7 days. Claims: sub, role, dept, iat, exp
 *   Refresh token  random string, 15 days, stored as SHA-256, ROTATED on every use.
 *                  The old token gets revoked_at + replaced_by.
 *                  Re-using a revoked token revokes the user's whole chain → 401.
 */

import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import { config } from '../../config/env.js';
import { RULES } from '../../config/rules.js';
import { query, withTransaction } from '../../db/pool.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';
import { unauthorized } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { audit } from '../audit/audit.service.js';

export function signAccessToken(user) {
	return jwt.sign(
		{
			sub: user.id,
			role: user.role,
			dept: user.department ?? null,
		},
		config.jwtSecret,
		{
			algorithm: 'HS256',
			expiresIn: RULES.accessTokenTtl,
		},
	);
}

/** Creates a refresh token row and returns the RAW token (shown to the client once). */
export async function createRefreshToken(
	db,
	{ userId, familyId = crypto.randomUUID(), ip, userAgent },
) {
	const raw = `sfr_${randomToken(32)}`;

	const { rows } = await db.query(
		`
		insert into refresh_tokens (user_id, family_id, token_hash, expires_at, ip, user_agent)
		values ($1, $2, $3, now() + ($4 || ' milliseconds')::interval, $5, $6)
		returning id
		`,
		[
			userId,
			familyId,
			sha256Hex(raw),
			String(RULES.refreshTokenTtlMs),
			ip,
			userAgent?.slice(0, 200),
		],
	);

	return { raw, id: rows[0].id, familyId };
}

/** Both tokens for a freshly logged-in user. */
export async function issueTokenPair(db, user, { ip, userAgent }) {
	const refresh = await createRefreshToken(db, { userId: user.id, ip, userAgent });

	return {
		accessToken: signAccessToken(user),
		refreshToken: refresh.raw,
	};
}

/**
 * Exchanges a refresh token for a new pair.
 * The client must not refresh twice in parallel — the second call would look like reuse.
 */
export async function rotateRefreshToken(rawToken, { ip, userAgent }) {
	const tokenHash = sha256Hex(String(rawToken ?? ''));

	return withTransaction(async (client) => {
		const { rows } = await client.query(
			`
			select t.*, u.role, u.department, u.is_active
			from refresh_tokens t
			join users u on u.id = t.user_id
			where t.token_hash = $1
			for update of t
			`,
			[tokenHash],
		);

		const token = rows[0];

		if (!token) {
			throw unauthorized(
				'INVALID_REFRESH_TOKEN',
				'Your session is not valid. Please log in again.',
			);
		}

		// ── reuse of a revoked token: assume theft, revoke EVERYTHING for this user ──
		if (token.revoked_at) {
			await client.query(
				`
				update refresh_tokens
				set revoked_at = now(), revoked_reason = 'reuse_detected'
				where user_id = $1 and revoked_at is null
				`,
				[token.user_id],
			);

			await audit(client, {
				actorType: 'system',
				action: 'auth.refresh_reuse_detected',
				entityType: 'user',
				entityId: token.user_id,
				details: { ip },
			});

			logger.warn('auth', 'Refresh token reuse detected — all sessions of the user revoked', {
				user: token.user_id,
			});

			// Commit the revocation, then answer 401 (so the throw must not roll it back).
			return { reuseDetected: true };
		}

		if (new Date(token.expires_at) <= new Date()) {
			throw unauthorized(
				'REFRESH_TOKEN_EXPIRED',
				'Your session expired. Please log in again.',
			);
		}

		if (!token.is_active) {
			throw unauthorized('ACCOUNT_DISABLED', 'This account has been disabled.');
		}

		const next = await createRefreshToken(client, {
			userId: token.user_id,
			familyId: token.family_id,
			ip,
			userAgent,
		});

		await client.query(
			`
			update refresh_tokens
			set revoked_at = now(), revoked_reason = 'rotated', replaced_by = $2
			where id = $1
			`,
			[token.id, next.id],
		);

		return {
			accessToken: signAccessToken({
				id: token.user_id,
				role: token.role,
				department: token.department,
			}),
			refreshToken: next.raw,
		};
	}).then((result) => {
		if (result.reuseDetected) {
			throw unauthorized(
				'REFRESH_TOKEN_REUSED',
				'For your safety, all sessions were signed out. Please log in again.',
			);
		}

		return result;
	});
}

/** Logout: revokes the token's whole family (this device's session chain). */
export async function revokeRefreshToken(rawToken) {
	await query(
		`
		update refresh_tokens
		set revoked_at = now(), revoked_reason = 'logout'
		where family_id = (select family_id from refresh_tokens where token_hash = $1)
		  and revoked_at is null
		`,
		[sha256Hex(String(rawToken ?? ''))],
	);
}

/** Admin password reset: sign the user out everywhere. */
export async function revokeAllForUser(db, userId, reason) {
	await db.query(
		`
		update refresh_tokens
		set revoked_at = now(), revoked_reason = $2
		where user_id = $1 and revoked_at is null
		`,
		[userId, reason],
	);
}
