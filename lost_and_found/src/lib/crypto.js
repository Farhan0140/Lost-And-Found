/**
 * All hashing, HMAC and encryption helpers.
 *
 *   - National IDs:    HMAC-SHA256 with NID_HMAC_KEY (never stored raw)
 *   - OTP codes:       HMAC-SHA256 with a key derived from JWT_SECRET
 *                      (+ AES-256-GCM copy so the SAME user can see the code again — Q6)
 *   - Refresh tokens:  SHA-256 (they are long random strings)
 *   - Device secrets:  SHA-256 (long random strings)
 *   - Images:          SHA-256 of the bytes (idempotency key only; bytes are discarded)
 */

import crypto from 'node:crypto';

import { config } from '../config/env.js';

// ─────────────────────────────────────────────────────────────
//  Basic hashes
// ─────────────────────────────────────────────────────────────

export function sha256Hex(input) {
	return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmacHex(key, message) {
	return crypto.createHmac('sha256', key).update(String(message)).digest('hex');
}

/** Constant-time comparison of two hex strings. */
export function safeEqualHex(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
		return false;
	}

	return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function randomToken(bytes = 32) {
	return crypto.randomBytes(bytes).toString('base64url');
}

// ─────────────────────────────────────────────────────────────
//  National ID
// ─────────────────────────────────────────────────────────────

/** Removes spaces and dashes so "1234 567-890" and "1234567890" hash the same. */
export function normalizeNationalId(nationalId) {
	return String(nationalId ?? '').replace(/[\s-]/g, '');
}

export function hashNationalId(nationalId) {
	return hmacHex(config.nidHmacKey, normalizeNationalId(nationalId));
}

// ─────────────────────────────────────────────────────────────
//  OTP codes
// ─────────────────────────────────────────────────────────────

// Two separate keys derived from JWT_SECRET, so one leaked key cannot do both jobs.
const OTP_HASH_KEY = crypto
	.createHmac('sha256', config.jwtSecret)
	.update('smartfind/otp-hash')
	.digest();
const OTP_ENC_KEY = crypto
	.createHmac('sha256', config.jwtSecret)
	.update('smartfind/otp-enc')
	.digest();

/** Random 6-digit code, e.g. "042917". */
export function generateOtpCode() {
	return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtpCode(code) {
	return hmacHex(OTP_HASH_KEY, code);
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encryptOtpCode(code) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', OTP_ENC_KEY, iv);

	const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();

	return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptOtpCode(payload) {
	try {
		const [iv, tag, ciphertext] = String(payload)
			.split('.')
			.map((part) => Buffer.from(part, 'base64url'));

		const decipher = crypto.createDecipheriv('aes-256-gcm', OTP_ENC_KEY, iv);
		decipher.setAuthTag(tag);

		return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
	} catch {
		// The key changed (JWT_SECRET rotated) or the value is corrupt.
		return null;
	}
}
