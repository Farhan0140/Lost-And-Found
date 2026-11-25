/**
 * Swagger docs: /reports/*, /matches/*, /notifications/*  (students, login required)
 */

import { listSchema as notificationListSchema } from '../../modules/notifications/notifications.routes.js';
import {
	createSchema,
	extractSchema,
	followupAnswersSchema,
	generateSchema,
	listSchema as reportListSchema,
	updateSchema,
} from '../../modules/reports/reports.routes.js';
import { imageSchema } from '../../modules/reports/images.js';
import { jsonResponse, operation, pathParam, ref, toJsonSchema } from '../builders.js';
import * as examples from '../examples.js';

const reportId = pathParam('id', 'Report ID (uuid)');
const matchId = pathParam('id', 'Match ID (uuid)');

const NOT_FOUND = { 404: ['REPORT_NOT_FOUND'] };

/** One photo as the client sends it (already resized to ≤1024 px, EXIF removed, ≤2.5 MB). */
const photoSchema = toJsonSchema(imageSchema, {
	descriptions: {
		role: 'What the photo shows',
		data: 'Base64 (a "data:image/...;base64," prefix is accepted and removed)',
	},
});

// ─────────────────────────────────────────────────────────────
//  Reports
// ─────────────────────────────────────────────────────────────

const reportPaths = {
	'/reports': {
		get: operation({
			id: 'listMyReports',
			tag: 'Reports',
			summary: 'My reports, by tab',
			description:
				'- **drafts** — unfinished drafts (incl. "Waiting for AI")\n- **active** — submitted, still in progress (stored, open, matched, …)\n- **closed** — collected, cancelled, expired, discarded',
			query: reportListSchema,
			ok: {
				schema: {
					type: 'object',
					properties: { reports: { type: 'array', items: ref('ReportListItem') } },
				},
				example: examples.reportList,
			},
		}),

		post: operation({
			id: 'createDraft',
			tag: 'Reports',
			summary: 'Start a new report (it is a server-side draft from the first step)',
			description:
				'`found` = I found an item and will put it in a locker · `lost` = I lost something.\n\nLimits: 10 new reports per day, at most 3 unfinished drafts.',
			body: createSchema,
			bodyExample: { kind: 'found' },
			ok: {
				status: 201,
				description: 'Draft created',
				schema: ref('ReportEnvelope'),
				example: examples.newDraft,
			},
			errors: { 409: ['TOO_MANY_DRAFTS'], 429: ['DAILY_REPORT_LIMIT'] },
		}),
	},

	'/reports/{id}': {
		get: operation({
			id: 'getMyReport',
			tag: 'Reports',
			summary: 'Full view of one of my reports',
			description:
				'Includes answers, follow-ups with my answers, draft progress, locker, active OTP and matches.',
			params: [reportId],
			ok: {
				schema: ref('ReportEnvelope'),
				example: { report: examples.submittedReport.report },
			},
			errors: NOT_FOUND,
		}),

		patch: operation({
			id: 'updateDraft',
			tag: 'Reports',
			summary: 'Autosave a draft',
			description: [
				'Send only the fields that changed, plus the `version` you last received.',
				'If the draft was changed in another tab, you get **409 VERSION_CONFLICT** with `currentVersion` — reload it.',
				'',
				'**answers** — `{ questionKey: { codes: [...] } | { text } | null }`. Codes must be option codes of the question set.',
				'',
				'Text answers are checked for personal data (phone numbers, IDs, emails, names) → `PERSONAL_DATA_NOT_ALLOWED`.',
			].join('\n'),
			params: [reportId],
			body: updateSchema,
			bodyOptions: {
				descriptions: {
					version: 'The `version` from the last response (optimistic locking).',
					categoryId:
						'Choosing a category freezes its ACTIVE question set into the draft.',
					occurredOn: 'Date found / lost, campus time, not in the future.',
					draftStep: 'Where the user is in the wizard (to resume later).',
				},
			},
			bodyExample: examples.updateDraftBody,
			ok: { schema: ref('ReportEnvelope'), example: examples.newDraft },
			errors: {
				400: [
					'CHOOSE_CATEGORY_FIRST',
					'UNKNOWN_QUESTION',
					'INVALID_OPTION',
					'ONE_OPTION_ONLY',
					'DONT_KNOW_ALONE',
					'ANSWER_TOO_LONG',
					'PERSONAL_DATA_NOT_ALLOWED',
					'UNKNOWN_ZONE',
					'DATE_IN_FUTURE',
					'DATE_TOO_OLD',
				],
				...NOT_FOUND,
				409: ['VERSION_CONFLICT', 'NOT_A_DRAFT', 'NO_ACTIVE_QUESTION_SET'],
			},
		}),

		delete: operation({
			id: 'discardDraft',
			tag: 'Reports',
			summary: 'Discard a draft',
			params: [reportId],
			ok: { schema: ref('Ok') },
			errors: { ...NOT_FOUND, 409: ['NOT_A_DRAFT'] },
		}),
	},

	'/reports/{id}/extract': {
		post: operation({
			id: 'extractFromPhotos',
			tag: 'Reports',
			summary: 'AI reads 2–5 photos → category + pre-filled answers (photo path)',
			description: [
				'Photos are sent to Google Gemini and are **never stored** on the server (they stay in the browser, IndexedDB).',
				'Resize to ≤1024 px and strip EXIF before sending. Body limit: 15 MB.',
				'',
				'Pass `categoryId` if the user already picked one; otherwise the AI suggests it.',
				'The same photos within 24 h reuse the cached result (no new AI call).',
				'',
				'If every Gemini key/model fails, you get **503 AI_UNAVAILABLE** with `draftSaved: true`: show "Waiting for AI" — the draft resumes automatically and the user is notified.',
			].join('\n'),
			params: [reportId],
			body: extractSchema,
			bodyOptions: {
				overrides: {
					images: { type: 'array', minItems: 1, maxItems: 5, items: photoSchema },
				},
			},
			bodyExample: examples.extractBody,
			ok: { schema: ref('ReportEnvelope') },
			errors: {
				400: ['NOT_ENOUGH_PHOTOS', 'PHOTO_TOO_LARGE'],
				...NOT_FOUND,
				409: ['AI_BUSY', 'NOT_A_DRAFT', 'NO_ACTIVE_QUESTION_SET'],
				413: ['PAYLOAD_TOO_LARGE'],
				503: ['AI_UNAVAILABLE'],
			},
		}),
	},

	'/reports/{id}/followups/generate': {
		post: operation({
			id: 'generateFollowups',
			tag: 'Reports',
			summary: 'AI writes 3–4 follow-up questions (once per report)',
			description: [
				'Call after every question is answered. Calling again returns the same questions (no new AI call).',
				'',
				'Finders may send the photos again (`images`) so the AI can ask about details it sees.',
				"Follow-up options always use codes from the category's frozen aspect list, so two different questions about the same aspect can be compared exactly.",
				'',
				'**503 AI_UNAVAILABLE** → the draft is saved and waits for the AI (see `draft.waitingForAi`).',
			].join('\n'),
			params: [reportId],
			body: generateSchema,
			bodyOptions: {
				overrides: { images: { type: 'array', maxItems: 5, items: photoSchema } },
			},
			bodyExample: {},
			ok: {
				schema: ref('ReportEnvelope'),
				example: { report: examples.submittedReport.report },
			},
			errors: {
				400: ['CHOOSE_CATEGORY_FIRST', 'ANSWERS_INCOMPLETE'],
				...NOT_FOUND,
				409: ['AI_BUSY', 'NOT_A_DRAFT'],
				503: ['AI_UNAVAILABLE'],
			},
		}),
	},

	'/reports/{id}/followups/answers': {
		put: operation({
			id: 'answerFollowups',
			tag: 'Reports',
			summary: 'Answer the follow-up questions',
			description: [
				'`kind`:',
				'- `option` + `code` — one of the listed options',
				'- `other` + `text` — free text (2–200 characters, no personal data)',
				'- `none` — "there is none" (e.g. no sticker)',
				'- `dont_remember`',
				'',
				'Answers are visible only to the reporter and admins — never to the other side of a match.',
			].join('\n'),
			params: [reportId],
			body: followupAnswersSchema,
			bodyExample: examples.followupAnswersBody,
			ok: { schema: ref('ReportEnvelope') },
			errors: {
				400: [
					'UNKNOWN_FOLLOWUP',
					'INVALID_OPTION',
					'ANSWER_LENGTH',
					'PERSONAL_DATA_NOT_ALLOWED',
				],
				...NOT_FOUND,
				409: ['NOT_A_DRAFT'],
			},
		}),
	},

	'/reports/{id}/submit': {
		post: operation({
			id: 'submitReport',
			tag: 'Reports',
			summary: 'Submit a finished draft (idempotent)',
			description: [
				'Safe to retry: a second call returns `alreadySubmitted: true` and the same report.',
				'',
				'- **found** → status `awaiting_deposit`; next step is **POST /reports/{id}/deposit-otp**.',
				'  If the finder said it does not fit in a locker (`fitsInLocker: false`), `outcome` is `ITEM_TOO_LARGE` and the admin desk takes it (status `overflow`).',
				'- **lost** → status `open`; matching runs in the background and the owner is notified when a stored item matches.',
				'',
				'**400 REPORT_INCOMPLETE** lists the unfinished steps in `error.missing`.',
			].join('\n'),
			params: [reportId],
			ok: {
				schema: ref('SubmitResult'),
				example: examples.submittedReport,
			},
			errors: { 400: ['REPORT_INCOMPLETE'], ...NOT_FOUND },
		}),
	},

	'/reports/{id}/cancel': {
		post: operation({
			id: 'cancelReport',
			tag: 'Reports',
			summary: 'Cancel an open lost report, or a found item that was not deposited yet',
			params: [reportId],
			ok: { schema: ref('ReportEnvelope') },
			errors: { ...NOT_FOUND, 409: ['CANNOT_CANCEL'] },
		}),
	},

	'/reports/{id}/deposit-otp': {
		post: operation({
			id: 'getDepositOtp',
			tag: 'Reports',
			summary: 'Finder: reserve a locker and get a 30-minute deposit code',
			description: [
				'Reserves a free locker (on an online kiosk) and returns a 6-digit code to type on the kiosk keypad.',
				'',
				'- Generating again keeps the **same locker** and revokes the previous code.',
				'- 5 codes per item; after that the item is *abandoned* and an admin can grant 5 more.',
				'- All lockers busy → **202** with `queued: true` (FIFO); the finder is notified when one is free.',
				'',
				'The item counts as stored only after the kiosk reports the door closed with the IR sensor seeing an item.',
			].join('\n'),
			params: [reportId],
			ok: {
				status: 201,
				description: 'Code issued',
				schema: ref('OtpIssued'),
				example: examples.depositOtp,
			},
			extra: {
				202: jsonResponse(
					'All lockers are busy — queued',
					ref('OtpQueued'),
					examples.depositQueued,
				),
			},
			errors: {
				...NOT_FOUND,
				409: [
					'NOT_A_FOUND_ITEM',
					'OTP_NOT_AVAILABLE',
					'OTP_LIMIT_REACHED',
					'LOCKER_NOT_READY',
				],
			},
		}),
	},

	'/reports/{id}/otp': {
		get: operation({
			id: 'getMyReportOtp',
			tag: 'Reports',
			summary: 'Show my active deposit code again',
			description:
				'Codes are stored encrypted so the SAME user can see them again (e.g. after a page reload). `otp` is null when there is no active code.',
			params: [reportId],
			ok: { schema: ref('ActiveOtp'), example: examples.activeOtp },
			errors: NOT_FOUND,
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Matches (owner side)
// ─────────────────────────────────────────────────────────────

const MATCH_NOT_FOUND = { 404: ['MATCH_NOT_FOUND'] };

const matchPaths = {
	'/matches/{id}': {
		get: operation({
			id: 'getMyMatch',
			tag: 'Matches',
			summary: 'A match I am part of (score band + agree/conflict flags only)',
			description:
				"The **owner** sees per-question flags and the hold time. The **finder** only sees that the item was matched (id, status, band). Nobody sees the other side's answers or the raw score.",
			params: [matchId],
			ok: {
				schema: { type: 'object', properties: { match: ref('StudentMatch') } },
				example: examples.studentMatch,
			},
			errors: MATCH_NOT_FOUND,
		}),
	},

	'/matches/{id}/collect-otp': {
		post: operation({
			id: 'getCollectOtp',
			tag: 'Matches',
			summary: 'Owner: get a 5-minute collection code',
			description:
				'Generate it **at the locker** — it is valid for only 5 minutes. 5 codes per match; after that the match goes to admin review. The match is held for 72 hours.',
			params: [matchId],
			ok: {
				status: 201,
				description: 'Code issued',
				schema: ref('OtpIssued'),
				example: examples.collectOtp,
			},
			errors: {
				...MATCH_NOT_FOUND,
				409: ['OTP_NOT_AVAILABLE', 'OTP_LIMIT_REACHED', 'LOCKER_NOT_READY'],
			},
		}),
	},

	'/matches/{id}/otp': {
		get: operation({
			id: 'getMyMatchOtp',
			tag: 'Matches',
			summary: 'Show my active collection code again',
			params: [matchId],
			ok: {
				schema: ref('ActiveOtp'),
				example: { otp: { ...examples.activeOtp.otp, action: 'collect' } },
			},
			errors: MATCH_NOT_FOUND,
		}),
	},
};

// ─────────────────────────────────────────────────────────────
//  Notifications
// ─────────────────────────────────────────────────────────────

const notificationPaths = {
	'/notifications': {
		get: operation({
			id: 'listNotifications',
			tag: 'Notifications',
			summary: 'My notifications, newest first',
			query: notificationListSchema,
			queryNotes: {
				before: 'Paging: pass the created_at of the last item you have.',
				limit: 'How many (1–100)',
			},
			ok: {
				schema: {
					type: 'object',
					properties: { notifications: { type: 'array', items: ref('Notification') } },
				},
				example: examples.notifications,
			},
		}),
	},

	'/notifications/unread-count': {
		get: operation({
			id: 'countUnreadNotifications',
			tag: 'Notifications',
			summary:
				'Unread count (refetched on a live `notifications` message; polled as a fallback)',
			ok: {
				schema: { type: 'object', properties: { unread: { type: 'integer' } } },
				example: { unread: 2 },
			},
		}),
	},

	'/notifications/{id}/read': {
		post: operation({
			id: 'markNotificationRead',
			tag: 'Notifications',
			summary: 'Mark one notification as read',
			params: [pathParam('id', 'Notification ID (uuid)')],
			ok: { schema: ref('Ok') },
		}),
	},

	'/notifications/read-all': {
		post: operation({
			id: 'markAllNotificationsRead',
			tag: 'Notifications',
			summary: 'Mark all as read',
			ok: { schema: ref('Ok') },
		}),
	},
};

export const studentPaths = {
	...reportPaths,
	...matchPaths,
	...notificationPaths,
};
