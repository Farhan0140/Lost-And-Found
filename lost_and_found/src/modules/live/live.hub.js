/**
 * Live updates: tells open browser tabs "this changed, fetch it again" within milliseconds,
 * instead of letting them poll every few seconds.
 *
 *     browser ──GET /api/v1/live (Server-Sent Events)──▶ backend keeps the connection open
 *     kiosk event / notification / audit ─▶ publishChange() ─▶ "data: {topics:[...]}" ─▶ browser refetches
 *
 * A message carries ONLY topic names, never data. Each tab then re-reads what it
 * shows through the normal, permission-checked API. So nothing private can leak
 * through this channel, even to an anonymous visitor.
 *
 * Topics (the web client maps them to its query keys, see lost_and_found_client/src/lib/live.js):
 *
 *   lockers         the public locker grid (door / item / status)      → everyone
 *   reports         the user's own reports                             → that user
 *   matches         the user's matches                                 → that user
 *   notifications   the bell + notification list                       → that user
 *   admin           every admin page                                   → admins
 *
 * Inside a transaction (`db` = a client from withTransaction) the message is sent only
 * AFTER the commit. Otherwise a tab could refetch before the change is visible, and miss it.
 */

import { logger } from '../../lib/logger.js';

// How often an idle connection gets a ping, so proxies (Render, Wi-Fi routers) keep it open.
const PING_EVERY_MS = 20_000;

// Several tabs per person are normal; this only stops a buggy client from piling up connections.
const MAX_CONNECTIONS_PER_USER = 10;
const MAX_ANONYMOUS_CONNECTIONS = 500;

// Changes that happen together (a batch of kiosk events) are sent as ONE message.
const COALESCE_MS = 25;

/** @type {Set<{ res, userId: string|null, isAdmin: boolean }>} */
const connections = new Set();

let pingTimer = null;

// ─────────────────────────────────────────────────────────────
//  Connections
// ─────────────────────────────────────────────────────────────

/**
 * Takes over an HTTP response and keeps it open as an event stream.
 * Returns false (and does not open the stream) when this user has too many connections.
 */
export function openStream(req, res, user) {
	const userId = user?.id ?? null;

	const sameOwner = [...connections].filter((connection) => connection.userId === userId);
	const limit = userId ? MAX_CONNECTIONS_PER_USER : MAX_ANONYMOUS_CONNECTIONS;

	if (sameOwner.length >= limit) {
		// Close the oldest one instead of refusing: usually a tab that was closed uncleanly.
		closeConnection(sameOwner[0]);
	}

	res.status(200);
	res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
	res.setHeader('Cache-Control', 'no-cache, no-transform');
	res.setHeader('Connection', 'keep-alive');

	// nginx-style proxies: do not buffer this response
	res.setHeader('X-Accel-Buffering', 'no');

	res.flushHeaders();

	// No socket timeout: the connection is meant to stay open.
	req.socket.setTimeout(0);
	req.socket.setNoDelay(true);
	req.socket.setKeepAlive(true);

	const connection = { res, userId, isAdmin: user?.role === 'admin' };

	connections.add(connection);

	// Reconnect after 2 s if the connection drops; then say hello.
	res.write('retry: 2000\n\n');
	writeMessage(connection, 'hello', { topics: [] });

	req.on('close', () => {
		connections.delete(connection);

		logger.debug('live', `Stream closed (${describe(connection)}) — ${connections.size} open`);
	});

	logger.debug('live', `Stream opened (${describe(connection)}) — ${connections.size} open`);

	startPinging();

	return true;
}

function closeConnection(connection) {
	connections.delete(connection);

	try {
		connection.res.end();
	} catch {
		// already gone
	}
}

/** Ends every stream (graceful shutdown), so server.close() does not wait for them. */
export function closeAllStreams() {
	for (const connection of connections) {
		closeConnection(connection);
	}

	if (pingTimer) {
		clearInterval(pingTimer);
		pingTimer = null;
	}
}

export function liveStats() {
	const all = [...connections];

	return {
		connections: all.length,
		users: new Set(
			all.filter((connection) => connection.userId).map((connection) => connection.userId),
		).size,
		anonymous: all.filter((connection) => !connection.userId).length,
	};
}

function describe(connection) {
	if (!connection.userId) {
		return 'anonymous';
	}

	return `${connection.isAdmin ? 'admin' : 'user'} ${connection.userId.slice(0, 8)}`;
}

function startPinging() {
	if (pingTimer) {
		return;
	}

	pingTimer = setInterval(() => {
		for (const connection of connections) {
			// A comment line: ignored by the client, but it keeps the connection alive.
			safeWrite(connection, `: ping ${Date.now()}\n\n`);
		}
	}, PING_EVERY_MS);

	// Do not keep the process alive just for the pings.
	pingTimer.unref();
}

function safeWrite(connection, text) {
	try {
		connection.res.write(text);
	} catch {
		closeConnection(connection);
	}
}

function writeMessage(connection, event, payload) {
	safeWrite(connection, `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

// ─────────────────────────────────────────────────────────────
//  Publishing
// ─────────────────────────────────────────────────────────────

/*
 * Pending, not yet sent topics:
 *   everyone  → Set of topics for every connection
 *   admins    → Set of topics for admin connections
 *   users     → Map userId → Set of topics
 */
let pending = null;
let flushTimer = null;

function emptyPending() {
	return { everyone: new Set(), admins: new Set(), users: new Map() };
}

/**
 * Says "this changed". Cheap: no database access, nothing is sent when nobody listens.
 *
 *     publishChange({ everyone: ['lockers'], admins: ['admin'] });
 *     publishChange({ users: { [userId]: ['reports', 'notifications'] } }, client);
 *
 * @param target   { everyone?: string[], admins?: string[], users?: { [userId]: string[] } }
 * @param db       optional: a transaction client → sent after its COMMIT
 */
export function publishChange(target, db = null) {
	if (db && Array.isArray(db.afterCommit)) {
		db.afterCommit.push(() => publishChange(target));

		return;
	}

	if (connections.size === 0) {
		return;
	}

	pending ??= emptyPending();

	for (const topic of target.everyone ?? []) {
		pending.everyone.add(topic);
	}

	for (const topic of target.admins ?? []) {
		pending.admins.add(topic);
	}

	for (const [userId, topics] of Object.entries(target.users ?? {})) {
		if (!userId || userId === 'null' || userId === 'undefined') {
			continue;
		}

		const set = pending.users.get(userId) ?? new Set();

		topics.forEach((topic) => set.add(topic));
		pending.users.set(userId, set);
	}

	if (!flushTimer) {
		flushTimer = setTimeout(flush, COALESCE_MS);
	}
}

function flush() {
	flushTimer = null;

	const batch = pending;
	pending = null;

	if (!batch) {
		return;
	}

	let sent = 0;

	for (const connection of connections) {
		const topics = new Set(batch.everyone);

		if (connection.isAdmin) {
			batch.admins.forEach((topic) => topics.add(topic));
		}

		if (connection.userId) {
			batch.users.get(connection.userId)?.forEach((topic) => topics.add(topic));
		}

		if (topics.size > 0) {
			writeMessage(connection, 'change', { topics: [...topics] });
			sent++;
		}
	}

	if (sent > 0) {
		const summary = [
			batch.everyone.size ? `everyone: ${[...batch.everyone].join(', ')}` : null,
			batch.admins.size ? `admins: ${[...batch.admins].join(', ')}` : null,
			batch.users.size ? `${batch.users.size} user(s)` : null,
		]
			.filter(Boolean)
			.join(' · ');

		logger.debug('live', `Pushed to ${sent} tab(s) — ${summary}`);
	}
}
