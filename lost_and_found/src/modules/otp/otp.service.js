/**
 * OTP rules (D3, §11.1 — the refined rules approved in REVIEW_ANSWERS.md, Part 2).
 *
 * FINDER (deposit)
 *   - "Get deposit OTP" reserves a free locker + a 6-digit code valid 30 min.
 *   - Generating again while a code is active: old code revoked, SAME locker, new 30 min.
 *   - Expired without a deposit → locker freed; item stays awaiting_deposit (details kept).
 *   - All lockers full → awaiting_locker (FIFO queue); does NOT use a generation.
 *   - 5 generations max; after the 5th expires → item abandoned (admin can grant 5 more).
 *
 * OWNER (collection)
 *   - Only for a live match (auto_matched / approved / otp_issued). Code valid 5 min.
 *   - Each new code revokes the previous one. 5 generations max; then admin review.
 *
 * BOTH
 *   - Codes are stored as HMAC (for the kiosk) + AES-GCM (only so the SAME user can see it again).
 *   - Active codes are unique (the kiosk finds the locker from the code alone).
 *   - The raw code is NEVER logged or written to the audit log.
 */

import { RULES } from '../../config/rules.js';
import { query, withTransaction } from '../../db/pool.js';
import { decryptOtpCode, encryptOtpCode, generateOtpCode, hashOtpCode } from '../../lib/crypto.js';
import { conflict, notFound } from '../../lib/errors.js';
import { addMs } from '../../lib/time.js';
import { audit } from '../audit/audit.service.js';
import { pickFreeLocker, reserveLocker } from '../lockers/lockers.service.js';

// ─────────────────────────────────────────────────────────────
//  Shared: create a code that does not collide with another ACTIVE code
// ─────────────────────────────────────────────────────────────

async function insertUniqueOtp(client, fields) {
	for (let attempt = 1; attempt <= 6; attempt++) {
		const code = generateOtpCode();

		await client.query('savepoint otp_insert');

		try {
			const { rows } = await client.query(
				`
				insert into otps
					(code_hash, code_encrypted, action, user_id, report_id, match_id,
					 locker_id, generation, expires_at)
				values
					($1, $2, $3, $4, $5, $6, $7, $8, $9)
				returning id, expires_at
				`,
				[
					hashOtpCode(code),
					encryptOtpCode(code),
					fields.action,
					fields.userId,
					fields.reportId,
					fields.matchId ?? null,
					fields.lockerId,
					fields.generation,
					fields.expiresAt,
				],
			);

			await client.query('release savepoint otp_insert');

			return { code, id: rows[0].id, expiresAt: rows[0].expires_at };
		} catch (error) {
			await client.query('rollback to savepoint otp_insert');

			// 23505 = the same code is already active somewhere: draw another one.
			if (error.code !== '23505') {
				throw error;
			}
		}
	}

	throw new Error('Could not generate a unique OTP after 6 attempts');
}

async function revokeActiveOtps(client, { reportId, matchId = null, action }) {
	const { rows } = await client.query(
		`
		update otps
		set status = 'revoked'
		where report_id = $1
		  and action = $2
		  and status = 'active'
		  and ($3::uuid is null or match_id = $3)
		returning id, locker_id, expires_at
		`,
		[reportId, action, matchId],
	);

	return rows;
}

// ─────────────────────────────────────────────────────────────
//  Finder: deposit OTP
// ─────────────────────────────────────────────────────────────

export async function issueDepositOtp(userId, reportId) {
	return withTransaction(async (client) => {
		const { rows } = await client.query(
			'select * from reports where id = $1 and user_id = $2 for update',
			[reportId, userId],
		);

		const report = rows[0];

		if (!report) {
			throw notFound('REPORT_NOT_FOUND', 'Report not found.');
		}

		if (report.kind !== 'found') {
			throw conflict('NOT_A_FOUND_ITEM', 'Deposit codes are only for found items.');
		}

		if (!['awaiting_deposit', 'awaiting_locker'].includes(report.status)) {
			throw conflict('OTP_NOT_AVAILABLE', depositUnavailableMessage(report.status));
		}

		if (report.deposit_generations >= report.deposit_generation_limit) {
			throw conflict(
				'OTP_LIMIT_REACHED',
				`You have used all ${report.deposit_generation_limit} deposit codes. Please hand the item to the admin desk.`,
			);
		}

		// ── keep the same locker if a code is still active ──
		const revoked = await revokeActiveOtps(client, { reportId, action: 'deposit' });
		const stillValid = revoked.find((otp) => new Date(otp.expires_at) > new Date());

		let locker = null;

		if (stillValid) {
			const result = await client.query('select * from lockers where id = $1 for update', [
				stillValid.locker_id,
			]);

			locker = result.rows[0];
		} else {
			// An expired code the sweeper has not processed yet may still hold a locker.
			await client.query(
				`
				update lockers
				set status = 'available', current_report_id = null
				where current_report_id = $1 and status = 'reserved'
				`,
				[reportId],
			);

			// FIFO: finders who queued earlier get the free lockers first.
			const ahead = await client.query(
				`
				select count(*) as count
				from reports
				where status = 'awaiting_locker'
				  and id <> $1
				  and queued_at < coalesce($2, now())
				`,
				[reportId, report.queued_at],
			);

			locker = await pickFreeLocker(client, { skip: ahead.rows[0].count });

			if (!locker) {
				await client.query(
					`
					update reports
					set status = 'awaiting_locker', queued_at = coalesce(queued_at, now()), locker_id = null
					where id = $1
					`,
					[reportId],
				);

				await audit(client, {
					actorType: 'user',
					actorId: userId,
					action: 'report.queued_for_locker',
					entityType: 'report',
					entityId: reportId,
				});

				return {
					queued: true,
					position: ahead.rows[0].count + 1,
					message:
						'All lockers are busy. You are in the queue — we will notify you when one is free.',
				};
			}

			await reserveLocker(client, locker.id, reportId);
		}

		const generation = report.deposit_generations + 1;

		const otp = await insertUniqueOtp(client, {
			action: 'deposit',
			userId,
			reportId,
			lockerId: locker.id,
			generation,
			expiresAt: addMs(new Date(), RULES.depositOtpTtlMs),
		});

		await client.query(
			`
			update reports
			set status = 'awaiting_deposit',
			    locker_id = $2,
			    deposit_generations = $3,
			    queued_at = null,
			    last_activity_at = now()
			where id = $1
			`,
			[reportId, locker.id, generation],
		);

		await audit(client, {
			actorType: 'user',
			actorId: userId,
			action: 'otp.deposit_issued',
			entityType: 'report',
			entityId: reportId,
			details: { locker: locker.label, generation, otpId: otp.id },
		});

		return {
			queued: false,
			code: otp.code,
			expiresAt: otp.expiresAt,
			lockerLabel: locker.label,
			generation,
			generationLimit: report.deposit_generation_limit,
		};
	});
}

function depositUnavailableMessage(status) {
	const messages = {
		draft: 'Submit the report first.',
		stored: 'This item is already in a locker.',
		abandoned: 'This report was closed. Please hand the item to the admin desk.',
		overflow: 'This item is too large for a locker. Please hand it to the admin desk.',
		cancelled: 'This report was cancelled.',
	};

	return messages[status] ?? `A deposit code is not available while the item is "${status}".`;
}

// ─────────────────────────────────────────────────────────────
//  Owner: collection OTP
// ─────────────────────────────────────────────────────────────

export async function issueCollectOtp(userId, matchId) {
	return withTransaction(async (client) => {
		const { rows } = await client.query(
			`
			select m.*, l.user_id as owner_id
			from matches m
			join reports l on l.id = m.lost_report_id
			where m.id = $1
			for update of m
			`,
			[matchId],
		);

		const match = rows[0];

		if (!match || match.owner_id !== userId) {
			throw notFound('MATCH_NOT_FOUND', 'Match not found.');
		}

		if (!['auto_matched', 'approved', 'otp_issued'].includes(match.status)) {
			throw conflict('OTP_NOT_AVAILABLE', 'This match is not ready for collection.');
		}

		if (match.collect_generations >= match.collect_generation_limit) {
			throw conflict(
				'OTP_LIMIT_REACHED',
				`You have used all ${match.collect_generation_limit} collection codes. An admin will review your match.`,
			);
		}

		const foundResult = await client.query(
			`
			select r.*, lk.label as locker_label, lk.status as locker_status
			from reports r
			join lockers lk on lk.id = r.locker_id
			where r.id = $1
			for update of r
			`,
			[match.found_report_id],
		);

		const found = foundResult.rows[0];

		if (!found || found.locker_status !== 'occupied') {
			throw conflict(
				'LOCKER_NOT_READY',
				'The locker is not ready right now. Please try again shortly or ask the admin desk.',
			);
		}

		await revokeActiveOtps(client, { reportId: found.id, matchId, action: 'collect' });

		const generation = match.collect_generations + 1;

		const otp = await insertUniqueOtp(client, {
			action: 'collect',
			userId,
			reportId: found.id,
			matchId,
			lockerId: found.locker_id,
			generation,
			expiresAt: addMs(new Date(), RULES.collectOtpTtlMs),
		});

		await client.query(
			`
			update matches
			set status = 'otp_issued', collect_generations = $2
			where id = $1
			`,
			[matchId, generation],
		);

		await client.query(`update reports set status = 'awaiting_collection' where id = any($1)`, [
			[match.found_report_id, match.lost_report_id],
		]);

		await audit(client, {
			actorType: 'user',
			actorId: userId,
			action: 'otp.collect_issued',
			entityType: 'match',
			entityId: matchId,
			details: { locker: found.locker_label, generation, otpId: otp.id },
		});

		return {
			code: otp.code,
			expiresAt: otp.expiresAt,
			lockerLabel: found.locker_label,
			generation,
			generationLimit: match.collect_generation_limit,
		};
	});
}

// ─────────────────────────────────────────────────────────────
//  Showing an active code again (same user only — Q6)
// ─────────────────────────────────────────────────────────────

export async function getActiveOtp(userId, { reportId = null, matchId = null }) {
	const { rows } = await query(
		`
		select o.*, l.label as locker_label
		from otps o
		join lockers l on l.id = o.locker_id
		where o.user_id = $1
		  and o.status = 'active'
		  and o.expires_at > now()
		  and ($2::uuid is null or o.report_id = $2)
		  and ($3::uuid is null or o.match_id = $3)
		order by o.created_at desc
		limit 1
		`,
		[userId, reportId, matchId],
	);

	const otp = rows[0];

	if (!otp) {
		return null;
	}

	return {
		code: decryptOtpCode(otp.code_encrypted),
		action: otp.action,
		expiresAt: otp.expires_at,
		lockerLabel: otp.locker_label,
		generation: otp.generation,
	};
}
