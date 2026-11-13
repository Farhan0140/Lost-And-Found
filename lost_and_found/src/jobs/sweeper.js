/**
 * Background sweeper — runs every 30 s on the SERVER (A8), plus once at startup.
 * Every rule is timestamp-based, so a server that slept (Render) catches up correctly.
 *
 *   1. Expired OTPs      → free reserved lockers, count generations, notify
 *   2. Locker queue      → tell waiting finders when a locker is free (FIFO)
 *   3. Match holds       → owner never asked for a code within 72 h → released
 *   4. Draft expiry      → warn at day 6, abandon at day 7 of no activity
 *   5. Unclaimed items   → stored > 10 days → admin takes custody, locker needs emptying
 *   6. Doors left open   → open > 60 s → open_unresolved
 *   7. Stale commands    → force-open never picked up within 10 min → expired
 *   8. Embedding retry   → pending embeddings are retried while AI is available
 *   9. Draft resume      → see draftRecovery.js
 *  10. Audit head export → once a day, written outside the database
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { RULES } from '../config/rules.js';
import { query, withTransaction } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { todayInCampus } from '../lib/time.js';
import { aiEvents, isAiAvailable } from '../modules/ai/keyPool.js';
import { auditSystem, getAuditHead } from '../modules/audit/audit.service.js';
import { markOpenUnresolved } from '../modules/devices/deviceEvents.service.js';
import { removeCommand } from '../modules/devices/deviceState.js';
import {
	abandonFoundItem,
	sendMatchToReviewCodesUsedUp,
} from '../modules/lockers/custody.service.js';
import { matchFoundItem, runInBackground } from '../modules/matching/matching.service.js';
import { notify, notifyAdmins } from '../modules/notifications/notifications.service.js';
import { processEmbeddings } from '../modules/reports/embedding.service.js';
import { resumeWaitingDrafts } from './draftRecovery.js';

let timer = null;
let sweeping = false;

// ─────────────────────────────────────────────────────────────
//  1. Expired OTPs
// ─────────────────────────────────────────────────────────────

async function expireOtps() {
	const { rows } = await query(
		`select id from otps where status = 'active' and expires_at <= now() limit 100`,
	);

	for (const { id } of rows) {
		await withTransaction(async (client) => {
			const result = await client.query(
				`
				update otps set status = 'expired'
				where id = $1 and status = 'active'
				returning *
				`,
				[id],
			);

			const otp = result.rows[0];

			if (!otp) {
				return;
			}

			if (otp.action === 'deposit') {
				await expireDepositOtp(client, otp);
			} else {
				await expireCollectOtp(client, otp);
			}
		});
	}

	if (rows.length > 0) {
		logger.info('sweeper', `${rows.length} OTP(s) expired`);
	}
}

async function expireDepositOtp(client, otp) {
	// A door already open on this code keeps going: expiry only stops NEW opens (corner case 5).
	const session = await client.query(
		`select 1 from locker_sessions where locker_id = $1 and status = 'open'`,
		[otp.locker_id],
	);

	if (session.rowCount === 0) {
		await client.query(
			`
			update lockers set status = 'available', current_report_id = null
			where id = $1 and status = 'reserved' and current_report_id = $2
			`,
			[otp.locker_id, otp.report_id],
		);
	}

	const { rows } = await client.query(
		`
		update reports
		set locker_id = null
		where id = $1 and status = 'awaiting_deposit'
		returning user_id, deposit_generations, deposit_generation_limit
		`,
		[otp.report_id],
	);

	const report = rows[0];

	if (!report) {
		return;
	}

	const left = report.deposit_generation_limit - report.deposit_generations;

	if (left <= 0) {
		await abandonFoundItem(client, otp.report_id, report.user_id);
	} else {
		await notify(client, report.user_id, {
			type: 'deposit_otp_expired',
			title: 'Your deposit code expired',
			body: `The locker was released. Generate a new code when you are on your way (${left} left).`,
			link: `/reports/${otp.report_id}`,
		});
	}

	await auditSystem(client, 'otp.deposit_expired', 'report', otp.report_id, {
		generation: otp.generation,
	});
}

async function expireCollectOtp(client, otp) {
	const { rows } = await client.query(
		`
		select m.id, m.status, m.collect_generations, m.collect_generation_limit, m.lost_report_id,
		       l.user_id as owner_id
		from matches m
		join reports l on l.id = m.lost_report_id
		where m.id = $1
		for update of m
		`,
		[otp.match_id],
	);

	const match = rows[0];

	if (!match || match.status !== 'otp_issued') {
		return;
	}

	// Was a NEWER code issued? Then nothing to do.
	const newer = await client.query(
		`select 1 from otps where match_id = $1 and status = 'active'`,
		[match.id],
	);

	if (newer.rowCount > 0) {
		return;
	}

	if (match.collect_generations >= match.collect_generation_limit) {
		await sendMatchToReviewCodesUsedUp(client, match.id);
	} else {
		await notify(client, match.owner_id, {
			type: 'collect_otp_expired',
			title: 'Your collection code expired',
			body: `Generate a new one when you are standing at the locker (${match.collect_generation_limit - match.collect_generations} left).`,
			link: `/reports/${match.lost_report_id}`,
		});
	}

	await auditSystem(client, 'otp.collect_expired', 'match', match.id, {
		generation: otp.generation,
	});
}

// ─────────────────────────────────────────────────────────────
//  2. Locker queue (FIFO) — notify at most once every 30 min per finder
// ─────────────────────────────────────────────────────────────

const queueNotifiedAt = new Map();

async function notifyLockerQueue() {
	const { rows: free } = await query(
		`select count(*) as count from lockers where status = 'available'`,
	);

	if (free[0].count === 0) {
		return;
	}

	const { rows: queued } = await query(
		`
		select id, user_id
		from reports
		where status = 'awaiting_locker'
		order by queued_at
		limit $1
		`,
		[free[0].count],
	);

	for (const report of queued) {
		const last = queueNotifiedAt.get(report.id) ?? 0;

		if (Date.now() - last < 30 * 60 * 1000) {
			continue;
		}

		queueNotifiedAt.set(report.id, Date.now());

		await notify(null, report.user_id, {
			type: 'locker_free',
			title: 'A locker is free',
			body: 'You can now tap "Get deposit OTP" for your found item.',
			link: `/reports/${report.id}`,
		});
	}
}

// ─────────────────────────────────────────────────────────────
//  3. Match holds (72 h)
// ─────────────────────────────────────────────────────────────

async function expireMatchHolds() {
	const { rows } = await query(
		`
		select id from matches
		where status in ('auto_matched', 'approved')
		  and collect_generations = 0
		  and hold_expires_at < now()
		`,
	);

	for (const { id } of rows) {
		let foundId = null;

		await withTransaction(async (client) => {
			const result = await client.query(
				`
				update matches set status = 'expired', review_reason = 'Owner did not collect within the hold time'
				where id = $1 and status in ('auto_matched', 'approved')
				returning found_report_id, lost_report_id
				`,
				[id],
			);

			const match = result.rows[0];

			if (!match) {
				return;
			}

			await client.query(`update reports set status = 'stored' where id = $1`, [
				match.found_report_id,
			]);
			await client.query(`update reports set status = 'open' where id = $1`, [
				match.lost_report_id,
			]);

			const owner = await client.query('select user_id from reports where id = $1', [
				match.lost_report_id,
			]);

			await notify(client, owner.rows[0].user_id, {
				type: 'match_hold_expired',
				title: 'Your match was released',
				body: `You did not request a collection code within ${RULES.matchHoldMs / 3_600_000} hours. Your report is open again.`,
				link: `/reports/${match.lost_report_id}`,
			});

			await auditSystem(client, 'match.hold_expired', 'match', id);

			foundId = match.found_report_id;
		});

		if (foundId) {
			runInBackground('rematch after hold expiry', () => matchFoundItem(foundId));
		}
	}
}

// ─────────────────────────────────────────────────────────────
//  4. Draft expiry (7 days of no activity, warning at day 6)
// ─────────────────────────────────────────────────────────────

async function expireDrafts() {
	const warned = await query(
		`
		update reports
		set expiry_warned_at = now()
		where status = 'draft'
		  and expiry_warned_at is null
		  and last_activity_at < now() - ($1 || ' milliseconds')::interval
		returning id, user_id
		`,
		[String(RULES.draftExpiryWarningMs)],
	);

	for (const draft of warned.rows) {
		await notify(null, draft.user_id, {
			type: 'draft_expiring',
			title: 'Your draft expires tomorrow',
			body: 'Finish and submit it, or it will be removed after 7 days without changes.',
			link: `/reports/${draft.id}`,
		});
	}

	const abandoned = await query(
		`
		update reports
		set status = 'abandoned', closed_reason = 'draft_idle_7_days'
		where status = 'draft'
		  and last_activity_at < now() - ($1 || ' milliseconds')::interval
		returning id
		`,
		[String(RULES.draftIdleExpiryMs)],
	);

	for (const draft of abandoned.rows) {
		await auditSystem(null, 'report.draft_abandoned', 'report', draft.id);
	}
}

// ─────────────────────────────────────────────────────────────
//  5. Unclaimed items (10 days in storage)
// ─────────────────────────────────────────────────────────────

async function expireUnclaimedItems() {
	const { rows } = await query(
		`
		select id from reports
		where kind = 'found'
		  and status = 'stored'
		  and first_stored_at < now() - ($1 || ' milliseconds')::interval
		`,
		[String(RULES.unclaimedAfterMs)],
	);

	for (const { id } of rows) {
		await withTransaction(async (client) => {
			const result = await client.query(
				`
				update reports set status = 'unclaimed_expired', closed_reason = 'unclaimed_10_days'
				where id = $1 and status = 'stored'
				returning locker_id
				`,
				[id],
			);

			if (!result.rows[0]) {
				return;
			}

			const locker = await client.query(
				`update lockers set status = 'needs_emptying' where id = $1 returning label`,
				[result.rows[0].locker_id],
			);

			await client.query(
				`update matches set status = 'expired', review_reason = 'Item unclaimed for 10 days'
				 where found_report_id = $1 and status = 'review'`,
				[id],
			);

			await notifyAdmins(client, {
				type: 'needs_emptying',
				title: `Locker ${locker.rows[0]?.label}: unclaimed item`,
				body: 'An item has been unclaimed for 10 days. Please take custody and confirm the locker is empty.',
				link: '/admin/lockers',
			});

			await auditSystem(client, 'report.unclaimed_expired', 'report', id, {
				locker: locker.rows[0]?.label,
			});
		});
	}
}

// ─────────────────────────────────────────────────────────────
//  6 + 7. Doors left open, stale commands
// ─────────────────────────────────────────────────────────────

async function checkDoorsLeftOpen() {
	const { rows } = await query(
		`
		select device_id, slot
		from lockers
		where door_closed = false
		  and door_opened_at < now() - ($1 || ' milliseconds')::interval
		  and status in ('available', 'reserved', 'occupied')
		`,
		[String(RULES.doorOpenUnresolvedMs)],
	);

	for (const locker of rows) {
		await markOpenUnresolved(locker.device_id, locker.slot);
	}
}

async function expireStaleCommands() {
	const { rows } = await query(
		`
		update device_commands
		set status = 'expired'
		where status in ('pending', 'sent') and created_at < now() - interval '10 minutes'
		returning id, device_id, slot
		`,
	);

	for (const command of rows) {
		removeCommand(command.device_id, command.id);

		await auditSystem(null, 'command.expired', 'device_command', command.id, {
			slot: command.slot,
		});

		logger.warn(
			'sweeper',
			`Force-open for slot ${command.slot} on ${command.device_id} was never executed (expired)`,
		);
	}
}

// ─────────────────────────────────────────────────────────────
//  8. Embedding retry
// ─────────────────────────────────────────────────────────────

async function retryEmbeddings() {
	if (!isAiAvailable()) {
		return;
	}

	const { rows } = await query(
		`
		select id from reports
		where embedding_status = 'pending'
		  and submitted_at is not null
		  and submitted_at < now() - interval '1 minute'
		  and status not in ('cancelled', 'abandoned', 'discarded')
		order by submitted_at
		limit 3
		`,
	);

	for (const { id } of rows) {
		await processEmbeddings(id);
	}
}

// ─────────────────────────────────────────────────────────────
//  10. Daily audit head export (outside the database)
// ─────────────────────────────────────────────────────────────

let lastHeadExportDay = null;

async function exportAuditHead() {
	const today = todayInCampus();

	if (lastHeadExportDay === today) {
		return;
	}

	const head = await getAuditHead();

	if (!head) {
		return;
	}

	lastHeadExportDay = today;

	const line = `${new Date().toISOString()}  id=${head.id}  hash=${head.hash}\n`;

	try {
		await fs.mkdir('logs', { recursive: true });
		await fs.appendFile(path.join('logs', 'audit-head.log'), line);
	} catch (error) {
		logger.warn('audit', `Could not write logs/audit-head.log: ${error.message}`);
	}

	// Also in the hosting provider's log stream — a copy outside our database.
	logger.info('audit', `Daily audit head: id=${head.id} hash=${head.hash}`);
}

// ─────────────────────────────────────────────────────────────
//  Runner
// ─────────────────────────────────────────────────────────────

const TASKS = [
	['expired OTPs', expireOtps],
	['locker queue', notifyLockerQueue],
	['match holds', expireMatchHolds],
	['draft expiry', expireDrafts],
	['unclaimed items', expireUnclaimedItems],
	['doors left open', checkDoorsLeftOpen],
	['stale commands', expireStaleCommands],
	['embedding retry', retryEmbeddings],
	['draft resume', resumeWaitingDrafts],
	['audit head export', exportAuditHead],
];

export async function sweepOnce() {
	if (sweeping) {
		return;
	}

	sweeping = true;

	try {
		for (const [name, task] of TASKS) {
			try {
				await task();
			} catch (error) {
				logger.error('sweeper', `Task "${name}" failed: ${error.message}`);
			}
		}
	} finally {
		sweeping = false;
	}
}

export function startSweeper() {
	sweepOnce();

	timer = setInterval(sweepOnce, RULES.sweepIntervalMs);

	// Resume waiting drafts as soon as AI answers again, not only on the next sweep.
	aiEvents.on('recovered', () => {
		resumeWaitingDrafts().catch((error) => logger.error('drafts', error.message));
	});

	logger.info('sweeper', `Background sweeper running every ${RULES.sweepIntervalMs / 1000} s`);
}

export function stopSweeper() {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
}
