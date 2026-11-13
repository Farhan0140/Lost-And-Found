/**
 * /api/v1/reports — a student's own reports (all routes need login).
 *
 *   GET    /                         ?tab=drafts|active|closed
 *   POST   /                         { kind: 'found'|'lost' }            → new draft
 *   GET    /:id                                                        → full view
 *   PATCH  /:id                      autosave { version, …fields }
 *   POST   /:id/extract              { images: [{ role, mimeType, data }], categoryId? }
 *   POST   /:id/followups/generate   { images? }
 *   PUT    /:id/followups/answers    { answers: [{ followupId, kind, code?, text? }] }
 *   POST   /:id/submit
 *   DELETE /:id                      discard a draft
 *   POST   /:id/cancel               cancel an open lost report / undeposited found item
 *   POST   /:id/deposit-otp          finder: reserve a locker + 30-min code
 *   GET    /:id/otp                  show the active code again (same user only)
 */

import { Router } from 'express';
import { z } from 'zod';

import { notFound } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { getActiveOtp, issueDepositOtp } from '../otp/otp.service.js';
import {
	answerFollowups,
	cancelReport,
	createDraft,
	discardDraft,
	extractPhotos,
	generateReportFollowups,
	loadOwnReport,
	submitReport,
	updateDraft,
} from './reports.service.js';
import { getReportView, listOwnReports } from './reports.view.js';
import { pool } from '../../db/pool.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

// ─────────────────────────────────────────────────────────────
//  Schemas
// ─────────────────────────────────────────────────────────────

const uuidParam = z.object({ id: z.uuid('invalid report id') });

export const createSchema = z.object({
	kind: z.enum(['found', 'lost']),
});

const answerValue = z.union([
	z.object({ codes: z.array(z.string().max(60)).max(20) }),
	z.object({ text: z.string().max(300) }),
	z.null(),
]);

export const updateSchema = z.object({
	version: z.number().int().positive(),
	path: z.enum(['photo', 'manual']).optional(),
	categoryId: z.number().int().positive().optional(),
	answers: z.record(z.string(), answerValue).optional(),
	occurredOn: z.iso.date('use the format YYYY-MM-DD').optional(),
	zoneId: z.number().int().positive().optional(),
	placeNote: z.string().max(200).nullable().optional(),
	fitsInLocker: z.boolean().optional(),
	draftStep: z.enum(['start', 'photos', 'answers', 'followups', 'review']).optional(),
});

export const extractSchema = z.object({
	images: z.array(z.any()).min(1).max(5),
	categoryId: z.number().int().positive().nullable().optional(),
});

export const generateSchema = z.object({
	images: z.array(z.any()).max(5).optional(),
});

export const followupAnswersSchema = z.object({
	answers: z
		.array(
			z.object({
				followupId: z.uuid(),
				kind: z.enum(['option', 'other', 'none', 'dont_remember']),
				code: z.string().max(60).optional(),
				text: z.string().max(200).optional(),
			}),
		)
		.min(1)
		.max(10),
});

export const listSchema = z.object({
	tab: z.enum(['drafts', 'active', 'closed']).default('active'),
});

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function reportId(req) {
	const parsed = uuidParam.safeParse(req.params);

	if (!parsed.success) {
		throw notFound('REPORT_NOT_FOUND', 'Report not found.');
	}

	return parsed.data.id;
}

async function sendOwnView(req, res, status = 200, extra = {}) {
	const id = reportId(req);

	await loadOwnReport(pool, req.user.id, id);

	const view = await getReportView(id, { viewer: 'owner' });

	res.status(status).json({ report: view, ...extra });
}

// ─────────────────────────────────────────────────────────────
//  Routes
// ─────────────────────────────────────────────────────────────

reportsRouter.get('/', validateQuery(listSchema), async (req, res) => {
	res.json({ reports: await listOwnReports(req.user.id, req.validQuery.tab) });
});

reportsRouter.post('/', validateBody(createSchema), async (req, res) => {
	const id = await createDraft(req.user.id, req.body.kind);

	res.status(201).json({ report: await getReportView(id, { viewer: 'owner' }) });
});

reportsRouter.get('/:id', async (req, res) => {
	await sendOwnView(req, res);
});

reportsRouter.patch('/:id', validateBody(updateSchema), async (req, res) => {
	await updateDraft(req.user.id, reportId(req), req.body);
	await sendOwnView(req, res);
});

reportsRouter.post('/:id/extract', validateBody(extractSchema), async (req, res) => {
	await extractPhotos(req.user.id, reportId(req), req.body);
	await sendOwnView(req, res);
});

reportsRouter.post('/:id/followups/generate', validateBody(generateSchema), async (req, res) => {
	const id = reportId(req);

	await loadOwnReport(pool, req.user.id, id);
	await generateReportFollowups(id, { images: req.body.images ?? [] });

	await sendOwnView(req, res);
});

reportsRouter.put(
	'/:id/followups/answers',
	validateBody(followupAnswersSchema),
	async (req, res) => {
		await answerFollowups(req.user.id, reportId(req), req.body.answers);
		await sendOwnView(req, res);
	},
);

reportsRouter.post('/:id/submit', async (req, res) => {
	const result = await submitReport(req.user.id, reportId(req));

	await sendOwnView(req, res, 200, {
		alreadySubmitted: result.alreadySubmitted,
		outcome: result.outcome ?? null,
	});
});

reportsRouter.delete('/:id', async (req, res) => {
	await discardDraft(req.user.id, reportId(req));

	res.json({ ok: true });
});

reportsRouter.post('/:id/cancel', async (req, res) => {
	await cancelReport(req.user.id, reportId(req));
	await sendOwnView(req, res);
});

reportsRouter.post('/:id/deposit-otp', async (req, res) => {
	const result = await issueDepositOtp(req.user.id, reportId(req));

	res.status(result.queued ? 202 : 201).json(result);
});

reportsRouter.get('/:id/otp', async (req, res) => {
	const id = reportId(req);

	await loadOwnReport(pool, req.user.id, id);

	res.json({ otp: await getActiveOtp(req.user.id, { reportId: id }) });
});
