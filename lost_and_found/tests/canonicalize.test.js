import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { phoneQuestions } from '../src/db/seed-data/questionSets/phone.js';
import { canonicalize, canonicalizeBrand } from '../src/modules/matching/canonicalize.js';
import { findPersonalData } from '../src/modules/ai/piiFilter.js';
import { CATEGORIES } from '../src/db/seed-data/questionSets/index.js';
import { totalWeight } from '../src/db/seed-data/questionSets/common.js';
import { answers } from './helpers.js';

describe('canonicalize (rules v1)', () => {
	test('colour synonyms share one token', () => {
		const set = { questions: phoneQuestions };

		const a = canonicalize(set, answers({ body_colour: ['navy'] }));
		const b = canonicalize(set, answers({ body_colour: ['dark_blue'] }));

		assert.deepEqual(a.values.body_colour.tokens, ['BLUE_DARK']);
		assert.deepEqual(b.values.body_colour.tokens, ['BLUE_DARK']);
	});

	test('"don\'t know" becomes null (= not answered)', () => {
		const result = canonicalize(
			{ questions: phoneQuestions },
			answers({ size: ['dont_know'] }),
		);

		assert.equal(result.values.size.tokens, null);
	});

	test('brand aliases', () => {
		assert.equal(canonicalizeBrand('iPhone 13'), 'APPLE');
		assert.equal(canonicalizeBrand('Galaxy A54'), 'SAMSUNG');
		assert.equal(canonicalizeBrand('redmi note'), 'XIAOMI');
		assert.equal(canonicalizeBrand('American Tourister'), 'AMERICAN_TOURISTER');
		assert.equal(canonicalizeBrand("don't know"), null);
		assert.equal(canonicalizeBrand('Acme Gadgets'), 'OTHER:ACMEGADGETS');
	});

	test('multi-select tokens are sorted and de-duplicated', () => {
		const result = canonicalize(
			{ questions: phoneQuestions },
			answers({ marks: ['scratches', 'sticker'] }),
		);

		assert.deepEqual(result.values.marks.tokens, ['SCRATCH', 'STICKER']);
	});
});

describe('seed question sets', () => {
	test('every category has weights summing to ~1.00 and a distinctive_marks field', () => {
		for (const category of CATEGORIES) {
			const sum = totalWeight(category.questions);

			assert.ok(Math.abs(sum - 1) < 0.02, `${category.slug}: weights sum to ${sum}`);
			assert.ok(
				category.questions.some(
					(question) =>
						question.key === 'distinctive_marks' && question.match_weight === 0,
				),
				`${category.slug}: needs distinctive_marks with weight 0`,
			);
			assert.ok(category.aspects.length >= 6, `${category.slug}: needs ~8 aspects`);
		}
	});
});

describe('personal-data filter', () => {
	test('rejects numbers, emails and requests for identity data', () => {
		assert.ok(findPersonalData('Call 01712345678'));
		assert.ok(findPersonalData('mail me at a@b.com'));
		assert.ok(findPersonalData('What is your national ID?'));
		assert.ok(findPersonalData("What is the owner's name?"));
		assert.ok(findPersonalData('Card ending 1234 5678'));
	});

	test('allows normal item questions', () => {
		assert.equal(findPersonalData('Does the case have a sticker on the back?'), null);
		assert.equal(findPersonalData('Is there a crack near the top corner of the screen?'), null);
		assert.equal(findPersonalData('How many keys are on the ring?'), null);
	});
});
