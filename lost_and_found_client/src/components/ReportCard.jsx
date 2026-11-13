/**
 * One report in "My reports". Click → the report page.
 */

import clsx from 'clsx';
import {
	CalendarDays,
	ChevronRight,
	Clock,
	Hourglass,
	KeyRound,
	Lock,
	MapPin,
	Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';

import { formatCountdown, formatDay, timeAgo } from '../lib/format.js';
import { useCountdown } from '../lib/hooks.js';
import { categoryIcon, matchStatus } from '../lib/statuses.js';
import { ReportStatusBadge } from './StatusVisuals.jsx';
import { Badge } from './ui/Badge.jsx';

function OtpChip({ expiresAt }) {
	const secondsLeft = useCountdown(expiresAt);

	if (secondsLeft <= 0) {
		return null;
	}

	return (
		<Badge tone="brand" icon={KeyRound}>
			Code active · {formatCountdown(secondsLeft)}
		</Badge>
	);
}

export function ReportCard({ report, index = 0 }) {
	const Icon = categoryIcon(report.category?.icon);
	const isDraft = report.status === 'draft';

	const title =
		report.category?.name ??
		(report.kind === 'found' ? 'Found item (draft)' : 'Lost item (draft)');

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: 14 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, scale: 0.97 }}
			transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.35 }}
		>
			<Link
				to={`/reports/${report.id}`}
				className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_16px_40px_-20px_var(--glow)] sm:p-5"
			>
				{/* kind stripe */}
				<span
					aria-hidden
					className={clsx(
						'absolute inset-y-0 left-0 w-1',
						report.kind === 'found'
							? 'bg-gradient-to-b from-brand to-accent'
							: 'bg-gradient-to-b from-warn to-bad',
					)}
				/>

				<span
					className={clsx(
						'grid size-12 shrink-0 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6',
						report.kind === 'found'
							? 'bg-brand-soft text-brand'
							: 'bg-warn/12 text-warn',
					)}
				>
					<Icon className="size-5" aria-hidden />
				</span>

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="truncate font-semibold text-ink">{title}</p>
						<span className="text-xs font-semibold uppercase tracking-wide text-subtle">
							{report.kind === 'found' ? 'Found' : 'Lost'}
						</span>
					</div>

					{report.summary && (
						<p className="mt-0.5 line-clamp-1 text-sm text-muted">“{report.summary}”</p>
					)}

					<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-subtle">
						{report.zone && (
							<span className="inline-flex items-center gap-1">
								<MapPin className="size-3.5" aria-hidden /> {report.zone}
							</span>
						)}
						{report.occurredOn && (
							<span className="inline-flex items-center gap-1">
								<CalendarDays className="size-3.5" aria-hidden />{' '}
								{formatDay(report.occurredOn)}
							</span>
						)}
						{report.lockerLabel && (
							<span className="inline-flex items-center gap-1">
								<Lock className="size-3.5" aria-hidden /> Locker{' '}
								{report.lockerLabel}
							</span>
						)}
						<span className="inline-flex items-center gap-1">
							<Clock className="size-3.5" aria-hidden /> {timeAgo(report.updatedAt)}
						</span>
					</div>
				</div>

				<div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
					{isDraft ? (
						report.draft?.waitingForAi ? (
							<Badge tone="warn" dot pulse icon={Sparkles}>
								Waiting for AI
							</Badge>
						) : (
							<Badge tone="neutral" icon={Hourglass}>
								Expires {timeAgo(report.draft?.expiresAt)}
							</Badge>
						)
					) : (
						<ReportStatusBadge status={report.status} />
					)}

					{report.otpExpiresAt && <OtpChip expiresAt={report.otpExpiresAt} />}

					{report.matchStatus && (
						<Badge tone={matchStatus(report.matchStatus).tone}>
							{matchStatus(report.matchStatus).label}
						</Badge>
					)}
				</div>

				<ChevronRight
					className="size-5 shrink-0 text-subtle transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand"
					aria-hidden
				/>
			</Link>
		</motion.div>
	);
}
