/**
 * Swagger docs: /device/*  (ESP32 kiosk only — X-Device-Id + X-Device-Secret headers)
 */

import {
	ackSchema,
	eventsSchema,
	heartbeatSchema,
	helloSchema,
	verifySchema,
} from '../../modules/devices/device.routes.js';
import { operation, pathParam, ref } from '../builders.js';
import * as examples from '../examples.js';

const EVENT_TYPES = [
	'`boot` — the ESP32 started',
	'`unlocked` / `locked` — servo moved',
	'`door_opened` / `door_closed` — door switch changed',
	'`item_detected` / `item_removed` — IR sensor changed',
	'**`door_closed_settled` { itemPresent }** — IR reading stable for 3 s after the door closed. **This decides the outcome**: the server marks the item stored / collected, or the attempt failed.',
	'`door_open_too_long` — door open past the warning time',
	'`error` — a hardware problem worth logging (put the details in `data`)',
];

export const devicePaths = {
	'/device/hello': {
		post: operation({
			id: 'deviceHello',
			tag: 'Device (ESP32)',
			summary: 'Handshake: setup-portal "Check Connection" and at every boot',
			description:
				'Returns the timing the firmware must use and the lockers it drives. A 401 / 404 here means the ID or secret in the setup portal is wrong.',
			auth: 'device',
			body: helloSchema,
			bodyExample: { firmware: '1.0.0', bootId: 'a1b2c3d4' },
			ok: { schema: ref('DeviceHello'), example: examples.deviceHello },
		}),
	},

	'/device/poll': {
		get: operation({
			id: 'devicePoll',
			tag: 'Device (ESP32)',
			summary: 'Every 1 s: pending commands + keypad lockout (answered from memory)',
			description:
				'Commands (e.g. an admin force-open) are repeated on every poll until the device calls **/device/commands/{id}/ack**. Poll lines are hidden from the server log unless `LOG_DEVICE_POLLS=true`.',
			auth: 'device',
			ok: { schema: ref('DevicePoll'), example: examples.devicePoll },
		}),
	},

	'/device/heartbeat': {
		post: operation({
			id: 'deviceHeartbeat',
			tag: 'Device (ESP32)',
			summary: 'Every 30 s: uptime, Wi-Fi signal and the sensor state of every locker',
			description: 'The device counts as offline after 90 s without a poll or heartbeat.',
			auth: 'device',
			body: heartbeatSchema,
			bodyExample: examples.heartbeatBody,
			ok: {
				schema: {
					type: 'object',
					properties: {
						ok: { type: 'boolean' },
						serverTime: { type: 'string', format: 'date-time' },
					},
				},
				example: { ok: true, serverTime: '2026-11-13T11:11:20.206Z' },
			},
		}),
	},

	'/device/otp/verify': {
		post: operation({
			id: 'deviceVerifyOtp',
			tag: 'Device (ESP32)',
			summary: 'A 6-digit code was typed on the keypad (# pressed)',
			description: [
				'Always **200** — check `ok`.',
				'',
				'- `ok: true` → unlock `slot`, show `lockerLabel` on the LCD, and send the door / IR events with `sessionId`.',
				'- `ok: false` → show the reason. After 5 wrong codes in 60 s the keypad is locked for 5 minutes (`LOCKED`).',
				'',
				'Codes are single-use: a used code is rejected the second time.',
			].join('\n'),
			auth: 'device',
			body: verifySchema,
			bodyExample: { code: '575926' },
			ok: {
				schema: ref('KioskVerifyResult'),
				example: {
					ok: true,
					slot: 1,
					lockerLabel: 'L1',
					action: 'deposit',
					sessionId: '53a76277-f09d-4135-a47a-3aa863c11f3b',
				},
			},
		}),
	},

	'/device/events': {
		post: operation({
			id: 'deviceEvents',
			tag: 'Device (ESP32)',
			summary: 'Door / IR / servo events — batched and safe to re-send',
			description: [
				'Each event has a `seq` number that increases per boot (`bootId`). The response lists the `acked` seq numbers — delete those from the queue and re-send the rest. Re-sent events are not processed twice.',
				'',
				'Event types:',
				'',
				...EVENT_TYPES.map((line) => `- ${line}`),
			].join('\n'),
			auth: 'device',
			body: eventsSchema,
			bodyExample: examples.eventsBody,
			ok: {
				schema: {
					type: 'object',
					properties: { acked: { type: 'array', items: { type: 'integer' } } },
				},
				example: { acked: [1, 2, 3, 4, 5, 6] },
			},
		}),
	},

	'/device/commands/{id}/ack': {
		post: operation({
			id: 'deviceAckCommand',
			tag: 'Device (ESP32)',
			summary: 'Report that a command (force-open) was executed',
			auth: 'device',
			params: [pathParam('id', 'Command ID from /device/poll')],
			body: ackSchema,
			bodyExample: { ok: true, message: 'L2 opened' },
			ok: { schema: ref('Ok') },
		}),
	},
};
