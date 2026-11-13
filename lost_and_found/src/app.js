/**
 * Builds the Express app (no listening here — see server.js).
 *
 *   /api/v1/health          liveness + database check
 *   /api/v1/auth            register, login, refresh, logout, me
 *   /api/v1/meta            zones, categories, lockers, rules, question sets
 *   /api/v1/reports         a student's own reports (drafts → submit → OTP)
 *   /api/v1/matches         the owner's side of a match + collection OTP
 *   /api/v1/notifications   in-app notifications
 *   /api/v1/admin           admin dashboard API
 *   /api/v1/device          ESP32 only (device secret)
 *
 *   /api/docs               Swagger UI (OpenAPI 3.1) — see src/docs/
 */

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { config } from './config/env.js';
import { DOCS_PATH, docsHelmet, docsRouter } from './docs/docs.routes.js';
import { checkDatabaseConnection } from './db/pool.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { getAiHealth } from './modules/ai/keyPool.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { deviceRouter } from './modules/devices/device.routes.js';
import { matchesRouter } from './modules/matching/matches.routes.js';
import { metaRouter } from './modules/meta/meta.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';

// Routes that carry photos (base64) get a bigger body limit; everything else stays small.
const PHOTO_ROUTE = /^\/api\/v1\/reports\/[^/]+\/(extract|followups\/generate)$/;

const smallJson = express.json({ limit: '200kb' });
const photoJson = express.json({ limit: '15mb' });

export function createApp() {
	const app = express();

	// Render / Vercel sit behind a proxy: trust it so req.ip is the real client IP.
	app.set('trust proxy', 1);
	app.disable('x-powered-by');

	// The docs page needs a slightly relaxed CSP (see docs.routes.js); the API keeps the defaults.
	const apiHelmet = helmet();

	app.use((req, res, next) => {
		const isDocs = req.path === DOCS_PATH || req.path.startsWith(`${DOCS_PATH}/`);

		(isDocs ? docsHelmet : apiHelmet)(req, res, next);
	});

	app.use(
		cors({
			origin(origin, callback) {
				// Requests without an Origin (ESP32, curl, server-to-server) are allowed;
				// they are authenticated by tokens / device secrets, not by CORS.
				if (!origin || config.allowedOrigins.includes(origin)) {
					return callback(null, true);
				}

				logger.warn('cors', `Blocked a request from origin ${origin}`, {
					hint: 'add it to ALLOWED_ORIGINS in .env (no trailing slash)',
				});

				return callback(null, false);
			},
			credentials: false,
			maxAge: 600,
		}),
	);

	app.use(requestLogger);

	app.use((req, res, next) => {
		const parser = PHOTO_ROUTE.test(req.path) ? photoJson : smallJson;

		parser(req, res, next);
	});

	// ── health ──
	app.get('/api/v1/health', async (req, res) => {
		let database = 'ok';

		try {
			await checkDatabaseConnection();
		} catch {
			database = 'unreachable';
		}

		res.status(database === 'ok' ? 200 : 503).json({
			status: database === 'ok' ? 'ok' : 'degraded',
			database,
			ai: getAiHealth().overall,
			time: new Date().toISOString(),
		});
	});

	// ── API docs (Swagger UI) ──
	if (config.apiDocsEnabled) {
		app.use(DOCS_PATH, docsRouter);
	}

	// ── API ──
	app.use('/api/v1/auth', authRouter);
	app.use('/api/v1/meta', metaRouter);
	app.use('/api/v1/reports', reportsRouter);
	app.use('/api/v1/matches', matchesRouter);
	app.use('/api/v1/notifications', notificationsRouter);
	app.use('/api/v1/admin', adminRouter);
	app.use('/api/v1/device', deviceRouter);

	app.get('/', (req, res) => {
		res.json({
			name: 'SmartFind API',
			docs: config.apiDocsEnabled ? DOCS_PATH : 'See README.md',
			health: '/api/v1/health',
		});
	});

	app.use(notFoundHandler);
	app.use(errorHandler);

	return app;
}
