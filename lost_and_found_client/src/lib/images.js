/**
 * Photo preparation — runs entirely in the browser.
 *
 *   - resizes so the longest side is at most 1024 px (the server rejects bigger)
 *   - re-encodes as JPEG through a <canvas>, which drops ALL metadata
 *     (EXIF, GPS location, camera serial) — nothing personal leaves the device
 *   - respects the phone's rotation flag before dropping it
 *
 * Result: { id, role, mimeType: 'image/jpeg', data: <base64 without prefix>, previewUrl, bytes }
 */

export const MAX_SIDE = 1024;
const JPEG_QUALITY = 0.85;

/** Roles the backend accepts (src/modules/reports/images.js). */
export const IMAGE_ROLES = [
	{ value: 'overview', label: 'Whole item' },
	{ value: 'detail', label: 'Close-up detail' },
	{ value: 'brand_label', label: 'Brand / logo' },
	{ value: 'damage', label: 'Damage / marks' },
	{ value: 'contents', label: 'Contents / inside' },
];

async function loadBitmap(file) {
	// imageOrientation: 'from-image' applies the EXIF rotation, so the photo is upright.
	if ('createImageBitmap' in window) {
		try {
			return await createImageBitmap(file, { imageOrientation: 'from-image' });
		} catch {
			// some formats (HEIC on desktop) fail here — fall back to <img>
		}
	}

	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new Image();

		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};

		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error(`"${file.name}" is not an image this browser can read.`));
		};

		image.src = url;
	});
}

/** File → prepared photo. */
export async function preparePhoto(file, role = 'overview') {
	if (!file.type.startsWith('image/')) {
		throw new Error(`"${file.name}" is not an image.`);
	}

	const bitmap = await loadBitmap(file);

	const width = bitmap.width;
	const height = bitmap.height;
	const scale = Math.min(1, MAX_SIDE / Math.max(width, height));

	const canvas = document.createElement('canvas');
	canvas.width = Math.round(width * scale);
	canvas.height = Math.round(height * scale);

	const context = canvas.getContext('2d');
	context.imageSmoothingQuality = 'high';
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

	bitmap.close?.();

	const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
	const data = dataUrl.slice(dataUrl.indexOf(',') + 1);

	return {
		id: crypto.randomUUID(),
		role,
		mimeType: 'image/jpeg',
		data,
		previewUrl: dataUrl,
		bytes: Math.round((data.length * 3) / 4),
		width: canvas.width,
		height: canvas.height,
	};
}

/** What the API expects for each image. */
export function toApiImages(photos) {
	return photos.map(({ role, mimeType, data }) => ({ role, mimeType, data }));
}
