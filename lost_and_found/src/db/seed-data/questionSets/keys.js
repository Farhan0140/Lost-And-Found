/**
 * KEYS — fully written and reviewed question set. Sum of weights = 1.00.
 */

import {
	aspect,
	colourQuestion,
	distinctiveMarksQuestion,
	multiQuestion,
	opt,
	selectQuestion,
} from './common.js';

export const keysQuestions = [
	selectQuestion('key_count', 'How many keys are on it?', 0.12, [
		opt('one', 'One'),
		opt('two', 'Two'),
		opt('three', 'Three'),
		opt('four_to_five', 'Four or five'),
		opt('six_plus', 'Six or more'),
	]),

	selectQuestion('ring_type', 'What holds the keys together?', 0.1, [
		opt('single_ring', 'One metal ring'),
		opt('double_ring', 'Two connected rings'),
		opt('carabiner', 'Carabiner clip'),
		opt('belt_clip', 'Belt clip'),
		opt('lanyard', 'Lanyard / strap'),
	]),

	multiQuestion('key_types', 'What kinds of keys are there? (pick all)', 0.16, [
		opt('door_key', 'Door key'),
		opt('small_padlock', 'Small padlock key'),
		opt('cabinet_key', 'Cabinet / locker key'),
		opt('car_fob', 'Car key / remote'),
		opt('motorbike_key', 'Motorbike key'),
		opt('bicycle_lock_key', 'Bicycle lock key'),
		opt('access_fob', 'Access card / RFID fob'),
	]),

	selectQuestion('keychain', 'Is there a keychain or charm?', 0.16, [
		opt('no_keychain', 'No keychain'),
		opt('figure_toy', 'Small figure or toy'),
		opt('brand_logo', 'Brand logo'),
		opt('bottle_opener', 'Bottle opener / tool'),
		opt('leather_tag', 'Leather tag'),
		opt('photo_frame', 'Photo frame'),
		opt('mini_light', 'Mini torch / light'),
	]),

	colourQuestion('keychain_colour', 'What colour is the keychain?', 0.08, [
		opt('no_keychain', 'No keychain'),
	]),

	selectQuestion('metal_colour', 'What colour are most of the keys?', 0.08, [
		opt('silver_metal', 'Silver'),
		opt('brass_gold', 'Brass / gold'),
		opt('black_coated', 'Black'),
		opt('mixed', 'Mixed'),
	]),

	selectQuestion('key_caps', 'Do any keys have coloured rubber caps?', 0.1, [
		opt('no_caps', 'No'),
		opt('one_cap', 'One key'),
		opt('several_caps', 'Several keys'),
	]),

	colourQuestion('strap_colour', 'If there is a strap or lanyard, what colour?', 0.08, [
		opt('no_strap', 'No strap'),
	]),

	multiQuestion(
		'labels',
		'Any labels or markings? (pick all)',
		0.12,
		[
			opt('none', 'None'),
			opt('number_tag', 'Number tag'),
			opt('written_label', 'Written label'),
			opt('coloured_tape', 'Coloured tape'),
			opt('engraving', 'Engraving'),
		],
		'damage',
	),

	distinctiveMarksQuestion(
		'Anything distinctive? (a special charm, a broken key, writing — but NO addresses)',
	),
];

export const keysAspects = [
	aspect('charm', 'Charm', [
		'cartoon',
		'religious_symbol',
		'sports_team',
		'letter_initial',
		'heart',
	]),

	aspect('key_shape', 'Unusual key', [
		'very_long_key',
		'round_head_key',
		'double_sided_key',
		'cross_shaped_key',
	]),

	aspect('caps', 'Key caps', ['red_cap', 'blue_cap', 'green_cap', 'yellow_cap', 'mixed_caps']),

	aspect('tag', 'Tag', ['plastic_number_tag', 'paper_tag', 'metal_tag', 'leather_tag']),

	aspect('fob', 'Remote or fob', ['car_remote', 'gate_remote', 'rfid_tear_drop', 'rfid_card']),

	aspect('ring', 'Ring', ['small_ring', 'large_ring', 'split_ring_coloured', 'twisted_wire']),

	aspect('wear', 'Wear', ['rusty_key', 'bent_key', 'shiny_new_key', 'worn_charm']),

	aspect('extras', 'Extras', ['whistle', 'usb_drive', 'nail_clipper', 'mini_knife', 'coin']),
];
