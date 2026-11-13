/**
 * Small reusable hooks.
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Seconds left until `expiresAt` (ISO string), updated every second.
 *
 *     const secondsLeft = useCountdown(otp.expiresAt);
 */
export function useCountdown(expiresAt) {
	const target = expiresAt ? new Date(expiresAt).getTime() : null;

	const compute = () => (target ? Math.max(0, Math.round((target - Date.now()) / 1000)) : 0);

	const [secondsLeft, setSecondsLeft] = useState(compute);

	useEffect(() => {
		setSecondsLeft(compute());

		if (!target) {
			return undefined;
		}

		const timer = setInterval(() => {
			const next = compute();

			setSecondsLeft(next);

			if (next <= 0) {
				clearInterval(timer);
			}
		}, 1000);

		return () => clearInterval(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [target]);

	return secondsLeft;
}

/** `value`, but only after it stopped changing for `delay` ms. */
export function useDebounced(value, delay = 300) {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay);

		return () => clearTimeout(timer);
	}, [value, delay]);

	return debounced;
}

/** Sets document.title while the page is mounted. */
export function usePageTitle(title) {
	useEffect(() => {
		const previous = document.title;

		document.title = title ? `${title} · SmartFind` : 'SmartFind';

		return () => {
			document.title = previous;
		};
	}, [title]);
}

/** The previous value of something (from the last render). */
export function usePrevious(value) {
	const ref = useRef(value);

	useEffect(() => {
		ref.current = value;
	}, [value]);

	return ref.current;
}
