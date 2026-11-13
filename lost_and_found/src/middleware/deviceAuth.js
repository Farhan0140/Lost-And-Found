/**
 * Device authentication for /api/v1/device/* (ESP32 only).
 *
 * Headers (over HTTPS):
 *     X-Device-Id:     KIOSK-01
 *     X-Device-Secret: sfd_…
 *
 * The secret is compared with the SHA-256 stored in `devices` (cached in memory).
 * Error codes match the statuses shown in the ESP32 setup portal:
 *     404 DEVICE_NOT_REGISTERED · 401 INVALID_DEVICE_CREDENTIALS · 403 DEVICE_DISABLED
 */

import { safeEqualHex, sha256Hex } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { getDeviceState, loadDevices, touchDevice } from '../modules/devices/deviceState.js';

export async function requireDevice(req, res, next) {
	const deviceId = String(req.headers['x-device-id'] ?? '').trim();
	const secret = String(req.headers['x-device-secret'] ?? '').trim();

	if (!deviceId || !secret) {
		throw new AppError(
			401,
			'INVALID_DEVICE_CREDENTIALS',
			'X-Device-Id and X-Device-Secret headers are required.',
		);
	}

	let state = getDeviceState(deviceId);

	// A device registered a moment ago may not be cached yet.
	if (!state) {
		await loadDevices();
		state = getDeviceState(deviceId);
	}

	if (!state) {
		throw new AppError(
			404,
			'DEVICE_NOT_REGISTERED',
			`Device "${deviceId}" is not registered on this server.`,
		);
	}

	if (!safeEqualHex(state.secretHash, sha256Hex(secret))) {
		throw new AppError(401, 'INVALID_DEVICE_CREDENTIALS', 'The device secret is wrong.');
	}

	if (!state.isActive) {
		throw new AppError(
			403,
			'DEVICE_DISABLED',
			'This device has been disabled by an administrator.',
		);
	}

	req.device = { id: state.id, name: state.name };

	touchDevice(state.id, req.ip);

	next();
}
