/**
 * Autosave for a draft report.
 *
 *     const saver = useDraftAutosave(reportId, { onFieldError });
 *     saver.queue({ answers: { brand: { text: 'Samsung' } } });   // debounced
 *     saver.queue({ zoneId: 4 }, { immediate: true });
 *     const saved = await saver.flush();                         // before moving on (true / false)
 *     saver.state  →  'idle' | 'pending' | 'saving' | 'saved' | 'error'
 *
 * How it works:
 *   - changes are merged into one pending batch and sent after 700 ms of quiet
 *   - only ONE request is in flight; changes made meanwhile wait for the next one
 *   - every PATCH carries the draft `version`; on VERSION_CONFLICT (another tab
 *     saved first) the latest version is loaded and the same changes are re-sent
 *   - the pending batch is mirrored to localStorage, so closing the tab before the
 *     save finished loses nothing — it is re-sent next time the draft opens
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { api, ApiError } from '../../../lib/api.js';
import { keys } from '../../../lib/queries.js';

const DEBOUNCE_MS = 700;

function mirrorKey(reportId) {
	return `sf.draft.${reportId}`;
}

function readMirror(reportId) {
	try {
		return JSON.parse(localStorage.getItem(mirrorKey(reportId)) ?? 'null');
	} catch {
		return null;
	}
}

function writeMirror(reportId, changes) {
	try {
		if (changes && Object.keys(changes).length > 0) {
			localStorage.setItem(mirrorKey(reportId), JSON.stringify(changes));
		} else {
			localStorage.removeItem(mirrorKey(reportId));
		}
	} catch {
		// storage full / blocked — autosave still works, only the safety copy is missing
	}
}

/** Merges two change batches; `answers` is merged key by key. */
function merge(base, extra) {
	const result = { ...base, ...extra };

	if (base.answers || extra.answers) {
		result.answers = { ...(base.answers ?? {}), ...(extra.answers ?? {}) };
	}

	return result;
}

export function clearDraftMirror(reportId) {
	writeMirror(reportId, null);
}

export function useDraftAutosave(reportId, { onFieldError } = {}) {
	const queryClient = useQueryClient();

	const pending = useRef({});
	const timer = useRef(null);
	const inFlight = useRef(null);
	const flushRef = useRef(null);

	const [state, setState] = useState('idle');

	const onFieldErrorRef = useRef(onFieldError);
	onFieldErrorRef.current = onFieldError;

	// ── send the pending batch ──
	const send = useCallback(
		async (attempt = 0) => {
			const changes = pending.current;

			if (Object.keys(changes).length === 0) {
				return true;
			}

			pending.current = {};
			setState('saving');

			const current = queryClient.getQueryData(keys.report(reportId));

			try {
				const result = await api.patch(`/reports/${reportId}`, {
					version: current?.version,
					...changes,
				});

				queryClient.setQueryData(keys.report(reportId), result.report);

				writeMirror(reportId, pending.current);
				setState(Object.keys(pending.current).length > 0 ? 'pending' : 'saved');

				return true;
			} catch (error) {
				if (error instanceof ApiError && error.code === 'VERSION_CONFLICT' && attempt < 2) {
					// Another tab saved first: load the newest version and re-send our changes on top.
					await queryClient.refetchQueries({
						queryKey: keys.report(reportId),
						exact: true,
					});

					pending.current = merge(changes, pending.current);

					if (attempt === 0) {
						toast.info(
							'This draft was also edited somewhere else — your latest changes were kept.',
						);
					}

					return send(attempt + 1);
				}

				setState('error');

				// Keep the mirror only for problems worth retrying (network, server).
				const retryable =
					!(error instanceof ApiError) || error.status === 0 || error.status >= 500;

				if (retryable) {
					pending.current = merge(changes, pending.current);
					writeMirror(reportId, pending.current);
					toast.error('Could not save — will try again.', { id: 'autosave' });

					clearTimeout(timer.current);
					timer.current = setTimeout(() => flushRef.current?.(), 5000);
				} else {
					writeMirror(reportId, pending.current);
					onFieldErrorRef.current?.(error, changes);

					if (!onFieldErrorRef.current) {
						toast.error(error.message);
					}
				}

				return false;
			}
		},
		[queryClient, reportId],
	);

	/**
	 * Sends now (waits for a request already in flight first).
	 * Resolves to true when everything is saved, false when the last save failed.
	 */
	const flush = useCallback(async () => {
		clearTimeout(timer.current);

		let ok = true;

		while (inFlight.current) {
			ok = await inFlight.current;
		}

		if (Object.keys(pending.current).length === 0) {
			return ok;
		}

		inFlight.current = send().finally(() => {
			inFlight.current = null;
		});

		ok = await inFlight.current;

		// changes queued while that request ran (not after a failure — that would loop)
		if (ok && Object.keys(pending.current).length > 0) {
			return flush();
		}

		return ok;
	}, [send]);

	flushRef.current = flush;

	const queue = useCallback(
		(changes, { immediate = false } = {}) => {
			pending.current = merge(pending.current, changes);
			writeMirror(reportId, pending.current);
			setState('pending');

			clearTimeout(timer.current);

			if (immediate) {
				return flush();
			}

			timer.current = setTimeout(flush, DEBOUNCE_MS);

			return undefined;
		},
		[flush, reportId],
	);

	// ── re-send changes left over from a previous visit ──
	useEffect(() => {
		const leftover = readMirror(reportId);

		if (leftover && Object.keys(leftover).length > 0) {
			pending.current = merge(leftover, pending.current);
			flush();
		}
	}, [reportId, flush]);

	// ── save when leaving the page ──
	useEffect(() => {
		const onHide = () => {
			if (document.visibilityState === 'hidden') {
				flush();
			}
		};

		document.addEventListener('visibilitychange', onHide);

		return () => {
			document.removeEventListener('visibilitychange', onHide);
			clearTimeout(timer.current);
			flush();
		};
	}, [flush]);

	return { queue, flush, state };
}
