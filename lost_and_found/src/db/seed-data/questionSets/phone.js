/**
 * PHONE — fully written and reviewed question set.
 *
 * Every question can be answered by a finder holding the phone AND by an owner
 * from memory. Nothing needs the phone powered on (no IMEI, no wallpaper, no serial).
 *
 * Weights: inversely to how common the answer is. "Is the screen cracked?" is strong;
 * "What colour is it?" is weak (most phones are black). Sum = 1.00.
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

export const phoneQuestions = [
	brandQuestion('What brand is the phone?', 0.14),

	colourQuestion('body_colour', 'What colour is the phone itself (not the case)?', 0.06),

	selectQuestion('case_type', 'Does it have a case or cover?', 0.12, [
		opt('no_case', 'No case'),
		opt('clear_case', 'Clear / transparent case'),
		opt('coloured_case', 'Coloured silicone or plastic case'),
		opt('leather_case', 'Leather case'),
		opt('rugged_case', 'Thick rugged case'),
		opt('wallet_case', 'Flip / wallet case'),
	]),

	colourQuestion('case_colour', 'What colour is the case?', 0.07, [opt('no_case', 'No case')]),

	selectQuestion('screen_condition', 'What does the screen look like?', 0.14, [
		opt('intact', 'No cracks'),
		opt('cracked', 'Cracked in one area'),
		opt('heavily_cracked', 'Heavily cracked'),
		opt('protector_cracked', 'Only the screen protector is cracked'),
	]),

	selectQuestion('rear_cameras', 'How many camera lenses are on the back?', 0.1, [
		opt('one', 'One'),
		opt('two', 'Two'),
		opt('three', 'Three'),
		opt('four_plus', 'Four or more'),
	]),

	selectQuestion(
		'size',
		'How big is the phone?',
		0.05,
		[
			opt('compact', 'Small / compact'),
			opt('regular', 'Regular'),
			opt('large', 'Large / "Max" / "Plus" size'),
		],
		'size',
	),

	multiQuestion(
		'marks',
		'Any marks on the phone or case? (pick all)',
		0.12,
		[
			opt('none', 'None'),
			opt('sticker', 'Sticker'),
			opt('engraving', 'Engraving or name'),
			opt('scratches', 'Scratches'),
			opt('dents', 'Dents'),
			opt('paint_marks', 'Paint or marker marks'),
		],
		'damage',
	),

	multiQuestion('accessories', 'Anything attached to it? (pick all)', 0.12, [
		opt('none', 'Nothing attached'),
		opt('pop_socket', 'Pop socket / grip'),
		opt('ring_holder', 'Ring holder'),
		opt('lanyard', 'Lanyard or strap'),
		opt('card_in_case', 'Card or paper kept in the case'),
		opt('charm', 'Charm or keychain'),
	]),

	selectQuestion(
		'back_material',
		'What is the back of the phone made of?',
		0.08,
		[opt('glass'), opt('plastic'), opt('metal'), opt('leather', 'Leather / vegan leather')],
		'material',
	),

	distinctiveMarksQuestion(),
];

export const phoneAspects = [
	aspect('case', 'Case or cover', [
		'clear_silicone',
		'coloured_silicone',
		'hard_plastic',
		'leather',
		'rugged',
		'wallet_flip',
		'glitter_or_printed',
	]),

	aspect('screen_protector', 'Screen protector', [
		'tempered_glass',
		'tempered_glass_cracked',
		'plastic_film',
		'privacy_film',
	]),

	aspect('sticker', 'Sticker', [
		'on_phone_back',
		'on_case_outside',
		'inside_clear_case',
		'near_camera',
		'cartoon_or_anime',
		'logo_or_text',
	]),

	aspect('crack', 'Cracks', [
		'screen_corner',
		'screen_spider_web',
		'screen_line',
		'back_glass',
		'camera_lens',
	]),

	aspect('camera_area', 'Camera area', [
		'lens_protector_ring',
		'scratched_lens',
		'case_covers_camera',
		'colourful_camera_ring',
	]),

	aspect('engraving', 'Engraving or writing', [
		'name_or_initials',
		'number_written',
		'marker_drawing',
		'carved_scratch_mark',
	]),

	aspect('accessories', 'Accessories', [
		'pop_socket',
		'ring_holder',
		'wrist_strap',
		'neck_lanyard',
		'card_in_case',
		'charm',
	]),

	aspect('wear', 'Wear and tear', [
		'scuffed_corners',
		'faded_case',
		'yellowed_clear_case',
		'peeling_paint',
		'dented_frame',
	]),
];
