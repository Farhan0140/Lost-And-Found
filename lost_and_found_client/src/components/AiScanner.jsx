/**
 * "The AI is looking at your photos" animation.
 *
 *     <AiScanner photos={photos} active={isExtracting} />
 *     <AiThinking label="Writing follow-up questions…" />
 *
 * A glowing scan line sweeps the photos, corner brackets pulse, and a rotating
 * status line says what the AI is checking — so a 5–20 s wait feels alive.
 */

import clsx from 'clsx';
import { BrainCircuit, ScanLine, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

const PHOTO_MESSAGES = [
	'Finding the item in the photos…',
	'Checking the colours…',
	'Looking for a brand or logo…',
	'Spotting scratches, stickers and marks…',
	'Choosing the best category…',
	'Pre-filling your answers…',
];

const FOLLOWUP_MESSAGES = [
	'Reading your answers…',
	'Thinking about what makes this item unique…',
	'Writing questions only the real owner could answer…',
	'Double-checking the options…',
];

function useRotatingMessage(messages, active, interval = 2200) {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (!active) {
			setIndex(0);

			return undefined;
		}

		const timer = setInterval(
			() => setIndex((value) => (value + 1) % messages.length),
			interval,
		);

		return () => clearInterval(timer);
	}, [active, messages, interval]);

	return messages[index];
}

function Corners() {
	const corner = 'absolute size-5 border-accent';

	return (
		<motion.div
			aria-hidden
			className="pointer-events-none absolute inset-2"
			animate={{ opacity: [0.5, 1, 0.5] }}
			transition={{ duration: 1.6, repeat: Infinity }}
		>
			<span className={clsx(corner, 'left-0 top-0 rounded-tl-lg border-l-2 border-t-2')} />
			<span className={clsx(corner, 'right-0 top-0 rounded-tr-lg border-r-2 border-t-2')} />
			<span className={clsx(corner, 'bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2')} />
			<span
				className={clsx(corner, 'bottom-0 right-0 rounded-br-lg border-b-2 border-r-2')}
			/>
		</motion.div>
	);
}

/** Scan overlay for one photo tile. */
export function ScanOverlay({ active, delay = 0 }) {
	if (!active) {
		return null;
	}

	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
		>
			<div className="absolute inset-0 bg-brand/10 mix-blend-overlay" />
			<div
				className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-accent/45 to-transparent"
				style={{ animation: `scan 1.8s ${delay}s ease-in-out infinite alternate` }}
			/>
			<div
				className="absolute inset-0 opacity-30"
				style={{
					backgroundImage:
						'linear-gradient(rgba(34,211,238,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.35) 1px, transparent 1px)',
					backgroundSize: '18px 18px',
				}}
			/>
			<Corners />
		</div>
	);
}

/** Full "AI is reading your photos" panel. */
export function AiScanner({ photos, active }) {
	const message = useRotatingMessage(PHOTO_MESSAGES, active);

	return (
		<div className="space-y-5">
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{photos.map((photo, index) => (
					<motion.div
						key={photo.id}
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ delay: index * 0.08 }}
						className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-surface-2"
					>
						<img src={photo.previewUrl} alt="" className="size-full object-cover" />
						<ScanOverlay active={active} delay={index * 0.25} />
					</motion.div>
				))}
			</div>

			<AiStatusLine active={active} icon={ScanLine} message={message} />
		</div>
	);
}

/** Thinking animation without photos (follow-up questions). */
export function AiThinking({ active = true, title = 'Writing follow-up questions' }) {
	const message = useRotatingMessage(FOLLOWUP_MESSAGES, active);

	return (
		<div className="flex flex-col items-center gap-6 py-8 text-center">
			<div className="relative size-28">
				{/* orbiting particles */}
				{[0, 1, 2].map((ring) => (
					<motion.span
						key={ring}
						aria-hidden
						className="absolute inset-0 rounded-full border border-dashed border-brand/40"
						style={{ scale: 1 - ring * 0.18 }}
						animate={{ rotate: ring % 2 ? -360 : 360 }}
						transition={{ duration: 8 + ring * 3, repeat: Infinity, ease: 'linear' }}
					>
						<span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
					</motion.span>
				))}

				<motion.div
					className="absolute inset-7 grid place-items-center rounded-full bg-gradient-brand text-white shadow-[0_0_40px_var(--glow)]"
					animate={{ scale: [1, 1.08, 1] }}
					transition={{ duration: 1.8, repeat: Infinity }}
				>
					<BrainCircuit className="size-7" aria-hidden />
				</motion.div>
			</div>

			<div>
				<p className="font-semibold text-ink">{title}</p>
				<AiStatusLine active={active} icon={Sparkles} message={message} centered />
			</div>
		</div>
	);
}

function AiStatusLine({ active, icon: Icon, message, centered }) {
	return (
		<div
			className={clsx(
				'flex items-center gap-2 text-sm text-muted',
				centered && 'mt-1 justify-center',
			)}
			aria-live="polite"
		>
			{active && <Icon className="size-4 shrink-0 text-accent" aria-hidden />}
			<AnimatePresence mode="wait">
				<motion.span
					key={message}
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -6 }}
					transition={{ duration: 0.25 }}
				>
					{message}
				</motion.span>
			</AnimatePresence>
		</div>
	);
}
