/**
 * Applies every `.sql` file in ./migrations that has not been applied yet.
 *
 *     npm run migrate
 *
 * Files run in name order (001_…, 002_…). Each file runs in its own transaction and is
 * recorded in `schema_migrations`, so running this twice is safe.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from './pool.js';
import { logger } from '../lib/logger.js';
import { explainError } from '../lib/errors.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function runMigrations() {
	await pool.query(`
		create table if not exists schema_migrations (
			name        text primary key,
			applied_at  timestamptz not null default now()
		)
	`);

	const { rows } = await pool.query('select name from schema_migrations');
	const applied = new Set(rows.map((row) => row.name));

	const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

	let count = 0;

	for (const file of files) {
		if (applied.has(file)) {
			continue;
		}

		const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
		const client = await pool.connect();

		try {
			logger.info('migrate', `Applying ${file} …`);

			await client.query('begin');
			await client.query(sql);
			await client.query('insert into schema_migrations (name) values ($1)', [file]);
			await client.query('commit');

			count++;
		} catch (error) {
			await client.query('rollback').catch(() => {});

			logger.error('migrate', `${file} failed: ${error.message}`, {
				position: error.position,
				hint: explainError(error)?.hint,
			});

			throw error;
		} finally {
			client.release();
		}
	}

	if (count === 0) {
		logger.info('migrate', 'Database schema is already up to date');
	} else {
		logger.info('migrate', `Applied ${count} migration(s)`);
	}
}

// Run directly: `node src/db/migrate.js`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	runMigrations()
		.then(() => pool.end())
		.catch(() => {
			pool.end();
			process.exit(1);
		});
}
