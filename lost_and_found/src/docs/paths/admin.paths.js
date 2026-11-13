/**
 * Swagger docs: /admin/*  (admin accounts only)
 *
 * Every admin DECISION needs a `reason` (≥ 5 characters). It is written to the
 * hash-chained audit log together with the admin's ID.
 */

import { listSchema as auditListSchema } from '../../modules/admin/audit.admin.routes.js';
import { reasonBody } from '../../modules/admin/common.js';
import {
	createDeviceSchema,
	maintenanceSchema,
	updateDeviceSchema,
} from '../../modules/admin/lockers.admin.routes.js';
import {
	createSchema as questionSetCreateSchema,
	generateSchema as questionSetGenerateSchema,
	updateSchema as questionSetUpdateSchema,
} from '../../modules/admin/questionSets.admin.routes.js';
import { listSchema as reportListSchema } from '../../modules/admin/reports.admin.routes.js';
import { listSchema as reviewListSchema } from '../../modules/admin/review.admin.routes.js';
import {
	createSchema as studentCreateSchema,
	listSchema as studentListSchema,
	updateSchema as studentUpdateSchema,
} from '../../modules/admin/university.admin.routes.js';
import {
	listSchema as userListSchema,
	resetPasswordSchema,
	roleSchema,
	statusSchema,
} from '../../modules/admin/users.admin.routes.js';
import {
	updateSchema as zoneUpdateSchema,
	zoneSchema,
} from '../../modules/admin/zones.admin.routes.js';
import { aspectSchema, questionSchema } from '../../modules/questionSets/questionSet.schema.js';
import { operation, pathParam, ref, toJsonSchema } from '../builders.js';
import * as examples from '../examples.js';

// ─────────────────────────────────────────────────────────────
//  Shared bits
// ─────────────────────────────────────────────────────────────

const REASON_EXAMPLE = { reason: 'Owner showed the matching sticker at the desk' };

/** { ok: true } response used by most admin actions. */
const OK = { schema: ref('Ok') };

/** A paged list: { total, page, pageSize, <key>: [...] } */
function paged(key, items) {
	return {
		allOf: [ref('Paged'), { type: 'object', properties: { [key]: { type: 'array', items } } }],
	};
}

const loose = { type: 'object', additionalProperties: true };

/** questions / aspects arrays described with the real question-set schemas. */
const questionSetOverrides = {
	overrides: {
		questions: { type: 'array', items: toJsonSchema(questionSchema) },
		aspects: { type: 'array', items: toJsonSchema(aspectSchema) },
	},
	descriptions: {},
};

// ─────────────────────────────────────────────────────────────
//  Overview + AI
// ─────────────────────────────────────────────────────────────

const overviewPaths = {
	'/admin/overview': {
		get: operation({
			id: 'adminOverview',
			tag: 'Admin · Overview',
			summary: 'Dashboard numbers, lockers, AI health, drafts, recent activity',
			auth: 'admin',
			ok: {
				schema: {
					type: 'object',
					properties: {
						counts: {
							type: 'object',
							additionalProperties: { type: 'integer' },
							description:
								'students, stored_items, open_lost_reports, locker_queue, review_queue, live_matches, returned_items, open_overflow, unclaimed_items',
						},
						drafts: {
							type: 'object',
							properties: {
								drafts: { type: 'integer' },
								waitingForAi: { type: 'integer' },
							},
						},
						lockers: { type: 'array', items: ref('AdminLocker') },
						ai: ref('AiHealth'),
						recentActivity: { type: 'array', items: loose },
					},
				},
				example: {
					counts: {
						students: 2,
						stored_items: 1,
						open_lost_reports: 0,
						locker_queue: 0,
						review_queue: 1,
						live_matches: 0,
						returned_items: 1,
						open_overflow: 0,
						unclaimed_items: 0,
					},
					drafts: { drafts: 1, waitingForAi: 0 },
					lockers: [examples.adminLocker],
					ai: examples.aiHealth,
					recentActivity: [
						{
							id: 27,
							at: '2026-11-13T11:11:05.286Z',
							actor_type: 'admin',
							action: 'locker.force_open',
							entity_type: 'locker',
							entity_id: '2',
							reason: 'Testing force open',
						},
					],
				},
			},
		}),
	},

	'/admin/ai/health': {
		get: operation({
			id: 'adminAiHealth',
			tag: 'Admin · Overview',
			summary: 'Gemini key slots (by number only), models, last errors',
			description:
				'API keys are never returned — only their slot numbers (#1 … #10) and state: `ready`, `resting` (rate-limited, with seconds left) or `disabled` (invalid key).',
			auth: 'admin',
			ok: {
				schema: {
					allOf: [ref('AiHealth'), { type: 'object', properties: { drafts: loose } }],
				},
				example: { ...examples.aiHealth, drafts: { drafts: 1, waitingForAi: 0 } },
			},
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Match review queue
// ─────────────────────────────────────────────────────────────

const matchId = pathParam('id', 'Match ID (uuid)');

const reviewPaths = {
	'/admin/matches': {
		get: operation({
			id: 'adminListMatches',
			tag: 'Admin · Review',
			summary: 'Review queue (and other match states)',
			description:
				'Matches land in **review** when the score is between 0.50 and 0.85, when the release rule blocks an auto-match (conflict, too few overlapping aspects, more than one candidate), or when the owner used up all collection codes.',
			auth: 'admin',
			query: reviewListSchema,
			ok: { schema: paged('matches', ref('AdminMatch')), example: examples.adminMatchList },
		}),
	},

	'/admin/matches/{id}': {
		get: operation({
			id: 'adminGetMatch',
			tag: 'Admin · Review',
			summary: 'One match with the full score breakdown and BOTH reports',
			auth: 'admin',
			params: [matchId],
			ok: {
				schema: {
					type: 'object',
					properties: {
						match: ref('AdminMatch'),
						found: ref('AdminReport'),
						lost: ref('AdminReport'),
					},
				},
				example: examples.adminMatch,
			},
			errors: { 404: ['MATCH_NOT_FOUND'] },
		}),
	},

	'/admin/matches/{id}/approve': {
		post: operation({
			id: 'adminApproveMatch',
			tag: 'Admin · Review',
			summary: 'Approve a match in review → the owner can get a collection code',
			auth: 'admin',
			params: [matchId],
			body: reasonBody,
			bodyExample: REASON_EXAMPLE,
			ok: OK,
			errors: { 404: ['MATCH_NOT_FOUND'], 409: ['NOT_IN_REVIEW', 'CANNOT_APPROVE'] },
		}),
	},

	'/admin/matches/{id}/reject': {
		post: operation({
			id: 'adminRejectMatch',
			tag: 'Admin · Review',
			summary: 'Reject a match → the lost report stays open',
			auth: 'admin',
			params: [matchId],
			body: reasonBody,
			bodyExample: { reason: 'Different phone model — owner described a Pixel' },
			ok: OK,
			errors: { 404: ['MATCH_NOT_FOUND'], 409: ['CANNOT_REJECT'] },
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Reports + overflow
// ─────────────────────────────────────────────────────────────

const reportsPaths = {
	'/admin/reports': {
		get: operation({
			id: 'adminListReports',
			tag: 'Admin · Reports',
			summary: 'All reports, filterable',
			auth: 'admin',
			query: reportListSchema,
			queryNotes: {
				status: 'A report status, e.g. stored, open, awaiting_locker, abandoned',
				search: 'Student ID or name',
			},
			ok: { schema: paged('reports', loose), example: examples.adminReports },
		}),
	},

	'/admin/reports/{id}': {
		get: operation({
			id: 'adminGetReport',
			tag: 'Admin · Reports',
			summary: 'One report with internal fields (follow-up answers, extraction, matches)',
			auth: 'admin',
			params: [pathParam('id', 'Report ID (uuid)')],
			ok: {
				schema: { type: 'object', properties: { report: ref('AdminReport') } },
				example: { report: examples.submittedReport.report },
			},
			errors: { 404: ['REPORT_NOT_FOUND'] },
		}),
	},

	'/admin/reports/{id}/grant-generations': {
		post: operation({
			id: 'adminGrantDepositCodes',
			tag: 'Admin · Reports',
			summary: 'Give a finder 5 more deposit codes (after they used all 5)',
			auth: 'admin',
			params: [pathParam('id', 'Found-item report ID (uuid)')],
			body: reasonBody,
			bodyExample: { reason: 'Finder missed the 30-minute window twice because of class' },
			ok: OK,
			errors: { 404: ['REPORT_NOT_FOUND'], 409: ['NOT_NEEDED'] },
		}),
	},

	'/admin/overflow': {
		get: operation({
			id: 'adminListOverflow',
			tag: 'Admin · Reports',
			summary: 'Found items too large for a locker (handed to the admin desk)',
			auth: 'admin',
			ok: {
				schema: {
					type: 'object',
					properties: { overflow: { type: 'array', items: loose } },
				},
				example: { overflow: [] },
			},
		}),
	},

	'/admin/overflow/{id}/resolve': {
		post: operation({
			id: 'adminResolveOverflow',
			tag: 'Admin · Reports',
			summary: 'Mark an oversize item as handled',
			auth: 'admin',
			params: [pathParam('id', 'Overflow report ID (uuid)')],
			body: reasonBody,
			bodyExample: { reason: 'Umbrella returned to owner at the desk' },
			ok: OK,
			errors: { 404: ['NOT_FOUND'] },
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Lockers + devices
// ─────────────────────────────────────────────────────────────

const lockerId = pathParam('id', 'Locker ID (number, not the label)', 'integer');
const deviceId = pathParam('id', 'Device ID, e.g. KIOSK-01', 'string');

const lockerPaths = {
	'/admin/lockers': {
		get: operation({
			id: 'adminListLockers',
			tag: 'Admin · Lockers & devices',
			summary: 'Every locker with its live sensor state and current item',
			auth: 'admin',
			ok: {
				schema: {
					type: 'object',
					properties: { lockers: { type: 'array', items: ref('AdminLocker') } },
				},
				example: { lockers: [examples.adminLocker] },
			},
		}),
	},

	'/admin/lockers/{id}/force-open': {
		post: operation({
			id: 'adminForceOpen',
			tag: 'Admin · Lockers & devices',
			summary: 'Open a locker remotely',
			description:
				'Queues a `force_open` command; the ESP32 picks it up on its next poll (≤ 1 s) and acks it. Returns **202** because the door opens asynchronously.',
			auth: 'admin',
			params: [lockerId],
			body: reasonBody,
			bodyExample: { reason: 'Item stuck — opening for inspection' },
			ok: {
				status: 202,
				description: 'Command queued',
				schema: {
					type: 'object',
					properties: {
						commandId: { type: 'string', format: 'uuid' },
						deviceOnline: { type: 'boolean' },
						message: { type: 'string' },
					},
				},
				example: {
					commandId: 'b38031d6-cb8e-4276-97c4-dc0e1ebf033f',
					deviceOnline: true,
					message: 'Command sent. The locker should open within a couple of seconds.',
				},
			},
			errors: { 404: ['LOCKER_NOT_FOUND'] },
		}),
	},

	'/admin/lockers/{id}/confirm-emptied': {
		post: operation({
			id: 'adminConfirmEmptied',
			tag: 'Admin · Lockers & devices',
			summary: 'needs_emptying → available (the admin took the item out)',
			auth: 'admin',
			params: [lockerId],
			body: reasonBody,
			bodyExample: { reason: 'Unclaimed item moved to the admin desk' },
			ok: OK,
			errors: { 404: ['LOCKER_NOT_FOUND'], 409: ['NOT_NEEDS_EMPTYING'] },
		}),
	},

	'/admin/lockers/{id}/clear-unresolved': {
		post: operation({
			id: 'adminClearUnresolved',
			tag: 'Admin · Lockers & devices',
			summary: 'open_unresolved → available / occupied (after checking the locker)',
			description:
				'Use when a door was left open past 60 s. The new status is `occupied` if the locker still holds a stored item, otherwise `available`.',
			auth: 'admin',
			params: [lockerId],
			body: reasonBody,
			bodyExample: { reason: 'Checked in person — door closed, item inside' },
			ok: {
				schema: {
					type: 'object',
					properties: {
						ok: { type: 'boolean' },
						status: { type: 'string', enum: ['available', 'occupied'] },
					},
				},
				example: { ok: true, status: 'occupied' },
			},
			errors: { 404: ['LOCKER_NOT_FOUND'], 409: ['NOT_UNRESOLVED'] },
		}),
	},

	'/admin/lockers/{id}/maintenance': {
		post: operation({
			id: 'adminSetMaintenance',
			tag: 'Admin · Lockers & devices',
			summary: 'Take an available locker out of service (or put it back)',
			auth: 'admin',
			params: [lockerId],
			body: maintenanceSchema,
			bodyExample: { on: true, reason: 'Servo making a grinding noise' },
			ok: OK,
			errors: { 404: ['LOCKER_NOT_FOUND'], 409: ['LOCKER_IN_USE', 'NOT_IN_MAINTENANCE'] },
		}),
	},

	'/admin/devices': {
		get: operation({
			id: 'adminListDevices',
			tag: 'Admin · Lockers & devices',
			summary: 'ESP32 kiosks: online state, firmware, Wi-Fi signal, pending commands',
			auth: 'admin',
			ok: {
				schema: {
					type: 'object',
					properties: { devices: { type: 'array', items: loose } },
				},
				example: examples.adminDevices,
			},
		}),

		post: operation({
			id: 'adminCreateDevice',
			tag: 'Admin · Lockers & devices',
			summary: 'Register a new ESP32 kiosk with its lockers',
			description:
				'Creates the device and `lockerCount` lockers labelled `<labelPrefix>1 … <labelPrefix>N`. The **secret is shown only once** — copy it into the ESP32 setup portal.',
			auth: 'admin',
			body: createDeviceSchema,
			bodyExample: {
				id: 'KIOSK-02',
				name: 'Library kiosk',
				lockerCount: 4,
				labelPrefix: 'B',
			},
			ok: {
				status: 201,
				description: 'Device created',
				schema: {
					type: 'object',
					properties: {
						deviceId: { type: 'string' },
						secret: { type: 'string' },
						warning: { type: 'string' },
					},
				},
				example: {
					deviceId: 'KIOSK-02',
					secret: 'sfd_Qm9vZ3VzRXhhbXBsZVNlY3JldA',
					warning:
						'Copy this secret into the ESP32 setup portal now. It will NOT be shown again.',
				},
			},
			errors: { 409: ['DEVICE_EXISTS', 'LABEL_TAKEN'] },
		}),
	},

	'/admin/devices/{id}': {
		patch: operation({
			id: 'adminUpdateDevice',
			tag: 'Admin · Lockers & devices',
			summary: 'Rename or enable / disable a device',
			auth: 'admin',
			params: [deviceId],
			body: updateDeviceSchema,
			bodyExample: { isActive: false, reason: 'Kiosk moved to storage for the holidays' },
			ok: OK,
			errors: { 404: ['DEVICE_NOT_FOUND'] },
		}),
	},

	'/admin/devices/{id}/rotate-secret': {
		post: operation({
			id: 'adminRotateDeviceSecret',
			tag: 'Admin · Lockers & devices',
			summary: 'Issue a new device secret (the old one stops working immediately)',
			auth: 'admin',
			params: [deviceId],
			body: reasonBody,
			bodyExample: { reason: 'Secret was visible in a photo of the setup portal' },
			ok: {
				schema: {
					type: 'object',
					properties: {
						deviceId: { type: 'string' },
						secret: { type: 'string' },
						warning: { type: 'string' },
					},
				},
				example: {
					deviceId: 'KIOSK-01',
					secret: 'sfd_TmV3U2VjcmV0RXhhbXBsZQ',
					warning:
						'The old secret stopped working. Enter this new one in the ESP32 setup portal.',
				},
			},
			errors: { 404: ['DEVICE_NOT_FOUND'] },
		}),
	},

	'/admin/devices/{id}/events': {
		get: operation({
			id: 'adminDeviceEvents',
			tag: 'Admin · Lockers & devices',
			summary: 'Latest events received from a device (newest first)',
			auth: 'admin',
			params: [deviceId],
			ok: {
				schema: { type: 'object', properties: { events: { type: 'array', items: loose } } },
				example: examples.deviceEvents,
			},
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  University database (dummy)
// ─────────────────────────────────────────────────────────────

const studentId = pathParam('studentId', 'University student ID', 'string');

const NATIONAL_ID_NOTE = {
	descriptions: {
		nationalId: '10, 13 or 17 digits (spaces / dashes ignored). Stored ONLY as HMAC-SHA256.',
	},
};

const universityPaths = {
	'/admin/university-students': {
		get: operation({
			id: 'adminListUniversityStudents',
			tag: 'Admin · University DB',
			summary: 'Students in the dummy university database',
			description: 'National IDs are never returned — only `hasNationalId`.',
			auth: 'admin',
			query: studentListSchema,
			queryNotes: { search: 'Student ID or name' },
			ok: {
				schema: paged('students', loose),
				example: {
					total: 31,
					page: 1,
					pageSize: 25,
					students: [examples.universityStudent],
				},
			},
		}),

		post: operation({
			id: 'adminCreateUniversityStudent',
			tag: 'Admin · University DB',
			summary: 'Add a student (they can then register)',
			auth: 'admin',
			body: studentCreateSchema,
			bodyOptions: NATIONAL_ID_NOTE,
			bodyExample: {
				studentId: 'NEW0001',
				nationalId: '5555555555',
				fullName: 'New Student',
				department: 'CSE',
				campusZoneId: 6,
			},
			ok: {
				status: 201,
				description: 'Student added',
				schema: { type: 'object', properties: { student: loose } },
				example: { student: examples.universityStudent },
			},
			errors: { 409: ['STUDENT_EXISTS'] },
		}),
	},

	'/admin/university-students/{studentId}': {
		put: operation({
			id: 'adminUpdateUniversityStudent',
			tag: 'Admin · University DB',
			summary: 'Edit a student (send only what changes)',
			auth: 'admin',
			params: [studentId],
			body: studentUpdateSchema,
			bodyOptions: NATIONAL_ID_NOTE,
			bodyExample: { department: 'EEE', campusZoneId: 8 },
			ok: {
				schema: { type: 'object', properties: { student: loose } },
				example: { student: { ...examples.universityStudent, department: 'EEE' } },
			},
			errors: { 404: ['STUDENT_NOT_FOUND'] },
		}),

		delete: operation({
			id: 'adminDeleteUniversityStudent',
			tag: 'Admin · University DB',
			summary: 'Delete a student from the university database',
			description: 'An existing SmartFind account of this student is not deleted.',
			auth: 'admin',
			params: [studentId],
			body: reasonBody,
			bodyExample: { reason: 'Test record no longer needed' },
			ok: OK,
			errors: { 404: ['STUDENT_NOT_FOUND'] },
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Users
// ─────────────────────────────────────────────────────────────

const userId = pathParam('id', 'User ID (uuid)');

const userPaths = {
	'/admin/users': {
		get: operation({
			id: 'adminListUsers',
			tag: 'Admin · Users',
			summary: 'SmartFind accounts',
			auth: 'admin',
			query: userListSchema,
			queryNotes: { search: 'Student ID, name or email' },
			ok: { schema: paged('users', loose), example: examples.adminUsers },
		}),
	},

	'/admin/users/{id}/role': {
		post: operation({
			id: 'adminSetUserRole',
			tag: 'Admin · Users',
			summary: 'Make a user admin / student',
			auth: 'admin',
			params: [userId],
			body: roleSchema,
			bodyExample: { role: 'admin', reason: 'New lab assistant joins the admin desk' },
			ok: OK,
			errors: { 400: ['CANNOT_CHANGE_OWN_ROLE'], 404: ['USER_NOT_FOUND'] },
		}),
	},

	'/admin/users/{id}/status': {
		post: operation({
			id: 'adminSetUserStatus',
			tag: 'Admin · Users',
			summary: 'Disable / enable an account (disabling signs it out everywhere)',
			auth: 'admin',
			params: [userId],
			body: statusSchema,
			bodyExample: { isActive: false, reason: 'Repeated false reports' },
			ok: OK,
			errors: { 400: ['CANNOT_DISABLE_SELF'], 404: ['USER_NOT_FOUND'] },
		}),
	},

	'/admin/users/{id}/reset-password': {
		post: operation({
			id: 'adminResetPassword',
			tag: 'Admin · Users',
			summary: 'Set a new password for a user (there is no email reset)',
			description: 'The user is notified in-app and all their sessions are signed out.',
			auth: 'admin',
			params: [userId],
			body: resetPasswordSchema,
			bodyExample: {
				newPassword: 'Temporary123',
				reason: 'Student forgot password, ID checked at desk',
			},
			ok: OK,
			errors: { 404: ['USER_NOT_FOUND'] },
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Zones
// ─────────────────────────────────────────────────────────────

const zoneId = pathParam('id', 'Zone ID', 'integer');

const zonePaths = {
	'/admin/zones': {
		get: operation({
			id: 'adminListZones',
			tag: 'Admin · Zones',
			summary: 'All zones, including inactive ones, with report counts',
			auth: 'admin',
			ok: {
				schema: { type: 'object', properties: { zones: { type: 'array', items: loose } } },
				example: { zones: [examples.adminZone] },
			},
		}),

		post: operation({
			id: 'adminCreateZone',
			tag: 'Admin · Zones',
			summary: 'Add a campus zone',
			auth: 'admin',
			body: zoneSchema,
			bodyExample: {
				name: 'EEE lab floor',
				department: 'EEE',
				building: 'Academic building B',
				sortOrder: 9,
			},
			ok: {
				status: 201,
				description: 'Zone created',
				schema: { type: 'object', properties: { zone: loose } },
				example: { zone: examples.adminZone },
			},
			errors: { 409: ['ZONE_EXISTS'] },
		}),
	},

	'/admin/zones/{id}': {
		put: operation({
			id: 'adminUpdateZone',
			tag: 'Admin · Zones',
			summary: 'Edit or (de)activate a zone',
			auth: 'admin',
			params: [zoneId],
			body: zoneUpdateSchema,
			bodyExample: { name: 'CSE lab floor (4th)', isActive: true },
			ok: {
				schema: { type: 'object', properties: { zone: loose } },
				example: { zone: examples.adminZone },
			},
			errors: { 404: ['ZONE_NOT_FOUND'], 409: ['ZONE_EXISTS'] },
		}),

		delete: operation({
			id: 'adminDeleteZone',
			tag: 'Admin · Zones',
			summary: 'Delete a zone (or deactivate it if reports use it)',
			auth: 'admin',
			params: [zoneId],
			body: reasonBody,
			bodyExample: { reason: 'Building closed for renovation' },
			ok: {
				schema: {
					type: 'object',
					properties: {
						ok: { type: 'boolean' },
						deactivatedInstead: { type: 'boolean' },
						message: { type: 'string' },
					},
				},
				example: {
					ok: true,
					deactivatedInstead: true,
					message: 'Reports use this zone, so it was hidden instead of deleted.',
				},
			},
			errors: { 404: ['ZONE_NOT_FOUND'] },
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Question sets
// ─────────────────────────────────────────────────────────────

const questionSetId = pathParam('id', 'Question set ID', 'integer');

const questionSetPaths = {
	'/admin/question-sets': {
		get: operation({
			id: 'adminListQuestionSets',
			tag: 'Admin · Question sets',
			summary: 'All versions of every category (draft / active / retired)',
			auth: 'admin',
			params: [
				{
					name: 'categoryId',
					in: 'query',
					required: false,
					description: 'Only this category',
					schema: { type: 'integer' },
				},
			],
			ok: {
				schema: {
					type: 'object',
					properties: { questionSets: { type: 'array', items: loose } },
				},
				example: { questionSets: [examples.questionSetRow] },
			},
		}),

		post: operation({
			id: 'adminCreateQuestionSet',
			tag: 'Admin · Question sets',
			summary: 'Create a new DRAFT version by hand',
			description:
				'`match_weight` of all questions must sum to about 1.00. Aspects (2–10 values each) are what the AI may write follow-ups about.',
			auth: 'admin',
			body: questionSetCreateSchema,
			bodyOptions: questionSetOverrides,
			bodyExample: examples.questionSetBody,
			ok: {
				status: 201,
				description: 'Draft created',
				schema: {
					type: 'object',
					properties: { id: { type: 'integer' }, version: { type: 'integer' } },
				},
				example: { id: 21, version: 2 },
			},
			errors: { 400: ['WEIGHTS_DO_NOT_SUM'] },
		}),
	},

	'/admin/question-sets/generate': {
		post: operation({
			id: 'adminGenerateQuestionSet',
			tag: 'Admin · Question sets',
			summary: 'Let the AI draft a question set (saved as DRAFT — review before activating)',
			auth: 'admin',
			body: questionSetGenerateSchema,
			bodyExample: { categoryId: 6 },
			ok: {
				status: 201,
				description: 'AI draft created',
				schema: {
					type: 'object',
					properties: { id: { type: 'integer' }, version: { type: 'integer' } },
				},
				example: { id: 22, version: 2 },
			},
			errors: { 404: ['CATEGORY_NOT_FOUND'], 503: ['AI_UNAVAILABLE'] },
		}),
	},

	'/admin/question-sets/{id}': {
		get: operation({
			id: 'adminGetQuestionSet',
			tag: 'Admin · Question sets',
			summary: 'One question set with weights, canon and aspects',
			auth: 'admin',
			params: [questionSetId],
			ok: {
				schema: { type: 'object', properties: { questionSet: loose } },
				example: {
					questionSet: {
						...examples.questionSetRow,
						questions: examples.questionSetBody.questions,
						aspects: examples.questionSetBody.aspects,
					},
				},
			},
			errors: { 404: ['QUESTION_SET_NOT_FOUND'] },
		}),

		put: operation({
			id: 'adminUpdateQuestionSet',
			tag: 'Admin · Question sets',
			summary: 'Edit a DRAFT set (active sets are frozen)',
			auth: 'admin',
			params: [questionSetId],
			body: questionSetUpdateSchema,
			bodyOptions: questionSetOverrides,
			bodyExample: {
				questions: examples.questionSetBody.questions,
				aspects: examples.questionSetBody.aspects,
				notes: examples.questionSetBody.notes,
			},
			ok: OK,
			errors: {
				400: ['WEIGHTS_DO_NOT_SUM'],
				404: ['QUESTION_SET_NOT_FOUND'],
				409: ['NOT_A_DRAFT'],
			},
		}),

		delete: operation({
			id: 'adminDeleteQuestionSet',
			tag: 'Admin · Question sets',
			summary: 'Delete an unused DRAFT set',
			auth: 'admin',
			params: [questionSetId],
			ok: OK,
			errors: { 404: ['QUESTION_SET_NOT_FOUND'], 409: ['CANNOT_DELETE'] },
		}),
	},

	'/admin/question-sets/{id}/activate': {
		post: operation({
			id: 'adminActivateQuestionSet',
			tag: 'Admin · Question sets',
			summary: 'Activate a draft — the previous active version is retired',
			description:
				'New reports use this version. Existing reports keep their old version and only match reports of the same version.',
			auth: 'admin',
			params: [questionSetId],
			body: reasonBody,
			bodyExample: { reason: 'Reviewed every question with the team' },
			ok: {
				schema: {
					type: 'object',
					properties: { ok: { type: 'boolean' }, note: { type: 'string' } },
				},
				example: {
					ok: true,
					note: 'New reports use this version. Existing reports keep their old version and only match each other.',
				},
			},
			errors: { 404: ['QUESTION_SET_NOT_FOUND'], 409: ['NOT_A_DRAFT'] },
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Audit log
// ─────────────────────────────────────────────────────────────

const auditPaths = {
	'/admin/audit': {
		get: operation({
			id: 'adminListAudit',
			tag: 'Admin · Audit',
			summary: 'Audit log entries, newest first, filterable',
			description:
				'Append-only: the database blocks UPDATE / DELETE / TRUNCATE. Each entry stores the hash of the previous one.',
			auth: 'admin',
			query: auditListSchema,
			ok: { schema: paged('entries', ref('AuditEntry')), example: examples.auditEntries },
		}),
	},

	'/admin/audit/verify': {
		get: operation({
			id: 'adminVerifyAudit',
			tag: 'Admin · Audit',
			summary: 'Re-check every hash in the chain',
			auth: 'admin',
			ok: {
				schema: {
					type: 'object',
					properties: {
						ok: { type: 'boolean' },
						checked: { type: 'integer' },
						firstBrokenId: { type: ['integer', 'null'] },
						problem: { type: ['string', 'null'] },
					},
				},
				example: { ok: true, checked: 27, firstBrokenId: null, problem: null },
			},
		}),
	},

	'/admin/audit/head': {
		get: operation({
			id: 'adminAuditHead',
			tag: 'Admin · Audit',
			summary: 'Latest entry ID + hash (write it down to detect rewrites later)',
			auth: 'admin',
			ok: {
				schema: { type: 'object', properties: { head: loose } },
				example: {
					head: {
						id: 27,
						hash: '69511c59bed59f4b696d504a20f8e1487e97049976d7c82cb1ce9d3d0cac5dd8',
						at: '2026-11-13T11:11:05.286Z',
					},
				},
			},
		}),
	},

	'/admin/audit/actions': {
		get: operation({
			id: 'adminAuditActions',
			tag: 'Admin · Audit',
			summary: 'Distinct action names (for the filter dropdown)',
			auth: 'admin',
			ok: {
				schema: {
					type: 'object',
					properties: { actions: { type: 'array', items: { type: 'string' } } },
				},
				example: { actions: ['locker.force_open', 'otp.deposit_used', 'report.submitted'] },
			},
		}),
	},
};

export const adminPaths = {
	...overviewPaths,
	...reviewPaths,
	...reportsPaths,
	...lockerPaths,
	...universityPaths,
	...userPaths,
	...zonePaths,
	...questionSetPaths,
	...auditPaths,
};
