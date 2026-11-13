/**
 * Locker helpers (§11.2, §11.5).
 *
 * Locker states:
 *   available → reserved (deposit OTP issued) → occupied (item confirmed) → available (collected)
 *   occupied → needs_emptying (unclaimed 10 days) → available (admin confirms emptied)
 *   reserved/occupied → open_unresolved (door open > 60 s) → occupied / available (staff clears)
 *   available ↔ maintenance (admin)
 */

import { pool } from '../../db/pool.js';
import { describeDevice, isOnline, onlineDeviceIds } from '../devices/deviceState.js';

/**
 * Picks a free locker on an ONLINE device, skipping rows other transactions are holding
 * (`FOR UPDATE SKIP LOCKED`), so two finders at the same moment get DIFFERENT lockers.
 *
 * `skip` = how many queued finders are ahead (FIFO): we only take a locker if there is
 * one left over after they each get theirs.
 */
export async function pickFreeLocker(client, { skip = 0 } = {}) {
	const deviceIds = onlineDeviceIds();

	if (deviceIds.length === 0) {
		return null;
	}

	const { rows } = await client.query(
		`
		select l.*
		from lockers l
		join devices d on d.id = l.device_id
		where l.status = 'available'
		  and d.is_active
		  and l.device_id = any($1)
		order by l.device_id, l.slot
		for update of l skip locked
		limit $2
		`,
		[deviceIds, skip + 1],
	);

	return rows.length > skip ? rows[skip] : null;
}

export async function reserveLocker(client, lockerId, reportId) {
	await client.query(
		`
		update lockers
		set status = 'reserved', current_report_id = $2
		where id = $1
		`,
		[lockerId, reportId],
	);
}

/** Back to `available` (only from reserved — an occupied locker is never freed here). */
export async function releaseReservedLocker(client, lockerId) {
	await client.query(
		`
		update lockers
		set status = 'available', current_report_id = null
		where id = $1 and status = 'reserved'
		`,
		[lockerId],
	);
}

/** Lockers for the admin dashboard and the 3D grid. */
export async function listLockers() {
	const { rows } = await pool.query(
		`
		select
			l.*,
			d.name as device_name,
			r.kind as report_kind,
			r.status as report_status,
			r.first_stored_at,
			c.name as category_name
		from lockers l
		join devices d on d.id = l.device_id
		left join reports r on r.id = l.current_report_id
		left join categories c on c.id = r.category_id
		order by l.device_id, l.slot
		`,
	);

	return rows.map((row) => ({
		id: row.id,
		deviceId: row.device_id,
		deviceName: row.device_name,
		deviceOnline: isOnline(row.device_id),
		slot: row.slot,
		label: row.label,
		sizeClass: row.size_class,
		status: row.status,
		doorClosed: row.door_closed,
		itemPresent: row.item_present,
		servoLocked: row.servo_locked,
		doorOpenedAt: row.door_opened_at,
		sensorsUpdatedAt: row.sensors_updated_at,
		currentReport: row.current_report_id
			? {
					id: row.current_report_id,
					kind: row.report_kind,
					status: row.report_status,
					category: row.category_name,
					storedAt: row.first_stored_at,
				}
			: null,
	}));
}

/** Public, anonymous view: only labels and states (used on the landing page and by students). */
export async function publicLockerGrid() {
	const { rows } = await pool.query(
		'select device_id, slot, label, status from lockers order by device_id, slot',
	);

	return rows.map((row) => ({
		label: row.label,
		slot: row.slot,
		status: row.status,
		online: isOnline(row.device_id),
	}));
}

export async function listDevicesWithLockers() {
	const { rows } = await pool.query(
		`
		select d.id, d.name, d.is_active, d.firmware_version, d.last_seen_at, d.created_at,
		       count(l.id) as locker_count
		from devices d
		left join lockers l on l.device_id = d.id
		group by d.id
		order by d.id
		`,
	);

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		isActive: row.is_active,
		lockerCount: row.locker_count,
		createdAt: row.created_at,
		lastSeenSavedAt: row.last_seen_at,
		...describeDevice(row.id),
	}));
}
