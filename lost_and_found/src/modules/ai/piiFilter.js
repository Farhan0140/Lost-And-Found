/**
 * Personal-data filter for AI output (§7.3).
 *
 * Follow-up questions must never contain names, ID numbers, phone numbers, emails or
 * addresses. The prompt forbids them; this filter REJECTS any output that still has them
 * (the runner regenerates once, then moves on to the next key).
 *
 * Returns the name of the first rule that matched, or null when the text is clean.
 */

const RULES = [
	{
		name: 'email address',
		pattern: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
	},
	{
		name: 'Bangladeshi phone number',
		pattern: /(?:\+?88)?01[3-9]\d{8}/,
	},
	{
		name: 'long number (ID, card or phone)',
		pattern: /\d(?:[\s-]?\d){5,}/,
	},
	{
		name: 'asks for an identity document',
		pattern:
			/\b(national id|nid number|student id|passport|birth certificate|driving licen[cs]e number)\b/i,
	},
	{
		name: 'asks for account or card numbers',
		pattern: /\b(account number|card number|imei|serial number|pin code|password)\b/i,
	},
	{
		name: 'asks for a personal name or address',
		pattern:
			/\b(your name|owner'?s name|full name|whose name|home address|phone number|mobile number)\b/i,
	},
];

export function findPersonalData(text) {
	const value = String(text ?? '');

	for (const rule of RULES) {
		if (rule.pattern.test(value)) {
			return rule.name;
		}
	}

	return null;
}

/** Removes personal data from free text instead of rejecting it (used for AI suggestions). */
export function scrubPersonalData(text) {
	return String(text ?? '')
		.replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '[removed]')
		.replace(/\d(?:[\s-]?\d){5,}/g, '[removed]');
}
