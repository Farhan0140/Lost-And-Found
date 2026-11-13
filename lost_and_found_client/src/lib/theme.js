/**
 * Light / dark theme, shared by every component (including the 3D scenes).
 *
 *     const { dark, toggle } = useTheme();
 *
 * The "dark" class on <html> switches every colour token (styles/index.css).
 * index.html applies the saved choice before React starts, so there is no flash.
 */

import { useSyncExternalStore } from 'react';

const KEY = 'sf.theme';

const listeners = new Set();

function isDark() {
	return document.documentElement.classList.contains('dark');
}

function setDark(dark) {
	document.documentElement.classList.toggle('dark', dark);

	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute('content', dark ? '#0b0b14' : '#f6f5fb');

	try {
		localStorage.setItem(KEY, dark ? 'dark' : 'light');
	} catch {
		// remembered for this visit only
	}

	listeners.forEach((listener) => listener());
}

function subscribe(listener) {
	listeners.add(listener);

	return () => listeners.delete(listener);
}

export function useTheme() {
	const dark = useSyncExternalStore(subscribe, isDark);

	return {
		dark,
		toggle: () => setDark(!isDark()),
	};
}
