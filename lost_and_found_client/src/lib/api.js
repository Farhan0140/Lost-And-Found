/**
 * Talks to the SmartFind backend.
 *
 *     const { report } = await api.get(`/reports/${id}`);
 *     await api.post('/reports', { kind: 'found' });
 *
 * - Adds the access token to every request.
 * - When the access token expired, refreshes it ONCE (even if 5 requests fail at the
 *   same time) and retries. Refresh tokens are single-use on the server, so two
 *   parallel refreshes would sign the user out — that is why they are serialised.
 * - Every failure becomes an ApiError with the server's code + readable message.
 */

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1').replace(
	/\/+$/,
	'',
);

const ACCESS_KEY = 'sf.access';
const REFRESH_KEY = 'sf.refresh';

// ─────────────────────────────────────────────────────────────
//  Errors
// ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
	/**
	 * @param {number} status   HTTP status (0 = network error)
	 * @param {string} code     server error code, e.g. VERSION_CONFLICT
	 * @param {string} message  readable message to show the user
	 * @param {object} details  extra fields from the server (fields, missing, currentVersion, …)
	 */
	constructor(status, code, message, details = {}) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.details = details;
		this.requestId = details.requestId ?? null;
	}
}

// ─────────────────────────────────────────────────────────────
//  Token storage
// ─────────────────────────────────────────────────────────────

function read(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key, value) {
	try {
		if (value) {
			localStorage.setItem(key, value);
		} else {
			localStorage.removeItem(key);
		}
	} catch {
		// private mode: tokens live only in memory for this tab
	}
}

let accessToken = read(ACCESS_KEY);
let refreshToken = read(REFRESH_KEY);

export const tokens = {
	get access() {
		return accessToken;
	},

	get refresh() {
		return refreshToken;
	},

	set({ accessToken: access, refreshToken: refresh }) {
		accessToken = access ?? null;
		refreshToken = refresh ?? null;
		write(ACCESS_KEY, accessToken);
		write(REFRESH_KEY, refreshToken);
	},

	clear() {
		this.set({});
	},
};

/** Called when the session is gone for good (refresh failed) — AuthProvider listens. */
const sessionListeners = new Set();

export function onSessionExpired(listener) {
	sessionListeners.add(listener);

	return () => sessionListeners.delete(listener);
}

// ─────────────────────────────────────────────────────────────
//  Refresh (one at a time)
// ─────────────────────────────────────────────────────────────

let refreshing = null;

async function refreshTokens() {
	if (!refreshToken) {
		throw new ApiError(401, 'NOT_LOGGED_IN', 'Please log in first.');
	}

	// Everyone who needs a refresh right now waits for the same promise.
	if (!refreshing) {
		refreshing = (async () => {
			try {
				const result = await send('POST', '/auth/refresh', {
					body: { refreshToken },
					auth: false,
				});

				tokens.set(result);

				return result.accessToken;
			} catch (error) {
				tokens.clear();
				sessionListeners.forEach((listener) => listener(error));
				throw error;
			} finally {
				refreshing = null;
			}
		})();
	}

	return refreshing;
}

/**
 * Gets a fresh access token (shared with any refresh already running).
 * Used by the live stream (lib/live.js), which talks to the server without send().
 */
export function refreshAccessToken() {
	return refreshTokens();
}

// ─────────────────────────────────────────────────────────────
//  The request function
// ─────────────────────────────────────────────────────────────

async function send(method, path, { body, auth = true, signal, query } = {}) {
	let url = `${API_URL}${path}`;

	if (query) {
		const params = new URLSearchParams();

		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && value !== null && value !== '') {
				params.set(key, String(value));
			}
		}

		const text = params.toString();

		if (text) {
			url += `?${text}`;
		}
	}

	const headers = { Accept: 'application/json' };

	if (body !== undefined) {
		headers['Content-Type'] = 'application/json';
	}

	if (auth && accessToken) {
		headers.Authorization = `Bearer ${accessToken}`;
	}

	let response;

	try {
		response = await fetch(url, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
			signal,
		});
	} catch (error) {
		if (error.name === 'AbortError') {
			throw error;
		}

		throw new ApiError(
			0,
			'NETWORK_ERROR',
			'Cannot reach the SmartFind server. Check your connection and try again.',
		);
	}

	const data = await response.json().catch(() => null);

	if (response.ok) {
		return data;
	}

	const error = data?.error ?? {};
	const { code, message, ...details } = error;

	throw new ApiError(
		response.status,
		code ?? `HTTP_${response.status}`,
		message ?? `The server answered ${response.status}.`,
		details,
	);
}

/** send() + one automatic refresh-and-retry when the access token expired. */
async function request(method, path, options = {}) {
	try {
		return await send(method, path, options);
	} catch (error) {
		const canRetry =
			options.auth !== false &&
			error instanceof ApiError &&
			error.status === 401 &&
			['TOKEN_EXPIRED', 'INVALID_TOKEN'].includes(error.code) &&
			refreshToken;

		if (!canRetry) {
			throw error;
		}

		await refreshTokens();

		return send(method, path, options);
	}
}

export const api = {
	get: (path, options) => request('GET', path, options),
	post: (path, body, options) => request('POST', path, { ...options, body: body ?? {} }),
	put: (path, body, options) => request('PUT', path, { ...options, body: body ?? {} }),
	patch: (path, body, options) => request('PATCH', path, { ...options, body: body ?? {} }),
	delete: (path, body, options) => request('DELETE', path, { ...options, body }),
};

/** Readable text for any error (ApiError or not). */
export function errorMessage(error) {
	if (error instanceof ApiError) {
		return error.message;
	}

	return error?.message ?? 'Something went wrong.';
}

/**
 * Validation errors → { field: message } for showing next to form fields.
 * The server sends  details.fields = [{ field: 'password', message: 'must be at least 8 characters' }].
 */
export function fieldErrors(error) {
	if (!(error instanceof ApiError) || !Array.isArray(error.details?.fields)) {
		return {};
	}

	return Object.fromEntries(error.details.fields.map((item) => [item.field, item.message]));
}
