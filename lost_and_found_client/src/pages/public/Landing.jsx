/**
 * Landing page: 3D locker hero, how it works (finder / owner), privacy, live lockers.
 */

import clsx from 'clsx';
import {
	ArrowRight,
	BellRing,
	Camera,
	EyeOff,
	Fingerprint,
	HandHeart,
	KeyRound,
	LockOpen,
	PackageCheck,
	PackageSearch,
	ScanLine,
	ScrollText,
	ShieldCheck,
	Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';

import { LockerLegend, LockerScene } from '../../components/LockerScene.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { AnimatedNumber, Tabs, TiltCard } from '../../components/ui/Layout.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { usePageTitle } from '../../lib/hooks.js';
import { usePublicLockers } from '../../lib/queries.js';

/** Shown while the API is loading or unreachable, so the hero is never empty. */
const DEMO_LOCKERS = [
	{ label: 'L1', slot: 1, status: 'occupied', online: true },
	{ label: 'L2', slot: 2, status: 'available', online: true },
	{ label: 'L3', slot: 3, status: 'reserved', online: true },
	{ label: 'L4', slot: 4, status: 'available', online: true },
];

const FLOWS = {
	found: [
		{
			icon: Camera,
			title: 'Snap 2–5 photos',
			text: 'The AI reads the item and fills in the questions. You only check and correct.',
		},
		{
			icon: Sparkles,
			title: 'Answer a few follow-ups',
			text: 'Smart questions about details only the real owner would know.',
		},
		{
			icon: KeyRound,
			title: 'Get a locker code',
			text: 'A free locker is reserved for you with a 30-minute code.',
		},
		{
			icon: PackageCheck,
			title: 'Drop it in',
			text: 'Type the code on the kiosk, put the item inside, close the door. Done — thank you!',
		},
	],
	lost: [
		{
			icon: PackageSearch,
			title: 'Describe what you lost',
			text: 'Pick the category and answer simple questions — "don\'t remember" is fine.',
		},
		{
			icon: ScanLine,
			title: 'We match in the background',
			text: 'Every stored item is compared with your report, detail by detail.',
		},
		{
			icon: BellRing,
			title: 'Get notified',
			text: 'When a strong match is found, you get a notification. Admins double-check unclear ones.',
		},
		{
			icon: LockOpen,
			title: 'Collect it',
			text: 'At the kiosk, tap "Get collection code" (valid 5 minutes) and open your locker.',
		},
	],
};

const PRIVACY = [
	{
		icon: Fingerprint,
		title: 'Verified students only',
		text: 'Accounts are checked against university records. National IDs are stored only as a one-way hash.',
	},
	{
		icon: EyeOff,
		title: 'Photos never stored',
		text: 'Photos stay on your device. They are only sent to the AI to read the item, never saved on our server.',
	},
	{
		icon: ShieldCheck,
		title: 'Secret answers stay secret',
		text: 'Follow-up answers are seen only by you and the admins — never by the other person.',
	},
	{
		icon: ScrollText,
		title: 'Tamper-proof history',
		text: 'Every locker opening and admin decision is written to a hash-chained audit log.',
	},
];

const reveal = {
	initial: { opacity: 0, y: 24 },
	whileInView: { opacity: 1, y: 0 },
	viewport: { once: true, margin: '-60px' },
	transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
};

export function Landing() {
	usePageTitle(null);

	const { isLoggedIn } = useAuth();
	const { data: lockers, isError } = usePublicLockers();
	const [flow, setFlow] = useState('found');

	const shown = lockers?.length && !isError ? lockers : DEMO_LOCKERS;
	const free = lockers?.filter((locker) => locker.online && locker.status === 'available').length;

	const startLink = (kind) =>
		isLoggedIn
			? `/reports/new?kind=${kind}`
			: `/login?next=${encodeURIComponent(`/reports/new?kind=${kind}`)}`;

	return (
		<div className="overflow-hidden">
			{/* ── hero ── */}
			<section className="relative">
				<div className="aurora" aria-hidden />
				<div
					className="bg-grid absolute inset-0 [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]"
					aria-hidden
				/>

				<div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
					<div>
						<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
							<Badge tone="brand" dot pulse>
								{lockers ? (
									<>
										<AnimatedNumber value={free ?? 0} /> of {lockers.length}{' '}
										lockers free right now
									</>
								) : (
									'Campus smart lockers · UITS'
								)}
							</Badge>
						</motion.div>

						<motion.h1
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
							className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl"
						>
							Lost it on campus?
							<br />
							<span className="text-gradient">It&apos;s locked & waiting.</span>
						</motion.h1>

						<motion.p
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.16, duration: 0.7 }}
							className="mt-5 max-w-xl text-lg text-muted"
						>
							SmartFind matches found items with lost reports using AI, keeps them in
							OTP-locked smart lockers, and only opens the door for the real owner.
						</motion.p>

						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.24, duration: 0.7 }}
							className="mt-8 flex flex-wrap gap-3"
						>
							<Button
								as={Link}
								to={startLink('found')}
								size="lg"
								icon={HandHeart}
								iconRight={ArrowRight}
							>
								I found something
							</Button>
							<Button
								as={Link}
								to={startLink('lost')}
								size="lg"
								variant="outline"
								icon={PackageSearch}
							>
								I lost something
							</Button>
						</motion.div>

						<motion.ul
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ delay: 0.4 }}
							className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted"
						>
							{['No photos stored', 'Owner-only unlock', '24/7 kiosk'].map((text) => (
								<li key={text} className="flex items-center gap-2">
									<ShieldCheck className="size-4 text-ok" aria-hidden /> {text}
								</li>
							))}
						</motion.ul>
					</div>

					<motion.div
						initial={{ opacity: 0, scale: 0.92 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ delay: 0.15, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
						className="relative"
					>
						<div
							className="absolute inset-10 rounded-full bg-brand/25 blur-3xl"
							aria-hidden
						/>
						<LockerScene
							lockers={shown}
							demo
							sparkles
							interactive={false}
							className="h-[340px] sm:h-[440px]"
						/>
						<LockerLegend
							className="relative -mt-2 justify-center"
							statuses={['available', 'reserved', 'occupied']}
						/>
					</motion.div>
				</div>
			</section>

			{/* ── how it works ── */}
			<section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
				<motion.div {...reveal} className="flex flex-col items-center text-center">
					<p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
						How it works
					</p>
					<h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
						Four steps, either way
					</h2>
					<Tabs
						id="landing-flow"
						className="mt-6"
						value={flow}
						onChange={setFlow}
						items={[
							{ value: 'found', label: 'I found something' },
							{ value: 'lost', label: 'I lost something' },
						]}
					/>
				</motion.div>

				<div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{FLOWS[flow].map((step, index) => (
						<motion.div
							key={`${flow}-${step.title}`}
							initial={{ opacity: 0, y: 24, rotateX: -15 }}
							animate={{ opacity: 1, y: 0, rotateX: 0 }}
							transition={{
								delay: index * 0.08,
								type: 'spring',
								stiffness: 200,
								damping: 22,
							}}
						>
							<TiltCard className="h-full rounded-2xl">
								<div className="relative h-full overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-card">
									<span className="absolute -right-3 -top-6 font-mono text-8xl font-bold text-brand/8">
										{index + 1}
									</span>
									<span className="grid size-12 place-items-center rounded-2xl bg-gradient-brand text-white shadow-[0_10px_30px_-10px_var(--glow)] [transform:translateZ(30px)]">
										<step.icon className="size-5" aria-hidden />
									</span>
									<h3 className="mt-5 font-bold text-ink">{step.title}</h3>
									<p className="mt-2 text-sm text-muted">{step.text}</p>
								</div>
							</TiltCard>
						</motion.div>
					))}
				</div>
			</section>

			{/* ── privacy ── */}
			<section className="relative border-y border-line bg-surface/50">
				<div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
					<motion.div {...reveal} className="max-w-2xl">
						<p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
							Built for trust
						</p>
						<h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
							Only the real owner gets the door open
						</h2>
					</motion.div>

					<div className="mt-10 grid gap-4 sm:grid-cols-2">
						{PRIVACY.map((item, index) => (
							<motion.div
								key={item.title}
								{...reveal}
								transition={{ ...reveal.transition, delay: index * 0.08 }}
								className="group flex gap-4 rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-brand/40"
							>
								<span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
									<item.icon className="size-5" aria-hidden />
								</span>
								<div>
									<h3 className="font-bold text-ink">{item.title}</h3>
									<p className="mt-1 text-sm text-muted">{item.text}</p>
								</div>
							</motion.div>
						))}
					</div>
				</div>
			</section>

			{/* ── call to action ── */}
			<section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
				<motion.div
					{...reveal}
					className={clsx(
						'relative overflow-hidden rounded-3xl bg-gradient-brand px-8 py-14 text-center text-white',
						'shadow-[0_30px_80px_-30px_var(--glow)]',
					)}
				>
					<div className="bg-grid absolute inset-0 opacity-40" aria-hidden />
					<h2 className="relative text-3xl font-extrabold tracking-tight sm:text-4xl">
						Found something? Be someone&apos;s good news.
					</h2>
					<p className="relative mx-auto mt-3 max-w-xl text-white/85">
						It takes about two minutes. The locker does the rest.
					</p>
					<div className="relative mt-8 flex flex-wrap justify-center gap-3">
						<Button
							as={Link}
							to={isLoggedIn ? '/reports/new' : '/register'}
							size="lg"
							variant="secondary"
							iconRight={ArrowRight}
							className="!border-white/20 !bg-white !text-[#2b1a5c]"
						>
							{isLoggedIn ? 'Start a report' : 'Create your account'}
						</Button>
						<Button
							as={Link}
							to="/lockers"
							size="lg"
							variant="ghost"
							className="!text-white hover:!bg-white/10"
						>
							See the lockers live
						</Button>
					</div>
				</motion.div>
			</section>
		</div>
	);
}
