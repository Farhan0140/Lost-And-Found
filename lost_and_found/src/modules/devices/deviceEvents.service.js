/**
 * Everything the ESP32 sends: OTP verification at the keypad, events, heartbeats,
 * command acknowledgements.
 *
 * The backend is the source of truth for OTPs and locker state; the device only
 * executes authorised actions and reports what its sensors actually see (§12).
 */

import { RULES } from '../../config/rules.js';
import { query, withTransaction } from '../../db/pool.js';
import { hashOtpCode } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { audit } from '../audit/audit.service.js';
import { handleDoorSettled } from '../lockers/custody.service.js';
import { notifyAdmins } from '../notifications/notifications.service.js';
import {
	clearWrongCodes,
	getDeviceState,
	kioskLockedForMs,
	recordWrongCode,
	removeCommand,
	updateRuntimeInfo,
	updateSensors,
} from './deviceState.js';

// ─────────────────────────────────────────────────────────────
//  Keypad: verify a 6-digit code
// ─────────────────────────────────────────────────────────────

/**
 * Returns what the kiosk should do:
 *   { ok: true,  slot, lockerLabel, action, sessionId }                     → open that servo
 *   { ok: false, reason: 'INVALID'|'EXPIRED'|'LOCKED', attemptsLeft, lockedForSeconds }
 */
export async function verifyKioskCode(deviceId, code) {
	const lockedMs = kioskLockedForMs(deviceId);

	if (lockedMs > 0) {
		return { ok: false, reason: 'LOCKED', lockedForSeconds: Math.ceil(lockedMs / 1000) };
	}

	const result = await withTransaction(async (client) => {
		const { rows } = await client.query(
			`
			select o.*, l.slot, l.label, l.device_id, l.status as locker_status
			from otps o
			join lockers l on l.id = o.locker_id
			where o.code_hash = $1 and o.status = 'active'
			for update of o
			`,
			[hashOtpCode(code)],
		);

		const otp = rows[0];

		if (!otp || otp.device_id !== deviceId) {
			return { ok: false, reason: 'INVALID' };
		}

		if (new Date(otp.expires_at) <= new Date()) {
			return { ok: false, reason: 'EXPIRED' };
		}

		const busy = await client.query(
			`select 1 from locker_sessions where locker_id = $1 and status = 'open'`,
			[otp.locker_id],
		);

		if (busy.rowCount > 0) {
			return { ok: false, reason: 'LOCKER_BUSY' };
		}

		await client.query(`update otps set status = 'used', used_at = now() where id = $1`, [
			otp.id,
		]);

		const session = await client.query(
			`
			insert into locker_sessions (locker_id, device_id, action, otp_id, report_id, match_id)
			values ($1, $2, $3, $4, $5, $6)
			returning id
			`,
			[otp.locker_id, deviceId, otp.action, otp.id, otp.report_id, otp.match_id],
		);

		await audit(client, {
			actorType: 'device',
			actorId: deviceId,
			action: `otp.${otp.action}_used`,
			entityType: 'locker',
			entityId: otp.locker_id,
			details: { locker: otp.label, otpId: otp.id, userId: otp.user_id },
		});

		return {
			ok: true,
			slot: otp.slot,
			lockerLabel: otp.label,
			action: otp.action,
			sessionId: session.rows[0].id,
		};
	});

	if (result.ok) {
		clearWrongCodes(deviceId);

		logger.device(`${deviceId}: code accepted → open ${result.lockerLabel} (${result.action})`);

		return result;
	}

	if (result.reason === 'LOCKER_BUSY') {
		return result;
	}

	// ── wrong or expired code: count it (corner case 17) ──
	const { attemptsLeft, lockedNow } = recordWrongCode(deviceId);

	await audit(null, {
		actorType: 'device',
		actorId: deviceId,
		action: 'kiosk.wrong_code',
		entityType: 'device',
		entityId: deviceId,
		details: { reason: result.reason, attemptsLeft },
	});

	if (lockedNow) {
		logger.warn(
			'device',
			`${deviceId}: keypad LOCKED for 5 minutes after too many wrong codes`,
		);

		await audit(null, {
			actorType: 'system',
			actorId: 'system',
			action: 'kiosk.locked_out',
			entityType: 'device',
			entityId: deviceId,
		});

		await notifyAdmins(null, {
			type: 'kiosk_lockout',
			title: `Kiosk ${deviceId} locked`,
			body: 'Too many wrong codes were typed. The keypad is locked for 5 minutes.',
			link: '/admin/lockers',
		});

		return { ok: false, reason: 'LOCKED', lockedForSeconds: RULES.kioskLockoutMs / 1000 };
	}

	return { ok: false, reason: result.reason, attemptsLeft };
}

// ─────────────────────────────────────────────────────────────
//  Events (batched, re-sendable: (device, boot, seq) is unique)
// ─────────────────────────────────────────────────────────────

/**
 * Event types:
 *   boot                    { lockers: [{ slot, doorClosed, itemPresent }] }
 *   unlocked / locked       servo moved
 *   door_opened             contact switch released
 *   door_closed             contact switch pressed (raw)
 *   item_detected / item_removed   raw IR changes (informational)
 *   door_closed_settled     { itemPresent } — IR stable for 3 s after the door closed
 *   door_open_too_long      { seconds }
 *   error                   { message }
 *
 * Returns the list of `seq` numbers the device may delete from its queue.
 */
export async function receiveEvents(deviceId, bootId, events) {
	const acked = [];

	for (const event of events) {
		const inserted = await query(
			`
			insert into device_events (device_id, boot_id, seq, type, slot, session_id, data, device_uptime_ms)
			values ($1, $2, $3, $4, $5, $6, $7, $8)
			on conflict (device_id, boot_id, seq) do nothing
			returning id
			`,
			[
				deviceId,
				bootId,
				event.seq,
				event.type,
				event.slot ?? null,
				event.sessionId ?? null,
				JSON.stringify(event.data ?? {}),
				event.uptimeMs ?? null,
			],
		);

		// Already received earlier (the device re-sent it) → just acknowledge again.
		if (inserted.rowCount > 0) {
			try {
				await applyEvent(deviceId, event);
			} catch (error) {
				logger.error(
					'device',
					`${deviceId}: could not apply "${event.type}" (seq ${event.seq}): ${error.message}`,
				);
			}
		}

		acked.push(event.seq);
	}

	return acked;
}

async function applyEvent(deviceId, event) {
	const slot = event.slot;
	const data = event.data ?? {};

	logger.device(`${deviceId}: ${event.type}${slot ? ` (slot ${slot})` : ''}`);

	switch (event.type) {
		case 'boot':
			await handleBoot(deviceId, data);
			break;

		case 'unlocked':
		case 'locked':
			updateSensors(deviceId, slot, { servoLocked: event.type === 'locked' });
			await saveSensorColumns(deviceId, slot, { servo_locked: event.type === 'locked' });
			break;

		case 'door_opened':
			updateSensors(deviceId, slot, { doorClosed: false });
			await query(
				`
				update lockers
				set door_closed = false, door_opened_at = coalesce(door_opened_at, now()), sensors_updated_at = now()
				where device_id = $1 and slot = $2
				`,
				[deviceId, slot],
			);
			break;

		case 'door_closed':
			updateSensors(deviceId, slot, { doorClosed: true });
			await saveSensorColumns(deviceId, slot, { door_closed: true });
			break;

		case 'item_detected':
		case 'item_removed':
			updateSensors(deviceId, slot, { itemPresent: event.type === 'item_detected' });
			await saveSensorColumns(deviceId, slot, {
				item_present: event.type === 'item_detected',
			});
			break;

		case 'door_closed_settled':
			updateSensors(deviceId, slot, {
				doorClosed: true,
				itemPresent: Boolean(data.itemPresent),
			});
			await handleDoorSettled(deviceId, slot, Boolean(data.itemPresent));
			break;

		case 'door_open_too_long':
			await markOpenUnresolved(deviceId, slot, data.seconds);
			break;

		case 'error':
			logger.warn(
				'device',
				`${deviceId} reported an error: ${String(data.message ?? '').slice(0, 200)}`,
			);
			break;

		default:
			logger.debug('device', `${deviceId}: unhandled event type "${event.type}"`);
	}
}

async function saveSensorColumns(deviceId, slot, columns) {
	const [[column, value]] = Object.entries(columns);

	// column names come from our own code above, never from the request
	await query(
		`update lockers set ${column} = $3, sensors_updated_at = now() where device_id = $1 and slot = $2`,
		[deviceId, slot, value],
	);
}

/**
 * Power loss mid-open (corner case 9): the device boots LOCKED (if the door is closed)
 * and reports what its sensors see; we reconcile any session left open.
 */
async function handleBoot(deviceId, data) {
	logger.device(`${deviceId} booted`, { firmware: data.firmware });

	for (const reading of data.lockers ?? []) {
		updateSensors(deviceId, reading.slot, reading);

		await query(
			`
			update lockers
			set door_closed = $3, item_present = $4, sensors_updated_at = now()
			where device_id = $1 and slot = $2
			`,
			[deviceId, reading.slot, reading.doorClosed, reading.itemPresent],
		);

		const open = await query(
			`
			select s.id
			from locker_sessions s
			join lockers l on l.id = s.locker_id
			where l.device_id = $1 and l.slot = $2 and s.status = 'open'
			`,
			[deviceId, reading.slot],
		);

		if (open.rowCount > 0 && reading.doorClosed) {
			await handleDoorSettled(deviceId, reading.slot, Boolean(reading.itemPresent));
		}
	}
}

/** Door open > 60 s (corner case 8). Also detected by the sweeper from sensor columns. */
export async function markOpenUnresolved(deviceId, slot, seconds = null) {
	const { rows } = await query(
		`
		update lockers
		set status = 'open_unresolved'
		where device_id = $1 and slot = $2 and status in ('reserved', 'occupied', 'available')
		returning id, label
		`,
		[deviceId, slot],
	);

	if (rows.length === 0) {
		return;
	}

	await audit(null, {
		actorType: 'device',
		actorId: deviceId,
		action: 'locker.door_left_open',
		entityType: 'locker',
		entityId: rows[0].id,
		details: { locker: rows[0].label, seconds },
	});

	await notifyAdmins(null, {
		type: 'door_left_open',
		title: `Locker ${rows[0].label}: door left open`,
		body: 'The door has been open for over a minute. Please check the locker.',
		link: '/admin/lockers',
	});

	logger.warn('device', `${rows[0].label}: door open too long → open_unresolved`);
}

// ─────────────────────────────────────────────────────────────
//  Heartbeat + commands
// ─────────────────────────────────────────────────────────────

/** Saves sensor columns ONLY when something changed (keeps Neon idle — D7). */
export async function receiveHeartbeat(deviceId, heartbeat) {
	updateRuntimeInfo(deviceId, {
		bootId: heartbeat.bootId ?? null,
		uptimeMs: heartbeat.uptimeMs ?? null,
		rssi: heartbeat.rssi ?? null,
		freeHeap: heartbeat.freeHeap ?? null,
		firmware: heartbeat.firmware ?? getDeviceState(deviceId)?.firmware,
	});

	for (const reading of heartbeat.lockers ?? []) {
		const changed = updateSensors(deviceId, reading.slot, reading);

		if (changed) {
			await query(
				`
				update lockers
				set door_closed = $3, item_present = $4, servo_locked = $5, sensors_updated_at = now()
				where device_id = $1 and slot = $2
				`,
				[
					deviceId,
					reading.slot,
					reading.doorClosed,
					reading.itemPresent,
					reading.servoLocked,
				],
			);
		}
	}
}

export async function acknowledgeCommand(deviceId, commandId, { ok, message }) {
	removeCommand(deviceId, commandId);

	const { rows } = await query(
		`
		update device_commands
		set status = $3, acked_at = now(), result = $4
		where id = $1 and device_id = $2 and status in ('pending', 'sent')
		returning slot
		`,
		[
			commandId,
			deviceId,
			ok ? 'done' : 'failed',
			JSON.stringify({ ok, message: message ?? null }),
		],
	);

	if (rows.length > 0) {
		await audit(null, {
			actorType: 'device',
			actorId: deviceId,
			action: ok ? 'command.executed' : 'command.failed',
			entityType: 'device_command',
			entityId: commandId,
			details: { slot: rows[0].slot, message },
		});

		logger.device(
			`${deviceId}: command ${commandId.slice(0, 8)} ${ok ? 'executed' : 'FAILED'}`,
		);
	}
}

export async function markCommandsSent(commandIds) {
	if (commandIds.length === 0) {
		return;
	}

	await query(
		`update device_commands set status = 'sent', sent_at = now() where id = any($1) and status = 'pending'`,
		[commandIds],
	);
}
