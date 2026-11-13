/**
 * Admin home: counters, the live locker cabinet, AI key health, recent audit entries.
 */

import clsx from 'clsx';
import {
	Activity,
	Archive,
	BrainCircuit,
	FilePen,
	Inbox,
	Lock,
	PackageCheck,
	PackageSearch,
	Scale,
	Users,
	Warehouse,
	Hourglass,
	Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router';

import { LockerLegend, LockerScene } from '../../components/LockerScene.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ErrorState, PageLoader } from '../../components/ui/Feedback.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { humanize, timeAgo } from '../../lib/format.js';
import { usePageTitle } from '../../lib/hooks.js';
import { useAdmin } from '../../lib/queries.js';
import { StatCard } from './shared.jsx';

const KEY_TONE = { ready: 'ok', resting: 'warn', disabled: 'bad' };
const OVERALL_TONE = {
	healthy: 'ok',
	ok: 'ok',
	degraded: 'warn',
	down: 'bad',
	unconfigured: 'bad',
};

/** Admin locker rows → the shape the 3D cabinet uses. */
export function toSceneLockers(lockers = []) {
	return lockers.map((locker) => ({
		label: locker.label,
		slot: locker.slot,
		status: locker.status,
		online: locker.deviceOnline,
	}));
}

export function AiHealthCard({ ai, drafts }) {
	if (!ai) {
		return null;
	}

	return (
		<Card
			title="AI (Gemini)"
			icon={BrainCircuit}
			action={
				<Badge tone={OVERALL_TONE[ai.overall] ?? 'neutral'} dot pulse={ai.overall !== 'ok'}>
					{humanize(ai.overall)}
				</Badge>
			}
			description={`${ai.readyKeys ?? 0} of ${ai.configuredKeys ?? 0} keys ready`}
		>
			<ul className="space-y-2">
				{(ai.keys ?? []).map((key) => (
					<li
						key={key.slot}
						className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3 py-2"
					>
						<div className="min-w-0">
							<p className="text-sm font-semibold text-ink">Key {key.slot}</p>
							<p className="truncate text-xs text-subtle">
								{key.successes} ok · {key.failures} failed
								{key.lastError ? ` · last error: ${key.lastError}` : ''}
							</p>
						</div>
						<Badge tone={KEY_TONE[key.status] ?? 'neutral'}>
							{key.status === 'resting'
								? `Resting ${key.restingForSeconds}s`
								: humanize(key.status)}
						</Badge>
					</li>
				))}
			</ul>

			{drafts && (
				<p className="mt-4 flex items-center gap-2 text-sm text-muted">
					<Hourglass className="size-4 text-warn" /> {drafts.waitingForAi} of{' '}
					{drafts.drafts} drafts waiting for the AI
				</p>
			)}

			{ai.lastSuccessAt && (
				<p className="mt-1 text-xs text-subtle">Last success {timeAgo(ai.lastSuccessAt)}</p>
			)}
		</Card>
	);
}

export function AdminOverview() {
	usePageTitle('Admin');

	const navigate = useNavigate();
	const overview = useAdmin('/admin/overview', undefined, { refetchInterval: 10_000 });

	if (overview.isPending) {
		return <PageLoader label="Loading overview…" />;
	}

	if (overview.isError) {
		return <ErrorState error={overview.error} onRetry={overview.refetch} />;
	}

	const { counts, drafts, lockers, ai, recentActivity } = overview.data;

	const stats = [
		{
			icon: Scale,
			label: 'Matches to review',
			value: counts.review_queue,
			tone: 'warn',
			to: '/admin/review',
		},
		{
			icon: Lock,
			label: 'Items in lockers',
			value: counts.stored_items,
			tone: 'info',
			to: '/admin/lockers',
		},
		{
			icon: PackageSearch,
			label: 'Open lost reports',
			value: counts.open_lost_reports,
			tone: 'brand',
			to: '/admin/reports',
		},
		{
			icon: Zap,
			label: 'Live matches',
			value: counts.live_matches,
			tone: 'accent',
			to: '/admin/review',
		},
		{ icon: PackageCheck, label: 'Items returned', value: counts.returned_items, tone: 'ok' },
		{
			icon: Warehouse,
			label: 'Open overflow',
			value: counts.open_overflow,
			tone: 'warn',
			to: '/admin/overflow',
		},
		{ icon: Inbox, label: 'Waiting for a locker', value: counts.locker_queue, tone: 'neutral' },
		{ icon: Archive, label: 'Unclaimed items', value: counts.unclaimed_items, tone: 'neutral' },
		{
			icon: Users,
			label: 'Students',
			value: counts.students,
			tone: 'brand',
			to: '/admin/users',
		},
		{ icon: FilePen, label: 'Drafts', value: drafts?.drafts, tone: 'neutral' },
	];

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="Overview"
				description="Live numbers — refreshed every 10 seconds."
			/>

			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
				{stats.map((stat, index) => (
					<StatCard
						key={stat.label}
						{...stat}
						index={index}
						onClick={stat.to ? () => navigate(stat.to) : undefined}
					/>
				))}
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-3">
				<Card
					className="xl:col-span-2"
					title="Lockers"
					icon={Lock}
					action={
						<Button as={Link} to="/admin/lockers" size="sm" variant="outline">
							Manage
						</Button>
					}
				>
					<LockerScene lockers={toSceneLockers(lockers)} className="h-72" />
					<LockerLegend className="mt-4" />
				</Card>

				<AiHealthCard ai={ai} drafts={drafts} />
			</div>

			<Card
				className="mt-6"
				title="Recent activity"
				icon={Activity}
				action={
					<Button as={Link} to="/admin/audit" size="sm" variant="outline">
						Audit log
					</Button>
				}
			>
				<ol className="relative space-y-3 border-l border-line pl-5">
					{recentActivity.map((entry, index) => (
						<motion.li
							key={entry.id}
							initial={{ opacity: 0, x: -8 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: index * 0.03 }}
							className="relative"
						>
							<span
								className={clsx(
									'absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-4 ring-surface',
									entry.actor_type === 'admin'
										? 'bg-accent'
										: entry.actor_type === 'device'
											? 'bg-info'
											: 'bg-brand',
								)}
							/>
							<p className="text-sm text-ink">
								<span className="font-mono text-xs text-brand">{entry.action}</span>
								<span className="text-muted">
									{' '}
									· {entry.entity_type}{' '}
									{entry.entity_id ? String(entry.entity_id).slice(0, 8) : ''}
								</span>
							</p>
							<p className="text-xs text-subtle">
								{humanize(entry.actor_type)} · {timeAgo(entry.at)}
								{entry.reason ? ` · “${entry.reason}”` : ''}
							</p>
						</motion.li>
					))}
				</ol>
			</Card>
		</>
	);
}
