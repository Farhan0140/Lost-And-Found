/**
 * /api/v1/admin — everything here needs an ADMIN login.
 *
 *   GET /overview                 dashboard numbers + lockers + AI health + pending drafts
 *   GET /ai/health                key slots (by number only), models, last errors
 *   /matches/*                    review queue
 *   /reports/*  /overflow/*       reports and oversize items
 *   /lockers/*  /devices/*        lockers, force-open, devices
 *   /university-students/*        dummy university database (CRUD)
 *   /users/*                      accounts, roles, password resets
 *   /zones/*                      campus zones
 *   /question-sets/*              frozen question sets
 *   /audit/*                      audit log
 */

import { Router } from 'express';

import { query } from '../../db/pool.js';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { getAiHealth } from '../ai/keyPool.js';
import { listLockers } from '../lockers/lockers.service.js';
import { auditAdminRouter } from './audit.admin.routes.js';
import { lockersAdminRouter } from './lockers.admin.routes.js';
import { questionSetsAdminRouter } from './questionSets.admin.routes.js';
import { reportsAdminRouter } from './reports.admin.routes.js';
import { reviewAdminRouter } from './review.admin.routes.js';
import { universityAdminRouter } from './university.admin.routes.js';
import { usersAdminRouter } from './users.admin.routes.js';
import { zonesAdminRouter } from './zones.admin.routes.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

async function pendingDraftCounts() {
	const { rows } = await query(
		`
		select
			count(*) filter (where status = 'draft') as drafts,
			count(*) filter (where status = 'draft' and ai_status = 'waiting') as waiting_for_ai
		from reports
		`,
	);

	return { drafts: rows[0].drafts, waitingForAi: rows[0].waiting_for_ai };
}

adminRouter.get('/overview', async (req, res) => {
	const { rows } = await query(
		`
		select
			(select count(*) from users where role = 'student') as students,
			(select count(*) from reports where kind = 'found' and status = 'stored') as stored_items,
			(select count(*) from reports where kind = 'lost' and status = 'open') as open_lost_reports,
			(select count(*) from reports where status = 'awaiting_locker') as locker_queue,
			(select count(*) from matches where status = 'review') as review_queue,
			(select count(*) from matches where status in ('auto_matched', 'approved', 'otp_issued')) as live_matches,
			(select count(*) from reports where kind = 'found' and status = 'collected') as returned_items,
			(select count(*) from overflow_reports where status = 'open') as open_overflow,
			(select count(*) from reports where status = 'unclaimed_expired') as unclaimed_items
		`,
	);

	const recent = await query(
		`
		select id, at, actor_type, action, entity_type, entity_id, reason
		from audit_log
		order by id desc
		limit 12
		`,
	);

	res.json({
		counts: rows[0],
		drafts: await pendingDraftCounts(),
		lockers: await listLockers(),
		ai: getAiHealth(),
		recentActivity: recent.rows,
	});
});

adminRouter.get('/ai/health', async (req, res) => {
	res.json({ ...getAiHealth(), drafts: await pendingDraftCounts() });
});

adminRouter.use('/matches', reviewAdminRouter);
adminRouter.use('/', reportsAdminRouter);
adminRouter.use('/', lockersAdminRouter);
adminRouter.use('/university-students', universityAdminRouter);
adminRouter.use('/users', usersAdminRouter);
adminRouter.use('/zones', zonesAdminRouter);
adminRouter.use('/question-sets', questionSetsAdminRouter);
adminRouter.use('/audit', auditAdminRouter);
