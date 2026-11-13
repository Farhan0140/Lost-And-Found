/**
 * EARBUDS CASE — fully written and reviewed question set. Sum of weights = 1.00.
 *
 * Earbud cases look alike (white pill shapes), so the cover, LED and marks carry
 * most of the weight; colour carries very little.
 */

import {
	aspect,
	brandQuestion,
	colourQuestion,
	distinctiveMarksQuestion,
	multiQuestion,
	opt,
	selectQuestion,
} from './common.js';

export const earbudsQuestions = [
	brandQuestion('What brand are the earbuds?', 0.16),

	colourQuestion('case_colour', 'What colour is the charging case itself?', 0.06),

	selectQuestion('shape', 'What shape is the charging case?', 0.12, [
		opt('pill_oval', 'Pill / oval'),
		opt('square_rounded', 'Rounded square'),
		opt('rectangular', 'Rectangle'),
		opt('round_flat', 'Round and flat'),
		opt('tall_stem', 'Tall (earbuds stand upright)'),
	]),

	selectQuestion('cover', 'Is there a protective cover on the case?', 0.14, [
		opt('no_cover', 'No cover'),
		opt('silicone_cover', 'Silicone cover'),
		opt('hard_cover', 'Hard plastic cover'),
		opt('leather_cover', 'Leather cover'),
		opt('character_cover', 'Cartoon / character-shaped cover'),
	]),

	colourQuestion('cover_colour', 'What colour is the cover?', 0.08, [
		opt('no_cover', 'No cover'),
	]),

	selectQuestion('lid', 'How does the case open?', 0.08, [
		opt('flip_top', 'Lid flips up'),
		opt('slide', 'Slides open'),
		opt('magnetic_split', 'Splits apart (magnetic)'),
	]),

	selectQuestion('led', 'Where is the light (LED)?', 0.1, [
		opt('no_led', 'No visible light'),
		opt('front_dot', 'One dot on the front'),
		opt('front_bar', 'A bar / several dots on the front'),
		opt('inside_only', 'Only inside the lid'),
		opt('digital_display', 'Digital battery display'),
	]),

	selectQuestion('earbuds_inside', 'Which earbuds are inside the case?', 0.1, [
		opt('both', 'Both'),
		opt('left_only', 'Only the left one'),
		opt('right_only', 'Only the right one'),
		opt('none_inside', 'None'),
	]),

	multiQuestion(
		'marks',
		'Any marks on the case or cover? (pick all)',
		0.16,
		[
			opt('none', 'None'),
			opt('scratches', 'Scratches'),
			opt('sticker', 'Sticker'),
			opt('engraving', 'Engraving or name'),
			opt('dirt_stain', 'Dirt or stain'),
			opt('crack', 'Crack'),
		],
		'damage',
	),

	distinctiveMarksQuestion(),
];

export const earbudsAspects = [
	aspect('cover_style', 'Cover style', [
		'plain',
		'cartoon_character',
		'animal_shape',
		'glitter',
		'carbon_pattern',
	]),

	aspect('keychain', 'Keychain or clip', ['metal_carabiner', 'strap_loop', 'charm', 'lanyard']),

	aspect('sticker', 'Sticker', ['on_lid', 'on_back', 'name_label', 'cartoon']),

	aspect('scratches', 'Scratches', ['on_lid', 'around_hinge', 'all_over', 'on_bottom']),

	aspect('hinge', 'Hinge or lid', ['loose_lid', 'stiff_lid', 'broken_hinge', 'magnet_weak']),

	aspect('port', 'Charging port', ['usb_c', 'lightning', 'micro_usb', 'wireless_only']),

	aspect('dirt', 'Dirt or discolouration', [
		'yellowed',
		'grey_dirt_in_gaps',
		'ink_mark',
		'makeup_stain',
	]),

	aspect('earbud_tips', 'Ear tips', [
		'no_tips_stem',
		'white_tips',
		'black_tips',
		'coloured_tips',
		'foam_tips',
	]),
];
