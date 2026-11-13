/**
 * Small helpers that keep the OpenAPI path files short and readable.
 *
 * Request bodies and query strings are NOT written by hand: they are converted
 * from the same zod schemas the routes validate with, so the docs cannot drift
 * away from what the server actually accepts.
 *
 *     operation({
 *         tag: 'Auth',
 *         summary: 'Log in',
 *         auth: 'none',
 *         body: loginSchema,
 *         bodyExample: { studentId: 'TEST0001', password: 'Password123' },
 *         ok: { status: 200, schema: ref('AuthResult') },
 *         errors: { 401: ['INVALID_CREDENTIALS'] },
 *     })
 */

import { z } from 'zod';

import { ERROR_MESSAGES } from './errorMessages.js';

// ─────────────────────────────────────────────────────────────
//  zod → JSON Schema
// ─────────────────────────────────────────────────────────────

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/**
 * Removes noise that zod adds but a human reader does not need:
 *   - "$schema" at the top
 *   - huge regex patterns when a "format" (date, date-time, email, uuid) already says it
 *   - "maximum: 9007199254740991" on every integer
 *   - "propertyNames: { type: 'string' }" on every record
 */
function tidy(node) {
	if (Array.isArray(node)) {
		return node.map(tidy);
	}

	if (!node || typeof node !== 'object') {
		return node;
	}

	const result = {};

	for (const [key, value] of Object.entries(node)) {
		if (key === '$schema') {
			continue;
		}

		if (key === 'pattern' && node.format) {
			continue;
		}

		if (key === 'maximum' && value === MAX_SAFE) {
			continue;
		}

		if (key === 'minimum' && value === -MAX_SAFE) {
			continue;
		}

		if (key === 'propertyNames') {
			continue;
		}

		result[key] = tidy(value);
	}

	return result;
}

/**
 * Converts a zod schema to JSON Schema (what the client SENDS, i.e. the input side).
 *
 * @param {import('zod').ZodType} schema
 * @param {object}  [options]
 * @param {Record<string, string>} [options.descriptions]  extra text per top-level field
 *        (useful for rules zod cannot express in JSON Schema, e.g. a .refine())
 * @param {Record<string, object>} [options.overrides]     replace a field's schema completely
 */
export function toJsonSchema(schema, { descriptions = {}, overrides = {} } = {}) {
	const json = tidy(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }));

	for (const [field, text] of Object.entries(descriptions)) {
		if (json.properties?.[field]) {
			json.properties[field] = { ...json.properties[field], description: text };
		}
	}

	for (const [field, replacement] of Object.entries(overrides)) {
		if (json.properties?.[field]) {
			json.properties[field] = replacement;
		}
	}

	return json;
}

/**
 * Turns a zod object schema (used with validateQuery) into OpenAPI query parameters.
 */
export function queryParameters(schema, descriptions = {}) {
	const json = toJsonSchema(schema);

	const required = new Set(json.required ?? []);

	return Object.entries(json.properties ?? {}).map(([name, propertySchema]) => ({
		name,
		in: 'query',
		required: required.has(name) && propertySchema.default === undefined,
		description: descriptions[name],
		schema: propertySchema,
	}));
}

// ─────────────────────────────────────────────────────────────
//  Small building blocks
// ─────────────────────────────────────────────────────────────

/** { $ref: '#/components/schemas/Name' } */
export function ref(name) {
	return { $ref: `#/components/schemas/${name}` };
}

/** A path parameter, e.g. pathParam('id', 'Report ID', 'uuid'). */
export function pathParam(name, description, format = 'uuid') {
	const schema =
		format === 'integer' ? { type: 'integer', minimum: 1 } : { type: 'string', format };

	if (format === 'string') {
		delete schema.format;
	}

	return { name, in: 'path', required: true, description, schema };
}

/** A JSON response with an optional example. */
export function jsonResponse(description, schema, example) {
	const content = { schema };

	if (example !== undefined) {
		content.example = example;
	}

	return {
		description,
		content: { 'application/json': content },
	};
}

/** An error response whose description lists every error code it can carry. */
export function errorResponse(codes) {
	const list = codes.map((code) => `- \`${code}\` — ${ERROR_MESSAGES[code] ?? ''}`).join('\n');

	const first = codes[0];

	return {
		description: `Error codes:\n\n${list}`,
		content: {
			'application/json': {
				schema: ref('Error'),
				example: {
					error: {
						code: first,
						message:
							ERROR_MESSAGES[first] ?? 'A readable explanation of what went wrong.',
						...(first === 'VALIDATION_FAILED'
							? {
									fields: [
										{
											field: 'password',
											message: 'must be at least 8 characters',
										},
									],
								}
							: {}),
						requestId: 'a81c09f2',
					},
				},
			},
		},
	};
}

// ─────────────────────────────────────────────────────────────
//  Who may call an endpoint
// ─────────────────────────────────────────────────────────────

const SECURITY = {
	none: [],
	user: [{ bearerAuth: [] }],
	admin: [{ bearerAuth: [] }],
	device: [{ deviceId: [], deviceSecret: [] }],
};

/** Errors that the auth middleware itself can return. */
const AUTH_ERRORS = {
	none: {},
	user: {
		401: ['NOT_LOGGED_IN', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'ACCOUNT_DISABLED'],
	},
	admin: {
		401: ['NOT_LOGGED_IN', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'ACCOUNT_DISABLED'],
		403: ['ADMIN_ONLY'],
	},
	device: {
		401: ['INVALID_DEVICE_CREDENTIALS'],
		403: ['DEVICE_DISABLED'],
		404: ['DEVICE_NOT_REGISTERED'],
	},
};

const AUTH_NOTE = {
	none: '',
	user: '🔒 **Login required** (Bearer access token).',
	admin: '🛡️ **Admin only** (Bearer access token of an admin account).',
	device: '📟 **ESP32 only** — headers `X-Device-Id` and `X-Device-Secret`.',
};

// ─────────────────────────────────────────────────────────────
//  The operation builder
// ─────────────────────────────────────────────────────────────

/**
 * Builds one OpenAPI operation.
 *
 * @param {object} spec
 * @param {string}   spec.id            operationId (unique, camelCase)
 * @param {string}   spec.tag
 * @param {string}   spec.summary       one line, shown in the list
 * @param {string}  [spec.description]  markdown, shown when expanded
 * @param {'none'|'user'|'admin'|'device'} spec.auth
 * @param {object}  [spec.params]       array of path parameters
 * @param {object}  [spec.query]        zod schema used with validateQuery
 * @param {object}  [spec.queryNotes]   description per query field
 * @param {object}  [spec.body]         zod schema used with validateBody (or a JSON Schema object)
 * @param {object}  [spec.bodyOptions]  { descriptions, overrides } for toJsonSchema
 * @param {object}  [spec.bodyExample]
 * @param {object}   spec.ok            { status, description, schema, example }
 * @param {object}  [spec.extra]        more success responses { 202: jsonResponse(...) }
 * @param {object}  [spec.errors]       { 404: ['REPORT_NOT_FOUND'], 409: [...] }
 */
export function operation(spec) {
	const auth = spec.auth ?? 'user';

	const op = {
		operationId: spec.id,
		tags: [spec.tag],
		summary: spec.summary,
		description: [AUTH_NOTE[auth], spec.description].filter(Boolean).join('\n\n'),
		security: SECURITY[auth],
	};

	// ── parameters ──
	const parameters = [...(spec.params ?? [])];

	if (spec.query) {
		parameters.push(...queryParameters(spec.query, spec.queryNotes));
	}

	if (parameters.length > 0) {
		op.parameters = parameters;
	}

	// ── request body ──
	if (spec.body) {
		const schema =
			typeof spec.body.safeParse === 'function'
				? toJsonSchema(spec.body, spec.bodyOptions)
				: spec.body;

		const content = { schema };

		if (spec.bodyExample !== undefined) {
			content.example = spec.bodyExample;
		}

		op.requestBody = {
			required: true,
			content: { 'application/json': content },
		};
	}

	// ── responses ──
	const ok = spec.ok;

	op.responses = {
		[ok.status ?? 200]: jsonResponse(ok.description ?? 'Success', ok.schema, ok.example),
		...(spec.extra ?? {}),
	};

	// Merge: errors from the auth middleware + body validation + the route itself.
	const errors = {};

	const addErrors = (byStatus) => {
		for (const [status, codes] of Object.entries(byStatus)) {
			errors[status] = [...new Set([...(errors[status] ?? []), ...codes])];
		}
	};

	if (spec.body || spec.query) {
		addErrors({ 400: ['VALIDATION_FAILED'] });
	}

	addErrors(spec.errors ?? {});
	addErrors(AUTH_ERRORS[auth]);

	for (const status of Object.keys(errors).sort()) {
		op.responses[status] = errorResponse(errors[status]);
	}

	return op;
}
