/**
 * Readable labels, colours and icons for every status the backend uses.
 * "tone" maps to the Badge colours (components/ui/Badge.jsx).
 */

import {
	Backpack,
	BatteryCharging,
	BookOpen,
	Cable,
	Calculator,
	Gem,
	Glasses,
	Headphones,
	Headset,
	KeyRound,
	Laptop,
	Milk,
	Package,
	PencilRuler,
	Shirt,
	Smartphone,
	Tablet,
	Umbrella,
	Usb,
	Wallet,
	Watch,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
//  Category icons (the server sends lucide icon NAMES)
// ─────────────────────────────────────────────────────────────

const CATEGORY_ICONS = {
	Smartphone,
	Wallet,
	Backpack,
	Headphones,
	KeyRound,
	Laptop,
	Tablet,
	Watch,
	Headset,
	Cable,
	BatteryCharging,
	Usb,
	Calculator,
	Milk,
	Umbrella,
	Glasses,
	Shirt,
	BookOpen,
	Gem,
	PencilRuler,
};

export function categoryIcon(name) {
	return CATEGORY_ICONS[name] ?? Package;
}

// ─────────────────────────────────────────────────────────────
//  Reports
// ─────────────────────────────────────────────────────────────

export const REPORT_STATUS = {
	draft: { label: 'Draft', tone: 'neutral' },
	abandoned: { label: 'Codes used up', tone: 'warn' },
	discarded: { label: 'Discarded', tone: 'neutral' },

	awaiting_deposit: { label: 'Bring it to a locker', tone: 'brand' },
	awaiting_locker: { label: 'Waiting for a free locker', tone: 'warn' },
	stored: { label: 'Safe in a locker', tone: 'ok' },
	unclaimed_expired: { label: 'Unclaimed — moved to admin', tone: 'neutral' },
	overflow: { label: 'Bring it to the admin desk', tone: 'warn' },

	open: { label: 'Searching for a match', tone: 'info' },
	cancelled: { label: 'Cancelled', tone: 'neutral' },

	matched: { label: 'Matched', tone: 'accent' },
	awaiting_collection: { label: 'Ready to collect', tone: 'accent' },
	collected: { label: 'Returned', tone: 'ok' },
};

export function reportStatus(status) {
	return REPORT_STATUS[status] ?? { label: status, tone: 'neutral' };
}

// ─────────────────────────────────────────────────────────────
//  Matches
// ─────────────────────────────────────────────────────────────

export const MATCH_STATUS = {
	auto_matched: { label: 'Matched', tone: 'accent' },
	review: { label: 'In admin review', tone: 'warn' },
	approved: { label: 'Approved', tone: 'ok' },
	rejected: { label: 'Rejected', tone: 'bad' },
	otp_issued: { label: 'Collection code issued', tone: 'brand' },
	collected: { label: 'Collected', tone: 'ok' },
	expired: { label: 'Expired', tone: 'neutral' },
	superseded: { label: 'Superseded', tone: 'neutral' },
};

export function matchStatus(status) {
	return MATCH_STATUS[status] ?? { label: status, tone: 'neutral' };
}

export const BAND = {
	high: { label: 'Strong match', tone: 'ok' },
	medium: { label: 'Possible match', tone: 'warn' },
	low: { label: 'Weak match', tone: 'neutral' },
};

/** Per-question comparison flag (student match view). */
export const FLAG = {
	agree: { label: 'Matches', tone: 'ok' },
	conflict: { label: 'Differs', tone: 'bad' },
	missing: { label: 'Not compared', tone: 'neutral' },
};

// ─────────────────────────────────────────────────────────────
//  Lockers
// ─────────────────────────────────────────────────────────────

/** `color` is used by the 3D locker cabinet (hex, works in both themes). */
export const LOCKER_STATUS = {
	available: { label: 'Free', tone: 'ok', color: '#34d399' },
	reserved: { label: 'Reserved', tone: 'brand', color: '#a78bfa' },
	occupied: { label: 'Holding an item', tone: 'info', color: '#60a5fa' },
	needs_emptying: { label: 'Needs emptying', tone: 'warn', color: '#fbbf24' },
	open_unresolved: { label: 'Door left open', tone: 'bad', color: '#f87171' },
	maintenance: { label: 'Maintenance', tone: 'neutral', color: '#94a3b8' },
	offline: { label: 'Kiosk offline', tone: 'neutral', color: '#64748b' },
};

export function lockerStatus(status, online = true) {
	if (!online) {
		return LOCKER_STATUS.offline;
	}

	return LOCKER_STATUS[status] ?? { label: status, tone: 'neutral', color: '#94a3b8' };
}

// ─────────────────────────────────────────────────────────────
//  Report lifecycle steps (for the timeline on the report page)
// ─────────────────────────────────────────────────────────────

const FOUND_STEPS = [
	{ key: 'submitted', label: 'Reported' },
	{ key: 'deposit', label: 'Put in a locker' },
	{ key: 'stored', label: 'Stored safely' },
	{ key: 'matched', label: 'Owner found' },
	{ key: 'collected', label: 'Returned' },
];

const LOST_STEPS = [
	{ key: 'submitted', label: 'Reported' },
	{ key: 'searching', label: 'Searching' },
	{ key: 'matched', label: 'Match found' },
	{ key: 'collected', label: 'Collected' },
];

const FOUND_PROGRESS = {
	awaiting_deposit: 1,
	awaiting_locker: 1,
	abandoned: 1,
	overflow: 1,
	stored: 2,
	unclaimed_expired: 2,
	matched: 3,
	awaiting_collection: 3,
	collected: 5,
};

const LOST_PROGRESS = {
	open: 1,
	matched: 2,
	awaiting_collection: 2,
	collected: 4,
	cancelled: 1,
};

/** → { steps, done } where `done` = how many steps are finished. */
export function lifecycle(kind, status) {
	if (kind === 'found') {
		return { steps: FOUND_STEPS, done: FOUND_PROGRESS[status] ?? 1 };
	}

	return { steps: LOST_STEPS, done: LOST_PROGRESS[status] ?? 1 };
}
