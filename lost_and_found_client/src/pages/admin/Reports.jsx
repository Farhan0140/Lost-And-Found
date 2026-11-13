/**
 * Reports for admins.
 *
 *   /admin/reports       every report (filter by kind, status, search student / marks)
 *   /admin/reports/:id   full view: answers, private follow-ups, AI details, matches
 *   /admin/overflow      items handed to the desk instead of a locker
 */

import clsx from 'clsx';
import {
	ArrowLeft,
	ArrowRight,
	CalendarDays,
	CheckCircle2,
	KeyRound,
	MapPin,
	UserRound,
	Warehouse,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { ReportStatusBadge, Timeline } from '../../components/StatusVisuals.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, Detail } from '../../components/ui/Card.jsx';
import { ErrorState, PageLoader, SkeletonRows } from '../../components/ui/Feedback.jsx';
import { SearchInput, Select } from '../../components/ui/Form.jsx';
import { PageHeader, Pagination, Table, Tabs } from '../../components/ui/Layout.jsx';
import { ReasonDialog } from '../../components/ui/Modal.jsx';
import { formatDateTime, formatDay, humanize, percent, timeAgo } from '../../lib/format.js';
import { useDebounced, usePageTitle } from '../../lib/hooks.js';
import { useAdmin } from '../../lib/queries.js';
import { categoryIcon, matchStatus, REPORT_STATUS } from '../../lib/statuses.js';
import { describeAnswer } from '../student/editor/answers.js';
import { Cell, EmptyRow, JsonBlock, PAGE_SIZE, Toolbar, useAdminAction } from './shared.jsx';

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

// ─────────────────────────────────────────────────────────────
//  Summary card (also used on the match review page)
// ─────────────────────────────────────────────────────────────

export function ReportSummary({ report, title, showLink = true }) {
	if (!report) {
		return null;
	}

	const Icon = categoryIcon(report.category?.icon);
	const questions = report.questionSet?.questions ?? [];

	return (
		<Card
			title={title ?? report.category?.name}
			description={`${report.kind === 'found' ? 'Found' : 'Lost'} · ${report.category?.name ?? 'no category'}`}
			icon={Icon}
			action={
				<div className="flex items-center gap-2">
					<ReportStatusBadge status={report.status} />
					{showLink && (
						<Button
							as={Link}
							to={`/admin/reports/${report.id}`}
							size="sm"
							variant="ghost"
							icon={ArrowRight}
							aria-label="Open report"
						/>
					)}
				</div>
			}
		>
			<div className="mb-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
				{report.reporter && (
					<span className="inline-flex items-center gap-1.5">
						<UserRound className="size-4" /> {report.reporter.fullName} (
						{report.reporter.studentId})
					</span>
				)}
				<span className="inline-flex items-center gap-1.5">
					<CalendarDays className="size-4" /> {formatDay(report.occurredOn)}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<MapPin className="size-4" /> {report.zone?.name ?? '—'}
					{report.placeNote ? ` · ${report.placeNote}` : ''}
				</span>
				{report.locker?.label && <Badge tone="info">Locker {report.locker.label}</Badge>}
			</div>

			<dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
				{questions.map((question) => (
					<div key={question.key}>
						<dt className="text-xs text-subtle">{question.text}</dt>
						<dd className="text-sm font-medium text-ink">
							{describeAnswer(question, report.answers?.[question.key]) ?? (
								<span className="text-subtle">—</span>
							)}
							{report.answers?.[question.key]?.source === 'ai' && (
								<span className="ml-1.5 rounded bg-accent/15 px-1 text-[10px] font-bold text-accent">
									AI
								</span>
							)}
						</dd>
					</div>
				))}
			</dl>

			{(report.followups ?? []).length > 0 && (
				<div className="mt-5 border-t border-line pt-4">
					<p className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">
						Follow-ups (private)
					</p>
					<dl className="space-y-2">
						{report.followups.map((followup) => (
							<div key={followup.id}>
								<dt className="text-xs text-subtle">
									<span className="font-mono text-accent">{followup.aspect}</span>{' '}
									· {followup.text}
								</dt>
								<dd className="text-sm font-medium text-ink">
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
//  List
// ─────────────────────────────────────────────────────────────

export function AdminReports() {
	usePageTitle('Reports');

	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();

	const kind = params.get('kind') ?? '';
	const status = params.get('status') ?? '';
	const page = Number(params.get('page') ?? 1);
	const [search, setSearch] = useState(params.get('search') ?? '');
	const debouncedSearch = useDebounced(search, 350);

	const update = (changes) => {
		const next = { kind, status, search: debouncedSearch, page: '1', ...changes };

		setParams(Object.fromEntries(Object.entries(next).filter(([, value]) => value)), {
			replace: true,
		});
	};

	// put the search into the URL once typing pauses (so the page can be shared / reloaded)
	useEffect(() => {
		if (debouncedSearch !== (params.get('search') ?? '')) {
			update({ search: debouncedSearch });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedSearch]);

	const reports = useAdmin('/admin/reports', {
		kind: kind || undefined,
		status: status || undefined,
		search: debouncedSearch || undefined,
		page,
		pageSize: PAGE_SIZE,
	});

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="Reports"
				description="Every found and lost report. Search by student ID, name or distinctive marks."
			/>

			<Toolbar>
				<Tabs
					id="report-kind"
					value={kind || 'all'}
					onChange={(value) => update({ kind: value === 'all' ? '' : value })}
					items={[
						{ value: 'all', label: 'All' },
						{ value: 'found', label: 'Found' },
						{ value: 'lost', label: 'Lost' },
					]}
				/>
				<Select
					value={status}
					onChange={(event) => update({ status: event.target.value })}
					className="w-52"
					aria-label="Status"
				>
					<option value="">Any status</option>
					{Object.entries(REPORT_STATUS).map(([value, info]) => (
						<option key={value} value={value}>
							{info.label}
						</option>
					))}
				</Select>
				<div className="w-full sm:w-64">
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Student, name, marks…"
					/>
				</div>
			</Toolbar>

			{reports.isError ? (
				<ErrorState error={reports.error} onRetry={reports.refetch} />
			) : (
				<Table
					head={[
						'Report',
						'Status',
						'Reporter',
						'Date / zone',
						'Locker',
						'AI',
						'Created',
					]}
					footer={
						reports.data && (
							<Pagination
								page={page}
								pageSize={PAGE_SIZE}
								total={reports.data.total}
								onChange={(next) => update({ page: String(next) })}
							/>
						)
					}
				>
					{reports.isPending ? (
						<SkeletonRows columns={7} />
					) : reports.data.reports.length === 0 ? (
						<EmptyRow columns={7} text="No reports match these filters." />
					) : (
						reports.data.reports.map((report) => (
							<tr
								key={report.id}
								className="cursor-pointer"
								onClick={() => navigate(`/admin/reports/${report.id}`)}
							>
								<Cell>
									<div className="flex items-center gap-2">
										<span
											className={clsx(
												'h-6 w-1 rounded-full',
												report.kind === 'found' ? 'bg-brand' : 'bg-warn',
											)}
										/>
										<div>
											<p className="font-medium text-ink">
												{report.category ?? 'No category yet'}
											</p>
											<p className="text-xs text-subtle">
												{report.kind} · {report.path ?? '—'} ·{' '}
												<span className="font-mono">
													{report.id.slice(0, 8)}
												</span>
											</p>
										</div>
									</div>
								</Cell>
								<Cell>
									<ReportStatusBadge status={report.status} />
								</Cell>
								<Cell>
									<p className="text-ink">{report.full_name}</p>
									<p className="font-mono text-xs text-subtle">
										{report.student_id}
									</p>
								</Cell>
								<Cell className="text-muted">
									{formatDay(report.occurred_on)}
									<p className="text-xs text-subtle">{report.zone ?? '—'}</p>
								</Cell>
								<Cell mono>{report.locker ?? '—'}</Cell>
								<Cell>
									<Badge
										tone={
											report.ai_status === 'waiting'
												? 'warn'
												: report.ai_status === 'ok'
													? 'ok'
													: 'neutral'
										}
									>
										{humanize(report.ai_status ?? 'none')}
									</Badge>
								</Cell>
								<Cell className="text-muted">{timeAgo(report.created_at)}</Cell>
							</tr>
						))
					)}
				</Table>
			)}
		</>
	);
}

// ─────────────────────────────────────────────────────────────
//  One report
// ─────────────────────────────────────────────────────────────

export function AdminReport() {
	usePageTitle('Report');

	const { id } = useParams();
	const navigate = useNavigate();
	const result = useAdmin(`/admin/reports/${id}`);
	const [granting, setGranting] = useState(false);

	const grant = useAdminAction({
		success: 'Extra deposit codes granted — the finder is notified.',
		onDone: () => setGranting(false),
	});

	if (result.isPending) {
		return <PageLoader label="Loading report…" />;
	}

	if (result.isError) {
		return <ErrorState error={result.error} onRetry={result.refetch} />;
	}

	const report = result.data.report;
	const deposit = report.deposit;
	const outOfCodes =
		report.kind === 'found' && deposit && deposit.generations >= deposit.generationLimit;

	return (
		<>
			<PageHeader
				back={
					<Button
						variant="ghost"
						size="sm"
						icon={ArrowLeft}
						className="-ml-3 mb-3"
						onClick={() => navigate(-1)}
					>
						Back
					</Button>
				}
				eyebrow={`${report.kind === 'found' ? 'Found' : 'Lost'} report · ${report.id.slice(0, 8)}`}
				title={report.category?.name ?? 'Report'}
				actions={
					<>
						<ReportStatusBadge status={report.status} />
						{outOfCodes &&
							['awaiting_deposit', 'awaiting_locker', 'abandoned'].includes(
								report.status,
							) && (
								<Button size="sm" icon={KeyRound} onClick={() => setGranting(true)}>
									Grant more codes
								</Button>
							)}
					</>
				}
			/>

			{report.status !== 'draft' && (
				<Card className="mb-6">
					<Timeline kind={report.kind} status={report.status} />
				</Card>
			)}

			<div className="grid gap-6 xl:grid-cols-3">
				<div className="xl:col-span-2">
					<ReportSummary report={report} title="Description" showLink={false} />
				</div>

				<div className="space-y-6">
					<Card title="Details">
						<dl className="grid grid-cols-2 gap-4">
							<Detail label="Path">{humanize(report.path ?? '—')}</Detail>
							<Detail label="AI status">{humanize(report.aiStatus ?? '—')}</Detail>
							<Detail label="Embedding">
								{humanize(report.embeddingStatus ?? '—')}
							</Detail>
							<Detail label="Fits in locker">
								{report.fitsInLocker === null || report.fitsInLocker === undefined
									? '—'
									: report.fitsInLocker
										? 'Yes'
										: 'No'}
							</Detail>
							{deposit && (
								<Detail label="Deposit codes">
									{deposit.generations} / {deposit.generationLimit}
								</Detail>
							)}
							{report.extraction?.confidence !== undefined && (
								<Detail label="AI confidence">
									{percent(report.extraction.confidence)}
								</Detail>
							)}
							<Detail label="Created">{formatDateTime(report.createdAt)}</Detail>
							<Detail label="Submitted">{formatDateTime(report.submittedAt)}</Detail>
							<Detail label="Stored">{formatDateTime(report.storedAt)}</Detail>
							<Detail label="Collected">{formatDateTime(report.collectedAt)}</Detail>
						</dl>
					</Card>

					<Card title="Matches">
						{(report.matches ?? []).length === 0 ? (
							<p className="text-sm text-subtle">No match candidates yet.</p>
						) : (
							<ul className="space-y-2">
								{report.matches.map((match) => (
									<li key={match.id}>
										<Link
											to={`/admin/matches/${match.id}`}
											className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3 py-2 transition-colors hover:border-brand/50"
										>
											<span className="font-mono text-sm text-ink">
												{percent(match.score)}
											</span>
											<Badge tone={matchStatus(match.status).tone}>
												{matchStatus(match.status).label}
											</Badge>
										</Link>
									</li>
								))}
							</ul>
						)}
					</Card>
				</div>
			</div>

			{(report.extraction || report.canonical) && (
				<details className="mt-6 rounded-2xl border border-line bg-surface p-5">
					<summary className="cursor-pointer text-sm font-semibold text-ink">
						AI extraction + canonical data (JSON)
					</summary>
					<JsonBlock
						value={{ extraction: report.extraction, canonical: report.canonical }}
						className="mt-4"
					/>
				</details>
			)}

			<ReasonDialog
				open={granting}
				onClose={() => setGranting(false)}
				loading={grant.isPending}
				title="Grant more deposit codes?"
				description="Gives the finder another set of deposit codes so they can still put the item in a locker."
				confirmLabel="Grant codes"
				onConfirm={(reason) =>
					grant.mutate({
						path: `/admin/reports/${report.id}/grant-generations`,
						body: { reason },
					})
				}
			/>
		</>
	);
}

// ─────────────────────────────────────────────────────────────
//  Overflow desk
// ─────────────────────────────────────────────────────────────

export function AdminOverflow() {
	usePageTitle('Overflow desk');

	const overflow = useAdmin('/admin/overflow');
	const [resolving, setResolving] = useState(null);

	const resolve = useAdminAction({
		success: 'Marked as resolved',
		onDone: () => setResolving(null),
	});

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="Overflow desk"
				description="Found items that do not fit a locker (or could not be stored) and are handed to the admin desk."
			/>

			{overflow.isError ? (
				<ErrorState error={overflow.error} onRetry={overflow.refetch} />
			) : (
				<Table head={['Item', 'Finder', 'Found', 'Note', 'Status', '']}>
					{overflow.isPending ? (
						<SkeletonRows columns={6} />
					) : overflow.data.overflow.length === 0 ? (
						<EmptyRow columns={6} text="The desk is empty." />
					) : (
						overflow.data.overflow.map((row) => (
							<tr key={row.id}>
								<Cell>
									<Link
										to={`/admin/reports/${row.report_id}`}
										className="font-medium text-ink hover:text-brand"
									>
										{row.category ?? 'Item'}
									</Link>
									<p className="font-mono text-xs text-subtle">
										{row.report_id.slice(0, 8)}
									</p>
								</Cell>
								<Cell>
									<p className="text-ink">{row.full_name}</p>
									<p className="font-mono text-xs text-subtle">
										{row.student_id}
									</p>
								</Cell>
								<Cell className="text-muted">
									{formatDay(row.occurred_on)}
									<p className="text-xs text-subtle">{row.zone ?? '—'}</p>
								</Cell>
								<Cell className="max-w-xs text-muted">
									{row.resolution_note ?? row.note ?? '—'}
								</Cell>
								<Cell>
									{row.status === 'open' ? (
										<Badge tone="warn" dot pulse icon={Warehouse}>
											Open
										</Badge>
									) : (
										<Badge tone="ok" icon={CheckCircle2}>
											Resolved {timeAgo(row.resolved_at)}
										</Badge>
									)}
								</Cell>
								<Cell className="text-right">
									{row.status === 'open' && (
										<Button
											size="sm"
											variant="outline"
											onClick={() => setResolving(row)}
										>
											Resolve
										</Button>
									)}
								</Cell>
							</tr>
						))
					)}
				</Table>
			)}

			<ReasonDialog
				open={Boolean(resolving)}
				onClose={() => setResolving(null)}
				loading={resolve.isPending}
				title="Resolve this overflow item?"
				description="Use this once the item is stored at the desk or returned."
				confirmLabel="Resolve"
				onConfirm={(reason) =>
					resolve.mutate({
						path: `/admin/overflow/${resolving.id}/resolve`,
						body: { reason },
					})
				}
			/>
		</>
	);
}
