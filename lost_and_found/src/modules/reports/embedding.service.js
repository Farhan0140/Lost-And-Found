/**
 * Embeddings for one report (§8.3 "Embedding timing", §10.4).
 *
 * Texts embedded in ONE batched call:
 *   - distinctive_marks           → field "distinctive_marks"
 *   - every "other" follow-up text → field "followup:<followup id>"
 *
 * Statuses: pending → ready | failed (after 5 attempts) | skipped (nothing to embed).
 * When an embedding arrives late, pairs scored without it are re-scored.
 */

import { query } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { AiStepFailedError } from '../ai/aiErrors.js';
import { embed } from '../ai/embeddings.js';
import { rescoreReport } from '../matching/matching.service.js';

const MAX_ATTEMPTS = 5;

/** Collects { field, text } pairs to embed for a report. */
async function collectTexts(report) {
	const items = [];

	const marks = String(report.answers?.distinctive_marks?.text ?? '').trim();

	if (marks) {
		items.push({ field: 'distinctive_marks', text: marks });
	}

	const { rows } = await query(
		`
		select id, answer_text
		from report_followups
		where report_id = $1 and answer_kind = 'other' and coalesce(answer_text, '') <> ''
		`,
		[report.id],
	);

	for (const row of rows) {
		items.push({ field: `followup:${row.id}`, text: row.answer_text.trim() });
	}

	return items;
}

/**
 * Embeds a report. Safe to call repeatedly. Never throws (errors are logged and
 * the report stays `pending` for the background retry).
 */
export async function processEmbeddings(reportId) {
	const { rows } = await query('select * from reports where id = $1', [reportId]);
	const report = rows[0];

	if (!report || report.embedding_status === 'ready' || report.embedding_status === 'skipped') {
		return;
	}

	const items = await collectTexts(report);

	if (items.length === 0) {
		await query(`update reports set embedding_status = 'skipped' where id = $1`, [reportId]);
		return;
	}

	try {
		const { model, vectors } = await embed(items.map((item) => item.text));

		for (let index = 0; index < items.length; index++) {
			await query(
				`
				insert into report_embeddings (report_id, field, source_text, model, embedding)
				values ($1, $2, $3, $4, $5::vector)
				on conflict (report_id, field) do update
					set source_text = excluded.source_text,
					    model = excluded.model,
					    embedding = excluded.embedding,
					    created_at = now()
				`,
				[
					reportId,
					items[index].field,
					items[index].text,
					model,
					JSON.stringify(vectors[index]),
				],
			);
		}

		await query(`update reports set embedding_status = 'ready' where id = $1`, [reportId]);

		logger.info(
			'embedding',
			`Report ${reportId.slice(0, 8)}: ${items.length} text(s) embedded`,
		);

		await rescoreReport(reportId);
	} catch (error) {
		const attempts = report.embedding_attempts + 1;
		const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

		await query(
			'update reports set embedding_status = $2, embedding_attempts = $3 where id = $1',
			[reportId, status, attempts],
		);

		const why = error instanceof AiStepFailedError ? error.reason : error.message;

		logger.warn(
			'embedding',
			`Report ${reportId.slice(0, 8)}: embedding failed (${why}) — attempt ${attempts}/${MAX_ATTEMPTS}`,
		);
	}
}
