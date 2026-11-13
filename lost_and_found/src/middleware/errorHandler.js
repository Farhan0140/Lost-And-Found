/**
 * The LAST middleware. Turns any thrown error into a clean JSON response.
 *
 *   - AppError        → its own status, code and message (safe to show users)
 *   - body parse error → 400 INVALID_JSON
 *   - body too large   → 413 PAYLOAD_TOO_LARGE
 *   - anything else    → 500 INTERNAL_ERROR, with the FULL details only in the server log
 *
 * Error responses never contain stack traces, SQL or connection strings (§5.3).
 */

import { AppError, explainError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req, res) {
	res.locals.errorCode = 'ROUTE_NOT_FOUND';

	res.status(404).json({
		error: {
			code: 'ROUTE_NOT_FOUND',
			message: `There is no API route for ${req.method} ${req.originalUrl.split('?')[0]}.`,
			requestId: req.id,
		},
	});
}

// Express recognises error handlers by their 4 parameters — keep `next`.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
	// ── errors we threw on purpose ──
	if (error instanceof AppError) {
		res.locals.errorCode = error.code;

		// 503 = a known outage (e.g. AI unavailable, draft saved) → warning, not a crash
		if (error.status === 503) {
			logger.warn('api', `${error.code}: ${error.message}`, { req: req.id });
		} else if (error.status >= 500) {
			logger.error('api', `${error.code}: ${error.message}`, { req: req.id });
		}

		return res.status(error.status).json({
			error: {
				code: error.code,
				message: error.message,
				...(error.details ?? {}),
				requestId: req.id,
			},
		});
	}

	// ── bad request bodies (from express.json) ──
	if (error.type === 'entity.parse.failed') {
		res.locals.errorCode = 'INVALID_JSON';

		return res.status(400).json({
			error: {
				code: 'INVALID_JSON',
				message: 'The request body is not valid JSON.',
				requestId: req.id,
			},
		});
	}

	if (error.type === 'entity.too.large') {
		res.locals.errorCode = 'PAYLOAD_TOO_LARGE';

		return res.status(413).json({
			error: {
				code: 'PAYLOAD_TOO_LARGE',
				message:
					'The request is too large. Photos must be resized to 1024 px before upload.',
				requestId: req.id,
			},
		});
	}

	// ── a real bug or an infrastructure problem ──
	const explained = explainError(error);

	res.locals.errorCode = 'INTERNAL_ERROR';

	logger.error('api', `${req.method} ${req.originalUrl} crashed: ${error.message}`, {
		req: req.id,
		area: explained?.area,
		why: explained?.explanation,
		hint: explained?.hint,
	});

	if (!explained) {
		console.error(error.stack);
	}

	const isDatabaseDown =
		explained?.area === 'database' && !['23505', '23503'].includes(error.code);

	return res.status(isDatabaseDown ? 503 : 500).json({
		error: {
			code: isDatabaseDown ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR',
			message: isDatabaseDown
				? 'The database is not answering right now. Please try again in a moment.'
				: 'Something went wrong on the server. Please try again.',
			requestId: req.id,
		},
	});
}
