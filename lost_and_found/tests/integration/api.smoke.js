/**
 * Integration smoke test: talks to a RUNNING backend over HTTP (real database, migrated + seeded).
 * Not part of `npm test` (that one needs no database); run it with `npm run test:integration`.
 *
 *     npm run setup && npm start                    # in one terminal (or in CI, see .github/workflows/ci.yml)
 *     SMOKE_ADMIN_PASSWORD=… SMOKE_DEVICE_SECRET=sfd_… npm run test:integration
 *
 * Environment:
 *   SMOKE_API_URL            default http://127.0.0.1:4000/api/v1
 *   SMOKE_ADMIN_STUDENT_ID   default ADMIN001
 *   SMOKE_ADMIN_PASSWORD     the ADMIN_PASSWORD the seed used                (required)
 *   SMOKE_DEVICE_ID          default KIOSK-01
 *   SMOKE_DEVICE_SECRET      the DEVICE_SEED_SECRET the seed used            (required)
 *
 * It never calls Gemini: only routes that work without an AI key are used.
 * It writes to the database (a test student, a draft, device events), so point it
 * at a throw-away database, never at production.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const API = (process.env.SMOKE_API_URL ?? 'http://127.0.0.1:4000/api/v1').replace(/\/+$/, '');
const ADMIN_ID = process.env.SMOKE_ADMIN_STUDENT_ID ?? 'ADMIN001';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
const DEVICE_ID = process.env.SMOKE_DEVICE_ID ?? 'KIOSK-01';
const DEVICE_SECRET = process.env.SMOKE_DEVICE_SECRET;

if (!ADMIN_PASSWORD || !DEVICE_SECRET) {
	throw new Error('Set SMOKE_ADMIN_PASSWORD and SMOKE_DEVICE_SECRET (see the top of this file).');
}

// Every run uses a new boot ID, so its event numbers never collide with an earlier run.
const BOOT_ID = `ci-${Date.now().toString(36)}`;

// How long a live message may take. Locally it is ~50 ms; CI machines are slower.
const LIVE_TIMEOUT_MS = 3000;

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

async function call(method, path, { body, token, headers = {} } = {}) {
	const response = await fetch(`${API}${path}`, {
		method,
		headers: {
			Accept: 'application/json',
			...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...headers,
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	const data = await response.json().catch(() => null);

	return { status: response.status, data };
}

const deviceHeaders = (secret = DEVICE_SECRET) => ({
	'X-Device-Id': DEVICE_ID,
	'X-Device-Secret': secret,
});

let nextSeq = 1;

function sendEvents(events) {
	return call('POST', '/device/events', {
		headers: deviceHeaders(),
		body: { bootId: BOOT_ID, events },
	});
}

/**
 * Opens GET /live and collects the topics of every "change" message.
 *
 *     const stream = await openLive(token);
 *     await stream.waitFor('lockers');
 *     stream.close();
 */
async function openLive(token = null) {
	const controller = new AbortController();

	const response = await fetch(`${API}/live`, {
		headers: {
			Accept: 'text/event-stream',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		signal: controller.signal,
	});

	assert.equal(response.status, 200, 'GET /live should answer 200');
	assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);

	const received = [];
	const waiters = [];
	let gotHello = false;

	const check = () => {
		for (const waiter of [...waiters]) {
			if (waiter.test()) {
				waiters.splice(waiters.indexOf(waiter), 1);
				waiter.resolve();
			}
		}
	};

	// Read in the background until close().
	(async () => {
		const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
		let buffer = '';

		try {
			for (;;) {
				const { value, done } = await reader.read();

				if (done) {
					return;
				}

				buffer += value;

				let end;

				while ((end = buffer.indexOf('\n\n')) >= 0) {
					const block = buffer.slice(0, end);
					buffer = buffer.slice(end + 2);

					const event = /^event: (.+)$/m.exec(block)?.[1];
					const data = /^data: (.+)$/m.exec(block)?.[1];

					if (event === 'hello') {
						gotHello = true;
					}

					if (event === 'change' && data) {
						received.push(...JSON.parse(data).topics);
					}

					check();
				}
			}
		} catch {
			// aborted by close()
		}
	})();

	const until = (test, label) =>
		new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(
					new Error(
						`no ${label} within ${LIVE_TIMEOUT_MS} ms (got: ${received.join(', ') || 'nothing'})`,
					),
				);
			}, LIVE_TIMEOUT_MS);

			waiters.push({
				test,
				resolve: () => {
					clearTimeout(timer);
					resolve();
				},
			});

			check();
		});

	await until(() => gotHello, '"hello" message');

	return {
		received,
		waitFor: (topic) => until(() => received.includes(topic), `"${topic}" message`),
		clear: () => received.splice(0, received.length),
		close: () => controller.abort(),
	};
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────
//  Tests
// ─────────────────────────────────────────────────────────────

let adminToken = null;
let studentToken = null;

describe('backend smoke test', () => {
	before(async () => {
		const login = await call('POST', '/auth/login', {
			body: { studentId: ADMIN_ID, password: ADMIN_PASSWORD },
		});

		assert.equal(login.status, 200, `admin login failed: ${JSON.stringify(login.data)}`);

		adminToken = login.data.accessToken;
	});

	test('health: server and database are up', async () => {
		const { status, data } = await call('GET', '/health');

		assert.equal(status, 200);
		assert.equal(data.status, 'ok');
		assert.equal(data.database, 'ok');
	});

	test('public meta: zones, categories and the locker grid are seeded', async () => {
		const zones = await call('GET', '/meta/zones');
		const categories = await call('GET', '/meta/categories');
		const lockers = await call('GET', '/meta/lockers');

		assert.equal(zones.status, 200);
		assert.ok(zones.data.zones.length > 0, 'no campus zones');

		assert.equal(categories.status, 200);
		assert.ok(categories.data.categories.length >= 20, 'expected the 20 seeded categories');

		assert.equal(lockers.status, 200);
		assert.ok(lockers.data.lockers.length >= 4, 'expected the 4 lockers of KIOSK-01');
	});

	test('auth: admin token works, a wrong password is refused', async () => {
		const me = await call('GET', '/auth/me', { token: adminToken });

		assert.equal(me.status, 200);
		assert.equal(me.data.user.role, 'admin');

		const wrong = await call('POST', '/auth/login', {
			body: { studentId: ADMIN_ID, password: 'definitely-not-the-password' },
		});

		assert.equal(wrong.status, 401);
	});

	test('auth: a student from the dummy university table can register, and only once', async () => {
		const body = {
			studentId: 'TEST0001',
			nationalId: '1234567890',
			email: 'ci-test0001@smartfind.local',
			password: 'ci-student-pass-123',
		};

		const first = await call('POST', '/auth/register', { body });

		if (first.status === 201) {
			studentToken = first.data.accessToken;
		} else {
			// Already registered by an earlier run against the same database → log in instead.
			const login = await call('POST', '/auth/login', {
				body: { studentId: body.studentId, password: body.password },
			});

			assert.equal(login.status, 200, `register: ${JSON.stringify(first.data)}`);
			studentToken = login.data.accessToken;
		}

		const again = await call('POST', '/auth/register', { body });

		assert.equal(again.status, 409, 'the same student must not register twice');

		const wrongNid = await call('POST', '/auth/register', {
			body: {
				...body,
				studentId: 'TEST0002',
				email: 'ci-test0002@smartfind.local',
				nationalId: '9999999999',
			},
		});

		assert.ok(
			[400, 403, 404, 409, 422].includes(wrongNid.status),
			`a wrong national ID must be refused (got ${wrongNid.status})`,
		);
	});

	test('reports: a student can create and read their own draft; admin routes stay closed', async () => {
		const created = await call('POST', '/reports', {
			token: studentToken,
			body: { kind: 'found' },
		});

		assert.equal(created.status, 201);

		const id = created.data.report.id;
		const read = await call('GET', `/reports/${id}`, { token: studentToken });

		assert.equal(read.status, 200);
		assert.equal(read.data.report.id, id);

		const admin = await call('GET', '/admin/overview', { token: studentToken });

		assert.equal(admin.status, 403, 'a student must not reach admin routes');
	});

	test('device: hello works with the secret and is refused without it', async () => {
		const hello = await call('POST', '/device/hello', {
			headers: deviceHeaders(),
			body: { firmware: 'ci', bootId: BOOT_ID },
		});

		assert.equal(hello.status, 200, JSON.stringify(hello.data));
		assert.equal(hello.data.authorized, true);
		assert.ok(hello.data.lockers.length >= 4);
		assert.equal(typeof hello.data.settleMs, 'number');

		const wrong = await call('POST', '/device/hello', {
			headers: deviceHeaders('sfd_wrong_secret_for_ci_test'),
			body: {},
		});

		assert.equal(wrong.status, 401);

		const poll = await call('GET', '/device/poll', { headers: deviceHeaders() });

		assert.equal(poll.status, 200);
		assert.ok(Array.isArray(poll.data.commands));
	});

	describe('live updates', () => {
		let anonymous = null;
		let admin = null;

		before(async () => {
			anonymous = await openLive();
			admin = await openLive(adminToken);
		});

		after(() => {
			anonymous?.close();
			admin?.close();
		});

		test('a kiosk event reaches every open page at once', async () => {
			const started = performance.now();

			const sent = await sendEvents([
				{ seq: nextSeq++, type: 'door_opened', slot: 1, uptimeMs: 1000 },
			]);

			assert.equal(sent.status, 200, JSON.stringify(sent.data));

			await Promise.all([
				anonymous.waitFor('lockers'),
				admin.waitFor('lockers'),
				admin.waitFor('admin'),
			]);

			console.log(
				`    live message arrived ${Math.round(performance.now() - started)} ms after the kiosk POST`,
			);
		});

		test('anonymous visitors only hear about lockers, never admin topics', async () => {
			anonymous.clear();
			admin.clear();

			await sendEvents([
				{ seq: nextSeq++, type: 'door_closed', slot: 1, uptimeMs: 2000 },
				{
					seq: nextSeq++,
					type: 'door_closed_settled',
					slot: 1,
					uptimeMs: 3000,
					data: { itemPresent: false },
				},
			]);

			await admin.waitFor('admin');
			await pause(200);

			assert.deepEqual([...new Set(anonymous.received)], ['lockers']);
		});

		test('a re-sent event is acknowledged again but changes nothing', async () => {
			const seq = nextSeq++;
			const event = { seq, type: 'item_detected', slot: 2, uptimeMs: 4000 };

			anonymous.clear();

			await sendEvents([event]);
			await anonymous.waitFor('lockers');

			anonymous.clear();

			const again = await sendEvents([event]);

			assert.deepEqual(again.data.acked, [seq]);

			await pause(500);

			assert.deepEqual(anonymous.received, [], 'a duplicate must not trigger a live message');

			// Put the sensor back the way it was.
			await sendEvents([{ seq: nextSeq++, type: 'item_removed', slot: 2, uptimeMs: 5000 }]);
		});

		test('an invalid token is refused with 401 (the client then refreshes it)', async () => {
			const response = await fetch(`${API}/live`, {
				headers: { Authorization: 'Bearer not.a.token' },
			});
			const data = await response.json().catch(() => null);

			assert.equal(response.status, 401);
			assert.equal(data?.error?.code, 'INVALID_TOKEN');
		});
	});
});
