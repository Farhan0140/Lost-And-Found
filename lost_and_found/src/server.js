/**
 * SmartFind backend — entry point.
 *
 *     npm run dev     (restarts on file changes)
 *     npm start
 *
 * Startup order, each step explained in the log if it fails:
 *   1. .env is validated            (src/config/env.js — exits with a readable list)
 *   2. database connection + pgvector
 *   3. migrations are applied
 *   4. device credentials + pending commands loaded into memory
 *   5. HTTP server starts
 *   6. background sweeper starts
 */

import { config } from './config/env.js';
import { createApp } from './app.js';
import { checkDatabaseConnection, pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { stopSweeper, startSweeper } from './jobs/sweeper.js';
import { explainError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { loadDevices, loadPendingCommands } from './modules/devices/deviceState.js';
import { closeAllStreams } from './modules/live/live.hub.js';

async function start() {
	logger.info('server', `Starting SmartFind backend (${config.nodeEnv})`);

	// ── 2. database ──
	try {
		const db = await checkDatabaseConnection();

		logger.info(
			'database',
			`Connected to "${db.database}" (PostgreSQL ${db.version}) in ${db.latencyMs} ms`,
		);
	} catch (error) {
		const explained = explainError(error);

		logger.error('database', explained?.explanation ?? `Could not connect: ${error.message}`, {
			code: error.code,
			hint: explained?.hint ?? 'check DATABASE_URL in .env',
		});

		process.exit(1);
	}

	// ── 3. migrations ──
	await runMigrations();

	// ── 4. devices ──
	const deviceCount = await loadDevices();
	const commandCount = await loadPendingCommands();

	logger.info('device', `${deviceCount} device(s) loaded, ${commandCount} pending command(s)`);

	// ── AI configuration summary (slots only, never keys) ──
	if (config.ai.keys.length === 0) {
		logger.warn(
			'ai',
			'No GEMINI_API_KEY is set — reports cannot be created until you add at least one',
			{
				hint: 'set GEMINI_API_KEY1 in .env',
			},
		);
	} else {
		logger.info(
			'ai',
			`${config.ai.keys.length} Gemini key(s) configured: slots ${config.ai.keys.map((key) => `#${key.slot}`).join(', ')}`,
		);
		logger.info(
			'ai',
			`Models — extraction: ${config.models.EXTRACTION.join(' → ')} · follow-ups: ${config.models.FOLLOWUPS.join(' → ')} · questions: ${config.models.QUESTIONS.join(' → ')} · embedding: ${config.models.EMBEDDING}`,
		);
	}

	// ── 5. HTTP ──
	const app = createApp();

	const server = app.listen(config.port, () => {
		logger.info(
			'server',
			`Listening on http://localhost:${config.port}  (API: /api/v1, health: /api/v1/health)`,
		);
		logger.info(
			'server',
			`Allowed web origins: ${config.allowedOrigins.join(', ') || '(none)'}`,
		);
	});

	server.on('error', (error) => {
		if (error.code === 'EADDRINUSE') {
			logger.error('server', `Port ${config.port} is already in use`, {
				hint: 'stop the other process or change PORT in .env',
			});
		} else {
			logger.error('server', error.message);
		}

		process.exit(1);
	});

	// ── 6. sweeper ──
	startSweeper();

	// ── graceful shutdown ──
	const shutdown = (signal) => {
		logger.info('server', `${signal} received — shutting down`);

		stopSweeper();

		// Open browser streams would otherwise keep server.close() waiting; the tabs reconnect.
		closeAllStreams();

		server.close(() => {
			pool.end().finally(() => process.exit(0));
		});

		setTimeout(() => process.exit(0), 5000).unref();
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
	logger.error('server', `Unhandled promise rejection: ${reason?.message ?? reason}`);

	if (reason?.stack) {
		console.error(reason.stack);
	}
});

start().catch((error) => {
	logger.error('server', `Startup failed: ${error.message}`, { hint: explainError(error)?.hint });
	process.exit(1);
});
