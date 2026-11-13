/**
 * Date helpers.
 *
 * Timestamps are stored in UTC (timestamptz).
 * "Calendar dates" (the day an item was lost or found) are plain `date` values
 * in the campus timezone (APP_TIMEZONE, default Asia/Dhaka).
 */

import { config } from '../config/env.js';

/** Today's date in the campus timezone as "YYYY-MM-DD". */
export function todayInCampus() {
	// en-CA formats as YYYY-MM-DD
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: config.timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date());
}

export function addMs(date, ms) {
	return new Date(new Date(date).getTime() + ms);
}

/** Seconds from now until `date` (never negative). */
export function secondsUntil(date) {
	return Math.max(0, Math.round((new Date(date).getTime() - Date.now()) / 1000));
}
