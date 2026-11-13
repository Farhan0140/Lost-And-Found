/**
 * Status visuals.
 *
 *     <Timeline kind="found" status="stored" />   progress steps of a report
 *     <ScoreGauge score={0.87} />                  semicircle gauge (admin)
 *     <ReportStatusBadge status="stored" />
 */

import clsx from 'clsx';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';

import { lifecycle, reportStatus } from '../lib/statuses.js';
import { Badge } from './ui/Badge.jsx';

export function ReportStatusBadge({ status }) {
	const { label, tone } = reportStatus(status);

	const live = ['awaiting_deposit', 'awaiting_locker', 'open', 'matched', 'awaiting_collection'];

	return (
		<Badge tone={tone} dot pulse={live.includes(status)}>
			{label}
		</Badge>
	);
}

export function Timeline({ kind, status }) {
	const { steps, done } = lifecycle(kind, status);

	const progress = Math.min(1, Math.max(0, (done - 0.5) / (steps.length - 1)));

	return (
		<div className="relative">
			{/* track + animated fill */}
			<div
				className="absolute left-4 right-4 top-4 h-1 rounded-full bg-surface-3"
				aria-hidden
			/>
			<motion.div
				aria-hidden
				className="absolute left-4 top-4 h-1 rounded-full bg-gradient-brand"
				initial={{ width: 0 }}
				animate={{ width: `calc((100% - 2rem) * ${progress})` }}
				transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
			/>

			<ol className="relative flex justify-between">
				{steps.map((step, index) => {
					const finished = index < done;
					const current = index === done;

					return (
						<li
							key={step.key}
							className="flex w-16 flex-col items-center gap-2 text-center sm:w-24"
						>
							<motion.span
								initial={{ scale: 0.6, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								transition={{ delay: 0.1 + index * 0.08 }}
								className={clsx(
									'relative grid size-9 place-items-center rounded-full border-2 text-xs font-bold',
									finished && 'border-transparent bg-gradient-brand text-white',
									current && 'border-brand bg-surface text-brand',
									!finished && !current && 'border-line bg-surface text-subtle',
								)}
							>
								{current && (
									<span className="absolute inset-0 rounded-full border-2 border-brand animate-ping-soft" />
								)}
								{finished ? (
									<Check className="size-4" strokeWidth={3} />
								) : (
									index + 1
								)}
							</motion.span>

							<span
								className={clsx(
									'text-[11px] font-medium leading-tight sm:text-xs',
									finished || current ? 'text-ink' : 'text-subtle',
								)}
							>
								{step.label}
							</span>
						</li>
					);
				})}
			</ol>
		</div>
	);
}

/** Semicircle 0–1 gauge with the auto-match and review thresholds marked. */
export function ScoreGauge({ score, size = 180, autoLine = 0.85, reviewLine = 0.5 }) {
	const value = Math.max(0, Math.min(1, Number(score) || 0));

	const radius = 80;
	const arc = Math.PI * radius;

	const color =
		value >= autoLine ? 'var(--ok)' : value >= reviewLine ? 'var(--warn)' : 'var(--bad)';

	const marker = (fraction) => {
		const angle = Math.PI * (1 - fraction);

		return {
			x1: 100 + Math.cos(angle) * (radius - 14),
			y1: 100 - Math.sin(angle) * (radius - 14),
			x2: 100 + Math.cos(angle) * (radius + 6),
			y2: 100 - Math.sin(angle) * (radius + 6),
		};
	};

	return (
		<div className="relative" style={{ width: size, height: size * 0.62 }}>
			<svg viewBox="0 0 200 115" className="size-full" aria-hidden>
				<path
					d="M 20 100 A 80 80 0 0 1 180 100"
					fill="none"
					stroke="var(--surface-3)"
					strokeWidth="14"
					strokeLinecap="round"
				/>
				<motion.path
					d="M 20 100 A 80 80 0 0 1 180 100"
					fill="none"
					stroke={color}
					strokeWidth="14"
					strokeLinecap="round"
					strokeDasharray={arc}
					initial={{ strokeDashoffset: arc }}
					animate={{ strokeDashoffset: arc * (1 - value) }}
					transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
				/>
				<line {...marker(reviewLine)} stroke="var(--warn)" strokeWidth="2" />
				<line {...marker(autoLine)} stroke="var(--ok)" strokeWidth="2" />
			</svg>

			<div className="absolute inset-x-0 bottom-0 text-center">
				<p className="font-mono text-3xl font-bold tabular-nums text-ink">
					{value.toFixed(2)}
				</p>
				<p className="text-xs text-subtle">
					auto ≥ {autoLine} · review ≥ {reviewLine}
				</p>
			</div>
		</div>
	);
}
