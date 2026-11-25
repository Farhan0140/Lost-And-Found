/**
 * Physical custody: what happens when a locker door closes (§11.3).
 *
 * The ESP32 waits until the IR reading has been STABLE for 1 s after the door-close
 * contact fires, then sends `door_closed_settled { slot, itemPresent }`. A hand in the
 * beam leaves before the door shuts, so a single reading proves nothing (corner case 2).
 *
 * The open locker session decides what the reading means:
 *
 *   session     itemPresent   result
 *   ─────────   ───────────   ──────────────────────────────────────────────
 *   deposit     true          item STORED → matching starts
 *   deposit     false         deposit failed (nothing placed) → locker freed
 *   collect     false         item COLLECTED → match closed
 *   collect     true          collection failed (item still inside)
 *   force_open  either        locker state reconciled; mismatches go to the admin
 *   (none)      true          open_unresolved → occupied (door closed, beam broken)
 *
 * An item is NEVER marked stored or collected without this sensor confirmation.
 */

import { withTransaction } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { audit } from '../audit/audit.service.js';
import { matchFoundItem, runInBackground } from '../matching/matching.service.js';
import { notify, notifyAdmins } from '../notifications/notifications.service.js';

const deviceActor = (deviceId) => ({ actorType: 'device', actorId: deviceId });

export async function handleDoorSettled(deviceId, slot, itemPresent) {
	let foundToMatch = null;

	await withTransaction(async (client) => {
		const lockerResult = await client.query(
			'select * from lockers where device_id = $1 and slot = $2 for update',
			[deviceId, slot],
		);

		const locker = lockerResult.rows[0];

		if (!locker) {
			logger.warn('custody', `${deviceId} reported unknown slot ${slot}`);
			return;
		}

		await client.query(
			`
			update lockers
			set door_closed = true, item_present = $2, door_opened_at = null, sensors_updated_at = now()
			where id = $1
			`,
			[locker.id, itemPresent],
		);

		const sessionResult = await client.query(
			`select * from locker_sessions where locker_id = $1 and status = 'open' for update`,
			[locker.id],
		);

		const session = sessionResult.rows[0];

		if (!session) {
			await settleWithoutSession(client, locker, itemPresent);
			return;
		}

		if (session.action === 'deposit') {
			foundToMatch = itemPresent
				? await completeDeposit(client, locker, session)
				: await failDeposit(client, locker, session);
			return;
		}

		if (session.action === 'collect') {
			if (itemPresent) {
				await failCollection(client, locker, session);
			} else {
				await completeCollection(client, locker, session);
			}
			return;
		}

		await finishForceOpen(client, locker, session, itemPresent);
	});

	if (foundToMatch) {
		runInBackground('match stored item', () => matchFoundItem(foundToMatch));
	}
}

// ─────────────────────────────────────────────────────────────
//  Deposit
// ─────────────────────────────────────────────────────────────

async function completeDeposit(client, locker, session) {
	await client.query(
		`
		update reports
		set status = 'stored',
		    first_stored_at = coalesce(first_stored_at, now()),
		    locker_id = $2,
		    last_activity_at = now()
		where id = $1
		`,
		[session.report_id, locker.id],
	);

	await client.query(
		`update lockers set status = 'occupied', current_report_id = $2 where id = $1`,
		[locker.id, session.report_id],
	);

	await closeSession(client, session, 'completed', 'stored');

	const report = await client.query('select user_id from reports where id = $1', [
		session.report_id,
	]);

	await notify(client, report.rows[0].user_id, {
		type: 'item_stored',
		title: `Item stored in locker ${locker.label}`,
		body: 'Thank you! The item is safely locked. We will match it with its owner.',
		link: `/reports/${session.report_id}`,
	});

	await audit(client, {
		...deviceActor(locker.device_id),
		action: 'custody.deposit_confirmed',
		entityType: 'report',
		entityId: session.report_id,
		details: { locker: locker.label, sessionId: session.id },
	});

	logger.info('custody', `Deposit confirmed in ${locker.label}`);

	return session.report_id;
}

async function failDeposit(client, locker, session) {
	await closeSession(client, session, 'failed', 'no_item_detected');

	await client.query(
		`update lockers set status = 'available', current_report_id = null where id = $1`,
		[locker.id],
	);

	const { rows } = await client.query(
		`
		update reports
		set locker_id = null, last_activity_at = now()
		where id = $1
		returning user_id, deposit_generations, deposit_generation_limit
		`,
		[session.report_id],
	);

	const report = rows[0];
	const left = report.deposit_generation_limit - report.deposit_generations;

	if (left <= 0) {
		await abandonFoundItem(client, session.report_id, report.user_id);
	} else {
		await notify(client, report.user_id, {
			type: 'deposit_failed',
			title: 'No item was detected',
			body: `The locker door closed but the sensor saw nothing inside. Generate a new code to try again (${left} left).`,
			link: `/reports/${session.report_id}`,
		});
	}

	await audit(client, {
		...deviceActor(locker.device_id),
		action: 'custody.deposit_failed_empty',
		entityType: 'report',
		entityId: session.report_id,
		details: { locker: locker.label },
	});

	logger.warn('custody', `Deposit in ${locker.label}: door closed with NO item inside`);

	return null;
}

/** Q2: after the 5th deposit code is spent, the item is abandoned (an admin may grant 5 more). */
export async function abandonFoundItem(client, reportId, userId) {
	await client.query(
		`update reports set status = 'abandoned', closed_reason = 'deposit_codes_used_up' where id = $1`,
		[reportId],
	);

	await notify(client, userId, {
		type: 'deposit_abandoned',
		title: 'All deposit codes used',
		body: 'Please hand the item to the admin desk. An admin can also give you more codes.',
		link: `/reports/${reportId}`,
	});

	await audit(client, {
		actorType: 'system',
		actorId: 'system',
		action: 'report.abandoned_codes_used_up',
		entityType: 'report',
		entityId: reportId,
	});
}

// ─────────────────────────────────────────────────────────────
//  Collection
// ─────────────────────────────────────────────────────────────

async function completeCollection(client, locker, session) {
	const { rows } = await client.query(
		`
		select m.*, f.user_id as finder_id, l.user_id as owner_id
		from matches m
		join reports f on f.id = m.found_report_id
		join reports l on l.id = m.lost_report_id
		where m.id = $1
		for update of m
		`,
		[session.match_id],
	);

	const match = rows[0];

	await client.query(`update matches set status = 'collected' where id = $1`, [match.id]);

	await client.query(
		`
		update reports
		set status = 'collected', collected_at = now(), last_activity_at = now()
		where id = any($1)
		`,
		[[match.found_report_id, match.lost_report_id]],
	);

	await client.query(
		`update lockers set status = 'available', current_report_id = null where id = $1`,
		[locker.id],
	);

	await closeSession(client, session, 'completed', 'collected');

	await notify(client, match.owner_id, {
		type: 'item_collected',
		title: 'Item collected',
		body: `You collected your item from locker ${locker.label}. Glad we could help!`,
		link: `/reports/${match.lost_report_id}`,
	});

	await notify(client, match.finder_id, {
		type: 'item_returned',
		title: 'Your found item was returned',
		body: 'The owner has collected the item you found. Thank you for your honesty!',
		link: `/reports/${match.found_report_id}`,
	});

	await audit(client, {
		...deviceActor(locker.device_id),
		action: 'custody.collection_confirmed',
		entityType: 'match',
		entityId: match.id,
		details: { locker: locker.label, sessionId: session.id },
	});

	logger.info('custody', `Collection confirmed from ${locker.label}`);
}

async function failCollection(client, locker, session) {
	await closeSession(client, session, 'failed', 'item_still_present');

	const { rows } = await client.query(
		`
		select m.id, m.lost_report_id, m.collect_generations, m.collect_generation_limit, l.user_id as owner_id
		from matches m
		join reports l on l.id = m.lost_report_id
		where m.id = $1
		`,
		[session.match_id],
	);

	const match = rows[0];

	const codesLeft = match.collect_generation_limit - match.collect_generations;

	if (codesLeft <= 0) {
		await sendMatchToReviewCodesUsedUp(client, match.id);
	}

	await notify(client, match.owner_id, {
		type: 'collection_failed',
		title: 'The item is still in the locker',
		body:
			codesLeft > 0
				? `The door closed but the item was still detected inside. Generate a new code if you still need it (${codesLeft} left).`
				: 'The door closed but the item was still inside, and all collection codes are used. An admin will contact you.',
		link: `/reports/${match.lost_report_id}`,
	});

	await audit(client, {
		...deviceActor(locker.device_id),
		action: 'custody.collection_failed_item_present',
		entityType: 'match',
		entityId: match.id,
		details: { locker: locker.label },
	});
}

// ─────────────────────────────────────────────────────────────
//  Admin force-open
// ─────────────────────────────────────────────────────────────

async function finishForceOpen(client, locker, session, itemPresent) {
	await closeSession(
		client,
		session,
		'completed',
		itemPresent ? 'closed_item_present' : 'closed_empty',
	);

	const holdsItem =
		Boolean(locker.current_report_id) &&
		['occupied', 'open_unresolved'].includes(locker.status);

	// The admin's own states (maintenance / needs_emptying) are cleared by the admin, not here.
	if (['maintenance', 'needs_emptying'].includes(locker.status)) {
		return;
	}

	if (holdsItem && !itemPresent) {
		await client.query(`update lockers set status = 'open_unresolved' where id = $1`, [
			locker.id,
		]);

		await notifyAdmins(client, {
			type: 'locker_mismatch',
			title: `Locker ${locker.label}: item missing`,
			body: 'After a force-open the stored item is no longer detected. Please check the locker.',
			link: '/admin/lockers',
		});
	} else if (holdsItem && itemPresent) {
		await client.query(`update lockers set status = 'occupied' where id = $1`, [locker.id]);
	} else if (!holdsItem && itemPresent && locker.status === 'available') {
		await client.query(`update lockers set status = 'open_unresolved' where id = $1`, [
			locker.id,
		]);

		await notifyAdmins(client, {
			type: 'locker_mismatch',
			title: `Locker ${locker.label}: unexpected item`,
			body: 'Something is inside a locker that should be empty. Please check it.',
			link: '/admin/lockers',
		});
	}

	await audit(client, {
		...deviceActor(locker.device_id),
		action: 'custody.force_open_closed',
		entityType: 'locker',
		entityId: locker.id,
		details: { locker: locker.label, itemPresent },
	});
}

// ─────────────────────────────────────────────────────────────
//  No session (e.g. a door left ajar was finally closed)
// ─────────────────────────────────────────────────────────────

async function settleWithoutSession(client, locker, itemPresent) {
	if (locker.status === 'open_unresolved' && itemPresent && locker.current_report_id) {
		await client.query(`update lockers set status = 'occupied' where id = $1`, [locker.id]);

		await audit(client, {
			...deviceActor(locker.device_id),
			action: 'locker.unresolved_closed_with_item',
			entityType: 'locker',
			entityId: locker.id,
			details: { locker: locker.label },
		});
	}
}

/**
 * The owner used every collection code without collecting → ADMIN REVIEW (not back to
 * `stored`, which would let the same pair auto-match again in a loop). Both reports stay
 * `matched` while the admin decides; approving grants 5 more codes.
 */
export async function sendMatchToReviewCodesUsedUp(client, matchId) {
	await client.query(
		`
		update matches
		set status = 'review',
		    review_reason = 'Owner used all collection codes without collecting',
		    hold_expires_at = null
		where id = $1
		`,
		[matchId],
	);

	await client.query(
		`
		update reports set status = 'matched'
		where id in (select found_report_id from matches where id = $1
		             union select lost_report_id from matches where id = $1)
		`,
		[matchId],
	);

	await notifyAdmins(client, {
		type: 'review_needed',
		title: 'Collection codes used up',
		body: 'An owner used all collection codes without collecting the item. Please review the match.',
		link: '/admin/review',
	});

	await audit(client, {
		actorType: 'system',
		actorId: 'system',
		action: 'match.codes_used_up_to_review',
		entityType: 'match',
		entityId: matchId,
	});
}

async function closeSession(client, session, status, result) {
	await client.query(
		`update locker_sessions set status = $2, result = $3, finished_at = now() where id = $1`,
		[session.id, status, result],
	);
}
