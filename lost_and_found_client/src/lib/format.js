/**
 * Formatting helpers (dates, durations, numbers). The campus is in Asia/Dhaka,
 * so calendar dates ("found on") are shown and chosen in that time zone.
 */

export const CAMPUS_TIMEZONE = 'Asia/Dhaka';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	timeZone: CAMPUS_TIMEZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
	timeZone: CAMPUS_TIMEZONE,
});

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * "2026-11-13" (a plain calendar date) → "13 Nov 2026"
 * A full timestamp ("2026-11-20T08:00:00Z") also works — it is shown as its campus date.
 */
export function formatDay(day) {
	if (!day) {
		return '—';
	}

	const text = String(day);

	// plain date: noon UTC so it never shifts a day in any time zone
	const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00Z`) : new Date(text);

	if (Number.isNaN(date.getTime())) {
		return '—';
	}

	return dateFormatter.format(date);
}

/** ISO timestamp → "13 Nov, 17:05" (campus time) */
export function formatDateTime(value) {
	if (!value) {
		return '—';
	}

	return dateTimeFormatter.format(new Date(value));
}

/** ISO timestamp → "5 minutes ago" / "in 2 hours" */
export function timeAgo(value) {
	if (!value) {
		return '—';
	}

	const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);

	const units = [
		['year', 31_536_000],
		['month', 2_592_000],
		['week', 604_800],
		['day', 86_400],
		['hour', 3_600],
		['minute', 60],
	];

	for (const [unit, size] of units) {
		if (Math.abs(seconds) >= size) {
			return relativeFormatter.format(Math.round(seconds / size), unit);
		}
	}

	return Math.abs(seconds) < 10 ? 'just now' : relativeFormatter.format(seconds, 'second');
}

/** Today's date in campus time as YYYY-MM-DD (for <input type="date" max>). */
export function todayInCampus() {
	return new Intl.DateTimeFormat('en-CA', { timeZone: CAMPUS_TIMEZONE }).format(new Date());
}

/** YYYY-MM-DD n days before today (campus time). */
export function daysAgoInCampus(days) {
	const today = new Date(`${todayInCampus()}T12:00:00Z`);

	today.setUTCDate(today.getUTCDate() - days);

	return today.toISOString().slice(0, 10);
}

/** 125 seconds → "2:05", 3700 → "1:01:40" */
export function formatCountdown(totalSeconds) {
	const seconds = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = String(seconds % 60).padStart(2, '0');

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, '0')}:${rest}`;
	}

	return `${minutes}:${rest}`;
}

/** 0.8734 → "87%" */
export function percent(value, digits = 0) {
	if (value === null || value === undefined || Number.isNaN(Number(value))) {
		return '—';
	}

	return `${(Number(value) * 100).toFixed(digits)}%`;
}

/** "dark_blue" → "Dark blue" (fallback when no label is known) */
export function humanize(code) {
	if (!code) {
		return '';
	}

	const text = String(code).replace(/[_-]+/g, ' ').trim();

	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Short id for display: "4b398006…" */
export function shortId(id) {
	return id ? `${String(id).slice(0, 8)}…` : '—';
}
