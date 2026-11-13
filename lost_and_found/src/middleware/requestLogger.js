/**
 * Gives every request a short ID and prints ONE line when it finishes:
 *
 *     14:05:12  HTTP   API   POST /api/v1/auth/login  200  84ms  user=2125051001  req=a81c09f2
 *
 * The ID is also returned in the `X-Request-Id` header and inside every error body,
 * so a user can report "request a81c09f2 failed" and you can find it in the log.
 *
 * The ESP32 polls once a second; those lines are hidden unless LOG_DEVICE_POLLS=true.
 */

import crypto from 'node:crypto';

import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

const QUIET_PATHS = ['/api/v1/device/poll', '/api/v1/device/heartbeat'];

// Swagger UI loads ~8 files (scripts, css, icons); only the page itself is logged.
const DOCS_ASSET = /^\/api\/docs\/.+\.(js|css|png|map)$/;

export function requestLogger(req, res, next) {
	req.id = crypto.randomUUID().slice(0, 8);
	res.setHeader('X-Request-Id', req.id);

	const started = performance.now();

	res.on('finish', () => {
		const path = req.originalUrl.split('?')[0];

		const isQuiet = QUIET_PATHS.includes(path) && res.statusCode < 400;

		if (isQuiet && !config.logDevicePolls) {
			return;
		}

		if (DOCS_ASSET.test(path) && res.statusCode < 400) {
			return;
		}

		logger.http({
			method: req.method,
			path:
				req.originalUrl.length > 120
					? `${req.originalUrl.slice(0, 117)}...`
					: req.originalUrl,
			status: res.statusCode,
			durationMs: performance.now() - started,
			user: req.user?.studentId ?? (req.device ? `device:${req.device.id}` : undefined),
			requestId: req.id,
			errorCode: res.locals.errorCode,
		});
	});

	next();
}
