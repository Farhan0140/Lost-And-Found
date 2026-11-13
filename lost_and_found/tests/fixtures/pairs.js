/**
 * Evaluation fixtures (§9.4) — FROZEN finder/owner pairs.
 *
 *   EVALUATION_PAIRS  30 pairs: 12 true matches, 12 near-misses, 6 obvious non-matches
 *   HELD_OUT_PAIRS    10 pairs written AFTER the thresholds were fixed; reported separately
 *
 * Each side = { answers, followups, zone, occurredOn }.
 *   - True matches are worded DIFFERENTLY on purpose (navy vs dark blue, "iPhone" vs "Apple"),
 *     and owners forget things ("don't know", "don't remember").
 *   - Near-misses look alike (two black wallets, two white earbud cases …) and differ on
 *     one or two discriminating details.
 *
 * NOTE: follow-up answers here are hand-written stand-ins with aspect codes. Once the
 * system runs on real data, replace them with frozen real generations (question text,
 * aspect, options, answers, model, prompt hash) — generated output is non-deterministic,
 * so the evaluation must always run on frozen fixtures.
 *
 * Embeddings are not frozen here, so the cosine term is dropped (renormalised) in this run.
 */

import { ZONES } from '../helpers.js';

// ─────────────────────────────────────────────────────────────
//  Base descriptions per category (finder's view); pairs override fields
// ─────────────────────────────────────────────────────────────

const phone = (overrides = {}) => ({
	brand: 'Samsung',
	body_colour: ['navy'],
	case_type: ['clear_case'],
	case_colour: ['transparent'],
	screen_condition: ['intact'],
	rear_cameras: ['three'],
	size: ['regular'],
	marks: ['sticker'],
	accessories: ['none'],
	back_material: ['glass'],
	...overrides,
});

const wallet = (overrides = {}) => ({
	brand: '',
	main_colour: ['black'],
	material: ['leather'],
	style: ['bifold'],
	closure: ['no_closure'],
	size: ['small'],
	content_types: ['cash', 'cards'],
	condition: ['slightly_worn'],
	marks: ['none'],
	...overrides,
});

const bag = (overrides = {}) => ({
	bag_type: ['backpack'],
	brand: 'JanSport',
	main_colour: ['navy'],
	second_colour: ['single_colour'],
	material: ['nylon'],
	size: ['medium'],
	compartments: ['two'],
	attachments: ['keychain'],
	contents: ['books', 'stationery'],
	condition: ['worn'],
	...overrides,
});

const earbuds = (overrides = {}) => ({
	brand: 'AirPods',
	case_colour: ['white'],
	shape: ['pill_oval'],
	cover: ['no_cover'],
	cover_colour: ['no_cover'],
	lid: ['flip_top'],
	led: ['front_dot'],
	earbuds_inside: ['both'],
	marks: ['scratches'],
	...overrides,
});

const keys = (overrides = {}) => ({
	key_count: ['three'],
	ring_type: ['single_ring'],
	key_types: ['door_key', 'small_padlock'],
	keychain: ['figure_toy'],
	keychain_colour: ['red'],
	metal_colour: ['silver_metal'],
	key_caps: ['no_caps'],
	strap_colour: ['no_strap'],
	labels: ['none'],
	...overrides,
});

const pair = (id, type, category, note, found, lost) => ({ id, type, category, note, found, lost });

const at = (zone, occurredOn) => ({ zone, occurredOn });

// ─────────────────────────────────────────────────────────────
//  30 evaluation pairs
// ─────────────────────────────────────────────────────────────

export const EVALUATION_PAIRS = [
	// ══ TRUE MATCHES (12) ══════════════════════════════════════
	pair(
		'TM01',
		'true_match',
		'phone',
		'navy vs dark blue; owner forgets camera count',
		{
			answers: phone({ screen_condition: ['cracked'] }),
			followups: [
				['case', 'clear_silicone'],
				['sticker', 'inside_clear_case'],
				['crack', 'screen_corner'],
				['accessories', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-10'),
		},
		{
			answers: phone({
				body_colour: ['dark_blue'],
				screen_condition: ['cracked'],
				rear_cameras: ['dont_know'],
			}),
			followups: [
				['case', 'clear_silicone'],
				['sticker', 'inside_clear_case'],
				['crack', 'screen_corner'],
				['accessories', 'dont_remember'],
			],
			...at(ZONES.cseLab, '2026-11-09'),
		},
	),

	pair(
		'TM02',
		'true_match',
		'phone',
		'"iPhone 13" vs "Apple"; silver vs grey; owner remembers only the sticker',
		{
			answers: phone({
				brand: 'iPhone 13',
				body_colour: ['silver'],
				case_type: ['coloured_case'],
				case_colour: ['pink'],
				marks: ['sticker', 'scratches'],
				rear_cameras: ['two'],
			}),
			followups: [
				['case', 'coloured_silicone'],
				['sticker', 'on_case_outside'],
				['camera_area', 'lens_protector_ring'],
				['wear', 'scuffed_corners'],
			],
			...at(ZONES.library, '2026-11-05'),
		},
		{
			answers: phone({
				brand: 'Apple',
				body_colour: ['grey'],
				case_type: ['coloured_case'],
				case_colour: ['rose_gold'],
				marks: ['sticker'],
				rear_cameras: ['two'],
			}),
			followups: [
				['case', 'coloured_silicone'],
				['sticker', 'on_case_outside'],
				['camera_area', 'lens_protector_ring'],
				['wear', 'dont_remember'],
			],
			...at(ZONES.library, '2026-11-04'),
		},
	),

	pair(
		'TM03',
		'true_match',
		'wallet',
		'faux leather vs leather; beige vs brown',
		{
			answers: wallet({
				main_colour: ['brown'],
				material: ['leather'],
				marks: ['stitching_coloured'],
			}),
			followups: [
				['stitching', 'contrast_colour'],
				['card_slots', 'four_to_six'],
				['coin_pocket', 'snap_coin_pocket'],
				['logo', 'embossed_logo'],
			],
			...at(ZONES.cafeteria, '2026-11-02'),
		},
		{
			answers: wallet({
				main_colour: ['beige'],
				material: ['faux_leather'],
				marks: ['stitching_coloured'],
			}),
			followups: [
				['stitching', 'contrast_colour'],
				['card_slots', 'four_to_six'],
				['coin_pocket', 'snap_coin_pocket'],
				['logo', 'embossed_logo'],
			],
			...at(ZONES.cafeteria, '2026-11-02'),
		},
	),

	pair(
		'TM04',
		'true_match',
		'wallet',
		'long zip wallet with initials; owner unsure of contents',
		{
			answers: wallet({
				style: ['long_zip'],
				closure: ['zip'],
				marks: ['initials_engraved'],
				content_types: ['cash', 'cards', 'paper_receipts'],
			}),
			followups: [
				['logo', 'metal_logo_plate'],
				['card_slots', 'seven_plus'],
				['wear', 'faded_edges'],
				['attachments', 'wrist_strap'],
			],
			...at(ZONES.cseClass, '2026-11-08'),
		},
		{
			answers: wallet({
				style: ['long_zip'],
				closure: ['zip'],
				marks: ['initials_engraved'],
				content_types: ['cash', 'cards'],
			}),
			followups: [
				['logo', 'metal_logo_plate'],
				['card_slots', 'seven_plus'],
				['wear', 'faded_edges'],
				['attachments', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-08'),
		},
	),

	pair(
		'TM05',
		'true_match',
		'bag',
		'"JANSPORT" vs "Jansport"; owner unsure of second colour',
		{
			answers: bag(),
			followups: [
				['keychain', 'cartoon_figure'],
				['zip_pulls', 'string_or_ribbon'],
				['side_pockets', 'mesh_both_sides'],
				['damage', 'none'],
			],
			...at(ZONES.library, '2026-11-11'),
		},
		{
			answers: bag({ brand: 'jansport', second_colour: ['dont_know'] }),
			followups: [
				['keychain', 'cartoon_figure'],
				['zip_pulls', 'string_or_ribbon'],
				['side_pockets', 'mesh_both_sides'],
				['damage', 'none'],
			],
			...at(ZONES.library, '2026-11-10'),
		},
	),

	pair(
		'TM06',
		'true_match',
		'bag',
		'laptop sleeve: nylon vs fabric, grey vs silver',
		{
			answers: bag({
				bag_type: ['laptop_sleeve'],
				brand: '',
				main_colour: ['grey'],
				material: ['nylon'],
				compartments: ['one'],
				attachments: ['none'],
				contents: ['laptop', 'charger'],
				condition: ['new_looking'],
			}),
			followups: [
				['zip_pulls', 'rubber_pulls'],
				['damage', 'none'],
				['contents_detail', 'laptop_charger'],
				['wear', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-06'),
		},
		{
			answers: bag({
				bag_type: ['laptop_sleeve'],
				brand: "don't know",
				main_colour: ['silver'],
				material: ['fabric'],
				compartments: ['one'],
				attachments: ['none'],
				contents: ['laptop'],
				condition: ['new_looking'],
			}),
			followups: [
				['zip_pulls', 'rubber_pulls'],
				['damage', 'none'],
				['contents_detail', 'laptop_charger'],
				['wear', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-05'),
		},
	),

	pair(
		'TM07',
		'true_match',
		'earbuds_case',
		'"AirPods Pro" vs "Apple"; pink vs rose gold cover',
		{
			answers: earbuds({
				cover: ['silicone_cover'],
				cover_colour: ['pink'],
				marks: ['none'],
			}),
			followups: [
				['cover_style', 'plain'],
				['keychain', 'metal_carabiner'],
				['sticker', 'none'],
				['hinge', 'stiff_lid'],
			],
			...at(ZONES.cafeteria, '2026-11-09'),
		},
		{
			answers: earbuds({
				brand: 'Apple',
				cover: ['silicone_cover'],
				cover_colour: ['rose_gold'],
				marks: ['none'],
			}),
			followups: [
				['cover_style', 'plain'],
				['keychain', 'metal_carabiner'],
				['sticker', 'none'],
				['hinge', 'dont_remember'],
			],
			...at(ZONES.cafeteria, '2026-11-09'),
		},
	),

	pair(
		'TM08',
		'true_match',
		'earbuds_case',
		'black Galaxy Buds; owner unsure about the LED',
		{
			answers: earbuds({
				brand: 'Samsung',
				case_colour: ['black'],
				shape: ['square_rounded'],
				led: ['front_bar'],
				marks: ['scratches', 'sticker'],
			}),
			followups: [
				['sticker', 'on_lid'],
				['scratches', 'on_lid'],
				['port', 'usb_c'],
				['dirt', 'grey_dirt_in_gaps'],
			],
			...at(ZONES.parking, '2026-11-01'),
		},
		{
			answers: earbuds({
				brand: 'Galaxy Buds',
				case_colour: ['black'],
				shape: ['square_rounded'],
				led: ['dont_know'],
				marks: ['sticker'],
			}),
			followups: [
				['sticker', 'on_lid'],
				['scratches', 'on_lid'],
				['port', 'usb_c'],
				['dirt', 'dont_remember'],
			],
			...at(ZONES.parking, '2026-10-31'),
		},
	),

	pair(
		'TM09',
		'true_match',
		'keys',
		'red vs maroon toy keychain; carabiner',
		{
			answers: keys({ ring_type: ['carabiner'] }),
			followups: [
				['charm', 'cartoon'],
				['caps', 'none'],
				['tag', 'none'],
				['extras', 'whistle'],
			],
			...at(ZONES.cseClass, '2026-11-07'),
		},
		{
			answers: keys({ ring_type: ['carabiner'], keychain_colour: ['maroon'] }),
			followups: [
				['charm', 'cartoon'],
				['caps', 'none'],
				['tag', 'none'],
				['extras', 'whistle'],
			],
			...at(ZONES.cseClass, '2026-11-07'),
		},
	),

	pair(
		'TM10',
		'true_match',
		'keys',
		'owner miscounts the keys (4–5 vs 6+), everything else agrees',
		{
			answers: keys({
				key_count: ['four_to_five'],
				key_types: ['door_key', 'motorbike_key', 'cabinet_key'],
				keychain: ['leather_tag'],
				keychain_colour: ['brown'],
				key_caps: ['several_caps'],
				labels: ['coloured_tape'],
			}),
			followups: [
				['caps', 'mixed_caps'],
				['tag', 'leather_tag'],
				['fob', 'none'],
				['wear', 'rusty_key'],
			],
			...at(ZONES.parking, '2026-11-03'),
		},
		{
			answers: keys({
				key_count: ['six_plus'],
				key_types: ['door_key', 'motorbike_key', 'cabinet_key'],
				keychain: ['leather_tag'],
				keychain_colour: ['beige'],
				key_caps: ['several_caps'],
				labels: ['coloured_tape'],
			}),
			followups: [
				['caps', 'mixed_caps'],
				['tag', 'leather_tag'],
				['fob', 'none'],
				['wear', 'rusty_key'],
			],
			...at(ZONES.parking, '2026-11-02'),
		},
	),

	pair(
		'TM11',
		'true_match',
		'phone',
		'"Redmi" vs "Xiaomi"; lost in the CSE classroom, found in the CSE lab, 2 days apart',
		{
			answers: phone({
				brand: 'Redmi Note 12',
				body_colour: ['black'],
				case_type: ['rugged_case'],
				case_colour: ['black'],
				accessories: ['ring_holder'],
				marks: ['scratches'],
				back_material: ['plastic'],
			}),
			followups: [
				['case', 'rugged'],
				['accessories', 'ring_holder'],
				['screen_protector', 'tempered_glass'],
				['wear', 'scuffed_corners'],
			],
			...at(ZONES.cseLab, '2026-11-10'),
		},
		{
			answers: phone({
				brand: 'Xiaomi',
				body_colour: ['black'],
				case_type: ['rugged_case'],
				case_colour: ['black'],
				accessories: ['ring_holder'],
				marks: ['scratches'],
				back_material: ['plastic'],
			}),
			followups: [
				['case', 'rugged'],
				['accessories', 'ring_holder'],
				['screen_protector', 'tempered_glass'],
				['wear', 'scuffed_corners'],
			],
			...at(ZONES.cseClass, '2026-11-08'),
		},
	),

	pair(
		'TM12',
		'true_match',
		'bag',
		'black backpack; owner enters the date 1 day AFTER it was found (tolerance)',
		{
			answers: bag({
				brand: 'Nike',
				main_colour: ['black'],
				second_colour: ['white'],
				material: ['nylon'],
				attachments: ['badge_pin'],
				condition: ['worn', 'broken_zip'],
			}),
			followups: [
				['patch_or_pin', 'enamel_pin'],
				['zip_pulls', 'missing_pull'],
				['damage', 'broken_zip'],
				['straps', 'padded_shoulder'],
			],
			...at(ZONES.library, '2026-11-09'),
		},
		{
			answers: bag({
				brand: 'nike',
				main_colour: ['black'],
				second_colour: ['white'],
				material: ['fabric'],
				attachments: ['badge_pin'],
				condition: ['broken_zip'],
			}),
			followups: [
				['patch_or_pin', 'enamel_pin'],
				['zip_pulls', 'missing_pull'],
				['damage', 'broken_zip'],
				['straps', 'padded_shoulder'],
			],
			...at(ZONES.library, '2026-11-10'),
		},
	),

	// ══ NEAR-MISSES (12) ═══════════════════════════════════════
	pair(
		'NM01',
		'near_miss',
		'wallet',
		'two black leather bifolds; one has initials, stitching differs',
		{
			answers: wallet(),
			followups: [
				['stitching', 'no_visible_stitching'],
				['card_slots', 'four_to_six'],
				['coin_pocket', 'none'],
				['logo', 'none'],
			],
			...at(ZONES.library, '2026-11-10'),
		},
		{
			answers: wallet({ marks: ['initials_engraved'] }),
			followups: [
				['stitching', 'contrast_colour'],
				['card_slots', 'four_to_six'],
				['coin_pocket', 'none'],
				['logo', 'none'],
			],
			...at(ZONES.library, '2026-11-10'),
		},
	),

	pair(
		'NM02',
		'near_miss',
		'wallet',
		'two black wallets: bifold vs trifold',
		{
			answers: wallet({ style: ['bifold'] }),
			followups: [
				['card_slots', 'four_to_six'],
				['coin_pocket', 'none'],
				['wear', 'faded_edges'],
				['logo', 'embossed_logo'],
			],
			...at(ZONES.cafeteria, '2026-11-07'),
		},
		{
			answers: wallet({ style: ['trifold'], closure: ['snap_button'] }),
			followups: [
				['card_slots', 'one_to_three'],
				['coin_pocket', 'snap_coin_pocket'],
				['wear', 'faded_edges'],
				['logo', 'embossed_logo'],
			],
			...at(ZONES.cafeteria, '2026-11-06'),
		},
	),

	pair(
		'NM03',
		'near_miss',
		'earbuds_case',
		'two white AirPods cases; one has a silicone cover',
		{
			answers: earbuds(),
			followups: [
				['cover_style', 'none'],
				['sticker', 'none'],
				['scratches', 'on_lid'],
				['port', 'lightning'],
			],
			...at(ZONES.cseLab, '2026-11-09'),
		},
		{
			answers: earbuds({ cover: ['silicone_cover'], cover_colour: ['white'] }),
			followups: [
				['cover_style', 'plain'],
				['sticker', 'none'],
				['scratches', 'on_lid'],
				['port', 'lightning'],
			],
			...at(ZONES.cseLab, '2026-11-09'),
		},
	),

	pair(
		'NM04',
		'near_miss',
		'earbuds_case',
		'two white cases; different earbuds inside and LED',
		{
			answers: earbuds({ earbuds_inside: ['both'], led: ['front_dot'] }),
			followups: [
				['cover_style', 'none'],
				['hinge', 'loose_lid'],
				['port', 'usb_c'],
				['dirt', 'yellowed'],
			],
			...at(ZONES.library, '2026-11-08'),
		},
		{
			answers: earbuds({ earbuds_inside: ['left_only'], led: ['inside_only'] }),
			followups: [
				['cover_style', 'none'],
				['hinge', 'stiff_lid'],
				['port', 'usb_c'],
				['dirt', 'yellowed'],
			],
			...at(ZONES.library, '2026-11-08'),
		},
	),

	pair(
		'NM05',
		'near_miss',
		'phone',
		'same model phones, only the cracked screen differs',
		{
			answers: phone({ screen_condition: ['intact'] }),
			followups: [
				['case', 'clear_silicone'],
				['crack', 'none'],
				['sticker', 'inside_clear_case'],
				['screen_protector', 'tempered_glass'],
			],
			...at(ZONES.cseLab, '2026-11-10'),
		},
		{
			answers: phone({ screen_condition: ['cracked'] }),
			followups: [
				['case', 'clear_silicone'],
				['crack', 'screen_spider_web'],
				['sticker', 'inside_clear_case'],
				['screen_protector', 'tempered_glass'],
			],
			...at(ZONES.cseLab, '2026-11-10'),
		},
	),

	pair(
		'NM06',
		'near_miss',
		'phone',
		'same model; clear case vs thick rugged case',
		{
			answers: phone({ case_type: ['clear_case'] }),
			followups: [
				['case', 'clear_silicone'],
				['sticker', 'inside_clear_case'],
				['accessories', 'none'],
				['wear', 'yellowed_clear_case'],
			],
			...at(ZONES.cafeteria, '2026-11-05'),
		},
		{
			answers: phone({ case_type: ['rugged_case'], case_colour: ['black'], marks: ['none'] }),
			followups: [
				['case', 'rugged'],
				['sticker', 'none'],
				['accessories', 'none'],
				['wear', 'scuffed_corners'],
			],
			...at(ZONES.cafeteria, '2026-11-05'),
		},
	),

	pair(
		'NM07',
		'near_miss',
		'bag',
		'two navy backpacks differing by brand',
		{
			answers: bag({ brand: 'JanSport' }),
			followups: [
				['keychain', 'cartoon_figure'],
				['side_pockets', 'mesh_both_sides'],
				['straps', 'padded_shoulder'],
				['damage', 'none'],
			],
			...at(ZONES.library, '2026-11-09'),
		},
		{
			answers: bag({ brand: 'Wildcraft', compartments: ['three'] }),
			followups: [
				['keychain', 'cartoon_figure'],
				['side_pockets', 'zipped_side_pocket'],
				['straps', 'padded_shoulder'],
				['damage', 'none'],
			],
			...at(ZONES.library, '2026-11-08'),
		},
	),

	pair(
		'NM08',
		'near_miss',
		'bag',
		'identical navy JanSports; keychain vs none (the old NM08 case)',
		{
			answers: bag({ attachments: ['keychain'] }),
			followups: [
				['keychain', 'soft_toy'],
				['zip_pulls', 'original_metal'],
				['side_pockets', 'mesh_both_sides'],
				['damage', 'none'],
			],
			...at(ZONES.cseClass, '2026-11-10'),
		},
		{
			answers: bag({ attachments: ['none'] }),
			followups: [
				['keychain', 'none'],
				['zip_pulls', 'original_metal'],
				['side_pockets', 'mesh_both_sides'],
				['damage', 'none'],
			],
			...at(ZONES.cseClass, '2026-11-10'),
		},
	),

	pair(
		'NM09',
		'near_miss',
		'keys',
		'similar keys; different keychain',
		{
			answers: keys(),
			followups: [
				['charm', 'cartoon'],
				['caps', 'none'],
				['tag', 'none'],
				['ring', 'small_ring'],
			],
			...at(ZONES.cafeteria, '2026-11-04'),
		},
		{
			answers: keys({ keychain: ['bottle_opener'], keychain_colour: ['silver'] }),
			followups: [
				['charm', 'none'],
				['caps', 'none'],
				['tag', 'none'],
				['ring', 'small_ring'],
			],
			...at(ZONES.cafeteria, '2026-11-04'),
		},
	),

	pair(
		'NM10',
		'near_miss',
		'keys',
		'same keychain; different number and types of keys',
		{
			answers: keys({ key_count: ['two'], key_types: ['door_key'] }),
			followups: [
				['charm', 'cartoon'],
				['fob', 'none'],
				['tag', 'none'],
				['extras', 'none'],
			],
			...at(ZONES.parking, '2026-11-06'),
		},
		{
			answers: keys({
				key_count: ['four_to_five'],
				key_types: ['door_key', 'car_fob', 'access_fob'],
			}),
			followups: [
				['charm', 'cartoon'],
				['fob', 'car_remote'],
				['tag', 'none'],
				['extras', 'none'],
			],
			...at(ZONES.parking, '2026-11-06'),
		},
	),

	pair(
		'NM11',
		'near_miss',
		'phone',
		'two black Samsungs; different case and accessories',
		{
			answers: phone({
				body_colour: ['black'],
				case_type: ['leather_case'],
				case_colour: ['brown'],
				accessories: ['lanyard'],
				marks: ['none'],
			}),
			followups: [
				['case', 'leather'],
				['accessories', 'neck_lanyard'],
				['sticker', 'none'],
				['crack', 'none'],
			],
			...at(ZONES.library, '2026-11-02'),
		},
		{
			answers: phone({
				body_colour: ['black'],
				case_type: ['wallet_case'],
				case_colour: ['black'],
				accessories: ['card_in_case'],
				marks: ['none'],
			}),
			followups: [
				['case', 'wallet_flip'],
				['accessories', 'card_in_case'],
				['sticker', 'none'],
				['crack', 'none'],
			],
			...at(ZONES.library, '2026-11-02'),
		},
	),

	pair(
		'NM12',
		'near_miss',
		'wallet',
		'two brown wallets; different style and closure',
		{
			answers: wallet({
				main_colour: ['brown'],
				style: ['card_holder'],
				closure: ['no_closure'],
			}),
			followups: [
				['card_slots', 'one_to_three'],
				['coin_pocket', 'none'],
				['stitching', 'double_stitched'],
				['wear', 'faded_edges'],
			],
			...at(ZONES.cseLab, '2026-11-08'),
		},
		{
			answers: wallet({
				main_colour: ['brown'],
				style: ['bifold'],
				closure: ['snap_button'],
			}),
			followups: [
				['card_slots', 'four_to_six'],
				['coin_pocket', 'none'],
				['stitching', 'double_stitched'],
				['wear', 'faded_edges'],
			],
			...at(ZONES.cseLab, '2026-11-08'),
		},
	),

	// ══ OBVIOUS NON-MATCHES (6) ════════════════════════════════
	pair(
		'NO01',
		'non_match',
		'phone',
		'different brand, colour, case, place',
		{
			answers: phone(),
			followups: [
				['case', 'clear_silicone'],
				['sticker', 'inside_clear_case'],
				['crack', 'none'],
				['accessories', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-10'),
		},
		{
			answers: phone({
				brand: 'Apple',
				body_colour: ['gold'],
				case_type: ['no_case'],
				case_colour: ['no_case'],
				rear_cameras: ['two'],
				marks: ['none'],
				back_material: ['metal'],
			}),
			followups: [
				['case', 'none'],
				['sticker', 'none'],
				['crack', 'back_glass'],
				['accessories', 'none'],
			],
			...at(ZONES.parking, '2026-10-20'),
		},
	),

	pair(
		'NO02',
		'non_match',
		'wallet',
		'black leather bifold vs pink fabric pouch',
		{
			answers: wallet(),
			followups: [
				['card_slots', 'four_to_six'],
				['logo', 'none'],
				['wear', 'faded_edges'],
				['coin_pocket', 'none'],
			],
			...at(ZONES.library, '2026-11-10'),
		},
		{
			answers: wallet({
				main_colour: ['pink'],
				material: ['fabric'],
				style: ['pouch'],
				closure: ['zip'],
				content_types: ['coins'],
				condition: ['new_looking'],
				marks: ['big_logo'],
			}),
			followups: [
				['card_slots', 'none'],
				['logo', 'cartoon_print'],
				['wear', 'none'],
				['coin_pocket', 'zip_coin_pocket'],
			],
			...at(ZONES.cafeteria, '2026-11-01'),
		},
	),

	pair(
		'NO03',
		'non_match',
		'bag',
		'navy backpack vs red tote',
		{
			answers: bag(),
			followups: [
				['keychain', 'cartoon_figure'],
				['straps', 'padded_shoulder'],
				['damage', 'none'],
				['side_pockets', 'mesh_both_sides'],
			],
			...at(ZONES.cseClass, '2026-11-09'),
		},
		{
			answers: bag({
				bag_type: ['tote'],
				brand: '',
				main_colour: ['red'],
				material: ['canvas'],
				compartments: ['one'],
				attachments: ['none'],
				contents: ['clothes'],
				condition: ['new_looking'],
			}),
			followups: [
				['keychain', 'none'],
				['straps', 'adjusted_very_short'],
				['damage', 'none'],
				['side_pockets', 'no_side_pocket'],
			],
			...at(ZONES.parking, '2026-10-25'),
		},
	),

	pair(
		'NO04',
		'non_match',
		'earbuds_case',
		'white AirPods vs black round JBL',
		{
			answers: earbuds(),
			followups: [
				['cover_style', 'none'],
				['port', 'lightning'],
				['sticker', 'none'],
				['scratches', 'on_lid'],
			],
			...at(ZONES.library, '2026-11-08'),
		},
		{
			answers: earbuds({
				brand: 'JBL',
				case_colour: ['black'],
				shape: ['round_flat'],
				lid: ['slide'],
				led: ['front_bar'],
				marks: ['none'],
			}),
			followups: [
				['cover_style', 'none'],
				['port', 'usb_c'],
				['sticker', 'on_lid'],
				['scratches', 'none'],
			],
			...at(ZONES.cafeteria, '2026-11-02'),
		},
	),

	pair(
		'NO05',
		'non_match',
		'keys',
		'one key on a lanyard vs a big bunch with a car fob',
		{
			answers: keys({
				key_count: ['one'],
				ring_type: ['lanyard'],
				key_types: ['cabinet_key'],
				keychain: ['no_keychain'],
				keychain_colour: ['no_keychain'],
				strap_colour: ['blue'],
			}),
			followups: [
				['charm', 'none'],
				['fob', 'none'],
				['tag', 'plastic_number_tag'],
				['extras', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-10'),
		},
		{
			answers: keys({
				key_count: ['six_plus'],
				key_types: ['door_key', 'car_fob', 'motorbike_key'],
				keychain: ['brand_logo'],
				keychain_colour: ['black'],
				metal_colour: ['mixed'],
			}),
			followups: [
				['charm', 'letter_initial'],
				['fob', 'car_remote'],
				['tag', 'none'],
				['extras', 'usb_drive'],
			],
			...at(ZONES.parking, '2026-11-01'),
		},
	),

	pair(
		'NO06',
		'non_match',
		'phone',
		'identical description, but found 5 days BEFORE it was lost (date gate)',
		{
			answers: phone(),
			followups: [
				['case', 'clear_silicone'],
				['sticker', 'inside_clear_case'],
				['crack', 'none'],
				['accessories', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-01'),
		},
		{
			answers: phone(),
			followups: [
				['case', 'clear_silicone'],
				['sticker', 'inside_clear_case'],
				['crack', 'none'],
				['accessories', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-06'),
		},
	),
];

// ─────────────────────────────────────────────────────────────
//  10 held-out pairs (written after the thresholds were fixed)
// ─────────────────────────────────────────────────────────────

export const HELD_OUT_PAIRS = [
	pair(
		'HO-TM1',
		'true_match',
		'phone',
		'Vivo phone, "blue" vs "light blue", owner forgets back material',
		{
			answers: phone({
				brand: 'Vivo Y36',
				body_colour: ['blue'],
				case_type: ['coloured_case'],
				case_colour: ['purple'],
				accessories: ['pop_socket'],
			}),
			followups: [
				['case', 'coloured_silicone'],
				['accessories', 'pop_socket'],
				['sticker', 'none'],
				['camera_area', 'colourful_camera_ring'],
			],
			...at(ZONES.cafeteria, '2026-11-11'),
		},
		{
			answers: phone({
				brand: 'vivo',
				body_colour: ['light_blue'],
				case_type: ['coloured_case'],
				case_colour: ['purple'],
				accessories: ['pop_socket'],
				back_material: ['dont_know'],
			}),
			followups: [
				['case', 'coloured_silicone'],
				['accessories', 'pop_socket'],
				['sticker', 'none'],
				['camera_area', 'dont_remember'],
			],
			...at(ZONES.cafeteria, '2026-11-10'),
		},
	),

	pair(
		'HO-TM2',
		'true_match',
		'wallet',
		'card holder, navy vs dark blue',
		{
			answers: wallet({
				main_colour: ['navy'],
				style: ['card_holder'],
				content_types: ['cards'],
			}),
			followups: [
				['card_slots', 'one_to_three'],
				['logo', 'embossed_logo'],
				['wear', 'none'],
				['attachments', 'keyring'],
			],
			...at(ZONES.cseClass, '2026-11-09'),
		},
		{
			answers: wallet({
				main_colour: ['dark_blue'],
				style: ['card_holder'],
				content_types: ['cards'],
				material: ['faux_leather'],
			}),
			followups: [
				['card_slots', 'one_to_three'],
				['logo', 'embossed_logo'],
				['wear', 'none'],
				['attachments', 'keyring'],
			],
			...at(ZONES.cseLab, '2026-11-09'),
		},
	),

	pair(
		'HO-TM3',
		'true_match',
		'keys',
		'two keys on a double ring, coloured caps',
		{
			answers: keys({
				key_count: ['two'],
				ring_type: ['double_ring'],
				key_caps: ['one_cap'],
				keychain: ['no_keychain'],
				keychain_colour: ['no_keychain'],
			}),
			followups: [
				['caps', 'blue_cap'],
				['charm', 'none'],
				['ring', 'split_ring_coloured'],
				['wear', 'shiny_new_key'],
			],
			...at(ZONES.library, '2026-11-07'),
		},
		{
			answers: keys({
				key_count: ['two'],
				ring_type: ['double_ring'],
				key_caps: ['one_cap'],
				keychain: ['no_keychain'],
				keychain_colour: ['no_keychain'],
				metal_colour: ['dont_know'],
			}),
			followups: [
				['caps', 'blue_cap'],
				['charm', 'none'],
				['ring', 'split_ring_coloured'],
				['wear', 'dont_remember'],
			],
			...at(ZONES.library, '2026-11-06'),
		},
	),

	pair(
		'HO-TM4',
		'true_match',
		'earbuds_case',
		'QCY case with character cover',
		{
			answers: earbuds({
				brand: 'QCY',
				case_colour: ['black'],
				shape: ['rectangular'],
				cover: ['character_cover'],
				cover_colour: ['yellow'],
				led: ['front_bar'],
				marks: ['dirt_stain'],
			}),
			followups: [
				['cover_style', 'cartoon_character'],
				['keychain', 'strap_loop'],
				['port', 'usb_c'],
				['dirt', 'ink_mark'],
			],
			...at(ZONES.parking, '2026-11-05'),
		},
		{
			answers: earbuds({
				brand: 'qcy',
				case_colour: ['black'],
				shape: ['rectangular'],
				cover: ['character_cover'],
				cover_colour: ['gold'],
				led: ['front_bar'],
				marks: ['dirt_stain'],
			}),
			followups: [
				['cover_style', 'cartoon_character'],
				['keychain', 'strap_loop'],
				['port', 'usb_c'],
				['dirt', 'ink_mark'],
			],
			...at(ZONES.parking, '2026-11-05'),
		},
	),

	pair(
		'HO-NM1',
		'near_miss',
		'phone',
		'two navy Samsungs; one has a pop socket',
		{
			answers: phone({ accessories: ['none'] }),
			followups: [
				['case', 'clear_silicone'],
				['accessories', 'none'],
				['sticker', 'inside_clear_case'],
				['crack', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-09'),
		},
		{
			answers: phone({ accessories: ['pop_socket'] }),
			followups: [
				['case', 'clear_silicone'],
				['accessories', 'pop_socket'],
				['sticker', 'inside_clear_case'],
				['crack', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-09'),
		},
	),

	pair(
		'HO-NM2',
		'near_miss',
		'bag',
		'two black Nike backpacks; different pins and damage',
		{
			answers: bag({ brand: 'Nike', main_colour: ['black'], attachments: ['badge_pin'] }),
			followups: [
				['patch_or_pin', 'university_logo'],
				['damage', 'torn_bottom'],
				['straps', 'padded_shoulder'],
				['zip_pulls', 'original_metal'],
			],
			...at(ZONES.library, '2026-11-10'),
		},
		{
			answers: bag({ brand: 'Nike', main_colour: ['black'], attachments: ['patch'] }),
			followups: [
				['patch_or_pin', 'country_flag'],
				['damage', 'none'],
				['straps', 'padded_shoulder'],
				['zip_pulls', 'original_metal'],
			],
			...at(ZONES.library, '2026-11-10'),
		},
	),

	pair(
		'HO-NM3',
		'near_miss',
		'earbuds_case',
		'two white AirPods; one engraved',
		{
			answers: earbuds({ marks: ['none'] }),
			followups: [
				['sticker', 'none'],
				['scratches', 'none'],
				['port', 'lightning'],
				['hinge', 'stiff_lid'],
			],
			...at(ZONES.cafeteria, '2026-11-08'),
		},
		{
			answers: earbuds({ marks: ['engraving'] }),
			followups: [
				['sticker', 'none'],
				['scratches', 'all_over'],
				['port', 'lightning'],
				['hinge', 'stiff_lid'],
			],
			...at(ZONES.cafeteria, '2026-11-08'),
		},
	),

	pair(
		'HO-NM4',
		'near_miss',
		'wallet',
		'two black zip wallets; different contents and coin pocket',
		{
			answers: wallet({ style: ['long_zip'], closure: ['zip'], content_types: ['cash'] }),
			followups: [
				['coin_pocket', 'zip_coin_pocket'],
				['card_slots', 'seven_plus'],
				['logo', 'none'],
				['wear', 'broken_zip'],
			],
			...at(ZONES.cseClass, '2026-11-07'),
		},
		{
			answers: wallet({
				style: ['long_zip'],
				closure: ['zip'],
				content_types: ['cards', 'photos'],
			}),
			followups: [
				['coin_pocket', 'none'],
				['card_slots', 'seven_plus'],
				['logo', 'none'],
				['wear', 'none'],
			],
			...at(ZONES.cseClass, '2026-11-07'),
		},
	),

	pair(
		'HO-NO1',
		'non_match',
		'keys',
		'completely different key sets',
		{
			answers: keys(),
			followups: [
				['charm', 'cartoon'],
				['caps', 'none'],
				['fob', 'none'],
				['tag', 'none'],
			],
			...at(ZONES.cseLab, '2026-11-10'),
		},
		{
			answers: keys({
				key_count: ['six_plus'],
				ring_type: ['belt_clip'],
				key_types: ['car_fob', 'access_fob'],
				keychain: ['mini_light'],
				keychain_colour: ['black'],
				metal_colour: ['brass_gold'],
			}),
			followups: [
				['charm', 'none'],
				['caps', 'mixed_caps'],
				['fob', 'rfid_tear_drop'],
				['tag', 'metal_tag'],
			],
			...at(ZONES.parking, '2026-10-18'),
		},
	),

	pair(
		'HO-NO2',
		'non_match',
		'bag',
		'small sling vs large duffel',
		{
			answers: bag({ bag_type: ['sling'], size: ['small'], compartments: ['one'] }),
			followups: [
				['keychain', 'carabiner_clip'],
				['straps', 'adjusted_very_short'],
				['damage', 'none'],
				['wear', 'none'],
			],
			...at(ZONES.cafeteria, '2026-11-09'),
		},
		{
			answers: bag({
				bag_type: ['duffel'],
				brand: 'Adidas',
				main_colour: ['green'],
				size: ['large'],
				compartments: ['three'],
				contents: ['clothes'],
			}),
			followups: [
				['keychain', 'none'],
				['straps', 'waist_strap'],
				['damage', 'torn_strap'],
				['wear', 'dirty_bottom'],
			],
			...at(ZONES.parking, '2026-10-30'),
		},
	),
];
