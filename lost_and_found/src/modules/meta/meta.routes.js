/**
 * /api/v1/meta — read-only reference data.
 *
 *   GET /zones                      campus zones (public)
 *   GET /categories                 20 categories (public)
 *   GET /lockers                    locker grid: labels + states only (public, for the 3D view)
 *   GET /rules                      timeouts and limits the UI needs to explain (public)
 *   GET /question-sets/:categoryId  ACTIVE set without match weights (login required)
 *
 * Fetching a question set never calls AI (§7.1).
 */

import { Router } from 'express';
import { z } from 'zod';

import { RULES } from '../../config/rules.js';
import { query } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { publicLockerGrid } from '../lockers/lockers.service.js';
import { toPublicQuestionSet } from '../questionSets/questionSet.schema.js';

export const metaRouter = Router();

metaRouter.get('/zones', async (req, res) => {
	const { rows } = await query(
		`
		select id, name, department, building
		from campus_zones
		where is_active
		order by sort_order, name
		`,
	);

	res.json({ zones: rows });
});

metaRouter.get('/categories', async (req, res) => {
	const { rows } = await query(
		`
		select c.id, c.slug, c.name, c.icon, c.is_fully_written as "fullyWritten",
		       exists (select 1 from question_sets q where q.category_id = c.id and q.status = 'active') as "hasActiveSet"
		from categories c
		order by c.sort_order
		`,
	);

	res.json({ categories: rows });
});

metaRouter.get('/lockers', async (req, res) => {
	res.json({ lockers: await publicLockerGrid() });
});

metaRouter.get('/rules', (req, res) => {
	res.json({
		depositOtpMinutes: RULES.depositOtpTtlMs / 60000,
		collectOtpMinutes: RULES.collectOtpTtlMs / 60000,
		depositGenerationLimit: RULES.depositGenerationLimit,
		collectGenerationLimit: RULES.collectGenerationLimit,
		matchHoldHours: RULES.matchHoldMs / 3_600_000,
		draftsPerDay: RULES.draftsPerDay,
		maxUnfinishedDrafts: RULES.maxUnfinishedDrafts,
		draftExpiryDays: RULES.draftIdleExpiryMs / 86_400_000,
		minPhotos: RULES.minPhotos,
		maxPhotos: RULES.maxPhotos,
		unclaimedAfterDays: RULES.unclaimedAfterMs / 86_400_000,
		autoMatchThreshold: RULES.autoMatchThreshold,
		reviewThreshold: RULES.reviewThreshold,
	});
});

metaRouter.get('/question-sets/:categoryId', requireAuth, async (req, res) => {
	const categoryId = z.coerce.number().int().positive().safeParse(req.params.categoryId);

	if (!categoryId.success) {
		throw notFound('QUESTION_SET_NOT_FOUND', 'Unknown category.');
	}

	const { rows } = await query(
		`select * from question_sets where category_id = $1 and status = 'active'`,
		[categoryId.data],
	);

	if (!rows[0]) {
		throw notFound('QUESTION_SET_NOT_FOUND', 'This category has no active question set yet.');
	}

	res.json({ questionSet: toPublicQuestionSet(rows[0]) });
});
