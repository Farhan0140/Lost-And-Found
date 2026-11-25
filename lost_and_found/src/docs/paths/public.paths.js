/**
 * Swagger docs: /health, /auth/*, /meta/*
 */

import {
	changePasswordSchema,
	loginSchema,
	refreshSchema,
	registerSchema,
} from '../../modules/auth/auth.routes.js';
import { operation, pathParam, ref } from '../builders.js';
import * as examples from '../examples.js';

// ─────────────────────────────────────────────────────────────
//  Health
// ─────────────────────────────────────────────────────────────

const healthPaths = {
	'/health': {
		get: operation({
			id: 'getHealth',
			tag: 'Health',
			summary: 'Is the server up? (database + AI state)',
			description:
				'Returns **503** with `status: "degraded"` when the database cannot be reached. Used by Render as the health check.',
			auth: 'none',
			ok: {
				schema: {
					type: 'object',
					properties: {
						status: { type: 'string', enum: ['ok', 'degraded'] },
						database: { type: 'string', enum: ['ok', 'unreachable'] },
						ai: { type: 'string', enum: ['ok', 'degraded', 'down'] },
						time: { type: 'string', format: 'date-time' },
					},
				},
				example: {
					status: 'ok',
					database: 'ok',
					ai: 'ok',
					time: '2026-11-13T11:11:03.707Z',
				},
			},
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Auth
// ─────────────────────────────────────────────────────────────

const authPaths = {
	'/auth/register': {
		post: operation({
			id: 'register',
			tag: 'Auth',
			summary: 'Create a student account (checked against the university database)',
			description: [
				'The student ID + national ID pair must exist in the (dummy) university database.',
				'The national ID is stored only as an HMAC-SHA256 hash — never in plain text.',
				'',
				'Try it with **TEST0001 / 1234567890** or **TEST0002 / 1234567891**.',
			].join('\n'),
			auth: 'none',
			body: registerSchema,
			bodyOptions: {
				descriptions: {
					nationalId: '10, 13 or 17 digits. Spaces and dashes are ignored.',
				},
			},
			bodyExample: {
				studentId: 'TEST0001',
				nationalId: '1234567890',
				email: 'finder@test.local',
				password: 'Password123',
			},
			ok: {
				status: 201,
				description: 'Account created and logged in',
				schema: ref('AuthResult'),
				example: examples.authResult,
			},
			errors: {
				403: ['STUDENT_NOT_VERIFIED'],
				409: ['ALREADY_REGISTERED', 'EMAIL_TAKEN'],
			},
		}),
	},

	'/auth/login': {
		post: operation({
			id: 'login',
			tag: 'Auth',
			summary: 'Log in with student ID + password',
			description:
				'Copy `accessToken` from the response, click **Authorize** (top right) and paste it.\n\nAfter repeated wrong passwords the student ID is blocked for a while (429).',
			auth: 'none',
			body: loginSchema,
			bodyExample: { studentId: 'TEST0001', password: 'Password123' },
			ok: { schema: ref('AuthResult'), example: examples.authResult },
			errors: {
				401: ['INVALID_CREDENTIALS', 'ACCOUNT_DISABLED'],
				429: ['TOO_MANY_LOGIN_ATTEMPTS'],
			},
		}),
	},

	'/auth/refresh': {
		post: operation({
			id: 'refreshTokens',
			tag: 'Auth',
			summary: 'Swap a refresh token for a new access + refresh token',
			description:
				'Refresh tokens are **single use**. Using an old one again signs out every session of that user (`REFRESH_TOKEN_REUSED`). The web client must serialise refreshes (one at a time).',
			auth: 'none',
			body: refreshSchema,
			bodyExample: { refreshToken: examples.tokens.refreshToken },
			ok: { schema: ref('TokenPair'), example: examples.tokens },
			errors: {
				401: [
					'INVALID_REFRESH_TOKEN',
					'REFRESH_TOKEN_EXPIRED',
					'REFRESH_TOKEN_REUSED',
					'ACCOUNT_DISABLED',
				],
			},
		}),
	},

	'/auth/logout': {
		post: operation({
			id: 'logout',
			tag: 'Auth',
			summary: 'Revoke a refresh token',
			auth: 'none',
			body: refreshSchema,
			bodyExample: { refreshToken: examples.tokens.refreshToken },
			ok: { schema: ref('Ok') },
		}),
	},

	'/auth/me': {
		get: operation({
			id: 'getMe',
			tag: 'Auth',
			summary: 'Current user + unread notification count',
			auth: 'user',
			ok: {
				schema: {
					type: 'object',
					properties: {
						user: ref('User'),
						unreadNotifications: { type: 'integer' },
					},
				},
				example: { user: examples.user, unreadNotifications: 2 },
			},
		}),
	},

	'/auth/change-password': {
		post: operation({
			id: 'changePassword',
			tag: 'Auth',
			summary: 'Change my password',
			auth: 'user',
			body: changePasswordSchema,
			bodyExample: { currentPassword: 'Password123', newPassword: 'NewPassword456' },
			ok: { schema: ref('Ok') },
			errors: { 401: ['WRONG_PASSWORD'] },
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Meta (reference data)
// ─────────────────────────────────────────────────────────────

const metaPaths = {
	'/meta/zones': {
		get: operation({
			id: 'listZones',
			tag: 'Meta',
			summary: 'Active campus zones (for the "where" dropdown)',
			auth: 'none',
			ok: {
				schema: {
					type: 'object',
					properties: { zones: { type: 'array', items: ref('Zone') } },
				},
				example: examples.zones,
			},
		}),
	},

	'/meta/categories': {
		get: operation({
			id: 'listCategories',
			tag: 'Meta',
			summary: 'The 20 item categories',
			auth: 'none',
			ok: {
				schema: {
					type: 'object',
					properties: { categories: { type: 'array', items: ref('Category') } },
				},
				example: examples.categories,
			},
		}),
	},

	'/meta/lockers': {
		get: operation({
			id: 'listPublicLockers',
			tag: 'Meta',
			summary: 'Locker grid — labels and states only (for the 3D locker view)',
			auth: 'none',
			ok: {
				schema: {
					type: 'object',
					properties: { lockers: { type: 'array', items: ref('PublicLocker') } },
				},
				example: examples.publicLockers,
			},
		}),
	},

	'/meta/rules': {
		get: operation({
			id: 'getRules',
			tag: 'Meta',
			summary: 'Timeouts and limits the UI explains to users',
			auth: 'none',
			ok: {
				schema: { type: 'object', additionalProperties: { type: 'number' } },
				example: examples.rules,
			},
		}),
	},

	'/meta/question-sets/{categoryId}': {
		get: operation({
			id: 'getActiveQuestionSet',
			tag: 'Meta',
			summary: "A category's ACTIVE question set (no match weights)",
			description: 'Fetching a question set never calls the AI — the sets are frozen.',
			auth: 'user',
			params: [pathParam('categoryId', 'Category ID', 'integer')],
			ok: {
				schema: { type: 'object', properties: { questionSet: ref('PublicQuestionSet') } },
				example: examples.publicQuestionSet,
			},
			errors: { 404: ['QUESTION_SET_NOT_FOUND'] },
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Live updates (Server-Sent Events)
// ─────────────────────────────────────────────────────────────

const liveStream = operation({
	id: 'openLiveStream',
	tag: 'Live',
	summary:
		'Live "what changed" stream (Server-Sent Events) — the web client refetches on each message',
	auth: 'none',
	description: [
		'Stays open. Messages carry **only topic names, never data**; the page then refetches through the normal API.',
		'',
		'- **Without a token:** only `lockers` (the public locker grid).',
		'- **With `Authorization: Bearer …`:** also `reports`, `matches`, `notifications` of this user, and `admin` for admins.',
		'',
		'```',
		'retry: 2000',
		'',
		'event: hello',
		'data: {"topics":[]}',
		'',
		'event: change',
		'data: {"topics":["lockers","reports"]}',
		'',
		': ping 1764061200000',
		'```',
		'',
		'A `: ping` comment arrives every 20 s. Swagger UI cannot display a stream; try it with `curl -N`.',
	].join('\n'),
	ok: {
		description: 'An open `text/event-stream`',
		schema: { type: 'string' },
	},
	errors: { 401: ['TOKEN_EXPIRED', 'INVALID_TOKEN'] },
});

// The stream is text/event-stream, not JSON; the token is optional.
liveStream.responses[200] = {
	description: 'An open `text/event-stream`',
	content: {
		'text/event-stream': {
			schema: { type: 'string' },
			example: 'event: change\ndata: {"topics":["lockers"]}\n\n',
		},
	},
};
liveStream.security = [{}, { bearerAuth: [] }];

const livePaths = {
	'/live': {
		get: liveStream,
	},

	'/live/stats': {
		get: operation({
			id: 'getLiveStats',
			tag: 'Live',
			summary: 'How many browser tabs are listening to the live stream right now',
			auth: 'admin',
			ok: {
				schema: {
					type: 'object',
					properties: {
						connections: { type: 'integer' },
						users: { type: 'integer' },
						anonymous: { type: 'integer' },
					},
				},
				example: { connections: 3, users: 2, anonymous: 1 },
			},
		}),
	},
};

export const publicPaths = {
	...healthPaths,
	...authPaths,
	...metaPaths,
	...livePaths,
};
