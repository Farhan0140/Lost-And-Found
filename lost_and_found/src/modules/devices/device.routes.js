/**
 * /api/v1/device — used ONLY by the ESP32 (headers X-Device-Id + X-Device-Secret).
 *
 *   POST /hello                   setup portal "Check Connection" + boot handshake
 *   GET  /poll                    every 1 s — answered from memory (D7)
 *   POST /heartbeat               every 30 s — uptime, Wi-Fi signal, sensor states
 *   POST /otp/verify              { code } typed on the keypad
 *   POST /events                  { bootId, events: [...] } — batched, re-sendable
 *   POST /commands/:id/ack        { ok, message } after executing a command
 */

import { Router } from 'express';
import { z } from 'zod';

import { RULES } from '../../config/rules.js';
import { query } from '../../db/pool.js';
import { requireDevice } from '../../middleware/deviceAuth.js';
import { validateBody } from '../../middleware/validate.js';
import {
	acknowledgeCommand,
	markCommandsSent,
	receiveEvents,
	receiveHeartbeat,
	verifyKioskCode,
} from './deviceEvents.service.js';
import { kioskLockedForMs, peekCommands } from './deviceState.js';

export const deviceRouter = Router();

deviceRouter.use(requireDevice);

// ─────────────────────────────────────────────────────────────
//  Schemas
// ─────────────────────────────────────────────────────────────

const sensorReading = z.object({
	slot: z.number().int().min(1).max(16),
	doorClosed: z.boolean().nullable().optional(),
	itemPresent: z.boolean().nullable().optional(),
	servoLocked: z.boolean().nullable().optional(),
});

export const helloSchema = z.object({
	firmware: z.string().max(40).optional(),
	bootId: z.string().max(40).optional(),
});

export const heartbeatSchema = z.object({
	bootId: z.string().max(40).optional(),
	uptimeMs: z.number().nonnegative().optional(),
	rssi: z.number().optional(),
	freeHeap: z.number().nonnegative().optional(),
	firmware: z.string().max(40).optional(),
	lockers: z.array(sensorReading).max(16).optional(),
});

export const verifySchema = z.object({
	code: z.string().regex(/^\d{6}$/, 'the code must be exactly 6 digits'),
});

export const eventsSchema = z.object({
	bootId: z.string().min(1).max(40),
	events: z
		.array(
			z.object({
				seq: z.number().int().nonnegative(),
				type: z.string().min(1).max(40),
				slot: z.number().int().min(1).max(16).nullable().optional(),
				sessionId: z.uuid().nullable().optional(),
				uptimeMs: z.number().nonnegative().optional(),
				data: z.record(z.string(), z.any()).optional(),
			}),
		)
		.max(50),
});

export const ackSchema = z.object({
	ok: z.boolean(),
	message: z.string().max(200).optional(),
});

// ─────────────────────────────────────────────────────────────
//  Routes
// ─────────────────────────────────────────────────────────────

deviceRouter.post('/hello', validateBody(helloSchema), async (req, res) => {
	if (req.body.firmware) {
		await query(
			'update devices set firmware_version = $2, last_seen_at = now() where id = $1',
			[req.device.id, req.body.firmware],
		);
	}

	const { rows } = await query(
		'select slot, label, status from lockers where device_id = $1 order by slot',
		[req.device.id],
	);

	res.json({
		authorized: true,
		deviceId: req.device.id,
		name: req.device.name,
		serverTime: new Date().toISOString(),
		pollIntervalMs: RULES.devicePollIntervalMs,
		heartbeatIntervalMs: RULES.deviceHeartbeatIntervalMs,
		doorOpenWarningMs: 45_000,
		doorOpenUnresolvedMs: RULES.doorOpenUnresolvedMs,
		settleMs: RULES.deviceSettleMs,
		lockers: rows,
	});
});

deviceRouter.get('/poll', async (req, res) => {
	const commands = peekCommands(req.device.id);

	const fresh = commands.filter((command) => !command.sentAt);

	for (const command of fresh) {
		command.sentAt = Date.now();
	}

	// Only touches the database when there is actually a new command to send.
	await markCommandsSent(fresh.map((command) => command.id));

	res.json({
		serverTime: new Date().toISOString(),
		kioskLockedForSeconds: Math.ceil(kioskLockedForMs(req.device.id) / 1000),
		commands: commands.map((command) => ({
			id: command.id,
			type: command.type,
			slot: command.slot,
		})),
	});
});

deviceRouter.post('/heartbeat', validateBody(heartbeatSchema), async (req, res) => {
	await receiveHeartbeat(req.device.id, req.body);

	res.json({ ok: true, serverTime: new Date().toISOString() });
});

deviceRouter.post('/otp/verify', validateBody(verifySchema), async (req, res) => {
	res.json(await verifyKioskCode(req.device.id, req.body.code));
});

deviceRouter.post('/events', validateBody(eventsSchema), async (req, res) => {
	const acked = await receiveEvents(req.device.id, req.body.bootId, req.body.events);

	res.json({ acked });
});

deviceRouter.post('/commands/:id/ack', validateBody(ackSchema), async (req, res) => {
	const id = z.uuid().safeParse(req.params.id);

	if (id.success) {
		await acknowledgeCommand(req.device.id, id.data, req.body);
	}

	res.json({ ok: true });
});
