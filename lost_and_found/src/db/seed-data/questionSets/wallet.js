/**
 * WALLET — fully written and reviewed question set. Sum of weights = 1.00.
 *
 * "Contents" questions ask only for TYPES of things (cards, cash), never card numbers
 * or names, so the finder never has to copy personal data.
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

export const walletQuestions = [
	brandQuestion('What brand is the wallet? (logo or label)', 0.1),

	colourQuestion('main_colour', 'What is the main colour?', 0.08),

	selectQuestion('material', 'What is it made of?', 0.1, MATERIAL_OPTIONS, 'material'),

	selectQuestion('style', 'What style of wallet is it?', 0.14, [
		opt('bifold', 'Bifold (folds once)'),
		opt('trifold', 'Trifold (folds twice)'),
		opt('long_zip', 'Long wallet with zip'),
		opt('long_flap', 'Long wallet with flap'),
		opt('card_holder', 'Slim card holder'),
		opt('pouch', 'Small pouch / coin purse'),
	]),

	selectQuestion('closure', 'How does it close?', 0.1, [
		opt('no_closure', 'It just folds'),
		opt('zip', 'Zip'),
		opt('snap_button', 'Snap button'),
		opt('magnet', 'Magnet'),
		opt('velcro', 'Velcro'),
	]),

	selectQuestion('size', 'How big is it?', 0.06, SIZE_OPTIONS, 'size'),

	multiQuestion('content_types', 'What kinds of things are inside? (pick all)', 0.14, [
		opt('cash', 'Cash notes'),
		opt('coins', 'Coins'),
		opt('cards', 'Plastic cards'),
		opt('paper_receipts', 'Receipts or paper slips'),
		opt('photos', 'Photos'),
		opt('keys', 'Small key'),
		opt('empty', 'Empty'),
	]),

	selectQuestion('condition', 'What condition is it in?', 0.1, [
		opt('new_looking', 'Looks new'),
		opt('slightly_worn', 'Slightly worn'),
		opt('very_worn', 'Very worn / faded'),
		opt('torn', 'Torn or broken somewhere'),
	]),

	multiQuestion(
		'marks',
		'Any marks or decorations? (pick all)',
		0.18,
		[
			opt('none', 'None'),
			opt('big_logo', 'Large logo or print'),
			opt('initials_engraved', 'Initials / name stamped'),
			opt('sticker', 'Sticker'),
			opt('stained', 'Stain'),
			opt('pen_mark', 'Pen or marker mark'),
			opt('stitching_coloured', 'Coloured stitching'),
		],
		'damage',
	),

	distinctiveMarksQuestion(),
];

export const walletAspects = [
	aspect('stitching', 'Stitching', [
		'contrast_colour',
		'loose_threads',
		'double_stitched',
		'no_visible_stitching',
	]),

	aspect('logo', 'Logo or print', [
		'embossed_logo',
		'metal_logo_plate',
		'printed_pattern',
		'cartoon_print',
	]),

	aspect('card_slots', 'Card slots', [
		'one_to_three',
		'four_to_six',
		'seven_plus',
		'clear_id_window',
	]),

	aspect('coin_pocket', 'Coin pocket', [
		'zip_coin_pocket',
		'snap_coin_pocket',
		'open_coin_pocket',
	]),

	aspect('wear', 'Wear and tear', [
		'faded_edges',
		'peeling_surface',
		'torn_lining',
		'bent_shape',
		'broken_zip',
	]),

	aspect('attachments', 'Attachments', ['chain', 'keyring', 'wrist_strap', 'charm']),

	aspect('inside_colour', 'Inside colour', [
		'same_as_outside',
		'contrasting_colour',
		'patterned_lining',
	]),

	aspect('contents', 'Contents (types only)', [
		'transport_card',
		'library_card',
		'shop_loyalty_card',
		'folded_paper',
		'small_photo',
		'religious_card',
	]),
];
