/**
 * PostgreSQL (Neon) connection pool + two helpers:
 *
 *     const { rows } = await query('select * from users where id = $1', [userId]);
 *
 *     await withTransaction(async (client) => {
 *         await client.query('update lockers ...');
 *         await client.query('insert into otps ...');
 *     });
 *
 * Every service function that writes takes an optional `db` argument, so it can run
 * either on its own (`db = pool`) or inside someone else's transaction (`db = client`).
 */

import pg from 'pg';

import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { explainError } from '../lib/errors.js';

// ─────────────────────────────────────────────────────────────
//  Type parsing
// ─────────────────────────────────────────────────────────────

// `date` columns stay as "YYYY-MM-DD" strings (no timezone shifting).
pg.types.setTypeParser(1082, (value) => value);

// bigint / count(*) → JavaScript number (our counts are small).
pg.types.setTypeParser(20, (value) => Number(value));

// numeric → JavaScript number. Scores are STORED as numeric(6,4) and rounded only for display.
pg.types.setTypeParser(1700, (value) => Number(value));

// ─────────────────────────────────────────────────────────────
//  Pool
// ─────────────────────────────────────────────────────────────

export const pool = new pg.Pool({
	connectionString: config.databaseUrl,
	max: config.dbPoolMax,
	idleTimeoutMillis: 30_000,

	// Neon can take a few seconds to wake up from autosuspend.
	connectionTimeoutMillis: 20_000,
});

pool.on('error', (error) => {
	const explained = explainError(error);

	logger.error('database', explained?.explanation ?? 'Idle database connection failed', {
		code: error.code,
		hint: explained?.hint,
	});
});

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

export function query(text, params = []) {
	return pool.query(text, params);
}

/**
 * Runs `work(client)` inside BEGIN … COMMIT.
 * Any thrown error rolls everything back and is re-thrown.
 */
export async function withTransaction(work) {
	const client = await pool.connect();

	// Things to do only once the transaction is committed (live updates to browsers).
	// Code inside `work` adds to it via publishChange(…, client). A rollback drops them.
	const afterCommit = [];
	client.afterCommit = afterCommit;

	try {
		await client.query('begin');

		const result = await work(client);

		await client.query('commit');

		// The client goes back to the pool below; detach the list first.
		client.afterCommit = undefined;

		for (const task of afterCommit) {
			try {
				task();
			} catch (error) {
				logger.warn('database', `After-commit task failed: ${error.message}`);
			}
		}

		return result;
	} catch (error) {
		await client.query('rollback').catch(() => {});

		throw error;
	} finally {
		client.afterCommit = undefined;
		client.release();
	}
}

/** Used at startup: proves the database answers and pgvector is installed. */
export async function checkDatabaseConnection() {
	const started = Date.now();

	const { rows } = await pool.query(`
		select
			current_database() as database,
			split_part(version(), ' ', 2) as version,
			exists (select 1 from pg_extension where extname = 'vector') as has_vector
	`);

	return {
		...rows[0],
		latencyMs: Date.now() - started,
	};
}
