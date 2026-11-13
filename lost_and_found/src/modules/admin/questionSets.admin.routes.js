/**
 * /api/v1/admin/question-sets — frozen, versioned question sets (D1, §7.1).
 *
 *   GET    /                    ?categoryId   all versions (draft / active / retired)
 *   GET    /:id                 full set INCLUDING match_weight
 *   POST   /                    { categoryId, questions, aspects, notes? }   → new DRAFT
 *   POST   /generate            { categoryId }  → AI drafts a set (capable model) → DRAFT
 *   PUT    /:id                 edit a DRAFT (active sets are frozen)
 *   POST   /:id/activate        { reason } — retires the previous active set in the same transaction
 *   DELETE /:id                 delete a DRAFT
 *
 * A set is NEVER auto-activated: a human reviews it first.
 */

import { Router } from 'express';
import { z } from 'zod';

import { query, withTransaction } from '../../db/pool.js';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors.js';
import { parseOrThrow, validateBody } from '../../middleware/validate.js';
import { AiStepFailedError } from '../ai/aiErrors.js';
import { draftQuestionSet } from '../ai/questionSetGenerator.js';
import { audit } from '../audit/audit.service.js';
import { normalizeQuestionSet, questionSetSchema } from '../questionSets/questionSet.schema.js';
import { adminActor, intParam, reasonBody } from './common.js';

export const questionSetsAdminRouter = Router();

export const createSchema = z.object({
	categoryId: z.number().int().positive(),
	questions: z.array(z.any()),
	aspects: z.array(z.any()),
	notes: z.string().max(500).optional(),
});

export const updateSchema = createSchema.omit({ categoryId: true });

export const generateSchema = z.object({
	categoryId: z.number().int().positive(),
});

function validateSet(body) {
	const normalized = normalizeQuestionSet({ questions: body.questions, aspects: body.aspects });

	const set = parseOrThrow(questionSetSchema, normalized);

	const total = set.questions.reduce((sum, question) => sum + question.match_weight, 0);

	if (Math.abs(total - 1) > 0.05) {
		throw badRequest(
			'WEIGHTS_DO_NOT_SUM',
			`Match weights sum to ${total.toFixed(2)}; they should sum to about 1.00.`,
		);
	}

	return set;
}

async function nextVersion(client, categoryId) {
	const { rows } = await client.query(
		'select coalesce(max(version), 0) + 1 as version from question_sets where category_id = $1',
		[categoryId],
	);

	return rows[0].version;
}

questionSetsAdminRouter.get('/', async (req, res) => {
	const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;

	const { rows } = await query(
		`
		select q.id, q.category_id, q.version, q.status, q.source, q.ai_model, q.notes,
		       q.created_at, q.activated_at,
		       jsonb_array_length(q.questions) as question_count,
		       jsonb_array_length(q.aspects) as aspect_count,
		       c.name as category_name, c.slug as category_slug,
		       (select count(*) from reports r where r.question_set_id = q.id) as report_count
		from question_sets q
		join categories c on c.id = q.category_id
		where ($1::int is null or q.category_id = $1)
		order by c.sort_order, q.version desc
		`,
		[Number.isFinite(categoryId) ? categoryId : null],
	);

	res.json({ questionSets: rows });
});

questionSetsAdminRouter.get('/:id', async (req, res) => {
	const { rows } = await query(
		`
		select q.*, c.name as category_name, c.slug as category_slug
		from question_sets q
		join categories c on c.id = q.category_id
		where q.id = $1
		`,
		[intParam(req, 'id', 'Question set')],
	);

	if (!rows[0]) {
		throw notFound('QUESTION_SET_NOT_FOUND', 'Question set not found.');
	}

	res.json({ questionSet: rows[0] });
});

questionSetsAdminRouter.post('/', validateBody(createSchema), async (req, res) => {
	const set = validateSet(req.body);

	const created = await withTransaction(async (client) => {
		const version = await nextVersion(client, req.body.categoryId);

		const { rows } = await client.query(
			`
			insert into question_sets (category_id, version, status, questions, aspects, source, notes, created_by)
			values ($1, $2, 'draft', $3, $4, 'manual', $5, $6)
			returning id, version
			`,
			[
				req.body.categoryId,
				version,
				JSON.stringify(set.questions),
				JSON.stringify(set.aspects),
				req.body.notes ?? null,
				req.user.id,
			],
		);

		await audit(client, {
			...adminActor(req),
			action: 'question_set.draft_created',
			entityType: 'question_set',
			entityId: rows[0].id,
			details: { categoryId: req.body.categoryId, version },
		});

		return rows[0];
	});

	res.status(201).json(created);
});

questionSetsAdminRouter.post('/generate', validateBody(generateSchema), async (req, res) => {
	const category = await query('select id, name from categories where id = $1', [
		req.body.categoryId,
	]);

	if (!category.rows[0]) {
		throw notFound('CATEGORY_NOT_FOUND', 'Category not found.');
	}

	let draft;

	try {
		draft = await draftQuestionSet(category.rows[0].name);
	} catch (error) {
		if (error instanceof AiStepFailedError) {
			throw new AppError(
				503,
				'AI_UNAVAILABLE',
				`The AI could not draft a set: ${error.reason}.`,
			);
		}

		throw error;
	}

	const created = await withTransaction(async (client) => {
		const version = await nextVersion(client, req.body.categoryId);

		const { rows } = await client.query(
			`
				insert into question_sets
					(category_id, version, status, questions, aspects, source, ai_model, notes, created_by)
				values ($1, $2, 'draft', $3, $4, 'ai', $5, 'AI draft — review every question before activating', $6)
				returning id, version
				`,
			[
				req.body.categoryId,
				version,
				JSON.stringify(draft.questions),
				JSON.stringify(draft.aspects),
				draft.model,
				req.user.id,
			],
		);

		await audit(client, {
			...adminActor(req),
			action: 'question_set.ai_draft_created',
			entityType: 'question_set',
			entityId: rows[0].id,
			details: { categoryId: req.body.categoryId, version, model: draft.model },
		});

		return rows[0];
	});

	res.status(201).json(created);
});

questionSetsAdminRouter.put('/:id', validateBody(updateSchema), async (req, res) => {
	const id = intParam(req, 'id', 'Question set');
	const set = validateSet(req.body);

	const { rowCount } = await query(
		`
		update question_sets
		set questions = $2, aspects = $3, notes = coalesce($4, notes)
		where id = $1 and status = 'draft'
		`,
		[id, JSON.stringify(set.questions), JSON.stringify(set.aspects), req.body.notes ?? null],
	);

	if (rowCount === 0) {
		throw conflict(
			'NOT_A_DRAFT',
			'Only DRAFT sets can be edited. Active sets are frozen — create a new version.',
		);
	}

	await audit(null, {
		...adminActor(req),
		action: 'question_set.draft_edited',
		entityType: 'question_set',
		entityId: id,
	});

	res.json({ ok: true });
});

questionSetsAdminRouter.post('/:id/activate', validateBody(reasonBody), async (req, res) => {
	const id = intParam(req, 'id', 'Question set');

	await withTransaction(async (client) => {
		const { rows } = await client.query(
			'select * from question_sets where id = $1 for update',
			[id],
		);
		const set = rows[0];

		if (!set) {
			throw notFound('QUESTION_SET_NOT_FOUND', 'Question set not found.');
		}

		if (set.status !== 'draft') {
			throw conflict('NOT_A_DRAFT', `This set is already "${set.status}".`);
		}

		const retired = await client.query(
			`
			update question_sets
			set status = 'retired'
			where category_id = $1 and status = 'active'
			returning id, version
			`,
			[set.category_id],
		);

		await client.query(
			`
			update question_sets
			set status = 'active', activated_at = now(), activated_by = $2
			where id = $1
			`,
			[id, req.user.id],
		);

		await audit(client, {
			...adminActor(req),
			action: 'question_set.activated',
			entityType: 'question_set',
			entityId: id,
			reason: req.body.reason,
			details: {
				categoryId: set.category_id,
				version: set.version,
				retired: retired.rows.map((row) => row.id),
			},
		});
	});

	res.json({
		ok: true,
		note: 'New reports use this version. Existing reports keep their old version and only match each other.',
	});
});

questionSetsAdminRouter.delete('/:id', async (req, res) => {
	const id = intParam(req, 'id', 'Question set');

	const { rowCount } = await query(
		`
		delete from question_sets
		where id = $1 and status = 'draft'
		  and not exists (select 1 from reports where question_set_id = $1)
		`,
		[id],
	);

	if (rowCount === 0) {
		throw conflict('CANNOT_DELETE', 'Only unused DRAFT sets can be deleted.');
	}

	await audit(null, {
		...adminActor(req),
		action: 'question_set.draft_deleted',
		entityType: 'question_set',
		entityId: id,
	});

	res.json({ ok: true });
});
