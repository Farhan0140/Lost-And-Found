/**
 * In-app notifications (D3): no push, email or SMS.
 * Open browser tabs hear about a new one at once through the live stream (live.hub.js);
 * `GET /notifications/unread-count` polling is only the fallback.
 */

import { pool } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { publishChange } from '../live/live.hub.js';

/**
 * @param db       pool or transaction client
 * @param userId   recipient
 * @param message  { type, title, body, link }
 */
export async function notify(db, userId, { type, title, body, link = null }) {
	await (db ?? pool).query(
		`
		insert into notifications (user_id, type, title, body, link)
		values ($1, $2, $3, $4, $5)
		`,
		[userId, type, title, body, link],
	);

	// A notification always comes with a change to that user's report or match,
	// so their open tabs refetch those too (after the COMMIT, when in a transaction).
	publishChange({ users: { [userId]: ['notifications', 'reports', 'matches'] } }, db);

	logger.debug('notify', `${type} → user ${userId}`);
}

/** Sends the same notification to every active admin. */
export async function notifyAdmins(db, { type, title, body, link = null }) {
	await (db ?? pool).query(
		`
		insert into notifications (user_id, type, title, body, link)
		select id, $1, $2, $3, $4
		from users
		where role = 'admin' and is_active
		`,
		[type, title, body, link],
	);

	publishChange({ admins: ['notifications', 'admin'] }, db);
}

export async function listNotifications(userId, { limit = 30, before = null } = {}) {
	const { rows } = await pool.query(
		`
		select id, type, title, body, link, read_at, created_at
		from notifications
		where user_id = $1
		  and ($2::timestamptz is null or created_at < $2)
		order by created_at desc
		limit $3
		`,
		[userId, before, Math.min(Number(limit) || 30, 100)],
	);

	return rows;
}

export async function countUnread(userId) {
	const { rows } = await pool.query(
		'select count(*) as count from notifications where user_id = $1 and read_at is null',
		[userId],
	);

	return rows[0].count;
}

export async function markRead(userId, notificationId) {
	await pool.query(
		`
		update notifications
		set read_at = now()
		where id = $1 and user_id = $2 and read_at is null
		`,
		[notificationId, userId],
	);
}

export async function markAllRead(userId) {
	await pool.query(
		'update notifications set read_at = now() where user_id = $1 and read_at is null',
		[userId],
	);
}
