/**
 * Photo handling (D6, §7.2).
 *
 *   - Photos arrive as base64 JSON (the browser already resized them to ≤ 1024 px and
 *     stripped EXIF/location).
 *   - The SERVER computes the SHA-256 of each image (the client's value is never trusted).
 *   - The bytes are passed to Gemini inline and then simply dropped: they are never
 *     written to the database, a file or a log.
 */

import { z } from 'zod';

import { RULES } from '../../config/rules.js';
import { sha256Hex } from '../../lib/crypto.js';
import { badRequest } from '../../lib/errors.js';
import { parseOrThrow } from '../../middleware/validate.js';

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

export const IMAGE_ROLES = ['overview', 'detail', 'brand_label', 'damage', 'contents'];

export const imageSchema = z.object({
	role: z.enum(IMAGE_ROLES),
	mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
	data: z.string().min(100, 'image data is empty'),
});

/**
 * Validates and hashes uploaded images.
 * @returns {Array<{ role, mimeType, data, hash }>}
 */
export function prepareImages(images, { min = RULES.minPhotos, max = RULES.maxPhotos } = {}) {
	const list = parseOrThrow(z.array(imageSchema).max(max, `at most ${max} photos`), images ?? []);

	if (list.length < min) {
		throw badRequest(
			'NOT_ENOUGH_PHOTOS',
			`Please add at least ${min} photos showing different sides of the item.`,
		);
	}

	return list.map((image) => {
		// strip a "data:image/jpeg;base64," prefix if the client left it on
		const data = image.data.replace(/^data:[^;]+;base64,/, '');
		const bytes = Buffer.from(data, 'base64');

		if (bytes.length > MAX_IMAGE_BYTES) {
			throw badRequest(
				'PHOTO_TOO_LARGE',
				'A photo is too large. Photos must be resized to 1024 px.',
			);
		}

		return {
			role: image.role,
			mimeType: image.mimeType,
			data,
			hash: sha256Hex(bytes),
		};
	});
}

/** One key for the whole set of photos (order does not matter). */
export function imagesKey(images) {
	return sha256Hex(
		images
			.map((image) => image.hash)
			.sort()
			.join('|'),
	);
}
