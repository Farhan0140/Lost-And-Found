/**
 * Data hooks (TanStack Query). One place for every query key, so a mutation
 * can refresh exactly what changed.
 *
 *     const { data: report, isPending } = useReport(id);
 *     queryClient.invalidateQueries({ queryKey: keys.reports() });
 */

import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query';

import { api, ApiError } from './api.js';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 15_000,
			refetchOnWindowFocus: true,
			retry(failureCount, error) {
				// 4xx are final (not found, forbidden, …); retry network / 5xx twice
				if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
					return false;
				}

				return failureCount < 2;
			},
		},
	},
});

// ─────────────────────────────────────────────────────────────
//  Query keys
// ─────────────────────────────────────────────────────────────

export const keys = {
	me: () => ['me'],

	zones: () => ['meta', 'zones'],
	categories: () => ['meta', 'categories'],
	rules: () => ['meta', 'rules'],
	publicLockers: () => ['meta', 'lockers'],
	questionSet: (categoryId) => ['meta', 'question-set', categoryId],

	reports: (tab) => (tab ? ['reports', 'list', tab] : ['reports']),
	report: (id) => ['reports', 'detail', id],
	reportOtp: (id) => ['reports', 'otp', id],

	match: (id) => ['matches', id],
	matchOtp: (id) => ['matches', id, 'otp'],

	notifications: () => ['notifications'],
	unread: () => ['notifications', 'unread'],

	admin: (...parts) => ['admin', ...parts],
};

// ─────────────────────────────────────────────────────────────
//  Meta (rarely changes → long cache)
// ─────────────────────────────────────────────────────────────

const LONG = 10 * 60_000;

export function useZones() {
	return useQuery({
		queryKey: keys.zones(),
		queryFn: () => api.get('/meta/zones').then((result) => result.zones),
		staleTime: LONG,
	});
}

export function useCategories() {
	return useQuery({
		queryKey: keys.categories(),
		queryFn: () => api.get('/meta/categories').then((result) => result.categories),
		staleTime: LONG,
	});
}

export function useRules() {
	return useQuery({
		queryKey: keys.rules(),
		queryFn: () => api.get('/meta/rules'),
		staleTime: LONG,
	});
}

/** Public locker grid — refreshed every few seconds for the live 3D view. */
export function usePublicLockers({ live = true } = {}) {
	return useQuery({
		queryKey: keys.publicLockers(),
		queryFn: () => api.get('/meta/lockers').then((result) => result.lockers),
		refetchInterval: live ? 5000 : false,
	});
}

// ─────────────────────────────────────────────────────────────
//  Reports
// ─────────────────────────────────────────────────────────────

export function useMyReports(tab) {
	return useQuery({
		queryKey: keys.reports(tab),
		queryFn: () => api.get('/reports', { query: { tab } }).then((result) => result.reports),
		placeholderData: keepPreviousData,
	});
}

/** `poll` may be a number (ms) or `(data) => ms | false`, so the speed can follow the state. */
function pollInterval(poll) {
	if (typeof poll === 'function') {
		return (query) => poll(query.state.data) || false;
	}

	return poll || false;
}

/**
 * One report. `poll` keeps it fresh while something happens elsewhere
 * (the kiosk storing the item, matching running in the background, …).
 *
 *     useReport(id, { poll: (report) => (report?.status === 'awaiting_deposit' ? 5000 : false) });
 */
export function useReport(id, { poll = false } = {}) {
	return useQuery({
		queryKey: keys.report(id),
		queryFn: () => api.get(`/reports/${id}`).then((result) => result.report),
		enabled: Boolean(id),
		refetchInterval: pollInterval(poll),
	});
}

export function useReportOtp(id, { enabled = true } = {}) {
	return useQuery({
		queryKey: keys.reportOtp(id),
		queryFn: () => api.get(`/reports/${id}/otp`).then((result) => result.otp),
		enabled: Boolean(id) && enabled,
	});
}

// ─────────────────────────────────────────────────────────────
//  Matches
// ─────────────────────────────────────────────────────────────

export function useMatch(id, { poll = false } = {}) {
	return useQuery({
		queryKey: keys.match(id),
		queryFn: () => api.get(`/matches/${id}`).then((result) => result.match),
		enabled: Boolean(id),
		refetchInterval: pollInterval(poll),
	});
}

export function useMatchOtp(id, { enabled = true } = {}) {
	return useQuery({
		queryKey: keys.matchOtp(id),
		queryFn: () => api.get(`/matches/${id}/otp`).then((result) => result.otp),
		enabled: Boolean(id) && enabled,
	});
}

// ─────────────────────────────────────────────────────────────
//  Notifications (unread count polled every 20 s)
// ─────────────────────────────────────────────────────────────

export function useUnreadCount(enabled = true) {
	return useQuery({
		queryKey: keys.unread(),
		queryFn: () => api.get('/notifications/unread-count').then((result) => result.unread),
		enabled,
		refetchInterval: 20_000,
		refetchIntervalInBackground: false,
	});
}

export function useNotifications(enabled = true) {
	return useQuery({
		queryKey: keys.notifications(),
		queryFn: () =>
			api
				.get('/notifications', { query: { limit: 50 } })
				.then((result) => result.notifications),
		enabled,
	});
}

// ─────────────────────────────────────────────────────────────
//  Admin (generic: path + query → data)
// ─────────────────────────────────────────────────────────────

/**
 *     const { data } = useAdmin('/admin/users', { page, search });
 */
export function useAdmin(path, query = undefined, options = {}) {
	return useQuery({
		queryKey: keys.admin(path, query ?? {}),
		queryFn: () => api.get(path, { query }),
		placeholderData: keepPreviousData,
		...options,
	});
}
