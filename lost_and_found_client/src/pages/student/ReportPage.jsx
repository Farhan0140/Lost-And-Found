/**
 * /reports/:id
 *
 *   draft      → the draft wizard (DraftWizard)
 *   submitted  → timeline + what to do next + the full description
 *
 * The page polls faster while something is expected to happen elsewhere
 * (a deposit code is active, the AI is retrying, a locker is being waited for).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeft,
	ArrowRight,
	Ban,
	CalendarDays,
	Clock,
	Lock,
	MapPin,
	PackageCheck,
	PartyPopper,
	Radar,
	ShieldCheck,
	TriangleAlert,
	Warehouse,
	XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { LockerScene } from '../../components/LockerScene.jsx';
import { ReportStatusBadge, Timeline } from '../../components/StatusVisuals.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, Detail } from '../../components/ui/Card.jsx';
import { Callout, EmptyState, ErrorState, PageLoader } from '../../components/ui/Feedback.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { api, ApiError } from '../../lib/api.js';
import { formatDateTime, formatDay, timeAgo } from '../../lib/format.js';
import { usePageTitle } from '../../lib/hooks.js';
import { keys, usePublicLockers, useReport } from '../../lib/queries.js';
import { BAND, categoryIcon, matchStatus } from '../../lib/statuses.js';
import { DraftWizard } from './editor/DraftWizard.jsx';
import { describeAnswer } from './editor/answers.js';
import { DepositPanel } from './report/DepositPanel.jsx';

/** How often to reload the report, depending on its state. */
function pollFor(report) {
	if (!report) {
		return false;
	}

	if (report.status === 'draft') {
		return report.draft?.waitingForAi ? 15_000 : false;
	}

	if (report.activeOtp) {
		return 5_000; // the kiosk may store / hand out the item any second
	}

	if (['awaiting_locker', 'awaiting_deposit'].includes(report.status)) {
		return 15_000;
	}

	if (['open', 'stored', 'matched', 'awaiting_collection'].includes(report.status)) {
		return 30_000;
	}

	return false;
}

// ─────────────────────────────────────────────────────────────
//  "What now" panels for each status
// ─────────────────────────────────────────────────────────────

function StoredPanel({ report }) {
	const { data: lockers = [] } = usePublicLockers({ live: true });
	const label = report.locker?.label;

	return (
		<Card title={label ? `Safe in locker ${label}` : 'Stored safely'} icon={ShieldCheck}>
			<div className="grid items-center gap-6 md:grid-cols-2">
				<LockerScene
					lockers={lockers}
					highlight={label}
					className="h-60"
					interactive={false}
				/>
				<div className="space-y-3">
					<p className="text-muted">
						Thank you! The item is locked away. We are comparing it with lost reports
						and will let you know when its owner picks it up.
					</p>
					{report.storedAt && (
						<p className="flex items-center gap-2 text-sm text-subtle">
							<Clock className="size-4" /> Stored {timeAgo(report.storedAt)}
						</p>
					)}
				</div>
			</div>
		</Card>
	);
}

function SearchingPanel({ report }) {
	const reviewing = (report.matches ?? []).some((match) => match.status === 'review');

	return (
		<Card>
			<div className="flex flex-col items-center gap-5 py-6 text-center sm:flex-row sm:text-left">
				<div className="relative grid size-24 shrink-0 place-items-center">
					{[0, 1, 2].map((ring) => (
						<motion.span
							key={ring}
							className="absolute inset-0 rounded-full border-2 border-brand/40"
							initial={{ scale: 0.4, opacity: 0.8 }}
							animate={{ scale: 1.3, opacity: 0 }}
							transition={{
								duration: 2.4,
								repeat: Infinity,
								delay: ring * 0.8,
								ease: 'easeOut',
							}}
						/>
					))}
					<span className="relative grid size-16 place-items-center rounded-full bg-gradient-brand text-white">
						<Radar className="size-8" aria-hidden />
					</span>
				</div>

				<div>
					<p className="text-lg font-bold text-ink">
						{reviewing
							? 'An admin is checking a possible match'
							: 'Searching for your item'}
					</p>
					<p className="mt-1 text-sm text-muted">
						Every found item handed in is compared with your description. You get a
						notification the moment there is a match — no need to keep this page open.
					</p>
				</div>
			</div>
		</Card>
	);
}

function MatchesPanel({ report }) {
	const matches = report.matches ?? [];
	const isOwner = report.kind === 'lost';

	if (matches.length === 0) {
		return null;
	}

	return (
		<Card title={isOwner ? 'Matches' : 'The owner was found'} icon={PackageCheck}>
			<div className="space-y-3">
				{matches.map((match) => {
					const status = matchStatus(match.status);
					const band = BAND[match.band];

					const content = (
						<>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-2">
									<Badge tone={status.tone} dot>
										{status.label}
									</Badge>
									{band && <Badge tone={band.tone}>{band.label}</Badge>}
								</div>
								<p className="mt-1.5 text-xs text-subtle">
									Found {timeAgo(match.createdAt)}
								</p>
							</div>
							{isOwner && (
								<ArrowRight className="size-5 text-subtle transition-transform group-hover:translate-x-1 group-hover:text-brand" />
							)}
						</>
					);

					return isOwner ? (
						<Link
							key={match.id}
							to={`/matches/${match.id}`}
							className="group flex items-center gap-4 rounded-xl border border-line bg-surface-2/40 p-4 transition-colors hover:border-brand/50"
						>
							{content}
						</Link>
					) : (
						<div
							key={match.id}
							className="flex items-center gap-4 rounded-xl border border-line bg-surface-2/40 p-4"
						>
							{content}
						</div>
					);
				})}
			</div>

			{!isOwner && (
				<p className="mt-4 text-sm text-muted">
					The owner collects it from the locker with their own code. For privacy you do
					not see who they are.
				</p>
			)}
		</Card>
	);
}

function CollectedPanel({ report }) {
	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.94 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ type: 'spring', stiffness: 180, damping: 16 }}
			className="relative overflow-hidden rounded-3xl border border-ok/40 bg-ok/8 p-8 text-center"
		>
			{Array.from({ length: 14 }, (_, index) => (
				<motion.span
					key={index}
					aria-hidden
					className="absolute size-2 rounded-sm"
					style={{
						left: `${(index * 37) % 100}%`,
						top: '-10px',
						background: ['var(--brand)', 'var(--accent)', 'var(--ok)', 'var(--warn)'][
							index % 4
						],
					}}
					animate={{ y: [0, 260], rotate: [0, 360], opacity: [1, 0] }}
					transition={{
						duration: 2.6 + (index % 4) * 0.4,
						repeat: Infinity,
						delay: index * 0.18,
					}}
				/>
			))}

			<PartyPopper className="relative mx-auto size-12 text-ok" aria-hidden />
			<p className="relative mt-3 text-2xl font-extrabold text-ink">
				{report.kind === 'found' ? 'Returned to its owner!' : 'You got it back!'}
			</p>
			<p className="relative mt-1 text-muted">
				{report.kind === 'found'
					? 'Thank you for handing it in — you made someone’s day.'
					: `Collected ${report.collectedAt ? timeAgo(report.collectedAt) : ''}. Thanks for using SmartFind.`}
			</p>
		</motion.div>
	);
}

function StatusPanel({ report }) {
	switch (report.status) {
		case 'awaiting_deposit':
		case 'awaiting_locker':
			return <DepositPanel report={report} />;

		case 'stored':
			return (
				<>
					<StoredPanel report={report} />
					<MatchesPanel report={report} />
				</>
			);

		case 'open':
			return (
				<>
					<SearchingPanel report={report} />
					<MatchesPanel report={report} />
				</>
			);

		case 'matched':
		case 'awaiting_collection':
			return <MatchesPanel report={report} />;

		case 'collected':
			return <CollectedPanel report={report} />;

		case 'overflow':
			return (
				<Callout
					tone="warn"
					icon={Warehouse}
					title="Please bring the item to the admin desk"
				>
					It does not fit in a locker (or no locker could be used). The admins will store
					it and it is still matched with lost reports as usual.
				</Callout>
			);

		case 'abandoned':
			return (
				<Callout tone="warn" icon={TriangleAlert} title="All locker codes were used">
					The item was not put in a locker in time. Please hand it to the admin desk.
				</Callout>
			);

		case 'unclaimed_expired':
			return (
				<Callout tone="info" icon={Warehouse} title="Moved to the admin desk">
					Nobody claimed the item in time, so the admins took it out of the locker. It can
					still be returned from the desk.
				</Callout>
			);

		case 'cancelled':
			return (
				<Callout tone="info" icon={Ban} title="Cancelled">
					This report is closed and no longer matched.
				</Callout>
			);

		default:
			return null;
	}
}

// ─────────────────────────────────────────────────────────────
//  Description (answers + follow-ups)
// ─────────────────────────────────────────────────────────────

function followupAnswerText(followup) {
	const answer = followup.answer;

	if (!answer) return '—';
	if (answer.kind === 'option')
		return (
			followup.options?.find((option) => option.code === answer.code)?.label ?? answer.code
		);
	if (answer.kind === 'other') return `“${answer.text}”`;

	return answer.kind === 'none' ? 'None of these' : "Don't remember";
}

function Description({ report }) {
	const questions = report.questionSet?.questions ?? [];

	return (
		<Card title="Your description">
			<dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
				{questions.map((question) => (
					<div key={question.key}>
						<dt className="text-xs font-medium text-subtle">{question.text}</dt>
						<dd className="mt-0.5 text-sm font-medium text-ink">
							{describeAnswer(question, report.answers?.[question.key]) ?? (
								<span className="text-subtle">—</span>
							)}
						</dd>
					</div>
				))}
			</dl>

			{(report.followups ?? []).length > 0 && (
				<div className="mt-6 border-t border-line pt-5">
					<p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
						<Lock className="size-4 text-ok" /> Follow-up answers{' '}
						<span className="font-normal text-subtle">(only you and admins)</span>
					</p>
					<dl className="space-y-3">
						{report.followups.map((followup) => (
							<div key={followup.id}>
								<dt className="text-xs font-medium text-subtle">{followup.text}</dt>
								<dd className="mt-0.5 text-sm font-medium text-ink">
									{followupAnswerText(followup)}
								</dd>
							</div>
						))}
					</dl>
				</div>
			)}
		</Card>
	);
}

// ─────────────────────────────────────────────────────────────
//  Submitted report
// ─────────────────────────────────────────────────────────────

function SubmittedReport({ report }) {
	const queryClient = useQueryClient();
	const [confirmCancel, setConfirmCancel] = useState(false);
	const CategoryIcon = categoryIcon(report.category?.icon);

	const cancellable =
		(report.kind === 'lost' && report.status === 'open') ||
		(report.kind === 'found' &&
			['awaiting_deposit', 'awaiting_locker'].includes(report.status));

	const cancel = useMutation({
		mutationFn: () => api.post(`/reports/${report.id}/cancel`),
		onSuccess: ({ report: updated }) => {
			queryClient.setQueryData(keys.report(report.id), updated);
			queryClient.invalidateQueries({ queryKey: keys.reports() });
			setConfirmCancel(false);
			toast.success('Report cancelled');
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<div className="mx-auto max-w-5xl">
			<PageHeader
				back={
					<Button
						as={Link}
						to="/dashboard"
						variant="ghost"
						size="sm"
						icon={ArrowLeft}
						className="-ml-3 mb-3"
					>
						My reports
					</Button>
				}
				eyebrow={report.kind === 'found' ? 'Found item' : 'Lost item'}
				title={
					<span className="flex items-center gap-3">
						<span className="grid size-11 place-items-center rounded-2xl bg-gradient-brand text-white">
							<CategoryIcon className="size-5" aria-hidden />
						</span>
						{report.category?.name ?? 'Report'}
					</span>
				}
				actions={
					<>
						<ReportStatusBadge status={report.status} />
						{cancellable && (
							<Button
								variant="ghost"
								size="sm"
								icon={XCircle}
								onClick={() => setConfirmCancel(true)}
							>
								Cancel report
							</Button>
						)}
					</>
				}
			/>

			<Card className="mb-6">
				<Timeline kind={report.kind} status={report.status} />
			</Card>

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="space-y-6 lg:col-span-2">
					<StatusPanel report={report} />
					<Description report={report} />
				</div>

				<div className="space-y-6">
					<Card title="Details">
						<dl className="space-y-4">
							<Detail label={report.kind === 'found' ? 'Found on' : 'Lost on'}>
								<span className="inline-flex items-center gap-1.5">
									<CalendarDays className="size-4 text-subtle" />{' '}
									{formatDay(report.occurredOn)}
								</span>
							</Detail>
							<Detail label="Where">
								<span className="inline-flex items-start gap-1.5">
									<MapPin className="mt-0.5 size-4 shrink-0 text-subtle" />
									<span>
										{report.zone?.name ?? '—'}
										{report.zone?.department && (
											<span className="text-muted">
												{' '}
												· {report.zone.department}
											</span>
										)}
										{report.placeNote && (
											<span className="block text-muted">
												{report.placeNote}
											</span>
										)}
									</span>
								</span>
							</Detail>
							{report.locker?.label && (
								<Detail label="Locker">{report.locker.label}</Detail>
							)}
							<Detail label="Submitted">{formatDateTime(report.submittedAt)}</Detail>
							<Detail label="Reference">
								<span className="font-mono text-xs">
									{report.id.slice(0, 8).toUpperCase()}
								</span>
							</Detail>
						</dl>
					</Card>

					<Callout tone="info" icon={ShieldCheck} title="Your privacy">
						Others never see your name or your follow-up answers. Photos were never
						stored.
					</Callout>
				</div>
			</div>

			<ConfirmDialog
				open={confirmCancel}
				onClose={() => setConfirmCancel(false)}
				onConfirm={() => cancel.mutate()}
				loading={cancel.isPending}
				title="Cancel this report?"
				description={
					report.kind === 'found'
						? 'Any locker code stops working. Only cancel if you no longer have the item.'
						: 'We stop looking for matches. Do this if you found the item yourself.'
				}
				confirmLabel="Cancel report"
			/>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────

export function ReportPage() {
	const { id } = useParams();
	const report = useReport(id, { poll: pollFor });

	usePageTitle(report.data?.category?.name ?? 'Report');

	if (report.isPending) {
		return <PageLoader label="Loading report…" />;
	}

	if (report.isError) {
		if (report.error instanceof ApiError && report.error.status === 404) {
			return (
				<EmptyState
					icon={TriangleAlert}
					title="Report not found"
					description="It may have been discarded, or it belongs to another account."
					action={
						<Button as={Link} to="/dashboard" icon={ArrowLeft}>
							My reports
						</Button>
					}
				/>
			);
		}

		return <ErrorState error={report.error} onRetry={report.refetch} />;
	}

	if (report.data.status === 'draft') {
		return <DraftWizard key={report.data.id} report={report.data} />;
	}

	return <SubmittedReport report={report.data} />;
}
