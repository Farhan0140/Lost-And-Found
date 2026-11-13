/**
 * Photos of a draft live ONLY in this browser (IndexedDB) — never on the server.
 * They survive a page reload, so a draft that is "Waiting for AI" can continue later.
 *
 *     await savePhotos(reportId, photos);
 *     const photos = await loadPhotos(reportId);
 *     await deletePhotos(reportId);
 */

import { createStore, del, get, keys, set } from 'idb-keyval';

const store = createStore('smartfind', 'draft-photos');

const keyFor = (reportId) => `photos:${reportId}`;

export async function savePhotos(reportId, photos) {
	try {
		// previewUrl is rebuilt from data on load — no need to store it twice
		const compact = photos.map(({ previewUrl, ...photo }) => photo);

		await set(keyFor(reportId), { savedAt: Date.now(), photos: compact }, store);
	} catch {
		// IndexedDB blocked (private mode): photos stay in memory for this visit only
	}
}

export async function loadPhotos(reportId) {
	try {
		const entry = await get(keyFor(reportId), store);

		return (entry?.photos ?? []).map((photo) => ({
			...photo,
			previewUrl: `data:${photo.mimeType};base64,${photo.data}`,
		}));
	} catch {
		return [];
	}
}

export async function deletePhotos(reportId) {
	try {
		await del(keyFor(reportId), store);
	} catch {
		// nothing to clean up
	}
}

/** Drop photos older than 8 days (drafts expire after 7). Called once at start-up. */
export async function cleanupOldPhotos() {
	try {
		const limit = Date.now() - 8 * 24 * 60 * 60 * 1000;

		for (const key of await keys(store)) {
			const entry = await get(key, store);

			if (!entry || entry.savedAt < limit) {
				await del(key, store);
			}
		}
	} catch {
		// ignore
	}
}
