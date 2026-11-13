/**
 * Match review.
 *
 *   /admin/review        queue of matches (default: waiting for review), best score first
 *   /admin/matches/:id   score breakdown, the two reports side by side, approve / reject
 */

import clsx from 'clsx';
import {
	ArrowLeft,
	ArrowRight,
	Check,
	CircleDashed,
	Scale,
	ThumbsDown,
	ThumbsUp,
	X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { ScoreGauge } from '../../components/StatusVisuals.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, Detail } from '../../components/ui/Card.jsx';
import { Callout, ErrorState, PageLoader, SkeletonRows } from '../../components/ui/Feedback.jsx';
import { PageHeader, Pagination, Table, Tabs } from '../../components/ui/Layout.jsx';
import { ReasonDialog } from '../../components/ui/Modal.jsx';
import { formatDateTime, formatDay, humanize, percent } from '../../lib/format.js';
import { usePageTitle } from '../../lib/hooks.js';
import { useAdmin, useRules } from '../../lib/queries.js';
import { BAND, matchStatus } from '../../lib/statuses.js';
import { ReportSummary } from './Reports.jsx';
import { Cell, EmptyRow, JsonBlock, PAGE_SIZE, useAdminAction } from './shared.jsx';

const STATUS_TABS = [
	{ value: 'review', label: 'Needs review' },
	{ value: 'auto_matched', label: 'Auto-matched' },
	{ value: 'approved', label: 'Approved' },
	{ value: 'otp_issued', label: 'Code issued' },
	{ value: 'collected', label: 'Collected' },
	{ value: 'rejected', label: 'Rejected' },
	{ value: 'all', label: 'All' },
];

const RESULT_STYLE = {
	agree: { icon: Check, className: 'bg-ok/12 text-ok' },
	conflict: { icon: X, className: 'bg-bad/12 text-bad' },
	missing: { icon: CircleDashed, className: 'bg-surface-3 text-subtle' },
};

function ScoreBar({ value }) {
	return (
		<div className="flex items-center gap-2">
			<div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
				<motion.div
					initial={{ width: 0 }}
					animate={{ width: `${Math.round((value ?? 0) * 100)}%` }}
					transition={{ duration: 0.6 }}
					className="h-full rounded-full bg-gradient-brand"
				/>
			</div>
			<span className="font-mono text-xs tabular-nums text-ink">{percent(value)}</span>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  Queue
// ─────────────────────────────────────────────────────────────

export function AdminReview() {
	usePageTitle('Review');

	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const status = params.get('status') ?? 'review';
	const page = Number(params.get('page') ?? 1);

	const matches = useAdmin(
		'/admin/matches',
		{ status, page, pageSize: PAGE_SIZE },
		{ refetchInterval: 15_000 },
	);

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="Match review"
				description="Matches between 50% and 85% (or failing the release rule) wait here for a human decision."
			/>

			<Tabs
				id="review-tabs"
				className="mb-4"
				value={status}
				onChange={(value) => setParams({ status: value })}
				items={STATUS_TABS}
			/>

			{matches.isError ? (
				<ErrorState error={matches.error} onRetry={matches.refetch} />
			) : (
				<Table
					head={['Score', 'Category', 'Found', 'Lost', 'Status', 'Created', '']}
					footer={
						matches.data && (
							<Pagination
								page={page}
								pageSize={PAGE_SIZE}
								total={matches.data.total}
								onChange={(next) => setParams({ status, page: String(next) })}
							/>
						)
					}
				>
					{matches.isPending ? (
						<SkeletonRows columns={7} />
					) : matches.data.matches.length === 0 ? (
						<EmptyRow columns={7} text="No matches in this list." />
					) : (
						matches.data.matches.map((match) => (
							<tr
								key={match.id}
								className="cursor-pointer"
								onClick={() => navigate(`/admin/matches/${match.id}`)}
							>
								<Cell>
									<ScoreBar value={match.score} />
								</Cell>
								<Cell className="font-medium text-ink">
									{match.category ?? '—'}
								</Cell>
								<Cell className="text-muted">
									{formatDay(match.found?.occurredOn)} ·{' '}
									{match.found?.zone ?? '—'}
									{match.found?.locker && (
										<span className="ml-1 font-mono text-xs text-brand">
											[{match.found.locker}]
										</span>
									)}
								</Cell>
								<Cell className="text-muted">
									{formatDay(match.lost?.occurredOn)} · {match.lost?.zone ?? '—'}
								</Cell>
								<Cell>
									<Badge tone={matchStatus(match.status).tone}>
										{matchStatus(match.status).label}
									</Badge>
								</Cell>
								<Cell className="text-muted">
									{formatDateTime(match.createdAt)}
								</Cell>
								<Cell>
									<ArrowRight className="size-4 text-subtle" />
								</Cell>
							</tr>
						))
					)}
				</Table>
			)}
		</>
	);
}

// ─────────────────────────────────────────────────────────────
//  One match
// ─────────────────────────────────────────────────────────────

export function AdminMatch() {
	usePageTitle('Match review');

	const { id } = useParams();
	const navigate = useNavigate();
	const { data: rules } = useRules();
	const result = useAdmin(`/admin/matches/${id}`);

	const [decision, setDecision] = useState(null);

	const decide = useAdminAction({
		success: (_, variables) =>
			variables.path.endsWith('approve')
				? 'Match approved — the owner is notified.'
				: 'Match rejected.',
		onDone: () => setDecision(null),
	});

	if (result.isPending) {
		return <PageLoader label="Loading match…" />;
	}

	if (result.isError) {
		return <ErrorState error={result.error} onRetry={result.refetch} />;
	}

	const { match, found, lost } = result.data;
	const breakdown = match.breakdown ?? {};
	const status = matchStatus(match.status);
	const canDecide = match.status === 'review';

	return (
		<>
			<PageHeader
				back={
					<Button
						variant="ghost"
						size="sm"
						icon={ArrowLeft}
						className="-ml-3 mb-3"
						onClick={() => navigate('/admin/review')}
					>
						Review queue
					</Button>
				}
				eyebrow="Match"
				title={`${BAND[match.band]?.label ?? 'Match'} · ${percent(match.score)}`}
				actions={
					<>
						<Badge tone={status.tone} dot>
							{status.label}
						</Badge>
						{canDecide && (
							<>
								<Button
									variant="danger"
									icon={ThumbsDown}
									onClick={() => setDecision('reject')}
								>
									Reject
								</Button>
								<Button
									variant="success"
									icon={ThumbsUp}
									onClick={() => setDecision('approve')}
								>
									Approve
								</Button>
							</>
						)}
					</>
				}
			/>

			{match.reviewReason && (
				<Callout tone="warn" icon={Scale} title="Why it needs review" className="mb-6">
					{humanize(match.reviewReason)}
					{match.releaseRuleMet === false &&
						' · the release rule (enough agreeing details) is not met.'}
				</Callout>
			)}

			{match.decisionReason && (
				<Callout
					tone="info"
					title={`Decided ${formatDateTime(match.decidedAt)}`}
					className="mb-6"
				>
					“{match.decisionReason}”
				</Callout>
			)}

			<div className="grid gap-6 xl:grid-cols-3">
				<Card title="Score">
					<div className="flex justify-center">
						<ScoreGauge
							score={match.score}
							autoLine={rules?.autoMatchThreshold}
							reviewLine={rules?.reviewThreshold}
						/>
					</div>

					<dl className="mt-4 space-y-2.5">
						{Object.entries(breakdown.terms ?? {}).map(([term, value]) => (
							<div key={term} className="flex items-center justify-between gap-3">
								<dt className="text-sm text-muted">{humanize(term)}</dt>
								<dd>
									<ScoreBar value={value} />
								</dd>
							</div>
						))}
						<div className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
							<dt className="text-sm text-muted">Coverage</dt>
							<dd>
								<ScoreBar value={breakdown.coverage} />
							</dd>
						</div>
					</dl>

					<div className="mt-4 grid grid-cols-2 gap-3">
						<Detail label="Gate">{humanize(breakdown.gate)}</Detail>
						<Detail label="Release rule">
							{match.releaseRuleMet ? 'Met' : 'Not met'}
						</Detail>
						<Detail label="Embedding">
							{match.scoredWithoutEmbedding ? 'Not used' : 'Used'}
						</Detail>
						<Detail label="Hold until">
							{match.holdExpiresAt ? formatDateTime(match.holdExpiresAt) : '—'}
						</Detail>
					</div>
				</Card>

				<Card title="Field by field" className="xl:col-span-2" padded={false}>
					<div className="overflow-x-auto">
						<table className="w-full min-w-[560px] text-left text-sm">
							<thead className="border-b border-line text-xs uppercase tracking-wide text-subtle">
								<tr>
									<th className="px-5 py-3 font-semibold">Question</th>
									<th className="px-5 py-3 font-semibold">Found</th>
									<th className="px-5 py-3 font-semibold">Lost</th>
									<th className="px-5 py-3 font-semibold">Result</th>
									<th className="px-5 py-3 text-right font-semibold">Weight</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-line">
								{(breakdown.fields ?? []).map((field) => {
									const style =
										RESULT_STYLE[field.result] ?? RESULT_STYLE.missing;
									const Icon = style.icon;

									return (
										<tr key={field.key}>
											<td className="px-5 py-2.5 font-mono text-xs text-ink">
												{field.key}
											</td>
											<td className="px-5 py-2.5 text-muted">
												{[].concat(field.a ?? '—').join(', ')}
											</td>
											<td className="px-5 py-2.5 text-muted">
												{[].concat(field.b ?? '—').join(', ')}
											</td>
											<td className="px-5 py-2.5">
												<span
													className={clsx(
														'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold',
														style.className,
													)}
												>
													<Icon className="size-3" strokeWidth={3} />{' '}
													{humanize(field.result)}
												</span>
											</td>
											<td className="px-5 py-2.5 text-right font-mono text-xs text-muted">
												{field.contribution?.toFixed?.(2) ?? '—'} /{' '}
												{field.weight?.toFixed?.(2) ?? '—'}
											</td>
										</tr>
									);
								})}

								{(breakdown.followups?.aspects ?? []).map((aspect) => {
									const style =
										RESULT_STYLE[aspect.result] ?? RESULT_STYLE.missing;
									const Icon = style.icon;

									return (
										<tr key={`aspect-${aspect.aspect}`} className="bg-accent/4">
											<td className="px-5 py-2.5 font-mono text-xs text-accent">
												follow-up: {aspect.aspect}
											</td>
											<td className="px-5 py-2.5 text-muted">
												{[].concat(aspect.a ?? '—').join(', ')}
											</td>
											<td className="px-5 py-2.5 text-muted">
												{[].concat(aspect.b ?? '—').join(', ')}
											</td>
											<td className="px-5 py-2.5" colSpan={2}>
												<span
													className={clsx(
														'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold',
														style.className,
													)}
												>
													<Icon className="size-3" strokeWidth={3} />{' '}
													{humanize(aspect.result)}
												</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 lg:grid-cols-2">
				<ReportSummary report={found} title="Found report" />
				<ReportSummary report={lost} title="Lost report" />
			</div>

			<details className="mt-6 rounded-2xl border border-line bg-surface p-5">
				<summary className="cursor-pointer text-sm font-semibold text-ink">
					Raw breakdown (JSON)
				</summary>
				<JsonBlock value={breakdown} className="mt-4" />
			</details>

			<ReasonDialog
				open={Boolean(decision)}
				onClose={() => setDecision(null)}
				loading={decide.isPending}
				variant={decision === 'approve' ? 'success' : 'danger'}
				title={decision === 'approve' ? 'Approve this match?' : 'Reject this match?'}
				description={
					decision === 'approve'
						? 'The owner is notified and can collect the item from the locker.'
						: 'Both reports go back to matching. The owner is not told about this candidate.'
				}
				confirmLabel={decision === 'approve' ? 'Approve' : 'Reject'}
				onConfirm={(reason) =>
					decide.mutate({
						path: `/admin/matches/${match.id}/${decision}`,
						body: { reason },
					})
				}
			/>

			{found?.id && lost?.id && (
				<p className="mt-6 text-xs text-subtle">
					Reports:{' '}
					<Link
						className="font-mono text-brand hover:underline"
						to={`/admin/reports/${found.id}`}
					>
						{found.id.slice(0, 8)}
					</Link>{' '}
					↔{' '}
					<Link
						className="font-mono text-brand hover:underline"
						to={`/admin/reports/${lost.id}`}
					>
						{lost.id.slice(0, 8)}
					</Link>
				</p>
			)}
		</>
	);
}
