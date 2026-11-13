/**
 * Append-only, hash-chained audit log.
 *
 *     await audit(client, {
 *         actorType: 'admin',
 *         actorId: req.user.id,
 *         action: 'locker.force_open',
 *         entityType: 'locker',
 *         entityId: locker.id,
 *         reason: 'Student locked their bag inside by mistake',
 *         details: { label: 'L2' },
 *     });
 *
 * The id, prev_hash and hash are filled in by the database trigger (see migration 001).
 * Pass the transaction `client` when the audited change happens in a transaction, so the
 * log entry is committed (or rolled back) together with the change itself.
 */

import { pool } from '../../db/pool.js';

export async function audit(db, entry) {
	const {
		actorType,
		actorId = null,
		action,
		entityType = null,
		entityId = null,
		reason = null,
		details = {},
	} = entry;

	await (db ?? pool).query(
		`
		insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, details)
		values ($1, $2, $3, $4, $5, $6, $7)
		`,
		[
			actorType,
			actorId === null ? null : String(actorId),
			action,
			entityType,
			entityId === null ? null : String(entityId),
			reason,
			JSON.stringify(details ?? {}),
		],
	);
}

/** Shortcut for system jobs (sweeper, seed). */
export function auditSystem(db, action, entityType, entityId, details = {}) {
	return audit(db, {
		actorType: 'system',
		actorId: 'system',
		action,
		entityType,
		entityId,
		details,
	});
}

/** The newest entry: { id, hash, at }. Exported daily outside the database. */
export async function getAuditHead() {
	const { rows } = await pool.query(
		'select id, hash, at from audit_log order by id desc limit 1',
	);

	return rows[0] ?? null;
}

/**
 * Re-computes every hash and checks every link of the chain.
 * Returns { ok, checked, firstBrokenId, problem }.
 */
export async function verifyAuditChain() {
	const BATCH = 2000;

	let lastId = 0;
	let expectedPrev = '0'.repeat(64);
	let checked = 0;

	for (;;) {
		const { rows } = await pool.query(
			`
			select
				id,
				prev_hash,
				hash,
				audit_row_hash(
					prev_hash, id, at, actor_type, actor_id, action,
					entity_type, entity_id, reason, details
				) as recomputed
			from audit_log
			where id > $1
			order by id
			limit $2
			`,
			[lastId, BATCH],
		);

		if (rows.length === 0) {
			break;
		}

		for (const row of rows) {
			if (row.prev_hash !== expectedPrev) {
				return {
					ok: false,
					checked,
					firstBrokenId: row.id,
					problem:
						'prev_hash does not match the previous entry (an entry was removed or reordered)',
				};
			}

			if (row.recomputed !== row.hash) {
				return {
					ok: false,
					checked,
					firstBrokenId: row.id,
					problem: 'hash does not match the content (the entry was edited)',
				};
			}

			expectedPrev = row.hash;
			lastId = row.id;
			checked++;
		}
	}

	return { ok: true, checked, firstBrokenId: null, problem: null };
}
