/**
 * Canonicalization rules — VERSION 1 (§8.2)
 *
 * Maps every answer code a person can pick to a canonical token, so two people who
 * describe the same object with different words end up with the SAME token:
 *
 *     "navy"  → BLUE_DARK
 *     "dark_blue" → BLUE_DARK
 *
 * This file is pure data. It is versioned (RULES_VERSION) and can be printed in the report.
 * If you change a mapping, bump the version, because stored `canonical` values were made
 * with the old one.
 */

export const RULES_VERSION = 'v1';

// ─────────────────────────────────────────────────────────────
//  Colour families
// ─────────────────────────────────────────────────────────────

export const COLOUR_FAMILIES = {
	black: 'BLACK',
	charcoal: 'BLACK',

	white: 'WHITE',
	off_white: 'WHITE',
	cream: 'WHITE',

	grey: 'GREY',
	silver: 'GREY',
	space_grey: 'GREY',

	navy: 'BLUE_DARK',
	dark_blue: 'BLUE_DARK',

	blue: 'BLUE',
	light_blue: 'BLUE',
	sky_blue: 'BLUE',

	red: 'RED',
	maroon: 'RED',

	pink: 'PINK',
	rose_gold: 'PINK',

	purple: 'PURPLE',
	lavender: 'PURPLE',

	green: 'GREEN',
	dark_green: 'GREEN',
	olive: 'GREEN',

	yellow: 'YELLOW',
	gold: 'YELLOW',

	orange: 'ORANGE',

	brown: 'BROWN',
	beige: 'BROWN',
	tan: 'BROWN',

	multicolour: 'MULTI',
	transparent: 'CLEAR',
};

// ─────────────────────────────────────────────────────────────
//  Size classes
// ─────────────────────────────────────────────────────────────

export const SIZE_CLASSES = {
	pocket: 'SIZE_S',
	small: 'SIZE_S',
	compact: 'SIZE_S',

	hand: 'SIZE_M',
	medium: 'SIZE_M',
	regular: 'SIZE_M',

	bag: 'SIZE_L',
	large: 'SIZE_L',

	very_large: 'SIZE_XL',
};

// ─────────────────────────────────────────────────────────────
//  Materials
// ─────────────────────────────────────────────────────────────

export const MATERIALS = {
	leather: 'LEATHER',
	faux_leather: 'LEATHER',

	fabric: 'FABRIC',
	nylon: 'FABRIC',
	canvas: 'FABRIC',
	polyester: 'FABRIC',
	denim: 'FABRIC',

	plastic: 'PLASTIC',
	silicone: 'RUBBER',
	rubber: 'RUBBER',

	metal: 'METAL',
	aluminium: 'METAL',
	steel: 'METAL',

	glass: 'GLASS',
	wood: 'WOOD',
	paper: 'PAPER',
};

// ─────────────────────────────────────────────────────────────
//  Damage / marks vocabulary
// ─────────────────────────────────────────────────────────────

export const DAMAGE = {
	none: 'NONE',

	scratches: 'SCRATCH',
	scratched: 'SCRATCH',

	crack: 'CRACK',
	cracked: 'CRACK',
	crack_or_tear: 'CRACK',

	dent: 'DENT',
	dents: 'DENT',

	tear: 'TEAR',
	torn: 'TEAR',

	stain: 'STAIN',
	stained: 'STAIN',
	dirt_stain: 'STAIN',

	sticker: 'STICKER',
	stickers: 'STICKER',

	engraving: 'ENGRAVING',
	initials_engraved: 'ENGRAVING',

	writing: 'WRITING',
	pen_mark: 'WRITING',
	written_label: 'WRITING',

	paint_marks: 'PAINT',
	faded: 'FADED',
};

// ─────────────────────────────────────────────────────────────
//  Brand aliases — free-text brand → canonical brand
//  Keys are lowercase, without spaces or punctuation.
// ─────────────────────────────────────────────────────────────

export const BRAND_ALIASES = {
	// phones / electronics
	apple: 'APPLE',
	iphone: 'APPLE',
	ipad: 'APPLE',
	airpods: 'APPLE',
	macbook: 'APPLE',

	samsung: 'SAMSUNG',
	galaxy: 'SAMSUNG',
	galaxybuds: 'SAMSUNG',

	xiaomi: 'XIAOMI',
	mi: 'XIAOMI',
	redmi: 'XIAOMI',
	poco: 'XIAOMI',

	google: 'GOOGLE',
	pixel: 'GOOGLE',

	oneplus: 'ONEPLUS',
	oppo: 'OPPO',
	vivo: 'VIVO',
	iqoo: 'VIVO',
	realme: 'REALME',
	huawei: 'HUAWEI',
	honor: 'HONOR',
	nokia: 'NOKIA',
	motorola: 'MOTOROLA',
	moto: 'MOTOROLA',
	infinix: 'INFINIX',
	tecno: 'TECNO',
	itel: 'ITEL',
	walton: 'WALTON',
	symphony: 'SYMPHONY',
	nothing: 'NOTHING',
	cmf: 'NOTHING',

	sony: 'SONY',
	jbl: 'JBL',
	boat: 'BOAT',
	anker: 'ANKER',
	soundcore: 'ANKER',
	qcy: 'QCY',
	edifier: 'EDIFIER',
	haylou: 'HAYLOU',
	lenovo: 'LENOVO',
	thinkpad: 'LENOVO',
	hp: 'HP',
	dell: 'DELL',
	asus: 'ASUS',
	acer: 'ACER',
	msi: 'MSI',
	casio: 'CASIO',
	baseus: 'BASEUS',
	ugreen: 'UGREEN',
	xiaomipowerbank: 'XIAOMI',

	// bags / wallets / accessories
	jansport: 'JANSPORT',
	nike: 'NIKE',
	adidas: 'ADIDAS',
	puma: 'PUMA',
	samsonite: 'SAMSONITE',
	americantourister: 'AMERICAN_TOURISTER',
	wildcraft: 'WILDCRAFT',
	skybags: 'SKYBAGS',
	apex: 'APEX',
	bata: 'BATA',
	lotto: 'LOTTO',
	fastrack: 'FASTRACK',
	titan: 'TITAN',
	rayban: 'RAY_BAN',
	milton: 'MILTON',
	tupperware: 'TUPPERWARE',
};

/** Free text that means "I don't know the brand". */
export const UNKNOWN_BRAND_WORDS = new Set([
	'',
	'unknown',
	'dontknow',
	'idontknow',
	'notsure',
	'none',
	'nobrand',
	'nologo',
	'generic',
	'na',
]);

/** Which table each `canon` type in a question set uses. */
export const CANON_TABLES = {
	colour: COLOUR_FAMILIES,
	size: SIZE_CLASSES,
	material: MATERIALS,
	damage: DAMAGE,
};
