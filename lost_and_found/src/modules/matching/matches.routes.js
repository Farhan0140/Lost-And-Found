/**
 * /api/v1/matches — the OWNER's side of a match (login required).
 *
 *   GET  /:id               student view: score band + agree/conflict flags only
 *   POST /:id/collect-otp   owner: 5-minute collection code (max 5 per match)
 *   GET  /:id/otp           show the active collection code again
 */

import { Router } from 'express';
import { z } from 'zod';

import { query } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { getActiveOtp, issueCollectOtp } from '../otp/otp.service.js';
import { toStudentMatchView } from './matchView.js';

export const matchesRouter = Router();

matchesRouter.use(requireAuth);

/** Loads a match that the current user is a party to; returns { match, role }. */
async function loadOwnMatch(req) {
	const parsed = z.uuid().safeParse(req.params.id);

	if (!parsed.success) {
		throw notFound('MATCH_NOT_FOUND', 'Match not found.');
	}

	const { rows } = await query(
		`
		select m.*, l.user_id as owner_id, f.user_id as finder_id, qs.questions
		from matches m
		join reports l on l.id = m.lost_report_id
		join reports f on f.id = m.found_report_id
		join question_sets qs on qs.id = m.question_set_id
		where m.id = $1
		`,
		[parsed.data],
	);

	const match = rows[0];

	if (!match || (match.owner_id !== req.user.id && match.finder_id !== req.user.id)) {
		throw notFound('MATCH_NOT_FOUND', 'Match not found.');
	}

	return { match, role: match.owner_id === req.user.id ? 'owner' : 'finder' };
}

matchesRouter.get('/:id', async (req, res) => {
	const { match, role } = await loadOwnMatch(req);

	const questionTexts = new Map(match.questions.map((question) => [question.key, question.text]));

	res.json({ match: toStudentMatchView(match, { role, questionTexts }) });
});

matchesRouter.post('/:id/collect-otp', async (req, res) => {
	const { match } = await loadOwnMatch(req);

	res.status(201).json(await issueCollectOtp(req.user.id, match.id));
});

matchesRouter.get('/:id/otp', async (req, res) => {
	const { match } = await loadOwnMatch(req);

	res.json({ otp: await getActiveOtp(req.user.id, { matchId: match.id }) });
});
