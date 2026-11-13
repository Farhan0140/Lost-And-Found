/**
 * Shows a 6-digit locker code with a countdown ring.
 *
 *     <OtpDisplay code="575926" expiresAt="…" totalSeconds={1800}
 *         lockerLabel="L1" action="deposit" generation={1} generationLimit={5} />
 *
 * The ring empties as time runs out and turns amber in the last minute,
 * red in the last 20 seconds. When it reaches zero the code is shown as expired.
 */

import clsx from 'clsx';
import { Clock, Lock, TimerReset } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { formatCountdown } from '../lib/format.js';
import { useCountdown } from '../lib/hooks.js';
import { CopyButton } from './ui/Layout.jsx';

const RADIUS = 92;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function OtpDisplay({
	code,
	expiresAt,
	totalSeconds,
	lockerLabel,
	action = 'deposit',
	generation,
	generationLimit,
	onExpired,
}) {
	const secondsLeft = useCountdown(expiresAt);
	const expired = secondsLeft <= 0;

	const fraction = totalSeconds ? Math.min(1, secondsLeft / totalSeconds) : 0;

	const tone = expired
		? 'expired'
		: secondsLeft <= 20
			? 'bad'
			: secondsLeft <= 60
				? 'warn'
				: 'ok';

	const ringColor = {
		ok: 'url(#otp-ring)',
		warn: 'var(--warn)',
		bad: 'var(--bad)',
		expired: 'var(--line-strong)',
	}[tone];

	// Tell the parent ONCE when the code runs out (so it can refresh its data).
	const onExpiredRef = useRef(onExpired);
	onExpiredRef.current = onExpired;

	useEffect(() => {
		if (expired && expiresAt) {
			onExpiredRef.current?.();
		}
	}, [expired, expiresAt]);

	return (
		<div className="flex flex-col items-center gap-6">
			{/* ── ring + time ── */}
			<div className="relative grid size-56 place-items-center">
				<div
					aria-hidden
					className={clsx(
						'absolute inset-6 rounded-full blur-2xl transition-colors duration-700',
						tone === 'ok' && 'bg-brand/25',
						tone === 'warn' && 'bg-warn/25',
						tone === 'bad' && 'bg-bad/30',
					)}
				/>

				<svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90" aria-hidden>
					<defs>
						<linearGradient id="otp-ring" x1="0" y1="0" x2="1" y2="1">
							<stop offset="0%" stopColor="var(--brand)" />
							<stop offset="100%" stopColor="var(--accent)" />
						</linearGradient>
					</defs>

					<circle
						cx="100"
						cy="100"
						r={RADIUS}
						fill="none"
						stroke="var(--surface-3)"
						strokeWidth="10"
					/>

					<motion.circle
						cx="100"
						cy="100"
						r={RADIUS}
						fill="none"
						stroke={ringColor}
						strokeWidth="10"
						strokeLinecap="round"
						strokeDasharray={CIRCUMFERENCE}
						animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - fraction) }}
						initial={{ strokeDashoffset: CIRCUMFERENCE }}
						transition={{ duration: 0.9, ease: 'linear' }}
					/>
				</svg>

				<div className="relative text-center" aria-live="polite">
					<p className="flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-widest text-subtle">
						<Clock className="size-3.5" aria-hidden />
						{expired ? 'Expired' : 'Valid for'}
					</p>
					<p
						className={clsx(
							'mt-1 font-mono text-4xl font-bold tabular-nums',
							tone === 'warn' && 'text-warn',
							tone === 'bad' && 'text-bad',
							tone === 'expired' && 'text-subtle',
						)}
					>
						{formatCountdown(secondsLeft)}
					</p>
					{lockerLabel && (
						<p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-ink">
							<Lock className="size-3.5 text-brand" aria-hidden />
							Locker {lockerLabel}
						</p>
					)}
				</div>
			</div>

			{/* ── digits ── */}
			<div
				className={clsx('flex gap-2 sm:gap-3', expired && 'opacity-40 grayscale')}
				aria-label={`Code ${code.split('').join(' ')}`}
			>
				<AnimatePresence mode="popLayout">
					{code.split('').map((digit, index) => (
						<motion.span
							key={`${code}-${index}`}
							initial={{ rotateX: -90, opacity: 0, y: -10 }}
							animate={{ rotateX: 0, opacity: 1, y: 0 }}
							transition={{
								delay: index * 0.07,
								type: 'spring',
								stiffness: 260,
								damping: 18,
							}}
							style={{ transformPerspective: 400 }}
							className={clsx(
								'grid h-16 w-12 place-items-center rounded-2xl border border-line bg-surface font-mono text-4xl font-bold text-ink shadow-card sm:h-20 sm:w-14 sm:text-5xl',
								index === 2 && 'mr-2 sm:mr-3',
							)}
						>
							{digit}
						</motion.span>
					))}
				</AnimatePresence>
			</div>

			<div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted">
				{!expired && <CopyButton value={code} label="Copy code" />}

				{generation && generationLimit && (
					<span className="inline-flex items-center gap-1.5">
						<TimerReset className="size-4" aria-hidden />
						Code {generation} of {generationLimit}
					</span>
				)}
			</div>

			<p className="max-w-sm text-center text-sm text-muted">
				{expired
					? 'This code has expired. Generate a new one when you are at the locker.'
					: action === 'deposit'
						? 'Type this code on the kiosk keypad and press #. The locker opens — put the item inside and close the door.'
						: 'Type this code on the kiosk keypad and press #. Take your item and close the door.'}
			</p>
		</div>
	);
}
