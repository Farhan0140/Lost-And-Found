/**
 * /api/v1/live — Server-Sent Events stream with "what changed" messages (see live.hub.js).
 *
 *   GET /    with "Authorization: Bearer <access token>" → lockers + own reports/matches/notifications (+ admin)
 *            without a token                              → lockers only (public locker grid)
 *
 * Messages:
 *
 *     event: hello
 *     data: {"topics":[]}
 *
 *     event: change
 *     data: {"topics":["lockers","reports"]}
 *
 * The web client reads it with fetch() (not EventSource), because EventSource cannot
 * send the Authorization header.
 */

import { Router } from 'express';

import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { liveStats, openStream } from './live.hub.js';

export const liveRouter = Router();

/** Logged in → requireAuth (so an expired token gets the usual 401 TOKEN_EXPIRED); otherwise anonymous. */
function optionalAuth(req, res, next) {
	if (req.headers.authorization) {
		return requireAuth(req, res, next);
	}

	return next();
}

liveRouter.get('/', optionalAuth, (req, res) => {
	openStream(req, res, req.user ?? null);
});

/** Admin only: how many tabs are listening right now (for debugging). */
liveRouter.get('/stats', requireAuth, requireAdmin, (req, res) => {
	res.json(liveStats());
});
