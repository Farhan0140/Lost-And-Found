/**
 * Shared bits for admin routes.
 * Every admin decision requires a reason and is logged with the actor ID (§5.3).
 */

import { z } from 'zod';

import { notFound } from '../../lib/errors.js';

export const reason = z
	.string({ error: 'a reason is required' })
	.trim()
	.min(5, 'please give a reason (at least 5 characters)')
	.max(500);

export const reasonBody = z.object({ reason });

export const pagination = z.object({
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function adminActor(req) {
	return { actorType: 'admin', actorId: req.user.id };
}

export function uuidParam(req, name = 'id', label = 'Item') {
	const parsed = z.uuid().safeParse(req.params[name]);

	if (!parsed.success) {
		throw notFound('NOT_FOUND', `${label} not found.`);
	}

	return parsed.data;
}

export function intParam(req, name = 'id', label = 'Item') {
	const parsed = z.coerce.number().int().positive().safeParse(req.params[name]);

	if (!parsed.success) {
		throw notFound('NOT_FOUND', `${label} not found.`);
	}

	return parsed.data;
}
