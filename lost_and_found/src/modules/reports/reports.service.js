/**
 * Reports: drafts → AI steps → submit (§7.4, §7.5 rework — REVIEW_ANSWERS.md Part 3).
 *
 *   createDraft()              POST   /reports                  one row from the FIRST step
 *   updateDraft()              PATCH  /reports/:id              autosave (with version check)
 *   extractPhotos()            POST   /reports/:id/extract      AI: category + prefilled answers
 *   generateReportFollowups()  POST   /reports/:id/followups/generate
 *   answerFollowups()          PUT    /reports/:id/followups/answers
 *   submitReport()             POST   /reports/:id/submit       idempotent
 *   discardDraft()             DELETE /reports/:id
 *   cancelReport()             POST   /reports/:id/cancel
 *
 * If every AI key fails, nothing is lost: the draft is marked "Waiting for AI" with the
 * reason, and the user resumes later (manual-path drafts are completed automatically).
 */

import { config } from '../../config/env.js';
import { RULES } from '../../config/rules.js';
import { pool, query, withTransaction } from '../../db/pool.js';
import { AppError, badRequest, conflict, notFound, tooManyRequests } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { todayInCampus } from '../../lib/time.js';
import { AiStepFailedError } from '../ai/aiErrors.js';
import { extractFromPhotos } from '../ai/extraction.js';
import { generateFollowups } from '../ai/followups.js';
import { findPersonalData } from '../ai/piiFilter.js';
import { audit } from '../audit/audit.service.js';
import { canonicalize } from '../matching/canonicalize.js';
import { daysBetween } from '../matching/scoring.js';
import { matchLostReport, runInBackground } from '../matching/matching.service.js';
import { notifyAdmins } from '../notifications/notifications.service.js';
import { releaseReservedLocker } from '../lockers/lockers.service.js';
import {
	answersFromExtraction,
	applyAnswerChanges,
	missingAnswers,
	summarizeAnswers,
} from './answers.js';
import { processEmbeddings } from './embedding.service.js';
import { imagesKey, prepareImages } from './images.js';

const AI_WORKING_STALE_MS = 2 * 60 * 1000;
const MAX_DAYS_BACK = 90;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────
//  Loading helpers
// ─────────────────────────────────────────────────────────────

export async function loadOwnReport(db, userId, reportId, { forUpdate = false } = {}) {
	const { rows } = await db.query(
		`select * from reports where id = $1 and user_id = $2 ${forUpdate ? 'for update' : ''}`,
		[reportId, userId],
	);

	if (!rows[0]) {
		throw notFound('REPORT_NOT_FOUND', 'Report not found.');
	}

	return rows[0];
}

function assertDraft(report) {
	if (report.status !== 'draft') {
		throw conflict(
			'NOT_A_DRAFT',
			'This report was already submitted and can no longer be edited.',
		);
	}
}

export async function loadQuestionSet(db, questionSetId) {
	const { rows } = await db.query('select * from question_sets where id = $1', [questionSetId]);

	return rows[0] ?? null;
}

async function activeQuestionSetFor(db, categoryId) {
	const { rows } = await db.query(
		`select * from question_sets where category_id = $1 and status = 'active'`,
		[categoryId],
	);

	if (!rows[0]) {
		throw conflict(
			'NO_ACTIVE_QUESTION_SET',
			'This category has no active question set yet. Ask an admin.',
		);
	}

	return rows[0];
}

/** Every category with its ACTIVE question set (for photo extraction). */
async function categoriesWithActiveSets(db, onlyCategoryId = null) {
	const { rows } = await db.query(
		`
		select c.id, c.slug, c.name, qs.id as question_set_id, qs.questions
		from categories c
		join question_sets qs on qs.category_id = c.id and qs.status = 'active'
		where ($1::int is null or c.id = $1)
		order by c.sort_order
		`,
		[onlyCategoryId],
	);

	return rows;
}

// ─────────────────────────────────────────────────────────────
//  AI "working" flag — stops two tabs from paying for the same AI step
// ─────────────────────────────────────────────────────────────

async function claimAiWork(reportId) {
	const { rowCount } = await query(
		`
		update reports
		set ai_status = 'working'
		where id = $1
		  and (ai_status <> 'working' or updated_at < now() - ($2 || ' milliseconds')::interval)
		`,
		[reportId, String(AI_WORKING_STALE_MS)],
	);

	if (rowCount === 0) {
		throw conflict(
			'AI_BUSY',
			'The AI is already working on this report. Please wait a moment.',
		);
	}
}

async function markAiWaiting(reportId, step, error) {
	await query(
		`
		update reports
		set ai_status = 'waiting',
		    ai_waiting_step = $2,
		    ai_error = $3,
		    ai_failed_at = now(),
		    last_activity_at = now()
		where id = $1
		`,
		[reportId, step, error.reason ?? error.message],
	);
}

async function resetAiFlag(reportId) {
	await query(`update reports set ai_status = 'idle' where id = $1 and ai_status = 'working'`, [
		reportId,
	]);
}

function aiUnavailableError(step) {
	const what = step === 'extraction' ? 'read your photos' : 'write the follow-up questions';

	return new AppError(
		503,
		'AI_UNAVAILABLE',
		`The AI could not ${what} right now. Your draft is saved — you will be notified when you can continue.`,
		{ draftSaved: true, step },
	);
}

// ─────────────────────────────────────────────────────────────
//  Create
// ─────────────────────────────────────────────────────────────

export async function createDraft(userId, kind) {
	return withTransaction(async (client) => {
		// lock the user row so two parallel "new report" clicks cannot both pass the limits
		await client.query('select 1 from users where id = $1 for update', [userId]);

		const { rows } = await client.query(
			`
			select
				count(*) filter (where created_at >= (date_trunc('day', now() at time zone $2) at time zone $2)) as today,
				count(*) filter (where status = 'draft') as unfinished
			from reports
			where user_id = $1
			`,
			[userId, config.timezone],
		);

		if (rows[0].today >= RULES.draftsPerDay) {
			throw tooManyRequests(
				'DAILY_REPORT_LIMIT',
				`You can start at most ${RULES.draftsPerDay} reports per day. Please try again tomorrow.`,
			);
		}

		if (rows[0].unfinished >= RULES.maxUnfinishedDrafts) {
			throw conflict(
				'TOO_MANY_DRAFTS',
				`You already have ${RULES.maxUnfinishedDrafts} unfinished drafts. Finish or discard one first.`,
			);
		}

		const inserted = await client.query(
			`insert into reports (user_id, kind) values ($1, $2) returning id`,
			[userId, kind],
		);

		const reportId = inserted.rows[0].id;

		await audit(client, {
			actorType: 'user',
			actorId: userId,
			action: 'report.draft_created',
			entityType: 'report',
			entityId: reportId,
			details: { kind },
		});

		return reportId;
	});
}

// ─────────────────────────────────────────────────────────────
//  Autosave
// ─────────────────────────────────────────────────────────────

/**
 * @param changes { version, path, categoryId, answers, occurredOn, zoneId, placeNote, fitsInLocker, draftStep }
 * Only the fields present in `changes` are updated.
 */
export async function updateDraft(userId, reportId, changes) {
	return withTransaction(async (client) => {
		const report = await loadOwnReport(client, userId, reportId, { forUpdate: true });

		assertDraft(report);

		if (changes.version !== report.version) {
			throw conflict(
				'VERSION_CONFLICT',
				'This draft was changed somewhere else (another tab or device). Reload to see the latest version.',
				{ currentVersion: report.version },
			);
		}

		const next = {
			path: report.path,
			category_id: report.category_id,
			question_set_id: report.question_set_id,
			answers: report.answers,
			occurred_on: report.occurred_on,
			zone_id: report.zone_id,
			place_note: report.place_note,
			fits_in_locker: report.fits_in_locker,
			draft_step: report.draft_step,
		};

		if (changes.path !== undefined) {
			next.path = changes.path;
		}

		// ── category change: re-snapshot the set, clear answers and follow-ups (§7.2) ──
		if (changes.categoryId !== undefined && changes.categoryId !== report.category_id) {
			const questionSet = await activeQuestionSetFor(client, changes.categoryId);

			next.category_id = changes.categoryId;
			next.question_set_id = questionSet.id;
			next.answers = {};

			await client.query('delete from report_followups where report_id = $1', [reportId]);
		}

		if (changes.answers !== undefined) {
			if (!next.question_set_id) {
				throw badRequest(
					'CHOOSE_CATEGORY_FIRST',
					'Choose a category before answering questions.',
				);
			}

			const questionSet = await loadQuestionSet(client, next.question_set_id);

			next.answers = applyAnswerChanges(
				questionSet,
				next.answers,
				changes.answers,
				report.extraction,
			);
		}

		if (changes.occurredOn !== undefined) {
			validateOccurredOn(changes.occurredOn, report.kind);
			next.occurred_on = changes.occurredOn;
		}

		if (changes.zoneId !== undefined) {
			const zone = await client.query(
				'select 1 from campus_zones where id = $1 and is_active',
				[changes.zoneId],
			);

			if (zone.rowCount === 0) {
				throw badRequest('UNKNOWN_ZONE', 'Please choose a campus zone from the list.');
			}

			next.zone_id = changes.zoneId;
		}

		if (changes.placeNote !== undefined) {
			const note = String(changes.placeNote ?? '').trim();

			if (findPersonalData(note)) {
				throw badRequest(
					'PERSONAL_DATA_NOT_ALLOWED',
					'Please do not include names or numbers in the place note.',
				);
			}

			next.place_note = note || null;
		}

		if (changes.fitsInLocker !== undefined) {
			next.fits_in_locker = changes.fitsInLocker;
		}

		if (changes.draftStep !== undefined) {
			next.draft_step = changes.draftStep;
		}

		await client.query(
			`
			update reports
			set path = $2,
			    category_id = $3,
			    question_set_id = $4,
			    answers = $5,
			    occurred_on = $6,
			    zone_id = $7,
			    place_note = $8,
			    fits_in_locker = $9,
			    draft_step = $10,
			    version = version + 1,
			    last_activity_at = now(),
			    expiry_warned_at = null
			where id = $1
			`,
			[
				reportId,
				next.path,
				next.category_id,
				next.question_set_id,
				JSON.stringify(next.answers ?? {}),
				next.occurred_on,
				next.zone_id,
				next.place_note,
				next.fits_in_locker,
				next.draft_step,
			],
		);
	});
}

function validateOccurredOn(dateText, kind) {
	const today = todayInCampus();
	const daysAgo = daysBetween(dateText, today);

	if (daysAgo < 0) {
		throw badRequest(
			'DATE_IN_FUTURE',
			`The ${kind === 'found' ? 'found' : 'lost'} date cannot be in the future.`,
		);
	}

	if (daysAgo > MAX_DAYS_BACK) {
		throw badRequest('DATE_TOO_OLD', `The date must be within the last ${MAX_DAYS_BACK} days.`);
	}
}

// ─────────────────────────────────────────────────────────────
//  AI step 1 — photo extraction
// ─────────────────────────────────────────────────────────────

export async function extractPhotos(userId, reportId, { images, categoryId = null }) {
	const report = await loadOwnReport(pool, userId, reportId);

	assertDraft(report);

	const prepared = prepareImages(images);
	const key = imagesKey(prepared);

	// ── cache: same user + same photos within 24 h → no AI call, no re-billing ──
	const cached = await query(
		`
		select result
		from image_extractions
		where user_id = $1 and images_key = $2
		  and created_at > now() - ($3 || ' milliseconds')::interval
		`,
		[userId, key, String(RULES.extractionCacheMs)],
	);

	let extraction = cached.rows[0]?.result ?? null;

	if (extraction) {
		logger.info('reports', `Extraction served from cache (no AI call)`, {
			report: reportId.slice(0, 8),
		});
	} else {
		await claimAiWork(reportId);

		try {
			const categories = await categoriesWithActiveSets(pool, categoryId);

			const result = await extractFromPhotos({
				images: prepared,
				categories,
			});

			const category = categories.find((item) => item.id === result.categoryId);

			extraction = {
				categoryId: result.categoryId,
				categorySlug: result.categorySlug,
				questionSetId: category.question_set_id,
				confidence: result.confidence,
				brandText: result.brandText,
				distinctiveMarks: result.distinctiveMarks,
				suggestions: result.answers,
				provider: 'gemini',
				model: result.model,
				keySlot: result.slot,
				promptHash: result.promptHash,
				at: new Date().toISOString(),
			};

			await query(
				`
				insert into image_extractions (user_id, images_key, result)
				values ($1, $2, $3)
				on conflict (user_id, images_key) do update set result = excluded.result, created_at = now()
				`,
				[userId, key, JSON.stringify(extraction)],
			);
		} catch (error) {
			if (error instanceof AiStepFailedError) {
				await markAiWaiting(reportId, 'extraction', error);
				throw aiUnavailableError('extraction');
			}

			await resetAiFlag(reportId);
			throw error;
		}
	}

	// ── save the suggestion as prefilled answers (the user confirms every one) ──
	await withTransaction(async (client) => {
		const questionSet = await loadQuestionSet(client, extraction.questionSetId);

		await client.query('delete from report_followups where report_id = $1', [reportId]);

		await client.query(
			`
			update reports
			set path = 'photo',
			    category_id = $2,
			    question_set_id = $3,
			    extraction = $4,
			    answers = $5,
			    image_hashes = $6,
			    ai_status = 'ok',
			    ai_waiting_step = null,
			    ai_error = null,
			    draft_step = 'answers',
			    version = version + 1,
			    last_activity_at = now()
			where id = $1
			`,
			[
				reportId,
				extraction.categoryId,
				extraction.questionSetId,
				JSON.stringify(extraction),
				JSON.stringify(answersFromExtraction(questionSet, extraction)),
				prepared.map((image) => image.hash),
			],
		);

		await audit(client, {
			actorType: 'user',
			actorId: userId,
			action: 'report.photos_extracted',
			entityType: 'report',
			entityId: reportId,
			details: {
				photos: prepared.length,
				category: extraction.categorySlug,
				confidence: extraction.confidence,
				model: extraction.model,
			},
		});
	});

	// `prepared` (with the image bytes) goes out of scope here and is garbage-collected.
}

// ─────────────────────────────────────────────────────────────
//  AI step 2 — follow-up questions
// ─────────────────────────────────────────────────────────────

/**
 * Generates and STORES the follow-ups once. Calling it again returns without a new AI
 * call — a reload never produces different questions.
 *
 * Used by the route (user waiting, photos optional) and by the background resume
 * (manual-path drafts, no photos).
 */
export async function generateReportFollowups(reportId, { images = [] } = {}) {
	const { rows } = await query('select * from reports where id = $1', [reportId]);
	const report = rows[0];

	assertDraft(report);

	const existing = await query(
		'select count(*) as count from report_followups where report_id = $1',
		[reportId],
	);

	if (existing.rows[0].count > 0) {
		return { alreadyGenerated: true };
	}

	if (!report.question_set_id) {
		throw badRequest(
			'CHOOSE_CATEGORY_FIRST',
			'Choose a category and answer the questions first.',
		);
	}

	const questionSet = await loadQuestionSet(pool, report.question_set_id);

	const missing = missingAnswers(questionSet, report.answers);

	if (missing.length > 0) {
		throw badRequest(
			'ANSWERS_INCOMPLETE',
			'Please answer every question first ("Don\'t know" is fine).',
			{
				missing,
			},
		);
	}

	const prepared = images.length > 0 ? prepareImages(images, { min: 1 }) : [];

	const category = await query('select name from categories where id = $1', [report.category_id]);

	await claimAiWork(reportId);

	let generated;

	try {
		generated = await generateFollowups({
			kind: report.kind,
			categoryName: category.rows[0].name,
			aspects: questionSet.aspects,
			answerSummary: summarizeAnswers(questionSet, report.answers),
			distinctiveMarks: report.answers?.distinctive_marks?.text ?? '',
			images: prepared,
		});
	} catch (error) {
		if (error instanceof AiStepFailedError) {
			await markAiWaiting(reportId, 'followups', error);
			throw aiUnavailableError('followups');
		}

		await resetAiFlag(reportId);
		throw error;
	}

	await withTransaction(async (client) => {
		let position = 1;

		for (const question of generated.questions) {
			await client.query(
				`
				insert into report_followups
					(report_id, position, aspect, question_text, options, ai_model, ai_key_slot, prompt_hash)
				values
					($1, $2, $3, $4, $5, $6, $7, $8)
				`,
				[
					reportId,
					position++,
					question.aspect,
					question.text,
					JSON.stringify(question.options),
					generated.model,
					generated.slot,
					generated.promptHash,
				],
			);
		}

		await client.query(
			`
			update reports
			set ai_status = 'ok',
			    ai_waiting_step = null,
			    ai_error = null,
			    draft_step = 'followups',
			    version = version + 1,
			    last_activity_at = now()
			where id = $1
			`,
			[reportId],
		);

		await audit(client, {
			actorType: 'system',
			actorId: 'ai',
			action: 'report.followups_generated',
			entityType: 'report',
			entityId: reportId,
			details: {
				count: generated.questions.length,
				aspects: generated.questions.map((question) => question.aspect),
				model: generated.model,
				promptHash: generated.promptHash,
			},
		});
	});

	return { alreadyGenerated: false };
}

/**
 * answers = [{ followupId, kind: 'option'|'other'|'none'|'dont_remember', code?, text? }]
 */
export async function answerFollowups(userId, reportId, answers) {
	await withTransaction(async (client) => {
		const report = await loadOwnReport(client, userId, reportId, { forUpdate: true });

		assertDraft(report);

		const { rows: followups } = await client.query(
			'select id, options, question_text from report_followups where report_id = $1',
			[reportId],
		);

		for (const answer of answers) {
			const followup = followups.find((item) => item.id === answer.followupId);

			if (!followup) {
				throw badRequest(
					'UNKNOWN_FOLLOWUP',
					'That follow-up question does not belong to this report.',
				);
			}

			let code = null;
			let text = null;

			if (answer.kind === 'option') {
				const valid = followup.options.some((option) => option.code === answer.code);

				if (!valid) {
					throw badRequest(
						'INVALID_OPTION',
						`Pick one of the listed options for "${followup.question_text}".`,
					);
				}

				code = answer.code;
			}

			if (answer.kind === 'other') {
				text = String(answer.text ?? '').trim();

				if (text.length < 2 || text.length > 200) {
					throw badRequest('ANSWER_LENGTH', 'Please describe it in 2–200 characters.');
				}

				if (findPersonalData(text)) {
					throw badRequest(
						'PERSONAL_DATA_NOT_ALLOWED',
						'Please do not type ID, card or phone numbers, names or emails.',
					);
				}
			}

			await client.query(
				`
				update report_followups
				set answer_kind = $2, answer_code = $3, answer_text = $4, answered_at = now()
				where id = $1
				`,
				[followup.id, answer.kind, code, text],
			);
		}

		await client.query(
			`update reports set version = version + 1, last_activity_at = now() where id = $1`,
			[reportId],
		);
	});
}

// ─────────────────────────────────────────────────────────────
//  Submit (idempotent — the draft id is the idempotency key)
// ─────────────────────────────────────────────────────────────

export async function submitReport(userId, reportId) {
	const outcome = await withTransaction(async (client) => {
		const report = await loadOwnReport(client, userId, reportId, { forUpdate: true });

		// Submitting twice returns the same result instead of an error.
		if (report.submitted_at) {
			return { alreadySubmitted: true, report };
		}

		assertDraft(report);

		const problems = [];

		if (!report.question_set_id) {
			problems.push('category');
		}

		if (!report.occurred_on) {
			problems.push('occurredOn');
		}

		if (!report.zone_id) {
			problems.push('zoneId');
		}

		if (report.kind === 'found' && report.fits_in_locker === null) {
			problems.push('fitsInLocker');
		}

		const questionSet = report.question_set_id
			? await loadQuestionSet(client, report.question_set_id)
			: null;

		if (questionSet) {
			problems.push(
				...missingAnswers(questionSet, report.answers).map((key) => `answers.${key}`),
			);
		}

		const followups = await client.query(
			'select count(*) as total, count(answer_kind) as answered from report_followups where report_id = $1',
			[reportId],
		);

		if (followups.rows[0].total < RULES.followupsMin) {
			problems.push('followups');
		} else if (followups.rows[0].answered < followups.rows[0].total) {
			problems.push('followupAnswers');
		}

		if (problems.length > 0) {
			throw badRequest('REPORT_INCOMPLETE', 'Some steps are not finished yet.', {
				missing: problems,
			});
		}

		const canonical = canonicalize(questionSet, report.answers);

		// ── oversize found item: not matchable, hand it to the admin (corner case 4) ──
		if (report.kind === 'found' && report.fits_in_locker === false) {
			await client.query(
				`
				update reports
				set status = 'overflow', canonical = $2, submitted_at = now(), last_activity_at = now()
				where id = $1
				`,
				[reportId, JSON.stringify(canonical)],
			);

			await client.query(
				`insert into overflow_reports (report_id, user_id, note) values ($1, $2, $3)`,
				[reportId, userId, report.place_note],
			);

			await notifyAdmins(client, {
				type: 'overflow_item',
				title: 'Oversize item reported',
				body: 'A finder reported an item that does not fit a locker. They were told to bring it to the admin desk.',
				link: '/admin/overflow',
			});

			await audit(client, {
				actorType: 'user',
				actorId: userId,
				action: 'report.overflow',
				entityType: 'report',
				entityId: reportId,
			});

			return { outcome: 'ITEM_TOO_LARGE', report };
		}

		const status = report.kind === 'found' ? 'awaiting_deposit' : 'open';

		await client.query(
			`
			update reports
			set status = $2,
			    canonical = $3,
			    submitted_at = now(),
			    last_activity_at = now(),
			    draft_step = 'submitted'
			where id = $1
			`,
			[reportId, status, JSON.stringify(canonical)],
		);

		await audit(client, {
			actorType: 'user',
			actorId: userId,
			action: 'report.submitted',
			entityType: 'report',
			entityId: reportId,
			details: { kind: report.kind, status },
		});

		return { outcome: 'SUBMITTED', report: { ...report, status } };
	});

	if (outcome.alreadySubmitted) {
		return { alreadySubmitted: true };
	}

	if (outcome.outcome === 'SUBMITTED') {
		const report = outcome.report;

		logger.info(
			'reports',
			`${report.kind === 'found' ? 'Found item' : 'Lost report'} submitted`,
			{
				report: reportId.slice(0, 8),
			},
		);

		// Embedding in the background. A LOST report is scored right away: we wait up to
		// 10 s for the embedding, then score without it (and re-score when it arrives).
		runInBackground('post-submit', async () => {
			const embedding = processEmbeddings(reportId);

			if (report.kind === 'lost') {
				await Promise.race([embedding, sleep(RULES.embeddingWaitMs)]);
				await matchLostReport(reportId);
			}

			await embedding;
		});
	}

	return { alreadySubmitted: false, outcome: outcome.outcome };
}

// ─────────────────────────────────────────────────────────────
//  Discard / cancel
// ─────────────────────────────────────────────────────────────

export async function discardDraft(userId, reportId) {
	await withTransaction(async (client) => {
		const report = await loadOwnReport(client, userId, reportId, { forUpdate: true });

		assertDraft(report);

		await client.query(`update reports set status = 'discarded' where id = $1`, [reportId]);

		await audit(client, {
			actorType: 'user',
			actorId: userId,
			action: 'report.draft_discarded',
			entityType: 'report',
			entityId: reportId,
		});
	});
}

/** A lost report that is still open, or a found item not yet deposited. */
export async function cancelReport(userId, reportId) {
	await withTransaction(async (client) => {
		const report = await loadOwnReport(client, userId, reportId, { forUpdate: true });

		const cancellable =
			(report.kind === 'lost' && report.status === 'open') ||
			(report.kind === 'found' &&
				['awaiting_deposit', 'awaiting_locker'].includes(report.status));

		if (!cancellable) {
			throw conflict(
				'CANNOT_CANCEL',
				'This report cannot be cancelled in its current state.',
			);
		}

		await client.query(
			`update otps set status = 'revoked' where report_id = $1 and status = 'active'`,
			[reportId],
		);

		if (report.locker_id) {
			await releaseReservedLocker(client, report.locker_id);
		}

		await client.query(
			`update matches set status = 'expired', review_reason = 'Report cancelled by the user'
			 where lost_report_id = $1 and status = 'review'`,
			[reportId],
		);

		await client.query(
			`update reports set status = 'cancelled', closed_reason = 'cancelled_by_user', locker_id = null where id = $1`,
			[reportId],
		);

		await audit(client, {
			actorType: 'user',
			actorId: userId,
			action: 'report.cancelled',
			entityType: 'report',
			entityId: reportId,
		});
	});
}
