/**
 * Small builders shared by the tests and the evaluation script.
 * No database, no AI — everything here is pure data.
 */

import { canonicalize } from '../src/modules/matching/canonicalize.js';

/**
 * { body_colour: ['navy'], brand: 'Samsung', distinctive_marks: 'sticker' }
 *   → stored answer shape { body_colour: { codes: ['navy'] }, brand: { text: 'Samsung' }, … }
 */
export function answers(simple) {
	const result = {};

	for (const [key, value] of Object.entries(simple)) {
		result[key] = Array.isArray(value) ? { codes: value } : { text: value };
	}

	return result;
}

/** [['case', 'clear_silicone'], ['sticker', 'none'], ['crack', 'dont_remember'], ['wear', 'other:faded corners']] */
export function followups(list) {
	return list.map(([aspect, value]) => {
		if (value === 'none' || value === 'dont_remember') {
			return { aspect, kind: value, code: null };
		}

		if (String(value).startsWith('other:')) {
			return { aspect, kind: 'other', code: null, text: value.slice(6), embedding: null };
		}

		return { aspect, kind: 'option', code: value };
	});
}

/** A side ready for scorePair(). */
export function side(
	questionSet,
	{ answers: simpleAnswers, followups: followupList = [], zone, occurredOn, embedding = null },
) {
	return {
		canonical: canonicalize(questionSet, answers(simpleAnswers)),
		followups: followups(followupList),
		zone,
		occurredOn,
		distinctiveEmbedding: embedding,
	};
}

/** Fake campus zones for tests. */
export const ZONES = {
	cseLab: { id: 6, department: 'CSE' },
	cseClass: { id: 7, department: 'CSE' },
	library: { id: 4, department: 'Library' },
	cafeteria: { id: 12, department: 'Student services' },
	parking: { id: 15, department: 'Outdoor' },
};
