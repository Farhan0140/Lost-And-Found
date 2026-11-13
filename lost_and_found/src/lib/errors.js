/**
 * Errors that the API is allowed to show to users.
 *
 * Throw an `AppError` anywhere in a route or service:
 *
 *     throw new AppError(409, 'LOCKER_BUSY', 'That locker is already reserved.');
 *
 * The error handler turns it into:
 *
 *     { "error": { "code": "LOCKER_BUSY", "message": "That locker is already reserved." } }
 *
 * Any OTHER error (a bug, a database crash) becomes a generic 500 for the client,
 * while the full details are printed in the server log with the request ID.
 */

export class AppError extends Error {
	/**
	 * @param {number} status   HTTP status code
	 * @param {string} code     Stable machine-readable code, e.g. "OTP_LIMIT_REACHED"
	 * @param {string} message  Human-readable sentence shown to the user
	 * @param {object} [details] Extra JSON-safe fields for the client (never secrets)
	 */
	constructor(status, code, message, details = undefined) {
		super(message);

		this.name = 'AppError';
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

// ─────────────────────────────────────────────────────────────
//  Shortcuts
// ─────────────────────────────────────────────────────────────

export const badRequest = (code, message, details) => new AppError(400, code, message, details);

export const unauthorized = (code, message, details) => new AppError(401, code, message, details);

export const forbidden = (code, message, details) => new AppError(403, code, message, details);

export const notFound = (code, message, details) => new AppError(404, code, message, details);

export const conflict = (code, message, details) => new AppError(409, code, message, details);

export const unprocessable = (code, message, details) => new AppError(422, code, message, details);

export const tooManyRequests = (code, message, details) =>
	new AppError(429, code, message, details);

export const serviceUnavailable = (code, message, details) =>
	new AppError(503, code, message, details);

// ─────────────────────────────────────────────────────────────
//  Explaining low-level errors in plain English (for the LOG only)
// ─────────────────────────────────────────────────────────────

/**
 * Returns a short explanation + hint for common infrastructure errors,
 * or `null` when we have nothing helpful to add.
 */
export function explainError(error) {
	const code = error?.code;
	const message = String(error?.message ?? '');

	if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
		return {
			area: 'database',
			explanation: 'Could not reach the database server.',
			hint: 'Check DATABASE_URL in .env and your internet connection.',
		};
	}

	if (code === 'ETIMEDOUT' || message.includes('timeout expired')) {
		return {
			area: 'database',
			explanation: 'The database took too long to answer.',
			hint: 'Neon may be waking up from autosuspend — retry in a few seconds.',
		};
	}

	if (code === '28P01') {
		return {
			area: 'database',
			explanation: 'The database rejected the username or password.',
			hint: 'Copy a fresh connection string from the Neon dashboard into DATABASE_URL.',
		};
	}

	if (code === '3D000') {
		return {
			area: 'database',
			explanation: 'The database named in DATABASE_URL does not exist.',
			hint: 'Check the database name at the end of DATABASE_URL.',
		};
	}

	if (code === '42P01') {
		return {
			area: 'database',
			explanation: 'A table is missing.',
			hint: 'Run `npm run migrate` to create the tables.',
		};
	}

	if (code === '42703') {
		return {
			area: 'database',
			explanation: 'A column is missing — the database schema is older than the code.',
			hint: 'Run `npm run migrate`.',
		};
	}

	if (code === '23505') {
		return {
			area: 'database',
			explanation: `A unique value already exists (${error.constraint ?? 'unique constraint'}).`,
			hint: null,
		};
	}

	if (code === '23503') {
		return {
			area: 'database',
			explanation: `A referenced row does not exist (${error.constraint ?? 'foreign key'}).`,
			hint: null,
		};
	}

	if (code === '40001' || code === '40P01') {
		return {
			area: 'database',
			explanation: 'Two requests changed the same rows at the same time.',
			hint: 'The client can simply retry.',
		};
	}

	return null;
}
