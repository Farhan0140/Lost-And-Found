/**
 * /api/v1/notifications — in-app notifications (login required).
 *
 *   GET  /               ?before=<ISO date>&limit=30
 *   GET  /unread-count   polled by the web client every ~20 s
 *   POST /:id/read
 *   POST /read-all
 */

import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import { validateQuery } from '../../middleware/validate.js';
import { countUnread, listNotifications, markAllRead, markRead } from './notifications.service.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

export const listSchema = z.object({
	before: z.iso.datetime().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(30),
});

notificationsRouter.get('/', validateQuery(listSchema), async (req, res) => {
	res.json({ notifications: await listNotifications(req.user.id, req.validQuery) });
});

notificationsRouter.get('/unread-count', async (req, res) => {
	res.json({ unread: await countUnread(req.user.id) });
});

notificationsRouter.post('/read-all', async (req, res) => {
	await markAllRead(req.user.id);

	res.json({ ok: true });
});

notificationsRouter.post('/:id/read', async (req, res) => {
	const parsed = z.uuid().safeParse(req.params.id);

	if (parsed.success) {
		await markRead(req.user.id, parsed.data);
	}

	res.json({ ok: true });
});
