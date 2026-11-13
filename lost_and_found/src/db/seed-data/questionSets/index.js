/**
 * The 20 categories (Q9) and the initial question set for each one.
 *
 *   5 fully written + reviewed:  phone, wallet, bag, earbuds case, keys
 *  15 using the generic set:     everything else
 *
 * `icon` is a lucide-react icon name used by the web client.
 */

import { bagAspects, bagQuestions } from './bag.js';
import { earbudsAspects, earbudsQuestions } from './earbuds.js';
import { genericAspects, genericQuestions } from './generic.js';
import { keysAspects, keysQuestions } from './keys.js';
import { phoneAspects, phoneQuestions } from './phone.js';
import { walletAspects, walletQuestions } from './wallet.js';

export const CATEGORIES = [
	// ── fully written ──
	{
		slug: 'phone',
		name: 'Phone',
		icon: 'Smartphone',
		full: true,
		questions: phoneQuestions,
		aspects: phoneAspects,
	},
	{
		slug: 'wallet',
		name: 'Wallet',
		icon: 'Wallet',
		full: true,
		questions: walletQuestions,
		aspects: walletAspects,
	},
	{
		slug: 'bag',
		name: 'Bag / backpack',
		icon: 'Backpack',
		full: true,
		questions: bagQuestions,
		aspects: bagAspects,
	},
	{
		slug: 'earbuds_case',
		name: 'Earbuds case',
		icon: 'Headphones',
		full: true,
		questions: earbudsQuestions,
		aspects: earbudsAspects,
	},
	{
		slug: 'keys',
		name: 'Keys',
		icon: 'KeyRound',
		full: true,
		questions: keysQuestions,
		aspects: keysAspects,
	},

	// ── generic set ──
	...[
		['laptop', 'Laptop', 'Laptop'],
		['tablet', 'Tablet', 'Tablet'],
		['smartwatch', 'Smartwatch', 'Watch'],
		['headphones', 'Headphones', 'Headset'],
		['charger_cable', 'Charger / cable', 'Cable'],
		['power_bank', 'Power bank', 'BatteryCharging'],
		['usb_drive', 'USB drive', 'Usb'],
		['calculator', 'Calculator', 'Calculator'],
		['water_bottle', 'Water bottle', 'Milk'],
		['umbrella', 'Umbrella', 'Umbrella'],
		['glasses', 'Glasses', 'Glasses'],
		['clothing', 'Jacket / clothing', 'Shirt'],
		['book_notebook', 'Book / notebook', 'BookOpen'],
		['jewelry', 'Jewelry', 'Gem'],
		['pencil_case', 'Pencil case', 'PencilRuler'],
	].map(([slug, name, icon]) => ({
		slug,
		name,
		icon,
		full: false,
		questions: genericQuestions(name.toLowerCase()),
		aspects: genericAspects,
	})),
];
