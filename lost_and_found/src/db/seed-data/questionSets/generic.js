/**
 * GENERIC question set + aspect list.
 *
 * Used by the 15 categories that are not fully written yet (§7.1). Each category gets
 * its own COPY (its own question_set row), so an admin can later replace it with a
 * reviewed set via `npm run generate-question-sets` + activation, without touching
 * any other category. Sum of weights = 1.00.
 */

import {
	aspect,
	brandQuestion,
	colourQuestion,
	CONDITION_OPTIONS,
	distinctiveMarksQuestion,
	MATERIAL_OPTIONS,
	multiQuestion,
	opt,
	selectQuestion,
} from './common.js';

/** Builds the generic set, using the category name in the question text. */
export function genericQuestions(itemName) {
	return [
		brandQuestion(`What brand is the ${itemName}?`, 0.14),

		colourQuestion('main_colour', 'What is the main colour?', 0.1),

		colourQuestion('second_colour', 'Is there a second colour?', 0.06, [
			opt('single_colour', 'No, one colour only'),
		]),

		selectQuestion(
			'size',
			'How big is it?',
			0.08,
			[
				opt('pocket', 'Fits in a pocket'),
				opt('hand', 'Fits in a hand'),
				opt('bag', 'Needs a bag'),
				opt('very_large', 'Bigger than a bag'),
			],
			'size',
		),

		selectQuestion(
			'material',
			'What is it mostly made of?',
			0.08,
			MATERIAL_OPTIONS,
			'material',
		),

		selectQuestion('condition', 'What condition is it in?', 0.12, CONDITION_OPTIONS),

		multiQuestion(
			'marks',
			'Any marks? (pick all)',
			0.18,
			[
				opt('none', 'None'),
				opt('scratches', 'Scratches'),
				opt('sticker', 'Sticker'),
				opt('engraving', 'Engraving or name'),
				opt('writing', 'Writing'),
				opt('stain', 'Stain'),
				opt('crack_or_tear', 'Crack or tear'),
			],
			'damage',
		),

		multiQuestion('attachments', 'Anything attached? (pick all)', 0.14, [
			opt('none', 'Nothing'),
			opt('case_or_cover', 'Case or cover'),
			opt('strap', 'Strap'),
			opt('keychain_or_charm', 'Keychain or charm'),
			opt('cable', 'Cable'),
			opt('tag', 'Tag or label'),
		]),

		selectQuestion('container', 'Was it inside something?', 0.1, [
			opt('loose', 'No, loose'),
			opt('original_box', 'Original box'),
			opt('pouch', 'Pouch or small bag'),
			opt('sleeve', 'Sleeve'),
			opt('plastic_bag', 'Plastic bag'),
		]),

		distinctiveMarksQuestion(),
	];
}

/** The generic aspect list named in §7.1. */
export const genericAspects = [
	aspect('colour_pattern', 'Colour pattern', [
		'solid',
		'two_tone',
		'striped',
		'printed_pattern',
		'gradient',
	]),

	aspect('marks_damage', 'Marks or damage', [
		'scratch',
		'crack',
		'dent',
		'tear',
		'stain',
		'faded',
	]),

	aspect('attachments', 'Attachments', ['strap', 'keychain', 'charm', 'clip', 'cable']),

	aspect('contents', 'Contents', ['papers', 'cards', 'cables', 'small_items', 'liquid']),

	aspect('case_cover', 'Case or cover', [
		'hard_case',
		'soft_pouch',
		'sleeve',
		'box',
		'skin_wrap',
	]),

	aspect('wear', 'Wear', ['looks_new', 'lightly_used', 'heavily_used', 'repaired']),

	aspect('labels', 'Labels', ['name_label', 'number_label', 'barcode_sticker', 'brand_tag']),

	aspect('other', 'Other detail', [
		'unusual_shape',
		'custom_paint',
		'missing_part',
		'extra_part',
	]),
];
