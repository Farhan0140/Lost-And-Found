/**
 * Is the live stream (lib/live.js) connected? A tiny store, readable outside React too.
 * Kept in its own file so lib/queries.js can use livePoll() without importing the stream code.
 *
 *     useLiveStatus()      'connecting' | 'live' | 'offline'
 *     livePoll(5000)       refetchInterval for TanStack Query
 */

import { useSyncExternalStore } from 'react';

// While connected, polling only catches the rare change the server does not announce.
const SAFETY_NET_POLL_MS = 30_000;

let status = 'connecting';
const statusListeners = new Set();

export function getLiveStatus() {
	return status;
}

export function setLiveStatus(next) {
	if (next === status) {
		return;
	}

	status = next;
	statusListeners.forEach((listener) => listener());
}

export function isLive() {
	return status === 'live';
}

export function useLiveStatus() {
	return useSyncExternalStore(
		(listener) => {
			statusListeners.add(listener);

			return () => statusListeners.delete(listener);
		},
		() => status,
	);
}

/**
 * A refetchInterval that is fast only when the live stream is down.
 *
 *     useQuery({ …, refetchInterval: livePoll(5000) })
 *     livePoll((data) => (data?.status === 'awaiting_deposit' ? 5000 : false))
 */
export function livePoll(interval) {
	return (query) => {
		const ms = typeof interval === 'function' ? interval(query.state.data) : interval;

		if (!ms) {
			return false;
		}

		return isLive() ? Math.max(ms, SAFETY_NET_POLL_MS) : ms;
	};
}
