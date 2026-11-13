/**
 * BAG / BACKPACK — fully written and reviewed question set. Sum of weights = 1.00.
 */

import {
	aspect,
	brandQuestion,
	colourQuestion,
	distinctiveMarksQuestion,
	MATERIAL_OPTIONS,
	multiQuestion,
	opt,
	selectQuestion,
	SIZE_OPTIONS,
} from './common.js';

export const bagQuestions = [
	selectQuestion('bag_type', 'What type of bag is it?', 0.14, [
		opt('backpack', 'Backpack'),
		opt('sling', 'Sling / crossbody bag'),
		opt('tote', 'Tote / shoulder bag'),
		opt('laptop_sleeve', 'Laptop sleeve'),
		opt('messenger', 'Messenger bag'),
		opt('duffel', 'Duffel / gym bag'),
		opt('drawstring', 'Drawstring bag'),
	]),

	brandQuestion('What brand is the bag?', 0.1),

	colourQuestion('main_colour', 'What is the main colour?', 0.06),

	colourQuestion('second_colour', 'Is there a second colour?', 0.08, [
		opt('single_colour', 'No, one colour only'),
	]),

	selectQuestion('material', 'What is it made of?', 0.07, MATERIAL_OPTIONS, 'material'),

	selectQuestion('size', 'How big is it?', 0.05, SIZE_OPTIONS, 'size'),

	selectQuestion('compartments', 'How many main zipped compartments?', 0.1, [
		opt('one', 'One'),
		opt('two', 'Two'),
		opt('three', 'Three'),
		opt('four_plus', 'Four or more'),
	]),

	multiQuestion('attachments', 'Anything attached on the outside? (pick all)', 0.15, [
		opt('none', 'Nothing'),
		opt('keychain', 'Keychain or charm'),
		opt('badge_pin', 'Badge or pin'),
		opt('patch', 'Sewn patch'),
		opt('small_lock', 'Small lock'),
		opt('ribbon_tag', 'Ribbon, tag or label'),
		opt('bottle_in_side_pocket', 'Bottle in the side pocket'),
	]),

	multiQuestion('contents', 'What kinds of things are inside? (pick all)', 0.12, [
		opt('books', 'Books or notebooks'),
		opt('laptop', 'Laptop'),
		opt('charger', 'Charger or cables'),
		opt('clothes', 'Clothes'),
		opt('stationery', 'Pens / pencil box'),
		opt('lunch_box', 'Lunch box'),
		opt('umbrella', 'Umbrella'),
		opt('water_bottle', 'Water bottle'),
		opt('empty', 'Empty'),
	]),

	multiQuestion(
		'condition',
		'What condition is it in? (pick all)',
		0.13,
		[
			opt('new_looking', 'Looks new'),
			opt('worn', 'Faded / worn'),
			opt('torn', 'Torn somewhere'),
			opt('stained', 'Stained'),
			opt('broken_zip', 'Broken zip'),
		],
		'damage',
	),

	distinctiveMarksQuestion(),
];

export const bagAspects = [
	aspect('keychain', 'Keychain or charm', [
		'cartoon_figure',
		'soft_toy',
		'metal_logo',
		'beaded',
		'carabiner_clip',
	]),

	aspect('patch_or_pin', 'Patch or pin', [
		'country_flag',
		'band_or_anime',
		'university_logo',
		'text_slogan',
		'enamel_pin',
	]),

	aspect('zip_pulls', 'Zip pulls', [
		'original_metal',
		'rubber_pulls',
		'string_or_ribbon',
		'missing_pull',
	]),

	aspect('side_pockets', 'Side pockets', [
		'mesh_both_sides',
		'mesh_one_side',
		'zipped_side_pocket',
		'no_side_pocket',
	]),

	aspect('straps', 'Straps', [
		'padded_shoulder',
		'chest_strap',
		'waist_strap',
		'adjusted_very_short',
		'repaired_strap',
	]),

	aspect('damage', 'Damage', ['torn_bottom', 'torn_strap', 'broken_zip', 'hole', 'faded_patch']),

	aspect('contents_detail', 'Contents detail', [
		'printed_notes',
		'textbook',
		'tiffin_box',
		'spare_clothes',
		'laptop_charger',
		'medicine',
	]),

	aspect('wear', 'Wear', ['dirty_bottom', 'pilling_fabric', 'peeling_logo', 'stretched_shape']),
];
