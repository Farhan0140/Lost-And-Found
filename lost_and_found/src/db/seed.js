/**
 * Seeds the starting data. Safe to run many times — existing rows are kept.
 *
 *     npm run seed
 *
 *   1. Campus zones (placeholders)
 *   2. 20 categories
 *   3. One ACTIVE question set per category (only if the category has none yet)
 *   4. Dummy university students (national IDs stored as HMAC only)
 *   5. The first admin account (from ADMIN_* in .env)
 *   6. Demo device KIOSK-01 with lockers L1–L4 (2×2 grid)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import argon2 from 'argon2';

import { config } from '../config/env.js';
import { hashNationalId, randomToken, sha256Hex } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { auditSystem } from '../modules/audit/audit.service.js';
import { pool, withTransaction } from './pool.js';
import { totalWeight } from './seed-data/questionSets/common.js';
import { CATEGORIES } from './seed-data/questionSets/index.js';
import { UNIVERSITY_STUDENTS } from './seed-data/universityStudents.js';
import { ZONES } from './seed-data/zones.js';

const DEMO_DEVICE_ID = 'KIOSK-01';
const DEMO_LOCKER_COUNT = 4;

// ─────────────────────────────────────────────────────────────
//  Steps
// ─────────────────────────────────────────────────────────────

async function seedZones(client) {
	let order = 0;

	for (const zone of ZONES) {
		await client.query(
			`
			insert into campus_zones (name, department, building, sort_order)
			values ($1, $2, $3, $4)
			on conflict (name) do nothing
			`,
			[zone.name, zone.department, zone.building, order++],
		);
	}

	logger.info('seed', `Campus zones: ${ZONES.length} ensured`);
}

async function seedCategoriesAndQuestionSets(client) {
	let order = 0;
	let createdSets = 0;

	for (const category of CATEGORIES) {
		const weight = totalWeight(category.questions);

		if (Math.abs(weight - 1) > 0.02) {
			logger.warn(
				'seed',
				`Question weights for "${category.slug}" sum to ${weight.toFixed(2)}, expected ~1.00`,
			);
		}

		const { rows } = await client.query(
			`
			insert into categories (slug, name, icon, is_fully_written, sort_order)
			values ($1, $2, $3, $4, $5)
			on conflict (slug) do update
				set name = excluded.name,
				    icon = excluded.icon,
				    sort_order = excluded.sort_order
			returning id
			`,
			[category.slug, category.name, category.icon, category.full, order++],
		);

		const categoryId = rows[0].id;

		const existing = await client.query(
			'select 1 from question_sets where category_id = $1 limit 1',
			[categoryId],
		);

		if (existing.rowCount > 0) {
			continue;
		}

		await client.query(
			`
			insert into question_sets
				(category_id, version, status, questions, aspects, source, notes, activated_at)
			values
				($1, 1, 'active', $2, $3, 'manual', $4, now())
			`,
			[
				categoryId,
				JSON.stringify(category.questions),
				JSON.stringify(category.aspects),
				category.full ? 'Hand-written and reviewed (seed v1)' : 'Generic set (seed v1)',
			],
		);

		createdSets++;
	}

	logger.info(
		'seed',
		`Categories: ${CATEGORIES.length} ensured, ${createdSets} new question set(s)`,
	);
}

async function seedUniversityStudents(client) {
	const zones = await client.query('select id, department from campus_zones order by sort_order');

	for (const student of UNIVERSITY_STUDENTS) {
		const homeZone = zones.rows.find((zone) => zone.department === student.department);

		await client.query(
			`
			insert into university_students
				(student_id, national_id_hash, full_name, department, campus_zone_id)
			values ($1, $2, $3, $4, $5)
			on conflict (student_id) do nothing
			`,
			[
				student.studentId,
				hashNationalId(student.nationalId),
				student.fullName,
				student.department,
				homeZone?.id ?? null,
			],
		);
	}

	logger.info('seed', `University students: ${UNIVERSITY_STUDENTS.length} ensured (dummy data)`);
}

async function seedAdmin(client) {
	const { studentId, email, password } = config.admin;

	const existing = await client.query('select id from users where student_id = $1', [studentId]);

	if (existing.rowCount > 0) {
		logger.info('seed', `Admin "${studentId}" already exists`);
		return;
	}

	if (!password || password.length < 8) {
		logger.warn(
			'seed',
			'ADMIN_PASSWORD is empty or shorter than 8 characters — admin account NOT created',
			{ hint: 'set ADMIN_PASSWORD in .env and run `npm run seed` again' },
		);
		return;
	}

	const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

	const { rows } = await client.query(
		`
		insert into users (student_id, email, password_hash, full_name, department, role)
		values ($1, $2, $3, 'SmartFind Admin', 'Administration', 'admin')
		returning id
		`,
		[studentId, email, passwordHash],
	);

	await auditSystem(client, 'user.admin_seeded', 'user', rows[0].id, { studentId });

	logger.info('seed', `Admin account created → log in with Student ID "${studentId}"`);
}

async function seedDemoDevice(client) {
	const existing = await client.query('select id from devices where id = $1', [DEMO_DEVICE_ID]);

	if (existing.rowCount > 0) {
		logger.info('seed', `Device ${DEMO_DEVICE_ID} already exists (secret unchanged)`);
		return;
	}

	const secret = config.deviceSeedSecret || `sfd_${randomToken(24)}`;

	await client.query(
		`
		insert into devices (id, name, secret_hash)
		values ($1, 'Main locker kiosk (2×2)', $2)
		`,
		[DEMO_DEVICE_ID, sha256Hex(secret)],
	);

	for (let slot = 1; slot <= DEMO_LOCKER_COUNT; slot++) {
		await client.query(
			`
			insert into lockers (device_id, slot, label)
			values ($1, $2, $3)
			`,
			[DEMO_DEVICE_ID, slot, `L${slot}`],
		);
	}

	await auditSystem(client, 'device.created', 'device', DEMO_DEVICE_ID, {
		lockers: DEMO_LOCKER_COUNT,
	});

	console.log('');
	console.log('  ┌──────────────────────────────────────────────────────────────');
	console.log(`  │  Device created: ${DEMO_DEVICE_ID} with lockers L1–L${DEMO_LOCKER_COUNT}`);
	console.log(`  │  Device secret:  ${secret}`);
	console.log('  │  Enter both in the ESP32 setup portal. The secret is shown ONCE.');
	console.log('  └──────────────────────────────────────────────────────────────');
	console.log('');
}

// ─────────────────────────────────────────────────────────────
//  Run
// ─────────────────────────────────────────────────────────────

export async function runSeed() {
	await withTransaction(async (client) => {
		await seedZones(client);
		await seedCategoriesAndQuestionSets(client);
		await seedUniversityStudents(client);
		await seedAdmin(client);
		await seedDemoDevice(client);
	});

	logger.info('seed', 'Done');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	runSeed()
		.then(() => pool.end())
		.catch((error) => {
			logger.error('seed', error.message);
			pool.end();
			process.exit(1);
		});
}
