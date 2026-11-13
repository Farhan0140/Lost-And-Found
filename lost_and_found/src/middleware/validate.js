/**
 * Request validation with zod.
 *
 *     router.post('/login', validateBody(loginSchema), handler)
 *
 * On failure the client gets a 400 with every problem listed:
 *
 *     {
 *         "error": {
 *             "code": "VALIDATION_FAILED",
 *             "message": "Some fields are missing or invalid.",
 *             "fields": [{ "field": "password", "message": "must be at least 8 characters" }]
 *         }
 *     }
 */

import { AppError } from '../lib/errors.js';

export function formatZodIssues(error) {
	return error.issues.map((issue) => ({
		field: issue.path.join('.') || '(body)',
		message: issue.message,
	}));
}

function validator(schema, source) {
	return (req, res, next) => {
		const parsed = schema.safeParse(req[source] ?? {});

		if (!parsed.success) {
			throw new AppError(400, 'VALIDATION_FAILED', 'Some fields are missing or invalid.', {
				fields: formatZodIssues(parsed.error),
			});
		}

		// Express 5 makes req.query read-only, so parsed query lives on req.validQuery.
		if (source === 'query') {
			req.validQuery = parsed.data;
		} else {
			req[source] = parsed.data;
		}

		next();
	};
}

export const validateBody = (schema) => validator(schema, 'body');

export const validateQuery = (schema) => validator(schema, 'query');

/** Validate any value inside a service (throws the same 400). */
export function parseOrThrow(schema, value) {
	const parsed = schema.safeParse(value);

	if (!parsed.success) {
		throw new AppError(400, 'VALIDATION_FAILED', 'Some fields are missing or invalid.', {
			fields: formatZodIssues(parsed.error),
		});
	}

	return parsed.data;
}
