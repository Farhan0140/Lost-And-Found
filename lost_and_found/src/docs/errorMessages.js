/**
 * Every error code the API can return, with the message the client sees
 * (or a short explanation where the real message includes live values).
 *
 * Used only by the Swagger docs — the real messages live next to the code that throws them.
 */

export const ERROR_MESSAGES = {
	// ── generic (error handler) ──
	VALIDATION_FAILED: 'Some fields are missing or invalid. `error.fields` lists each problem.',
	INVALID_JSON: 'The request body is not valid JSON.',
	PAYLOAD_TOO_LARGE: 'The request body is too large (photos: 15 MB, everything else: 200 KB).',
	ROUTE_NOT_FOUND: 'There is no API route for this method and path.',
	INTERNAL_ERROR: 'Something went wrong on the server. Search the log for the requestId.',
	DATABASE_UNAVAILABLE: 'The database cannot be reached right now.',
	NOT_FOUND: 'The item was not found.',

	// ── login / tokens ──
	NOT_LOGGED_IN: 'Please log in first.',
	TOKEN_EXPIRED: 'Your session expired. Please log in again (or call /auth/refresh).',
	INVALID_TOKEN: 'Your session is not valid. Please log in again.',
	ACCOUNT_DISABLED: 'This account has been disabled. Contact the admin desk.',
	ADMIN_ONLY: 'Only administrators can do this.',
	STUDENT_NOT_VERIFIED: 'The student ID and national ID do not match the university records.',
	ALREADY_REGISTERED: 'This student ID already has an account. Please log in.',
	EMAIL_TAKEN: 'This email is already used by another account.',
	INVALID_CREDENTIALS: 'Wrong student ID or password.',
	TOO_MANY_LOGIN_ATTEMPTS: 'Too many failed attempts. Try again in N seconds.',
	WRONG_PASSWORD: 'Your current password is not correct.',
	INVALID_REFRESH_TOKEN: 'Your session is not valid. Please log in again.',
	REFRESH_TOKEN_EXPIRED: 'Your session expired. Please log in again.',
	REFRESH_TOKEN_REUSED:
		'For your safety, all sessions were signed out. Please log in again. (An old refresh token was used twice.)',

	// ── reports / drafts ──
	REPORT_NOT_FOUND: 'Report not found (or it is not yours).',
	TOO_MANY_DRAFTS: 'You already have 3 unfinished drafts. Finish or discard one first.',
	DAILY_REPORT_LIMIT: 'You can start at most 10 reports per day. Please try again tomorrow.',
	VERSION_CONFLICT:
		'This draft was changed somewhere else (another tab or device). Reload to see the latest version. `error.currentVersion` has the newest version.',
	NOT_A_DRAFT: 'This report was already submitted and can no longer be edited.',
	CHOOSE_CATEGORY_FIRST: 'Choose a category before answering questions.',
	NO_ACTIVE_QUESTION_SET: 'This category has no active question set yet. Ask an admin.',
	UNKNOWN_QUESTION: '"key" is not a question in this category.',
	INVALID_OPTION: '"code" is not an option for this question.',
	ONE_OPTION_ONLY: 'Pick only one option for a single-select question.',
	DONT_KNOW_ALONE: '"Don\'t know" cannot be combined with other options.',
	ANSWER_TOO_LONG: 'A text answer is longer than allowed.',
	ANSWER_LENGTH: 'Please describe it in 2–200 characters.',
	PERSONAL_DATA_NOT_ALLOWED:
		'Please do not type ID, card or phone numbers, names or emails. Describe how the item looks instead.',
	UNKNOWN_ZONE: 'Please choose a campus zone from the list.',
	DATE_IN_FUTURE: 'The found / lost date cannot be in the future.',
	DATE_TOO_OLD: 'The date is too far in the past.',
	NOT_ENOUGH_PHOTOS: 'Please add at least 2 photos showing different sides of the item.',
	PHOTO_TOO_LARGE: 'A photo is too large. Photos must be resized to 1024 px.',
	AI_BUSY: 'The AI is already working on this report. Please wait a moment.',
	AI_UNAVAILABLE:
		'The AI could not finish this step right now. Your draft is saved (`error.draftSaved: true`) — you will be notified when you can continue.',
	ANSWERS_INCOMPLETE: 'Please answer every question first ("Don\'t remember" is allowed).',
	UNKNOWN_FOLLOWUP: 'That follow-up question does not belong to this report.',
	REPORT_INCOMPLETE: 'Some steps are not finished yet. `error.missing` lists them.',
	CANNOT_CANCEL: 'This report cannot be cancelled in its current state.',

	// ── OTP / lockers ──
	NOT_A_FOUND_ITEM: 'Deposit codes are only for found items.',
	OTP_LIMIT_REACHED: 'All codes for this item / match have been used. An admin takes over.',
	OTP_NOT_AVAILABLE: 'This match is not ready for collection.',
	LOCKER_NOT_READY:
		'The locker is not ready right now. Please try again shortly or ask the admin desk.',
	LOCKER_BUSY: 'That locker is already reserved.',
	MATCH_NOT_FOUND: 'Match not found (or you are not part of it).',

	// ── meta ──
	QUESTION_SET_NOT_FOUND: 'This category has no active question set yet.',
	CATEGORY_NOT_FOUND: 'Category not found.',

	// ── admin ──
	NOT_IN_REVIEW: 'Only matches in review can be approved.',
	CANNOT_APPROVE:
		'The item or the lost report changed state, so this match cannot be approved now.',
	CANNOT_REJECT: 'This match cannot be rejected in its current state.',
	NOT_NEEDED: 'This finder still has deposit codes left.',
	LOCKER_NOT_FOUND: 'Locker not found.',
	LOCKER_IN_USE: 'Only an available locker can go into maintenance.',
	NOT_IN_MAINTENANCE: 'The locker is not in maintenance.',
	NOT_NEEDS_EMPTYING: 'The locker is not in "needs_emptying".',
	NOT_UNRESOLVED: 'The locker is not in "open_unresolved".',
	DEVICE_EXISTS: 'A device with this ID already exists.',
	DEVICE_NOT_FOUND: 'Device not found.',
	LABEL_TAKEN: 'A locker label is already used. Choose another prefix.',
	STUDENT_EXISTS: 'This student ID already exists in the university database.',
	STUDENT_NOT_FOUND: 'Student not found.',
	USER_NOT_FOUND: 'User not found.',
	CANNOT_CHANGE_OWN_ROLE: 'You cannot change your own role.',
	CANNOT_DISABLE_SELF: 'You cannot disable your own account.',
	ZONE_EXISTS: 'A zone with this name already exists.',
	ZONE_NOT_FOUND: 'Zone not found.',
	WEIGHTS_DO_NOT_SUM: 'Match weights should sum to about 1.00.',
	CANNOT_DELETE: 'Only unused DRAFT sets can be deleted.',

	// ── device ──
	INVALID_DEVICE_CREDENTIALS: 'X-Device-Id / X-Device-Secret missing or wrong.',
	DEVICE_DISABLED: 'This device has been disabled by an administrator.',
	DEVICE_NOT_REGISTERED: 'This device ID is not registered on this server.',
};
