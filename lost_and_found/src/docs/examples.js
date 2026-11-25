/**
 * Example payloads for the Swagger docs.
 *
 * Copied from REAL responses recorded during the end-to-end test
 * (IDs and long lists shortened). Keep them realistic: the web-client and
 * firmware authors read these first.
 */

const REPORT_ID = '4b398006-f825-413c-b88a-08ba80ed4bcb';
const MATCH_ID = 'b8c36dbe-bcd5-45c0-b03d-92afa88c41d1';
const USER_ID = '9bb39d70-01bc-4c81-8d5f-b141e8cd642f';

// ─────────────────────────────────────────────────────────────
//  Auth
// ─────────────────────────────────────────────────────────────

export const user = {
	id: USER_ID,
	studentId: 'TEST0002',
	email: 'owner@test.local',
	fullName: 'Test Owner',
	department: 'CSE',
	campusZoneId: 6,
	role: 'student',
	createdAt: '2026-11-13T11:11:03.901Z',
};

export const tokens = {
	accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5YmIz…',
	refreshToken: 'sfr_ntnd7xOxGbPRWp8qprN-ipptaLCI_QV4IiHbH92wTlc',
};

export const authResult = { user, ...tokens };

// ─────────────────────────────────────────────────────────────
//  Meta
// ─────────────────────────────────────────────────────────────

export const zones = {
	zones: [
		{
			id: 1,
			name: 'Main gate & reception',
			department: 'Administration',
			building: 'Main building',
		},
		{ id: 4, name: 'Central library', department: 'Library', building: 'Main building' },
		{ id: 6, name: 'CSE lab floor', department: 'CSE', building: 'Academic building A' },
	],
};

export const categories = {
	categories: [
		{
			id: 1,
			slug: 'phone',
			name: 'Phone',
			icon: 'Smartphone',
			fullyWritten: true,
			hasActiveSet: true,
		},
		{
			id: 2,
			slug: 'wallet',
			name: 'Wallet',
			icon: 'Wallet',
			fullyWritten: true,
			hasActiveSet: true,
		},
	],
};

export const publicLockers = {
	lockers: [
		{ label: 'L1', slot: 1, status: 'occupied', online: true },
		{ label: 'L2', slot: 2, status: 'available', online: true },
		{ label: 'L3', slot: 3, status: 'reserved', online: true },
		{ label: 'L4', slot: 4, status: 'maintenance', online: true },
	],
};

export const rules = {
	depositOtpMinutes: 30,
	collectOtpMinutes: 5,
	depositGenerationLimit: 5,
	collectGenerationLimit: 5,
	matchHoldHours: 72,
	draftsPerDay: 10,
	maxUnfinishedDrafts: 3,
	draftExpiryDays: 7,
	minPhotos: 2,
	maxPhotos: 5,
	unclaimedAfterDays: 10,
	autoMatchThreshold: 0.85,
	reviewThreshold: 0.5,
};

export const publicQuestionSet = {
	questionSet: {
		id: 1,
		categoryId: 1,
		version: 1,
		questions: [
			{
				key: 'brand',
				text: 'What brand is the phone?',
				type: 'brand',
				options: [],
				placeholder: 'e.g. Samsung, Apple, JanSport — or leave empty if unsure',
			},
			{
				key: 'body_colour',
				text: 'What colour is the phone itself (not the case)?',
				type: 'single_select',
				options: [
					{ code: 'black', label: 'Black' },
					{ code: 'navy', label: 'Navy' },
					{ code: 'dark_blue', label: 'Dark blue' },
					{ code: 'dont_know', label: "Don't know / not sure" },
				],
			},
		],
	},
};

// ─────────────────────────────────────────────────────────────
//  Reports
// ─────────────────────────────────────────────────────────────

export const newDraft = {
	report: {
		id: 'dfb1bf8e-0c18-400a-953c-967f5c3c0e82',
		kind: 'found',
		status: 'draft',
		path: null,
		version: 1,
		category: null,
		questionSetId: null,
		questionSet: null,
		answers: {},
		extraction: null,
		photoCount: 0,
		occurredOn: null,
		zone: null,
		placeNote: null,
		fitsInLocker: null,
		followups: [],
		draft: {
			steps: [
				{ key: 'start', label: 'Choose photos or manual' },
				{ key: 'answers', label: 'Answer the questions' },
				{ key: 'followups', label: 'Follow-up questions' },
				{ key: 'review', label: 'Review and submit' },
			],
			current: 'start',
			waitingForAi: false,
			waitingStep: null,
			stoppedBecause: null,
			failedAt: null,
			expiresAt: '2026-11-20T11:11:20.212Z',
		},
		aiStatus: 'idle',
		embeddingStatus: 'pending',
		locker: null,
		activeOtp: null,
		deposit: { generations: 0, generationLimit: 5, queuedAt: null, otpValidMinutes: 30 },
		matches: [],
		storedAt: null,
		collectedAt: null,
		submittedAt: null,
		createdAt: '2026-11-13T11:11:20.212Z',
		updatedAt: '2026-11-13T11:11:20.212Z',
	},
};

export const submittedReport = {
	report: {
		id: REPORT_ID,
		kind: 'lost',
		status: 'open',
		path: 'manual',
		version: 4,
		category: { id: 1, name: 'Phone', slug: 'phone', icon: 'Smartphone' },
		questionSetId: 1,
		questionSet: publicQuestionSet.questionSet,
		answers: {
			brand: { text: 'Samsung', aiText: null, source: 'manual', corrected: false },
			body_colour: {
				codes: ['dark_blue'],
				source: 'manual',
				aiCodes: null,
				corrected: false,
			},
			distinctive_marks: {
				text: 'Cartoon sticker inside the clear case',
				aiText: null,
				source: 'manual',
				corrected: false,
			},
		},
		extraction: null,
		photoCount: 0,
		occurredOn: '2026-11-13',
		zone: { id: 1, name: 'Main gate & reception', department: 'Administration' },
		placeNote: null,
		fitsInLocker: null,
		followups: [
			{
				id: 'b0f39d91-6257-48bf-81c2-cf33d9a1e51f',
				position: 1,
				aspect: 'case',
				text: 'What kind of case was on the phone?',
				options: [
					{ code: 'clear_silicone', label: 'Clear silicone' },
					{ code: 'hard_plastic', label: 'Hard plastic' },
				],
				answer: { kind: 'option', code: 'clear_silicone', text: null },
			},
		],
		draft: null,
		aiStatus: 'ok',
		embeddingStatus: 'ready',
		locker: null,
		activeOtp: null,
		matches: [],
		storedAt: null,
		collectedAt: null,
		submittedAt: '2026-11-13T11:11:04.556Z',
		createdAt: '2026-11-13T11:11:04.471Z',
		updatedAt: '2026-11-13T11:11:04.556Z',
	},
	alreadySubmitted: false,
	outcome: 'SUBMITTED',
};

export const reportList = {
	reports: [
		{
			id: REPORT_ID,
			kind: 'lost',
			status: 'collected',
			path: 'manual',
			category: { name: 'Phone', icon: 'Smartphone' },
			zone: 'Main gate & reception',
			occurredOn: '2026-11-13',
			summary: 'Cartoon sticker inside the clear case',
			lockerLabel: null,
			matchStatus: null,
			otpExpiresAt: null,
			draft: null,
			createdAt: '2026-11-13T11:11:04.471Z',
			updatedAt: '2026-11-13T11:11:05.169Z',
		},
	],
};

export const updateDraftBody = {
	version: 3,
	path: 'manual',
	categoryId: 1,
	answers: {
		brand: { text: 'Samsung' },
		body_colour: { codes: ['navy'] },
		marks: { codes: ['sticker', 'scratches'] },
	},
	occurredOn: '2026-11-13',
	zoneId: 6,
	placeNote: 'Near the printer',
	fitsInLocker: true,
	draftStep: 'answers',
};

export const extractBody = {
	images: [
		{
			role: 'overview',
			mimeType: 'image/jpeg',
			data: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/…',
		},
		{
			role: 'detail',
			mimeType: 'image/jpeg',
			data: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/…',
		},
	],
	categoryId: null,
};

export const followupAnswersBody = {
	answers: [
		{
			followupId: 'b0f39d91-6257-48bf-81c2-cf33d9a1e51f',
			kind: 'option',
			code: 'clear_silicone',
		},
		{ followupId: 'e7c953f2-9e32-46b0-9ca5-c6ac7c1042a7', kind: 'other', text: 'faded corner' },
		{ followupId: 'a2f1c5d0-1b8e-4a77-9d3c-6f0e2b9a1c44', kind: 'dont_remember' },
	],
};

// ─────────────────────────────────────────────────────────────
//  OTP
// ─────────────────────────────────────────────────────────────

export const depositOtp = {
	queued: false,
	code: '575926',
	expiresAt: '2026-11-13T11:41:04.348Z',
	lockerLabel: 'L1',
	generation: 1,
	generationLimit: 5,
};

export const depositQueued = {
	queued: true,
	position: 2,
	message: 'All lockers are busy. You are in the queue — we will notify you when one is free.',
};

export const collectOtp = {
	code: '640010',
	expiresAt: '2026-11-13T11:16:05.117Z',
	lockerLabel: 'L1',
	generation: 1,
	generationLimit: 5,
};

export const activeOtp = {
	otp: {
		code: '575926',
		action: 'deposit',
		expiresAt: '2026-11-13T11:41:04.348Z',
		lockerLabel: 'L1',
		generation: 1,
	},
};

// ─────────────────────────────────────────────────────────────
//  Matches
// ─────────────────────────────────────────────────────────────

export const studentMatch = {
	match: {
		id: MATCH_ID,
		status: 'auto_matched',
		band: 'high',
		createdAt: '2026-11-13T11:11:04.582Z',
		reviewNote: null,
		fields: [
			{ key: 'brand', question: 'What brand is the phone?', flag: 'agree' },
			{
				key: 'body_colour',
				question: 'What colour is the phone itself (not the case)?',
				flag: 'agree',
			},
			{
				key: 'rear_cameras',
				question: 'How many camera lenses are on the back?',
				flag: 'missing',
			},
		],
		followups: [
			{ aspect: 'case', flag: 'agree' },
			{ aspect: 'sticker', flag: 'agree' },
		],
		holdExpiresAt: '2026-11-16T11:11:04.582Z',
		collectGenerations: 0,
		collectGenerationLimit: 5,
		canGetOtp: true,
		otpWarning:
			'The collection code is valid for only 5 minutes — generate it when you are standing at the locker.',
	},
};

// ─────────────────────────────────────────────────────────────
//  Notifications
// ─────────────────────────────────────────────────────────────

export const notifications = {
	notifications: [
		{
			id: '9edfe927-d5df-4b97-aa2c-70507f559369',
			type: 'match_ready',
			title: 'We may have found your item!',
			body: 'A stored item matches your report. Go to the locker, then tap "Get collection OTP" (valid 5 minutes).',
			link: `/reports/${REPORT_ID}`,
			read_at: null,
			created_at: '2026-11-13T11:11:04.582Z',
		},
	],
};

// ─────────────────────────────────────────────────────────────
//  Device
// ─────────────────────────────────────────────────────────────

export const deviceHello = {
	authorized: true,
	deviceId: 'KIOSK-01',
	name: 'Main locker kiosk (2×2)',
	serverTime: '2026-11-13T11:11:04.103Z',
	pollIntervalMs: 1000,
	heartbeatIntervalMs: 30000,
	doorOpenWarningMs: 45000,
	doorOpenUnresolvedMs: 60000,
	settleMs: 1000,
	lockers: [
		{ slot: 1, label: 'L1', status: 'available' },
		{ slot: 2, label: 'L2', status: 'available' },
		{ slot: 3, label: 'L3', status: 'available' },
		{ slot: 4, label: 'L4', status: 'available' },
	],
};

export const devicePoll = {
	serverTime: '2026-11-13T11:11:05.241Z',
	kioskLockedForSeconds: 0,
	commands: [{ id: 'b38031d6-cb8e-4276-97c4-dc0e1ebf033f', type: 'force_open', slot: 2 }],
};

export const heartbeatBody = {
	bootId: 'a1b2c3d4',
	uptimeMs: 123456,
	rssi: -61,
	freeHeap: 182344,
	firmware: '1.0.0',
	lockers: [
		{ slot: 1, doorClosed: true, itemPresent: true, servoLocked: true },
		{ slot: 2, doorClosed: true, itemPresent: false, servoLocked: true },
	],
};

export const eventsBody = {
	bootId: 'a1b2c3d4',
	events: [
		{ seq: 1, type: 'unlocked', slot: 1, sessionId: '53a76277-f09d-4135-a47a-3aa863c11f3b' },
		{ seq: 2, type: 'door_opened', slot: 1 },
		{ seq: 3, type: 'item_detected', slot: 1 },
		{ seq: 4, type: 'door_closed', slot: 1 },
		{ seq: 5, type: 'locked', slot: 1 },
		{ seq: 6, type: 'door_closed_settled', slot: 1, data: { itemPresent: true } },
	],
};

// ─────────────────────────────────────────────────────────────
//  Admin
// ─────────────────────────────────────────────────────────────

export const adminLocker = {
	id: 1,
	deviceId: 'KIOSK-01',
	deviceName: 'Main locker kiosk (2×2)',
	deviceOnline: true,
	slot: 1,
	label: 'L1',
	sizeClass: 'standard',
	status: 'available',
	doorClosed: true,
	itemPresent: false,
	servoLocked: true,
	doorOpenedAt: null,
	sensorsUpdatedAt: '2026-11-13T11:11:05.169Z',
	currentReport: null,
};

export const aiHealth = {
	overall: 'degraded',
	configuredKeys: 2,
	readyKeys: 1,
	lastSuccessAt: '2026-11-13T11:05:13.000Z',
	lastStepFailedAt: null,
	models: {
		FOLLOWUPS: ['gemini-3.1-flash-lite'],
		EXTRACTION: ['gemini-3.1-flash-lite'],
		QUESTIONS: ['gemini-2.5-pro'],
		EMBEDDING: 'gemini-embedding-001',
	},
	keys: [
		{
			slot: 1,
			status: 'resting',
			restingForSeconds: 30,
			reason: 'rate limited',
			successes: 41,
			failures: 3,
			lastError: 'HTTP 429',
			lastErrorAt: '2026-11-13T11:05:40.000Z',
			lastSuccessAt: '2026-11-13T11:04:58.000Z',
		},
		{
			slot: 2,
			status: 'ready',
			restingForSeconds: 0,
			reason: null,
			successes: 18,
			failures: 0,
			lastError: null,
			lastErrorAt: null,
			lastSuccessAt: '2026-11-13T11:05:13.000Z',
		},
	],
};

export const adminMatchList = {
	total: 1,
	page: 1,
	pageSize: 25,
	matches: [
		{
			id: MATCH_ID,
			status: 'review',
			score: 0.83,
			band: 'medium',
			category: 'Phone',
			found: { occurredOn: '2026-11-13', zone: 'CSE lab floor', locker: 'L1' },
			lost: { occurredOn: '2026-11-12', zone: 'CSE classrooms' },
		},
	],
};

export const adminMatch = {
	match: {
		id: MATCH_ID,
		status: 'review',
		score: 0.83,
		band: 'medium',
		breakdown: {
			gate: 'passed',
			terms: { rules: 0.86, followups: 0.75, cosine: 0.91, location: 0.7, temporal: 1 },
			coverage: 0.9,
			fields: [
				{
					key: 'brand',
					a: ['SAMSUNG'],
					b: ['SAMSUNG'],
					result: 'agree',
					weight: 0.14,
					contribution: 0.14,
				},
				{
					key: 'rear_cameras',
					a: ['THREE'],
					b: null,
					result: 'missing',
					weight: 0.1,
					contribution: 0,
				},
			],
		},
	},
	found: {
		id: '10528df6-bbb9-4964-9a96-2abd7e7c9f63',
		kind: 'found',
		status: 'stored',
		note: '… full admin report view',
	},
	lost: {
		id: '4b398006-f825-413c-b88a-08ba80ed4bcb',
		kind: 'lost',
		status: 'matched',
		note: '… full admin report view',
	},
};

export const adminReports = {
	total: 2,
	page: 1,
	pageSize: 25,
	reports: [
		{
			id: '10528df6-bbb9-4964-9a96-2abd7e7c9f63',
			kind: 'found',
			status: 'stored',
			path: 'manual',
			occurred_on: '2026-11-13',
			created_at: '2026-11-13T11:11:04.130Z',
			submitted_at: '2026-11-13T11:11:04.295Z',
			ai_status: 'ok',
			embedding_status: 'ready',
			deposit_generations: 1,
			deposit_generation_limit: 5,
			category: 'Phone',
			zone: 'Main gate & reception',
			locker: 'L1',
			student_id: 'TEST0001',
			full_name: 'Test Finder',
		},
	],
};

export const adminDevices = {
	devices: [
		{
			id: 'KIOSK-01',
			name: 'Main locker kiosk (2×2)',
			isActive: true,
			lockerCount: 4,
			createdAt: '2026-11-13T11:10:54.990Z',
			lastSeenSavedAt: '2026-11-13T11:11:04.100Z',
			online: true,
			lastSeenAt: '2026-11-13T11:11:05.292Z',
			ip: '192.168.0.42',
			firmware: '1.0.0',
			rssi: -61,
			freeHeap: 182344,
			uptimeMs: 123456,
			kioskLockedUntil: null,
			pendingCommands: 0,
		},
	],
};

export const deviceEvents = {
	events: [
		{
			id: 13,
			boot_id: 'a1b2c3d4',
			seq: 12,
			type: 'door_closed_settled',
			slot: 1,
			session_id: null,
			data: { itemPresent: false },
			device_uptime_ms: 123456,
			received_at: '2026-11-13T11:11:05.168Z',
		},
	],
};

export const universityStudent = {
	studentId: 'NEW0001',
	fullName: 'New Student',
	department: 'CSE',
	campusZoneId: 6,
	zoneName: 'CSE lab floor',
	hasNationalId: true,
	registered: false,
	createdAt: '2026-11-13T11:11:05.254Z',
	updatedAt: '2026-11-13T11:11:05.254Z',
};

export const adminUsers = {
	total: 3,
	page: 1,
	pageSize: 25,
	users: [{ ...user, isActive: true, lastLoginAt: '2026-11-13T11:11:19.940Z', reportCount: 1 }],
};

export const adminZone = {
	id: 6,
	name: 'CSE lab floor',
	department: 'CSE',
	building: 'Academic building A',
	is_active: true,
	sort_order: 5,
	created_at: '2026-11-13T11:10:54.990Z',
	updated_at: '2026-11-13T11:10:54.990Z',
	report_count: 0,
};

export const questionSetRow = {
	id: 1,
	category_id: 1,
	version: 1,
	status: 'active',
	source: 'manual',
	ai_model: null,
	notes: 'Hand-written and reviewed (seed v1)',
	created_at: '2026-11-13T11:10:54.990Z',
	activated_at: '2026-11-13T11:10:54.990Z',
	question_count: 11,
	aspect_count: 8,
	category_name: 'Phone',
	category_slug: 'phone',
	report_count: 2,
};

export const questionSetBody = {
	categoryId: 6,
	notes: 'Laptop v2 — added sticker question',
	questions: [
		{
			key: 'brand',
			text: 'What brand is the laptop?',
			type: 'brand',
			match_weight: 0.2,
			placeholder: 'e.g. HP, Dell, Apple',
		},
		{
			key: 'body_colour',
			text: 'What colour is the laptop lid?',
			type: 'single_select',
			canon: 'colour',
			match_weight: 0.15,
			options: [
				{ code: 'black', label: 'Black' },
				{ code: 'silver', label: 'Silver' },
				{ code: 'dont_know', label: "Don't know / not sure" },
			],
		},
	],
	aspects: [
		{
			key: 'stickers',
			label: 'Stickers on the lid',
			values: [
				{ code: 'none', label: 'No stickers' },
				{ code: 'one_or_two', label: 'One or two' },
				{ code: 'many', label: 'Many' },
			],
		},
	],
};

export const auditEntries = {
	total: 27,
	page: 1,
	pageSize: 25,
	entries: [
		{
			id: 27,
			at: '2026-11-13T11:11:05.286Z',
			actor_type: 'admin',
			actor_id: '017f9091-e916-45b8-a2fb-3b62de8f6968',
			action: 'locker.force_open',
			entity_type: 'locker',
			entity_id: '2',
			reason: 'Testing force open',
			details: { locker: 'L2', commandId: 'b38031d6-cb8e-4276-97c4-dc0e1ebf033f' },
			prev_hash: 'b45eb6cf8433075554acce512738b688514fe66207f807bb06873e5777b1d2ab',
			hash: '69511c59bed59f4b696d504a20f8e1487e97049976d7c82cb1ce9d3d0cac5dd8',
			actor_student_id: 'ADMIN001',
			actor_name: 'SmartFind Admin',
		},
	],
};
