/**
 * /api/v1/admin/lockers and /api/v1/admin/devices
 *
 *   GET  /lockers
 *   POST /lockers/:id/force-open        { reason } → command queued; ESP32 picks it up on its next poll
 *   POST /lockers/:id/confirm-emptied   { reason } → needs_emptying → available
 *   POST /lockers/:id/clear-unresolved  { reason } → open_unresolved → occupied / available
 *   POST /lockers/:id/maintenance       { on, reason }
 *
 *   GET   /devices
 *   POST  /devices                      { id, name, lockerCount, labelPrefix } → secret shown ONCE
 *   POST  /devices/:id/rotate-secret    { reason }                             → secret shown ONCE
 *   PATCH /devices/:id                  { name?, isActive?, reason }
 *   GET   /devices/:id/events           latest raw device events
 */

import { Router } from 'express';
import { z } from 'zod';

import { query, withTransaction } from '../../db/pool.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';
import { conflict, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../audit/audit.service.js';
import { isOnline, loadDevices, queueCommand } from '../devices/deviceState.js';
import { listDevicesWithLockers, listLockers } from '../lockers/lockers.service.js';
import { adminActor, intParam, reason, reasonBody } from './common.js';

export const lockersAdminRouter = Router();

// ─────────────────────────────────────────────────────────────
//  Lockers
// ─────────────────────────────────────────────────────────────

async function lockLocker(client, id) {
	const { rows } = await client.query('select * from lockers where id = $1 for update', [id]);

	if (!rows[0]) {
		throw notFound('LOCKER_NOT_FOUND', 'Locker not found.');
	}

	return rows[0];
}

lockersAdminRouter.get('/lockers', async (req, res) => {
	res.json({ lockers: await listLockers() });
});

lockersAdminRouter.post('/lockers/:id/force-open', validateBody(reasonBody), async (req, res) => {
	const id = intParam(req, 'id', 'Locker');

	const command = await withTransaction(async (client) => {
		const locker = await lockLocker(client, id);

		const { rows } = await client.query(
			`
			insert into device_commands (device_id, locker_id, slot, type, reason, issued_by)
			values ($1, $2, $3, 'force_open', $4, $5)
			returning id, created_at
			`,
			[locker.device_id, locker.id, locker.slot, req.body.reason, req.user.id],
		);

		// The door cycle is tracked as a session so the close can be reconciled.
		const openSession = await client.query(
			`select 1 from locker_sessions where locker_id = $1 and status = 'open'`,
			[locker.id],
		);

		if (openSession.rowCount === 0) {
			await client.query(
				`
				insert into locker_sessions (locker_id, device_id, action, command_id)
				values ($1, $2, 'force_open', $3)
				`,
				[locker.id, locker.device_id, rows[0].id],
			);
		}

		await audit(client, {
			...adminActor(req),
			action: 'locker.force_open',
			entityType: 'locker',
			entityId: locker.id,
			reason: req.body.reason,
			details: { locker: locker.label, commandId: rows[0].id },
		});

		return {
			id: rows[0].id,
			deviceId: locker.device_id,
			slot: locker.slot,
			label: locker.label,
			createdAt: rows[0].created_at,
		};
	});

	queueCommand(command.deviceId, {
		id: command.id,
		type: 'force_open',
		slot: command.slot,
		createdAt: command.createdAt,
	});

	logger.info('admin', `Force-open queued for ${command.label} by ${req.user.studentId}`);

	res.status(202).json({
		commandId: command.id,
		deviceOnline: isOnline(command.deviceId),
		message: isOnline(command.deviceId)
			? 'Command sent. The locker should open within a couple of seconds.'
			: 'The device is OFFLINE. The command will run when it reconnects (within 10 minutes).',
	});
});

lockersAdminRouter.post(
	'/lockers/:id/confirm-emptied',
	validateBody(reasonBody),
	async (req, res) => {
		const id = intParam(req, 'id', 'Locker');

		await withTransaction(async (client) => {
			const locker = await lockLocker(client, id);

			if (locker.status !== 'needs_emptying') {
				throw conflict(
					'NOT_NEEDS_EMPTYING',
					`Locker ${locker.label} is "${locker.status}", not "needs_emptying".`,
				);
			}

			await client.query(
				`update lockers set status = 'available', current_report_id = null where id = $1`,
				[id],
			);

			await audit(client, {
				...adminActor(req),
				action: 'locker.confirmed_emptied',
				entityType: 'locker',
				entityId: id,
				reason: req.body.reason,
				details: { locker: locker.label, reportId: locker.current_report_id },
			});
		});

		res.json({ ok: true });
	},
);

lockersAdminRouter.post(
	'/lockers/:id/clear-unresolved',
	validateBody(reasonBody),
	async (req, res) => {
		const id = intParam(req, 'id', 'Locker');

		const newStatus = await withTransaction(async (client) => {
			const locker = await lockLocker(client, id);

			if (locker.status !== 'open_unresolved') {
				throw conflict(
					'NOT_UNRESOLVED',
					`Locker ${locker.label} is "${locker.status}", not "open_unresolved".`,
				);
			}

			// Still holds a stored / matched item → occupied. Otherwise → available.
			let status = 'available';
			let reportId = null;

			if (locker.current_report_id) {
				const report = await client.query(
					'select kind, status from reports where id = $1',
					[locker.current_report_id],
				);

				const holds = ['stored', 'matched', 'awaiting_collection'].includes(
					report.rows[0]?.status,
				);

				if (holds) {
					status = 'occupied';
					reportId = locker.current_report_id;
				}
			}

			await client.query(
				`update lockers set status = $2, current_report_id = $3, door_opened_at = null where id = $1`,
				[id, status, reportId],
			);

			await client.query(
				`update locker_sessions set status = 'cancelled', finished_at = now(), result = 'cleared_by_admin'
			 where locker_id = $1 and status = 'open'`,
				[id],
			);

			await audit(client, {
				...adminActor(req),
				action: 'locker.unresolved_cleared',
				entityType: 'locker',
				entityId: id,
				reason: req.body.reason,
				details: { locker: locker.label, newStatus: status },
			});

			return status;
		});

		res.json({ ok: true, status: newStatus });
	},
);

export const maintenanceSchema = z.object({ on: z.boolean(), reason });

lockersAdminRouter.post(
	'/lockers/:id/maintenance',
	validateBody(maintenanceSchema),
	async (req, res) => {
		const id = intParam(req, 'id', 'Locker');

		await withTransaction(async (client) => {
			const locker = await lockLocker(client, id);

			if (req.body.on && locker.status !== 'available') {
				throw conflict(
					'LOCKER_IN_USE',
					`Only an available locker can go into maintenance (${locker.label} is "${locker.status}").`,
				);
			}

			if (!req.body.on && locker.status !== 'maintenance') {
				throw conflict(
					'NOT_IN_MAINTENANCE',
					`Locker ${locker.label} is not in maintenance.`,
				);
			}

			await client.query('update lockers set status = $2 where id = $1', [
				id,
				req.body.on ? 'maintenance' : 'available',
			]);

			await audit(client, {
				...adminActor(req),
				action: req.body.on ? 'locker.maintenance_on' : 'locker.maintenance_off',
				entityType: 'locker',
				entityId: id,
				reason: req.body.reason,
				details: { locker: locker.label },
			});
		});

		res.json({ ok: true });
	},
);

// ─────────────────────────────────────────────────────────────
//  Devices
// ─────────────────────────────────────────────────────────────

export const createDeviceSchema = z.object({
	id: z
		.string()
		.trim()
		.regex(/^[A-Z0-9-]{3,24}$/, 'use 3–24 capital letters, digits or dashes, e.g. KIOSK-02'),
	name: z.string().trim().min(2).max(60),
	lockerCount: z.number().int().min(1).max(16).default(4),
	labelPrefix: z
		.string()
		.trim()
		.regex(/^[A-Z]{1,3}$/, 'use 1–3 capital letters, e.g. L or B')
		.default('L'),
});

lockersAdminRouter.get('/devices', async (req, res) => {
	res.json({ devices: await listDevicesWithLockers() });
});

lockersAdminRouter.post('/devices', validateBody(createDeviceSchema), async (req, res) => {
	const { id, name, lockerCount, labelPrefix } = req.body;

	const secret = `sfd_${randomToken(24)}`;

	await withTransaction(async (client) => {
		const exists = await client.query('select 1 from devices where id = $1', [id]);

		if (exists.rowCount > 0) {
			throw conflict('DEVICE_EXISTS', `A device called ${id} already exists.`);
		}

		await client.query('insert into devices (id, name, secret_hash) values ($1, $2, $3)', [
			id,
			name,
			sha256Hex(secret),
		]);

		for (let slot = 1; slot <= lockerCount; slot++) {
			const label = `${labelPrefix}${slot}`;

			const taken = await client.query('select 1 from lockers where label = $1', [label]);

			if (taken.rowCount > 0) {
				throw conflict(
					'LABEL_TAKEN',
					`Locker label ${label} is already used. Choose another prefix.`,
				);
			}

			await client.query('insert into lockers (device_id, slot, label) values ($1, $2, $3)', [
				id,
				slot,
				label,
			]);
		}

		await audit(client, {
			...adminActor(req),
			action: 'device.created',
			entityType: 'device',
			entityId: id,
			details: { lockerCount, labelPrefix },
		});
	});

	await loadDevices();

	res.status(201).json({
		deviceId: id,
		secret,
		warning: 'Copy this secret into the ESP32 setup portal now. It will NOT be shown again.',
	});
});

lockersAdminRouter.post(
	'/devices/:id/rotate-secret',
	validateBody(reasonBody),
	async (req, res) => {
		const id = String(req.params.id);
		const secret = `sfd_${randomToken(24)}`;

		const { rowCount } = await query('update devices set secret_hash = $2 where id = $1', [
			id,
			sha256Hex(secret),
		]);

		if (rowCount === 0) {
			throw notFound('DEVICE_NOT_FOUND', 'Device not found.');
		}

		await audit(null, {
			...adminActor(req),
			action: 'device.secret_rotated',
			entityType: 'device',
			entityId: id,
			reason: req.body.reason,
		});

		await loadDevices();

		res.json({
			deviceId: id,
			secret,
			warning:
				'The old secret stopped working. Enter this new one in the ESP32 setup portal.',
		});
	},
);

export const updateDeviceSchema = z.object({
	name: z.string().trim().min(2).max(60).optional(),
	isActive: z.boolean().optional(),
	reason,
});

lockersAdminRouter.patch('/devices/:id', validateBody(updateDeviceSchema), async (req, res) => {
	const id = String(req.params.id);

	const { rowCount } = await query(
		`
		update devices
		set name = coalesce($2, name), is_active = coalesce($3, is_active)
		where id = $1
		`,
		[id, req.body.name ?? null, req.body.isActive ?? null],
	);

	if (rowCount === 0) {
		throw notFound('DEVICE_NOT_FOUND', 'Device not found.');
	}

	await audit(null, {
		...adminActor(req),
		action: 'device.updated',
		entityType: 'device',
		entityId: id,
		reason: req.body.reason,
		details: { name: req.body.name, isActive: req.body.isActive },
	});

	await loadDevices();

	res.json({ ok: true });
});

lockersAdminRouter.get('/devices/:id/events', async (req, res) => {
	const { rows } = await query(
		`
		select id, boot_id, seq, type, slot, session_id, data, device_uptime_ms, received_at
		from device_events
		where device_id = $1
		order by received_at desc
		limit 200
		`,
		[String(req.params.id)],
	);

	res.json({ events: rows });
});
