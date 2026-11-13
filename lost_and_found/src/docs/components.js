/**
 * Shared OpenAPI building blocks: security schemes and the response shapes
 * that several endpoints return.
 *
 * Shapes and examples were taken from real responses of the end-to-end test,
 * so they match what the server sends. Large admin views are described loosely
 * (additionalProperties) — their examples show the full shape.
 */

// ─────────────────────────────────────────────────────────────
//  Small helpers for readable schema definitions
// ─────────────────────────────────────────────────────────────

const string = (description, extra = {}) => ({ type: 'string', description, ...extra });
const integer = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const number = (description, extra = {}) => ({ type: 'number', description, ...extra });
const boolean = (description) => ({ type: 'boolean', description });
const uuid = (description) => ({ type: 'string', format: 'uuid', description });
const dateTime = (description) => ({ type: 'string', format: 'date-time', description });
const date = (description) => ({ type: 'string', format: 'date', description });
/** Allows null as well (also adds null to an enum, or the enum would reject it). */
const nullable = (schema) => ({
	...schema,
	type: [schema.type, 'null'],
	...(schema.enum ? { enum: [...schema.enum, null] } : {}),
});
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const nullableRef = (name) => ({ anyOf: [ref(name), { type: 'null' }] });
const arrayOf = (items, description) => ({ type: 'array', items, description });
const looseObject = (description) => ({ type: 'object', additionalProperties: true, description });

// ─────────────────────────────────────────────────────────────
//  Enums (same values as the CHECK constraints in the migration)
// ─────────────────────────────────────────────────────────────

export const REPORT_STATUSES = [
	'draft',
	'abandoned',
	'discarded',
	'awaiting_deposit',
	'awaiting_locker',
	'stored',
	'unclaimed_expired',
	'overflow',
	'open',
	'cancelled',
	'matched',
	'awaiting_collection',
	'collected',
];

export const MATCH_STATUSES = [
	'auto_matched',
	'review',
	'approved',
	'rejected',
	'otp_issued',
	'collected',
	'expired',
	'superseded',
];

export const LOCKER_STATUSES = [
	'available',
	'reserved',
	'occupied',
	'needs_emptying',
	'open_unresolved',
	'maintenance',
];

// ─────────────────────────────────────────────────────────────
//  Security schemes
// ─────────────────────────────────────────────────────────────

export const securitySchemes = {
	bearerAuth: {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
		description:
			'The `accessToken` from **POST /auth/login** or **/auth/register**. Paste it here WITHOUT the word "Bearer".',
	},
	deviceId: {
		type: 'apiKey',
		in: 'header',
		name: 'X-Device-Id',
		description: 'ESP32 device ID, e.g. `KIOSK-01`.',
	},
	deviceSecret: {
		type: 'apiKey',
		in: 'header',
		name: 'X-Device-Secret',
		description:
			'Device secret printed once by `npm run setup` (or by "create device" in the admin dashboard).',
	},
};

// ─────────────────────────────────────────────────────────────
//  Schemas
// ─────────────────────────────────────────────────────────────

export const schemas = {
	// ── common ──
	Error: {
		type: 'object',
		required: ['error'],
		properties: {
			error: {
				type: 'object',
				required: ['code', 'message'],
				additionalProperties: true,
				properties: {
					code: string(
						'Stable, machine-readable code — switch on this, not on the message.',
					),
					message: string('Readable sentence that can be shown to the user.'),
					requestId: string('Search the backend log for this ID.'),
					fields: arrayOf(
						{
							type: 'object',
							properties: { field: { type: 'string' }, message: { type: 'string' } },
						},
						'Only for VALIDATION_FAILED: one entry per invalid field.',
					),
				},
			},
		},
	},

	Ok: {
		type: 'object',
		properties: { ok: { type: 'boolean', const: true } },
		example: { ok: true },
	},

	// ── auth ──
	User: {
		type: 'object',
		properties: {
			id: uuid('User ID'),
			studentId: string('University student ID'),
			email: string('Email', { format: 'email' }),
			fullName: string('From the university database'),
			department: string('From the university database'),
			campusZoneId: nullable(integer('Home zone (from the university database)')),
			role: string('Role', { enum: ['student', 'admin'] }),
			createdAt: dateTime('Account created'),
		},
	},

	TokenPair: {
		type: 'object',
		properties: {
			accessToken: string('JWT for the Authorization header. Short-lived.'),
			refreshToken: string(
				'Opaque token (sfr_…). Use it ONCE with /auth/refresh — it is rotated every time.',
			),
		},
	},

	AuthResult: {
		allOf: [{ type: 'object', properties: { user: ref('User') } }, ref('TokenPair')],
	},

	// ── meta ──
	Zone: {
		type: 'object',
		properties: {
			id: integer('Zone ID'),
			name: string('Zone name'),
			department: string('Department that owns the zone'),
			building: nullable(string('Building')),
		},
	},

	Category: {
		type: 'object',
		properties: {
			id: integer('Category ID'),
			slug: string('Stable slug, e.g. "phone"'),
			name: string('Display name'),
			icon: string('lucide-react icon name'),
			fullyWritten: boolean('true for the 5 hand-written categories, false for generic ones'),
			hasActiveSet: boolean('Reports can be created only when this is true'),
		},
	},

	PublicLocker: {
		type: 'object',
		properties: {
			label: string('Locker label, e.g. L1'),
			slot: integer('Slot number on its ESP32 (1–16)'),
			status: string('Locker state', { enum: LOCKER_STATUSES }),
			online: boolean('Is the ESP32 that drives it online?'),
		},
	},

	QuestionOption: {
		type: 'object',
		properties: {
			code: string('Stable code that is stored and compared'),
			label: string('What the user sees'),
		},
	},

	PublicQuestion: {
		type: 'object',
		properties: {
			key: string('Answer key, e.g. body_colour'),
			text: string('Question text'),
			type: string('Input type', {
				enum: ['single_select', 'multi_select', 'brand', 'text'],
			}),
			options: arrayOf(ref('QuestionOption'), 'Empty for brand / text questions'),
			placeholder: string('Hint for text inputs'),
		},
	},

	PublicQuestionSet: {
		type: 'object',
		description: 'The frozen question set of a category, WITHOUT match weights.',
		properties: {
			id: integer('Question set ID'),
			categoryId: integer('Category ID'),
			version: integer('Version — reports only match reports of the same version'),
			questions: arrayOf(ref('PublicQuestion')),
		},
	},

	// ── reports ──
	Followup: {
		type: 'object',
		description:
			'An AI-written follow-up question. Answers are visible only to the reporter and admins.',
		properties: {
			id: uuid('Follow-up ID (use it when answering)'),
			position: integer('1–4'),
			aspect: string('Which aspect it asks about (frozen per category)'),
			text: string('Question text'),
			options: arrayOf(ref('QuestionOption'), 'Option codes come from the aspect value list'),
			answer: {
				anyOf: [
					{
						type: 'object',
						properties: {
							kind: string('Answer kind', {
								enum: ['option', 'other', 'none', 'dont_remember'],
							}),
							code: nullable(string('Chosen option code')),
							text: nullable(string('Free text when kind = other')),
						},
					},
					{ type: 'null' },
				],
			},
		},
	},

	DraftState: {
		type: 'object',
		description: 'Present while the report is a draft; null after submit.',
		properties: {
			steps: arrayOf(
				{
					type: 'object',
					properties: { key: { type: 'string' }, label: { type: 'string' } },
				},
				'Steps of the wizard for this path (photo or manual)',
			),
			current: string('Current step key'),
			waitingForAi: boolean('true = an AI step failed; the draft resumes automatically'),
			waitingStep: nullable(string('Which AI step is waiting')),
			stoppedBecause: nullable(string('Readable reason')),
			failedAt: nullable(dateTime('When the AI step failed')),
			expiresAt: dateTime('Drafts expire after 7 idle days (warning on day 6)'),
		},
	},

	OtpOverview: {
		type: 'object',
		properties: {
			code: string('6-digit code typed on the kiosk keypad', { pattern: '^\\d{6}$' }),
			action: string('What the code does', { enum: ['deposit', 'collect'] }),
			expiresAt: dateTime('Deposit: 30 min · collection: 5 min'),
			lockerLabel: string('Locker that will open, e.g. L1'),
			generation: integer('How many codes were generated so far (max 5)'),
		},
	},

	ReportMatchSummary: looseObject(
		'A match as the report owner sees it (status, band, hold time). Never shows the other side.',
	),

	ReportView: {
		type: 'object',
		description:
			'Full view of one report for its owner. Admins get the same shape plus internal fields.',
		properties: {
			id: uuid('Report ID'),
			kind: string('found = I found something · lost = I lost something', {
				enum: ['found', 'lost'],
			}),
			status: string('Lifecycle state', { enum: REPORT_STATUSES }),
			path: nullable(string('How it was described', { enum: ['photo', 'manual'] })),
			version: integer('Send this back with PATCH (optimistic locking)'),
			category: {
				anyOf: [
					{
						type: 'object',
						properties: {
							id: { type: 'integer' },
							name: { type: 'string' },
							slug: { type: 'string' },
							icon: { type: 'string' },
						},
					},
					{ type: 'null' },
				],
			},
			questionSetId: nullable(integer('Frozen question set used by this report')),
			questionSet: nullableRef('PublicQuestionSet'),
			answers: {
				type: 'object',
				description:
					'Answer per question key. `source` = ai | manual, `corrected` = the user changed what the AI read.',
				additionalProperties: {
					type: 'object',
					properties: {
						codes: arrayOf({ type: 'string' }),
						text: { type: 'string' },
						source: { type: 'string', enum: ['ai', 'manual'] },
						aiCodes: nullable(arrayOf({ type: 'string' })),
						aiText: nullable({ type: 'string' }),
						corrected: { type: 'boolean' },
					},
				},
			},
			extraction: nullable(looseObject('What the AI read from the photos (photo path only)')),
			photoCount: integer('Photos used (photos are never stored on the server)'),
			occurredOn: nullable(date('Date found / lost (YYYY-MM-DD, campus time)')),
			zone: {
				anyOf: [
					{
						type: 'object',
						properties: {
							id: { type: 'integer' },
							name: { type: 'string' },
							department: { type: 'string' },
						},
					},
					{ type: 'null' },
				],
			},
			placeNote: nullable(string('Optional note about the place (no personal data)')),
			fitsInLocker: nullable(boolean('Finder: does the item fit in a locker?')),
			followups: arrayOf(ref('Followup')),
			draft: nullableRef('DraftState'),
			aiStatus: string('AI state', { enum: ['idle', 'working', 'waiting', 'ok'] }),
			embeddingStatus: string('Embedding state', {
				enum: ['pending', 'ready', 'failed', 'skipped'],
			}),
			locker: nullable(looseObject('Reserved / used locker')),
			activeOtp: nullableRef('OtpOverview'),
			deposit: {
				type: 'object',
				description: 'Finder only',
				properties: {
					generations: integer('Deposit codes generated so far'),
					generationLimit: integer('Max codes (5, admin can grant 5 more)'),
					queuedAt: nullable(dateTime('Waiting for a free locker since')),
					otpValidMinutes: integer('30'),
				},
			},
			matches: arrayOf(ref('ReportMatchSummary')),
			storedAt: nullable(dateTime('Item confirmed in the locker (IR sensor)')),
			collectedAt: nullable(dateTime('Item confirmed collected')),
			submittedAt: nullable(dateTime('Submitted')),
			createdAt: dateTime('Created'),
			updatedAt: dateTime('Last change'),
		},
	},

	ReportEnvelope: {
		type: 'object',
		properties: { report: ref('ReportView') },
	},

	SubmitResult: {
		type: 'object',
		properties: {
			report: ref('ReportView'),
			alreadySubmitted: boolean('true = it was already submitted before (safe retry)'),
			outcome: {
				type: ['string', 'null'],
				enum: ['SUBMITTED', 'ITEM_TOO_LARGE', null],
				description: 'ITEM_TOO_LARGE = the found item does not fit a locker → admin desk',
			},
		},
	},

	ReportListItem: {
		type: 'object',
		properties: {
			id: uuid('Report ID'),
			kind: string('Kind', { enum: ['found', 'lost'] }),
			status: string('Lifecycle state', { enum: REPORT_STATUSES }),
			path: nullable(string('Path', { enum: ['photo', 'manual'] })),
			category: nullable(looseObject('{ name, icon }')),
			zone: nullable(string('Zone name')),
			occurredOn: nullable(date('Date')),
			summary: nullable(string('Short description (distinctive marks)')),
			lockerLabel: nullable(string('Locker label')),
			matchStatus: nullable(string('Live match status', { enum: MATCH_STATUSES })),
			otpExpiresAt: nullable(dateTime('Active code expiry')),
			draft: nullable(looseObject('Draft progress')),
			createdAt: dateTime('Created'),
			updatedAt: dateTime('Last change'),
		},
	},

	// ── OTP ──
	OtpIssued: {
		type: 'object',
		properties: {
			queued: { type: 'boolean', const: false },
			code: string('6-digit code — show it big, type it on the kiosk keypad'),
			expiresAt: dateTime('Expiry'),
			lockerLabel: string('Locker that will open'),
			generation: integer('This is code number N'),
			generationLimit: integer('Max codes'),
		},
	},

	OtpQueued: {
		type: 'object',
		description:
			'All lockers are busy — the finder is in a FIFO queue and gets a notification.',
		properties: {
			queued: { type: 'boolean', const: true },
			position: integer('Place in the queue (1 = next)'),
			message: string('Readable message'),
		},
	},

	ActiveOtp: {
		type: 'object',
		properties: {
			otp: nullableRef('OtpOverview'),
		},
	},

	// ── matches ──
	StudentMatch: {
		type: 'object',
		description:
			"What a student sees about a match: a score BAND and agree/conflict flags — never the raw score or the other person's answers.",
		properties: {
			id: uuid('Match ID'),
			status: string('Match status', { enum: MATCH_STATUSES }),
			band: string('Score band', { enum: ['high', 'medium', 'low'] }),
			createdAt: dateTime('Created'),
			reviewNote: nullable(string('Admin note')),
			fields: arrayOf(
				{
					type: 'object',
					properties: {
						key: { type: 'string' },
						question: { type: 'string' },
						flag: { type: 'string', enum: ['agree', 'conflict', 'missing'] },
					},
				},
				'Per-question comparison flag',
			),
			followups: arrayOf(
				{
					type: 'object',
					properties: { aspect: { type: 'string' }, flag: { type: 'string' } },
				},
				'Per-aspect follow-up comparison flag',
			),
			holdExpiresAt: nullable(dateTime('Owner must collect before this (72 h)')),
			collectGenerations: integer('Collection codes used'),
			collectGenerationLimit: integer('Max collection codes (5)'),
			canGetOtp: boolean('true = show the "Get collection OTP" button'),
			otpWarning: string('Text to show next to the button'),
		},
	},

	// ── notifications ──
	Notification: {
		type: 'object',
		properties: {
			id: uuid('Notification ID'),
			type: string(
				'e.g. match_ready, item_stored, item_collected, locker_free, draft_expiring, draft_ai_back, match_rejected',
			),
			title: string('Title'),
			body: string('Body text'),
			link: nullable(string('Client route to open, e.g. /reports/{id}')),
			read_at: nullable(dateTime('Read at')),
			created_at: dateTime('Created'),
		},
	},

	// ── device ──
	DeviceHello: {
		type: 'object',
		properties: {
			authorized: { type: 'boolean', const: true },
			deviceId: string('Device ID'),
			name: string('Display name'),
			serverTime: dateTime('Server time'),
			pollIntervalMs: integer('How often to call /device/poll'),
			heartbeatIntervalMs: integer('How often to call /device/heartbeat'),
			doorOpenWarningMs: integer('Beep + LCD warning after the door is open this long'),
			doorOpenUnresolvedMs: integer('Server marks the locker open_unresolved after this'),
			settleMs: integer('IR reading must be stable this long before door_closed_settled'),
			lockers: arrayOf(
				{
					type: 'object',
					properties: {
						slot: { type: 'integer' },
						label: { type: 'string' },
						status: { type: 'string', enum: LOCKER_STATUSES },
					},
				},
				'Lockers driven by this device',
			),
		},
	},

	DevicePoll: {
		type: 'object',
		properties: {
			serverTime: dateTime('Server time'),
			kioskLockedForSeconds: integer('>0 = keypad locked after 5 wrong codes'),
			commands: arrayOf(
				{
					type: 'object',
					properties: {
						id: uuid('Command ID — ack it after executing'),
						type: { type: 'string', enum: ['force_open'] },
						slot: { type: 'integer' },
					},
				},
				'Commands to execute (re-sent until acked)',
			),
		},
	},

	KioskVerifyResult: {
		description: 'Result of a code typed on the keypad.',
		oneOf: [
			{
				type: 'object',
				title: 'Accepted',
				properties: {
					ok: { type: 'boolean', const: true },
					slot: integer('Slot to unlock'),
					lockerLabel: string('Label to show on the LCD'),
					action: string('deposit or collect', { enum: ['deposit', 'collect'] }),
					sessionId: uuid('Send this with the door / IR events of this opening'),
				},
			},
			{
				type: 'object',
				title: 'Rejected',
				properties: {
					ok: { type: 'boolean', const: false },
					reason: string('Why', {
						enum: ['INVALID', 'EXPIRED', 'LOCKED', 'LOCKER_BUSY'],
					}),
					attemptsLeft: integer('Wrong codes left before the 5-minute lockout'),
					lockedForSeconds: integer('Only when reason = LOCKED'),
				},
			},
		],
	},

	// ── admin (loose; see the examples) ──
	Paged: {
		type: 'object',
		properties: {
			total: integer('Total rows matching the filter'),
			page: integer('Page (1-based)'),
			pageSize: integer('Rows per page'),
		},
	},

	AdminLocker: {
		type: 'object',
		properties: {
			id: integer('Locker ID'),
			deviceId: string('ESP32 device ID'),
			deviceName: string('Device name'),
			deviceOnline: boolean('Device online'),
			slot: integer('Slot'),
			label: string('Label'),
			sizeClass: string('Size class'),
			status: string('State', { enum: LOCKER_STATUSES }),
			doorClosed: nullable(boolean('Last door switch reading')),
			itemPresent: nullable(boolean('Last IR reading')),
			servoLocked: nullable(boolean('Last servo state')),
			doorOpenedAt: nullable(dateTime('Door open since')),
			sensorsUpdatedAt: nullable(dateTime('Last sensor update')),
			currentReport: nullable(looseObject('Report in / reserved for this locker')),
		},
	},

	AdminMatch: looseObject(
		'Full match for admins: raw score, per-field breakdown with both sides, follow-up comparison, release-rule result.',
	),

	AdminReport: looseObject('Full report for admins (owner view + internal fields).'),

	AiHealth: {
		type: 'object',
		properties: {
			overall: string(
				'ok = all keys ready · degraded = some resting/failing · down = none usable',
				{
					enum: ['ok', 'degraded', 'down'],
				},
			),
			configuredKeys: integer('Key slots filled in .env'),
			readyKeys: integer('Keys usable right now'),
			lastSuccessAt: nullable(dateTime('Last successful AI step')),
			lastStepFailedAt: nullable(dateTime('Last failed AI step')),
			models: looseObject('Configured model lists per step'),
			keys: arrayOf(looseObject('Key slot state (by number only — never the key)')),
		},
		additionalProperties: true,
	},

	AuditEntry: {
		type: 'object',
		properties: {
			id: integer('Sequence number'),
			at: dateTime('When'),
			actor_type: string('Who', { enum: ['user', 'admin', 'device', 'system'] }),
			actor_id: nullable(string('Actor ID')),
			action: string('e.g. otp.deposit_used, locker.force_open'),
			entity_type: nullable(string('Entity type')),
			entity_id: nullable(string('Entity ID')),
			reason: nullable(string('Admin reason')),
			details: looseObject('Extra details'),
			prev_hash: string('Hash of the previous entry'),
			hash: string('SHA-256 of this entry + prev_hash'),
			actor_student_id: nullable(string('Student ID of the acting user / admin')),
			actor_name: nullable(string('Name of the acting user / admin')),
		},
	},
};
