/**
 * Resuming drafts after an AI outage (§7.5 rework, REVIEW_ANSWERS.md Part 3, item 5).
 *
 *   - MANUAL-path drafts that stopped at the follow-up step are completed automatically
 *     (follow-ups only need the saved answers), then the user is told they are ready.
 *   - PHOTO-path drafts need the photos, which exist only in the user's browser, so the
 *     user is told "AI is back — continue your report".
 *
 * Triggered when the key pool sees a success after an outage, and by the sweeper.
 */

import { query } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { isAiAvailable } from '../modules/ai/keyPool.js';
import { notify } from '../modules/notifications/notifications.service.js';
import { generateReportFollowups } from '../modules/reports/reports.service.js';

const AUTO_RESUME_PER_RUN = 2;

let running = false;

export async function resumeWaitingDrafts() {
	if (running || !isAiAvailable()) {
		return;
	}

	running = true;

	try {
		// ── 1. manual-path drafts waiting for follow-ups: finish them for the user ──
		const { rows: manual } = await query(
			`
			select id, user_id
			from reports
			where status = 'draft'
			  and ai_status = 'waiting'
			  and ai_waiting_step = 'followups'
			  and coalesce(path, 'manual') = 'manual'
			  and ai_failed_at < now() - interval '1 minute'
			order by ai_failed_at
			limit $1
			`,
			[AUTO_RESUME_PER_RUN],
		);

		for (const draft of manual) {
			try {
				await generateReportFollowups(draft.id);

				await notify(null, draft.user_id, {
					type: 'draft_ready',
					title: 'Your follow-up questions are ready',
					body: 'The AI is back. Open your draft to answer a few quick questions and submit it.',
					link: `/reports/${draft.id}`,
				});

				logger.info('drafts', `Draft ${draft.id.slice(0, 8)} resumed automatically`);
			} catch (error) {
				// Still failing: it stays "waiting" and is retried on a later run.
				logger.debug(
					'drafts',
					`Auto-resume of ${draft.id.slice(0, 8)} failed: ${error.message}`,
				);
			}
		}

		// ── 2. photo-path drafts: the user must come back with the photos ──
		const { rows: photo } = await query(
			`
			update reports
			set ai_status = 'idle'
			where status = 'draft'
			  and ai_status = 'waiting'
			  and (path = 'photo' or ai_waiting_step = 'extraction')
			returning id, user_id
			`,
		);

		for (const draft of photo) {
			await notify(null, draft.user_id, {
				type: 'draft_ai_back',
				title: 'AI is back — continue your report',
				body: 'Open your draft on the same device to continue (your photos are kept there).',
				link: `/reports/${draft.id}`,
			});
		}

		if (photo.length > 0) {
			logger.info(
				'drafts',
				`Told ${photo.length} user(s) that they can continue their photo drafts`,
			);
		}
	} finally {
		running = false;
	}
}
