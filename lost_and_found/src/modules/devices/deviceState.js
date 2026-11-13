/**
 * In-memory state of every ESP32 (D7).
 *
 * The device polls once per second. To let Neon autosuspend, a poll is answered
 * entirely from memory:
 *   - credentials are cached here (refreshed from the DB every 60 s)
 *   - pending commands are cached here (loaded at startup, added by force-open)
 *   - `last_seen_at` is written to the database at most every 5 minutes
 *
 * "Online" = seen within the last 3 heartbeats (90 s). Lockers of an offline device
 * are not assignable for new deposits (corner case 10).
 */

import { RULES } from '../../config/rules.js';
import { query } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';

/** deviceId → state */
const devices = new Map();

function blankState(row) {
	return {
		id: row.id,
		name: row.name,
		secretHash: row.secret_hash,
		isActive: row.is_active,

		lastSeenAt: 0,
		lastSeenWrittenAt: row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0,
		ip: row.last_ip,
		firmware: row.firmware_version,
		bootId: null,
		rssi: null,
		freeHeap: null,
		uptimeMs: null,

		/** slot → { doorClosed, itemPresent, servoLocked } */
		sensors: new Map(),

		/** commands not yet acknowledged by the device */
		commands: [],

		/** kiosk brute-force protection (corner case 17) */
		wrongCodes: [],
		lockedUntil: 0,
	};
}

// ─────────────────────────────────────────────────────────────
//  Loading from the database
// ─────────────────────────────────────────────────────────────

/** (Re)loads credentials. Keeps runtime info (last seen, commands) for known devices. */
export async function loadDevices() {
	const { rows } = await query(
		'select id, name, secret_hash, is_active, last_seen_at, last_ip, firmware_version from devices',
	);

	const seen = new Set();

	for (const row of rows) {
		seen.add(row.id);

		const existing = devices.get(row.id);

		if (existing) {
			existing.name = row.name;
			existing.secretHash = row.secret_hash;
			existing.isActive = row.is_active;
		} else {
			devices.set(row.id, blankState(row));
		}
	}

	for (const id of devices.keys()) {
		if (!seen.has(id)) {
			devices.delete(id);
		}
	}

	return devices.size;
}

/** Pending/sent-but-not-acked commands survive a server restart. */
export async function loadPendingCommands() {
	const { rows } = await query(
		`
		select id, device_id, slot, type, created_at
		from device_commands
		where status in ('pending', 'sent')
		  and created_at > now() - interval '10 minutes'
		order by created_at
		`,
	);

	for (const row of rows) {
		devices.get(row.device_id)?.commands.push({
			id: row.id,
			type: row.type,
			slot: row.slot,
			createdAt: row.created_at,
		});
	}

	return rows.length;
}

export function getDeviceState(deviceId) {
	return devices.get(deviceId) ?? null;
}

// ─────────────────────────────────────────────────────────────
//  Presence
// ─────────────────────────────────────────────────────────────

/** Called on every authenticated device request. */
export function touchDevice(deviceId, ip) {
	const state = devices.get(deviceId);

	if (!state) {
		return;
	}

	const now = Date.now();
	const wasOnline = isOnline(deviceId);

	state.lastSeenAt = now;
	state.ip = ip;

	if (!wasOnline) {
		logger.device(`${deviceId} is ONLINE`, { ip });
	}

	// Write last_seen_at to the database only every 5 minutes (D7).
	if (now - state.lastSeenWrittenAt >= RULES.deviceLastSeenWriteMs) {
		state.lastSeenWrittenAt = now;

		query('update devices set last_seen_at = now(), last_ip = $2 where id = $1', [
			deviceId,
			ip,
		]).catch((error) =>
			logger.warn('device', `Could not save last_seen for ${deviceId}: ${error.message}`),
		);
	}
}

export function isOnline(deviceId) {
	const state = devices.get(deviceId);

	return Boolean(
		state && state.isActive && Date.now() - state.lastSeenAt < RULES.deviceOfflineAfterMs,
	);
}

export function onlineDeviceIds() {
	return [...devices.keys()].filter((id) => isOnline(id));
}

export function updateRuntimeInfo(deviceId, info) {
	const state = devices.get(deviceId);

	if (!state) {
		return;
	}

	Object.assign(state, info);
}

/** Summary for the admin dashboard. */
export function describeDevice(deviceId) {
	const state = devices.get(deviceId);

	if (!state) {
		return null;
	}

	return {
		online: isOnline(deviceId),
		lastSeenAt: state.lastSeenAt ? new Date(state.lastSeenAt) : null,
		ip: state.ip,
		firmware: state.firmware,
		rssi: state.rssi,
		freeHeap: state.freeHeap,
		uptimeMs: state.uptimeMs,
		kioskLockedUntil: state.lockedUntil > Date.now() ? new Date(state.lockedUntil) : null,
		pendingCommands: state.commands.length,
	};
}

// ─────────────────────────────────────────────────────────────
//  Commands
// ─────────────────────────────────────────────────────────────

export function queueCommand(deviceId, command) {
	devices.get(deviceId)?.commands.push(command);
}

export function peekCommands(deviceId) {
	return devices.get(deviceId)?.commands ?? [];
}

export function removeCommand(deviceId, commandId) {
	const state = devices.get(deviceId);

	if (state) {
		state.commands = state.commands.filter((command) => command.id !== commandId);
	}
}

// ─────────────────────────────────────────────────────────────
//  Sensors (only report changes to the caller, to avoid needless DB writes)
// ─────────────────────────────────────────────────────────────

/** Stores the latest reading; returns true if it differs from what we had. */
export function updateSensors(deviceId, slot, reading) {
	const state = devices.get(deviceId);

	if (!state) {
		return false;
	}

	const before = state.sensors.get(slot);

	const after = {
		doorClosed: reading.doorClosed ?? before?.doorClosed ?? null,
		itemPresent: reading.itemPresent ?? before?.itemPresent ?? null,
		servoLocked: reading.servoLocked ?? before?.servoLocked ?? null,
	};

	state.sensors.set(slot, after);

	return (
		!before ||
		before.doorClosed !== after.doorClosed ||
		before.itemPresent !== after.itemPresent ||
		before.servoLocked !== after.servoLocked
	);
}

// ─────────────────────────────────────────────────────────────
//  Kiosk lockout: 5 wrong codes in 60 s → locked for 5 minutes
// ─────────────────────────────────────────────────────────────

export function kioskLockedForMs(deviceId) {
	const state = devices.get(deviceId);

	return state ? Math.max(0, state.lockedUntil - Date.now()) : 0;
}

/** Records a wrong code. Returns { attemptsLeft, lockedNow }. */
export function recordWrongCode(deviceId) {
	const state = devices.get(deviceId);
	const now = Date.now();

	state.wrongCodes = state.wrongCodes.filter(
		(time) => now - time < RULES.kioskWrongCodesWindowMs,
	);
	state.wrongCodes.push(now);

	const attemptsLeft = Math.max(0, RULES.kioskWrongCodesLimit - state.wrongCodes.length);

	if (attemptsLeft === 0) {
		state.lockedUntil = now + RULES.kioskLockoutMs;
		state.wrongCodes = [];

		return { attemptsLeft: 0, lockedNow: true };
	}

	return { attemptsLeft, lockedNow: false };
}

export function clearWrongCodes(deviceId) {
	const state = devices.get(deviceId);

	if (state) {
		state.wrongCodes = [];
	}
}
