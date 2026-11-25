/**
 * Swagger / OpenAPI docs tests (no database, no AI).
 *
 *   - every route in the code is documented, and every documented route exists
 *   - operation IDs are unique, tags are declared, path parameters are defined
 *   - every error code in the docs has a message
 *
 * Routes are found by reading the route files, so adding a route without
 * documenting it makes `npm test` fail.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

// The docs import the route modules, which read the config. Give it harmless values.
process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:5432/smartfind_docs_test';
process.env.JWT_SECRET ??= 'docs-test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
process.env.NID_HMAC_KEY ??= 'docs-test-nid-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const { buildOpenApiSpec } = await import('../src/docs/openapi.js');
const { ERROR_MESSAGES } = await import('../src/docs/errorMessages.js');

const spec = buildOpenApiSpec();

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// ─────────────────────────────────────────────────────────────
//  Where each router is mounted (keep in sync with app.js / admin.routes.js)
// ─────────────────────────────────────────────────────────────

const ROUTE_FILES = {
	'src/modules/auth/auth.routes.js': '/auth',
	'src/modules/meta/meta.routes.js': '/meta',
	'src/modules/reports/reports.routes.js': '/reports',
	'src/modules/matching/matches.routes.js': '/matches',
	'src/modules/notifications/notifications.routes.js': '/notifications',
	'src/modules/devices/device.routes.js': '/device',
	'src/modules/live/live.routes.js': '/live',
	'src/modules/admin/admin.routes.js': '/admin',
	'src/modules/admin/review.admin.routes.js': '/admin/matches',
	'src/modules/admin/reports.admin.routes.js': '/admin',
	'src/modules/admin/lockers.admin.routes.js': '/admin',
	'src/modules/admin/university.admin.routes.js': '/admin/university-students',
	'src/modules/admin/users.admin.routes.js': '/admin/users',
	'src/modules/admin/zones.admin.routes.js': '/admin/zones',
	'src/modules/admin/questionSets.admin.routes.js': '/admin/question-sets',
	'src/modules/admin/audit.admin.routes.js': '/admin/audit',
};

/** "/reports/:id/otp" → "/reports/{id}/otp", and "/x/" → "/x" */
function toOpenApiPath(path) {
	const converted = path.replace(/:(\w+)/g, '{$1}');

	return converted.length > 1 ? converted.replace(/\/$/, '') : converted;
}

/** Reads every `someRouter.get('/path', …)` (also when the path is on the next line). */
function routesInCode() {
	const routes = new Set();

	for (const [file, prefix] of Object.entries(ROUTE_FILES)) {
		const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

		const pattern = /\b\w+Router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g;

		for (const match of source.matchAll(pattern)) {
			routes.add(`${match[1].toUpperCase()} ${toOpenApiPath(prefix + match[2])}`);
		}
	}

	// The one route defined directly in app.js
	routes.add('GET /health');

	return routes;
}

function routesInDocs() {
	const routes = new Set();

	for (const [path, item] of Object.entries(spec.paths)) {
		for (const method of METHODS) {
			if (item[method]) {
				routes.add(`${method.toUpperCase()} ${path}`);
			}
		}
	}

	return routes;
}

function allOperations() {
	const operations = [];

	for (const [path, item] of Object.entries(spec.paths)) {
		for (const method of METHODS) {
			if (item[method]) {
				operations.push({ path, method, op: item[method] });
			}
		}
	}

	return operations;
}

// ─────────────────────────────────────────────────────────────
//  Tests
// ─────────────────────────────────────────────────────────────

describe('OpenAPI docs', () => {
	test('is an OpenAPI 3.1 document with the /api/v1 server', () => {
		assert.equal(spec.openapi, '3.1.0');
		assert.equal(spec.servers[0].url, '/api/v1');
		assert.ok(spec.components.securitySchemes.bearerAuth);
		assert.ok(spec.components.securitySchemes.deviceSecret);
	});

	test('every route in the code is documented', () => {
		const documented = routesInDocs();

		const missing = [...routesInCode()].filter((route) => !documented.has(route));

		assert.deepEqual(missing, [], `Add these routes to src/docs/paths/*.paths.js`);
	});

	test('every documented route exists in the code', () => {
		const inCode = routesInCode();

		const extra = [...routesInDocs()].filter((route) => !inCode.has(route));

		assert.deepEqual(extra, [], `These documented routes do not exist`);
	});

	test('operation IDs are unique and every operation has a declared tag', () => {
		const tagNames = new Set(spec.tags.map((tag) => tag.name));
		const seen = new Set();

		for (const { path, method, op } of allOperations()) {
			const label = `${method.toUpperCase()} ${path}`;

			assert.ok(op.operationId, `${label} has no operationId`);
			assert.ok(!seen.has(op.operationId), `duplicate operationId ${op.operationId}`);
			seen.add(op.operationId);

			assert.equal(op.tags.length, 1, `${label} should have exactly one tag`);
			assert.ok(tagNames.has(op.tags[0]), `${label}: tag "${op.tags[0]}" is not declared`);

			assert.ok(op.summary, `${label} has no summary`);
		}
	});

	test('every {param} in a path is defined as a path parameter', () => {
		for (const { path, method, op } of allOperations()) {
			const inPath = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);

			const defined = (op.parameters ?? [])
				.filter((parameter) => parameter.in === 'path')
				.map((parameter) => parameter.name);

			assert.deepEqual(
				defined.sort(),
				inPath.sort(),
				`${method.toUpperCase()} ${path}: path parameters do not match`,
			);
		}
	});

	test('every documented error code has a message', () => {
		for (const { path, method, op } of allOperations()) {
			for (const [status, response] of Object.entries(op.responses)) {
				if (Number(status) < 400) {
					continue;
				}

				// The description lists every code as "- `CODE` — message"
				const codes = [...response.description.matchAll(/`([A-Z][A-Z_]+)`/g)].map(
					(match) => match[1],
				);

				assert.ok(
					codes.length > 0,
					`${method.toUpperCase()} ${path} ${status} lists no codes`,
				);

				for (const code of codes) {
					assert.ok(
						ERROR_MESSAGES[code],
						`${method.toUpperCase()} ${path} ${status}: no message for ${code} in errorMessages.js`,
					);
				}
			}
		}
	});

	test('request bodies come from the zod schemas (spot check)', () => {
		const register = spec.paths['/auth/register'].post.requestBody.content['application/json'];

		assert.deepEqual(register.schema.required.sort(), [
			'email',
			'nationalId',
			'password',
			'studentId',
		]);

		assert.equal(register.schema.properties.password.minLength, 8);

		const verify =
			spec.paths['/device/otp/verify'].post.requestBody.content['application/json'];

		assert.equal(verify.schema.properties.code.pattern, '^\\d{6}$');
	});
});
