/**
 * Builds the OpenAPI 3.1 document for the SmartFind API.
 *
 *   src/docs/
 *     openapi.js          ← this file: info, tags, servers, putting it together
 *     builders.js         operation() helper + zod → JSON Schema conversion
 *     components.js       shared schemas (User, ReportView, Error, …) + security schemes
 *     examples.js         example payloads (copied from real responses)
 *     errorMessages.js    every error code with its message
 *     paths/*.paths.js    one file per area: public, student, admin, device
 *     docs.routes.js      serves Swagger UI at /api/docs
 *
 * Adding an endpoint? Add it to the matching paths file — `npm test` fails
 * if a route exists in the code but not in the docs (tests/openapi.test.js).
 */

import { readFileSync } from 'node:fs';

import { schemas, securitySchemes } from './components.js';
import { adminPaths } from './paths/admin.paths.js';
import { devicePaths } from './paths/device.paths.js';
import { publicPaths } from './paths/public.paths.js';
import { studentPaths } from './paths/student.paths.js';

const packageJson = JSON.parse(
	readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

// ─────────────────────────────────────────────────────────────
//  Text shown at the top of the Swagger page
// ─────────────────────────────────────────────────────────────

const DESCRIPTION = `
Campus lost-and-found with OTP smart lockers — **Team TwoByFour, UITS CSE capstone**.

### Try it in 3 steps
1. **POST /auth/login** → \`{ "studentId": "TEST0001", "password": "…" }\` (register first with **POST /auth/register**, national ID \`1234567890\`).
2. Copy \`accessToken\` from the response.
3. Click **Authorize** (top right) → paste it into **bearerAuth**. Admin endpoints need an admin login (\`ADMIN001\`).

ESP32 endpoints use **deviceId** + **deviceSecret** in the same dialog (\`KIOSK-01\` + the secret printed by \`npm run setup\`).

### Errors
Every error has the same shape — switch on \`error.code\`, show \`error.message\`:

\`\`\`json
{ "error": { "code": "VERSION_CONFLICT", "message": "This draft was changed somewhere else…", "requestId": "a81c09f2" } }
\`\`\`

\`requestId\` is also in the \`X-Request-Id\` response header — search the backend log for it.
Any endpoint can also return **500 INTERNAL_ERROR** or **503 DATABASE_UNAVAILABLE**.

### The two main flows
**Finder:** \`POST /reports {kind:"found"}\` → \`POST /reports/{id}/extract\` (photos) or \`PATCH\` answers → \`POST /reports/{id}/followups/generate\` → \`PUT …/followups/answers\` → \`POST …/submit\` → \`POST …/deposit-otp\` → type the code at the kiosk → the kiosk reports the item stored.

**Owner:** \`POST /reports {kind:"lost"}\` → same steps until **submit** → notification "We may have found your item!" → \`GET /matches/{id}\` → at the locker: \`POST /matches/{id}/collect-otp\` (5 min) → type it at the kiosk.

### Privacy
National IDs are stored only as HMAC-SHA256. Photos are never stored on the server (they are sent to Google Gemini). Follow-up answers are visible only to the reporter and admins.
`.trim();

// ─────────────────────────────────────────────────────────────
//  Tags (= the sections in Swagger UI, in this order)
// ─────────────────────────────────────────────────────────────

const TAGS = [
	{ name: 'Health', description: 'Is the server up?' },
	{ name: 'Auth', description: 'Register (university check), login, rotating refresh tokens' },
	{ name: 'Meta', description: 'Zones, categories, locker grid, rules, question sets' },
	{
		name: 'Reports',
		description:
			"A student's own reports: draft → photos/answers → follow-ups → submit → deposit code",
	},
	{ name: 'Matches', description: "The owner's side of a match + 5-minute collection code" },
	{ name: 'Notifications', description: 'In-app notifications' },
	{ name: 'Admin · Overview', description: 'Dashboard and AI key health' },
	{ name: 'Admin · Review', description: 'Match review queue (approve / reject)' },
	{ name: 'Admin · Reports', description: 'All reports, extra deposit codes, oversize items' },
	{ name: 'Admin · Lockers & devices', description: 'Force-open, maintenance, ESP32 kiosks' },
	{ name: 'Admin · University DB', description: 'The dummy university database (CRUD)' },
	{ name: 'Admin · Users', description: 'Roles, disable, password reset' },
	{ name: 'Admin · Zones', description: 'Campus zones' },
	{
		name: 'Admin · Question sets',
		description: 'Frozen question sets: draft, AI draft, activate',
	},
	{ name: 'Admin · Audit', description: 'Hash-chained, append-only audit log' },
	{
		name: 'Device (ESP32)',
		description: 'Used only by the locker kiosk firmware (X-Device-Id + X-Device-Secret)',
	},
];

// ─────────────────────────────────────────────────────────────
//  Build (once — the document never changes while the server runs)
// ─────────────────────────────────────────────────────────────

let cached = null;

export function buildOpenApiSpec() {
	if (cached) {
		return cached;
	}

	cached = {
		openapi: '3.1.0',
		info: {
			title: 'SmartFind API',
			version: packageJson.version,
			description: DESCRIPTION,
		},
		// Relative URL: works on localhost and on Render without changes.
		servers: [{ url: '/api/v1', description: 'This server' }],
		tags: TAGS,
		paths: {
			...publicPaths,
			...studentPaths,
			...adminPaths,
			...devicePaths,
		},
		components: {
			securitySchemes,
			schemas,
		},
	};

	return cached;
}
