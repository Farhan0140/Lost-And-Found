/**
 * "My reports": quick start cards + tabs (drafts · active · closed).
 */

import { ArrowRight, ClipboardList, FilePen, HandHeart, Inbox, PackageSearch } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useSearchParams } from 'react-router';

import { ReportCard } from '../../components/ReportCard.jsx';
import { EmptyState, ErrorState, SkeletonCards } from '../../components/ui/Feedback.jsx';
import { PageHeader, Tabs, TiltCard } from '../../components/ui/Layout.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { usePageTitle } from '../../lib/hooks.js';
import { useMyReports } from '../../lib/queries.js';

const TAB_INFO = {
	drafts: {
		icon: FilePen,
		empty: 'No drafts',
		text: 'Unfinished reports are saved here for 7 days — continue on any device.',
	},
	active: {
		icon: ClipboardList,
		empty: 'Nothing in progress',
		text: 'Found something or lost something? Start a report and we take it from there.',
	},
	closed: {
		icon: Inbox,
		empty: 'No closed reports yet',
		text: 'Returned items and cancelled reports show up here.',
	},
};

function greeting() {
	const hour = Number(
		new Intl.DateTimeFormat('en-GB', {
			hour: 'numeric',
			hour12: false,
			timeZone: 'Asia/Dhaka',
		}).format(new Date()),
	);

	if (hour < 12) return 'Good morning';
	if (hour < 17) return 'Good afternoon';

	return 'Good evening';
}

function StartCard({ to, icon: Icon, title, text, tone }) {
	return (
		<TiltCard className="h-full rounded-3xl" max={8}>
			<Link
				to={to}
				className="group relative flex h-full items-center gap-5 overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card transition-colors hover:border-brand/40"
			>
				<div
					aria-hidden
					className={
						tone === 'found'
							? 'absolute -right-10 -top-10 size-40 rounded-full bg-brand/20 blur-3xl transition-opacity duration-500 group-hover:opacity-100 opacity-60'
							: 'absolute -right-10 -top-10 size-40 rounded-full bg-warn/20 blur-3xl transition-opacity duration-500 group-hover:opacity-100 opacity-60'
					}
				/>
				<span
					className={
						tone === 'found'
							? 'relative grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-brand text-white shadow-[0_10px_30px_-10px_var(--glow)] [transform:translateZ(40px)]'
							: 'relative grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-warn to-bad text-white [transform:translateZ(40px)]'
					}
				>
					<Icon className="size-6" aria-hidden />
				</span>
				<div className="relative min-w-0 [transform:translateZ(20px)]">
					<p className="text-lg font-bold text-ink">{title}</p>
					<p className="mt-0.5 text-sm text-muted">{text}</p>
				</div>
				<ArrowRight className="relative ml-auto size-5 shrink-0 text-subtle transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand" />
			</Link>
		</TiltCard>
	);
}

export function Dashboard() {
	usePageTitle('My reports');

	const { user } = useAuth();
	const [params, setParams] = useSearchParams();
	const tab = ['drafts', 'active', 'closed'].includes(params.get('tab'))
		? params.get('tab')
		: 'active';

	// counts for every tab (lists are small: max 100 per tab)
	const drafts = useMyReports('drafts');
	const active = useMyReports('active');
	const closed = useMyReports('closed');

	const current = { drafts, active, closed }[tab];
	const info = TAB_INFO[tab];

	return (
		<>
			<PageHeader
				eyebrow={greeting()}
				title={`Hi, ${user?.fullName?.split(' ')[0] ?? 'there'} 👋`}
				description="Everything you reported, and where each item is right now."
			/>

			<div className="grid gap-4 md:grid-cols-2">
				<StartCard
					to="/reports/new?kind=found"
					icon={HandHeart}
					title="I found something"
					text="Photos → a few questions → drop it in a locker."
					tone="found"
				/>
				<StartCard
					to="/reports/new?kind=lost"
					icon={PackageSearch}
					title="I lost something"
					text="Describe it and get notified when it turns up."
					tone="lost"
				/>
			</div>

			<div className="mt-10 flex flex-wrap items-center justify-between gap-4">
				<Tabs
					id="dashboard-tabs"
					value={tab}
					onChange={(value) => setParams({ tab: value }, { replace: true })}
					items={[
						{ value: 'active', label: 'Active', count: active.data?.length },
						{ value: 'drafts', label: 'Drafts', count: drafts.data?.length },
						{ value: 'closed', label: 'Closed', count: closed.data?.length },
					]}
				/>
			</div>

			<div className="mt-5">
				{current.isError ? (
					<ErrorState error={current.error} onRetry={current.refetch} />
				) : current.isPending ? (
					<SkeletonCards count={3} />
				) : current.data.length === 0 ? (
					<EmptyState icon={info.icon} title={info.empty} description={info.text} />
				) : (
					<motion.div layout className="grid gap-3">
						<AnimatePresence mode="popLayout">
							{current.data.map((report, index) => (
								<ReportCard key={report.id} report={report} index={index} />
							))}
						</AnimatePresence>
					</motion.div>
				)}
			</div>
		</>
	);
}
