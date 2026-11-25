/**
 * Live updates from the backend (GET /api/v1/live, Server-Sent Events).
 *
 *     kiosk: item stored ─▶ backend ─▶ "change: reports, lockers" ─▶ this file ─▶ refetch what is on screen
 *
 * The server only says WHICH kind of data changed (topics); the data itself is fetched
 * again through the normal API. So an update appears within a fraction of a second,
 * instead of at the next poll (which used to be every 4–20 s).
 *
 * fetch() is used instead of EventSource, because EventSource cannot send the
 * Authorization header.
 *
 * Polling stays as a slow safety net (see livePoll in liveStatus.js): every 30 s while the stream is
 * connected, the old fast interval when it is not.
 *
 *     <LiveUpdates />            mount once, inside AuthProvider + QueryClientProvider
 *
 * useLiveStatus() and livePoll() are in lib/liveStatus.js.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { API_URL, refreshAccessToken, tokens } from './api.js';
import { useAuth } from './auth.jsx';
import { getLiveStatus, setLiveStatus } from './liveStatus.js';

// Topic from the server → the query keys it refreshes (see keys in lib/queries.js).
const TOPIC_KEYS = {
	lockers: [['meta', 'lockers']],
	reports: [['reports']],
	matches: [['matches']],
	notifications: [['notifications']],
	admin: [['admin']],
};

// Messages arriving close together are handled as one refetch.
const BATCH_MS = 40;

// The server pings every 20 s. Nothing for this long → the connection is dead, reconnect.
const SILENCE_LIMIT_MS = 45_000;

// Waiting time before reconnecting: 1 s, 2 s, 4 s, … at most 15 s.
const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 15_000;

// ─────────────────────────────────────────────────────────────
//  Reading the stream
// ─────────────────────────────────────────────────────────────

/** Splits "event: x\ndata: {...}" blocks; calls onMessage(event, data). */
function createParser(onMessage) {
	let buffer = '';

	return (chunk) => {
		buffer += chunk.replace(/\r\n?/g, '\n');

		let end;

		while ((end = buffer.indexOf('\n\n')) >= 0) {
			const block = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);

			let event = 'message';
			const data = [];

			for (const line of block.split('\n')) {
				if (line.startsWith(':')) {
					continue; // comment / ping
				}

				const colon = line.indexOf(':');
				const field = colon >= 0 ? line.slice(0, colon) : line;
				const value = colon >= 0 ? line.slice(colon + 1).replace(/^ /, '') : '';

				if (field === 'event') {
					event = value;
				} else if (field === 'data') {
					data.push(value);
				}
			}

			if (data.length > 0) {
				try {
					onMessage(event, JSON.parse(data.join('\n')));
				} catch {
					// not JSON — ignore
				}
			}
		}
	};
}

class StreamRefused extends Error {
	constructor(status, code) {
		super(`live stream refused: ${status} ${code ?? ''}`);
		this.status = status;
		this.code = code;
	}
}

/** Opens the stream once and reads it until it ends. Resolves when it closed normally. */
async function readStream({ signal, withToken, onOpen, onMessage, onData }) {
	const headers = { Accept: 'text/event-stream' };

	if (withToken && tokens.access) {
		headers.Authorization = `Bearer ${tokens.access}`;
	}

	const response = await fetch(`${API_URL}/live`, { headers, signal, cache: 'no-store' });

	if (!response.ok || !response.body) {
		const body = await response.json().catch(() => null);

		throw new StreamRefused(response.status, body?.error?.code);
	}

	onOpen();

	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	const parse = createParser(onMessage);

	for (;;) {
		const { value, done } = await reader.read();

		if (done) {
			return;
		}

		onData();
		parse(value);
	}
}

// ─────────────────────────────────────────────────────────────
//  The component
// ─────────────────────────────────────────────────────────────

/** Keeps one live connection per tab, for whoever is logged in (or nobody). */
export function LiveUpdates() {
	const queryClient = useQueryClient();
	const { user, status: authStatus } = useAuth();

	// Reconnect when the person logs in / out (different topics); not on every token refresh.
	const userId = user?.id ?? null;

	useEffect(() => {
		// Wait until we know whether the stored token is valid.
		if (authStatus === 'loading') {
			return undefined;
		}

		let stopped = false;
		let controller = null;
		let retryTimer = null;
		let silenceTimer = null;
		let retryMs = RETRY_FIRST_MS;
		let everConnected = false;

		// ── batching refetches ──
		const pendingTopics = new Set();
		let batchTimer = null;

		const refetch = (topics) => {
			topics.forEach((topic) => pendingTopics.add(topic));

			if (batchTimer) {
				return;
			}

			batchTimer = setTimeout(() => {
				batchTimer = null;

				for (const topic of pendingTopics) {
					for (const queryKey of TOPIC_KEYS[topic] ?? []) {
						// Refetches the queries on screen now; the others when they are next shown.
						queryClient.invalidateQueries({ queryKey });
					}
				}

				pendingTopics.clear();
			}, BATCH_MS);
		};

		// ── watchdog: a silent connection is a dead connection ──
		const resetSilenceTimer = () => {
			clearTimeout(silenceTimer);
			silenceTimer = setTimeout(() => controller?.abort(), SILENCE_LIMIT_MS);
		};

		const scheduleReconnect = () => {
			if (stopped) {
				return;
			}

			setLiveStatus('offline');

			clearTimeout(retryTimer);
			retryTimer = setTimeout(connect, retryMs);
			retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
		};

		const connect = async () => {
			if (stopped) {
				return;
			}

			clearTimeout(retryTimer);
			controller?.abort();
			controller = new AbortController();

			const signal = controller.signal;
			let withToken = Boolean(userId);

			for (let attempt = 0; attempt < 2 && !stopped; attempt++) {
				try {
					await readStream({
						signal,
						withToken,

						onOpen() {
							setLiveStatus('live');
							retryMs = RETRY_FIRST_MS;
							resetSilenceTimer();

							// Back after a gap: changes may have been missed → refetch what is shown.
							if (everConnected) {
								refetch(Object.keys(TOPIC_KEYS));
							}

							everConnected = true;
						},

						onData: resetSilenceTimer,

						onMessage(event, data) {
							if (event === 'change' && Array.isArray(data?.topics)) {
								refetch(data.topics);
							}
						},
					});

					break; // closed by the server (restart / deploy) → reconnect below
				} catch (error) {
					if (stopped || error?.name === 'AbortError') {
						break;
					}

					// Access token expired → refresh once, then try again. If that fails,
					// the session is over (AuthProvider logs out) → listen anonymously.
					if (error instanceof StreamRefused && error.status === 401 && attempt === 0) {
						try {
							await refreshAccessToken();
						} catch {
							withToken = false;
						}

						continue;
					}

					break;
				}
			}

			// A newer connect() replaced this one (tab came back, …) → that one carries on.
			if (controller?.signal !== signal) {
				return;
			}

			clearTimeout(silenceTimer);
			scheduleReconnect();
		};

		// Phones drop background connections: reconnect at once when the tab is back.
		const reconnectNow = () => {
			if (document.visibilityState === 'visible' && getLiveStatus() !== 'live') {
				retryMs = RETRY_FIRST_MS;
				connect();
			}
		};

		document.addEventListener('visibilitychange', reconnectNow);
		window.addEventListener('online', reconnectNow);

		setLiveStatus('connecting');
		connect();

		return () => {
			stopped = true;

			document.removeEventListener('visibilitychange', reconnectNow);
			window.removeEventListener('online', reconnectNow);

			clearTimeout(retryTimer);
			clearTimeout(silenceTimer);
			clearTimeout(batchTimer);
			controller?.abort();
		};
	}, [queryClient, userId, authStatus]);

	return null;
}
