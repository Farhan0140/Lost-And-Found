/**
 * /admin/audit — the append-only, hash-chained audit log.
 *
 * Each entry stores the hash of the previous one, so editing or deleting an old entry
 * breaks the chain. "Verify chain" re-computes every hash on the server and reports
 * the first broken entry, if any.
 */

import clsx from 'clsx';
import { ChevronDown, Link2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Callout, ErrorState, SkeletonRows } from '../../components/ui/Feedback.jsx';
import { Input, Select } from '../../components/ui/Form.jsx';
import { PageHeader, Pagination, Table } from '../../components/ui/Layout.jsx';
import { api } from '../../lib/api.js';
import { formatDateTime, humanize } from '../../lib/format.js';
import { useDebounced, usePageTitle } from '../../lib/hooks.js';
import { useAdmin } from '../../lib/queries.js';
import { JsonBlock, PAGE_SIZE, Toolbar } from './shared.jsx';

const ACTOR_TONE = { admin: 'accent', user: 'brand', device: 'info', system: 'neutral' };

function ChainLink({ hash }) {
	return (
		<span className="font-mono text-[11px] text-subtle">
			{hash ? `${hash.slice(0, 10)}…` : '—'}
		</span>
	);
}

function AuditRow({ entry }) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<tr className="cursor-pointer" onClick={() => setOpen((value) => !value)}>
				<td className="px-4 py-3 font-mono text-xs text-subtle">#{entry.id}</td>
				<td className="px-4 py-3 text-muted">{formatDateTime(entry.at)}</td>
				<td className="px-4 py-3">
					<Badge tone={ACTOR_TONE[entry.actor_type] ?? 'neutral'}>
						{entry.actor_type}
					</Badge>
					{entry.actor_name && (
						<p className="mt-1 text-xs text-subtle">{entry.actor_name}</p>
					)}
				</td>
				<td className="px-4 py-3 font-mono text-xs text-brand">{entry.action}</td>
				<td className="px-4 py-3 text-muted">
					{entry.entity_type}
					{entry.entity_id && (
						<span className="ml-1 font-mono text-xs text-subtle">
							{String(entry.entity_id).slice(0, 12)}
						</span>
					)}
				</td>
				<td className="max-w-xs truncate px-4 py-3 text-muted">{entry.reason ?? '—'}</td>
				<td className="px-4 py-3">
					<ChevronDown
						className={clsx(
							'size-4 text-subtle transition-transform',
							open && 'rotate-180',
						)}
					/>
				</td>
			</tr>

			<AnimatePresence>
				{open && (
					<tr>
						<td colSpan={7} className="bg-surface-2/30 px-4 py-0">
							<motion.div
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: 'auto', opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								className="overflow-hidden"
							>
								<div className="grid gap-4 py-4 md:grid-cols-[1fr_auto]">
									<JsonBlock value={entry.details ?? {}} />
									<div className="space-y-2 text-xs">
										<p className="flex items-center gap-2 text-muted">
											<Link2 className="size-3.5" /> previous{' '}
											<ChainLink hash={entry.prev_hash} />
										</p>
										<p className="flex items-center gap-2 text-muted">
											<ShieldCheck className="size-3.5 text-ok" /> this{' '}
											<ChainLink hash={entry.hash} />
										</p>
									</div>
								</div>
							</motion.div>
						</td>
					</tr>
				)}
			</AnimatePresence>
		</>
	);
}

export function AdminAudit() {
	usePageTitle('Audit log');

	const [page, setPage] = useState(1);
	const [action, setAction] = useState('');
	const [actorType, setActorType] = useState('');
	const [entityId, setEntityId] = useState('');
	const debouncedEntity = useDebounced(entityId, 350);

	const [verifying, setVerifying] = useState(false);
	const [verification, setVerification] = useState(null);

	const actions = useAdmin('/admin/audit/actions', undefined, { staleTime: 60_000 });

	const entries = useAdmin('/admin/audit', {
		action: action || undefined,
		actorType: actorType || undefined,
		entityId: debouncedEntity || undefined,
		page,
		pageSize: PAGE_SIZE,
	});

	const verify = async () => {
		setVerifying(true);

		try {
			setVerification(await api.get('/admin/audit/verify'));
		} catch (error) {
			setVerification({ ok: false, problem: error.message });
		} finally {
			setVerifying(false);
		}
	};

	const filter = (setter) => (event) => {
		setter(event.target.value);
		setPage(1);
	};

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="Audit log"
				description="Every decision and device event, append-only and hash-chained."
				actions={
					<Button icon={ShieldQuestion} loading={verifying} onClick={verify}>
						Verify chain
					</Button>
				}
			/>

			<AnimatePresence>
				{verification && (
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						className="mb-6"
					>
						{verification.ok ? (
							<Callout tone="ok" icon={ShieldCheck} title="Chain intact">
								All {verification.checked} entries match their hashes.
							</Callout>
						) : (
							<Callout tone="bad" icon={ShieldAlert} title="Chain broken">
								{verification.firstBrokenId
									? `Entry #${verification.firstBrokenId}: `
									: ''}
								{verification.problem}
							</Callout>
						)}
					</motion.div>
				)}
			</AnimatePresence>

			<Toolbar>
				<Select
					value={action}
					onChange={filter(setAction)}
					className="w-60"
					aria-label="Action"
				>
					<option value="">All actions</option>
					{(actions.data?.actions ?? []).map((item) => (
						<option key={item} value={item}>
							{item}
						</option>
					))}
				</Select>
				<Select
					value={actorType}
					onChange={filter(setActorType)}
					className="w-40"
					aria-label="Actor"
				>
					<option value="">Any actor</option>
					{['user', 'admin', 'device', 'system'].map((item) => (
						<option key={item} value={item}>
							{humanize(item)}
						</option>
					))}
				</Select>
				<div className="w-full sm:w-64">
					<Input
						value={entityId}
						onChange={filter(setEntityId)}
						placeholder="Entity ID (report, locker…)"
					/>
				</div>
			</Toolbar>

			{entries.isError ? (
				<ErrorState error={entries.error} onRetry={entries.refetch} />
			) : (
				<Table
					head={['#', 'When', 'Actor', 'Action', 'Entity', 'Reason', '']}
					footer={
						entries.data && (
							<Pagination
								page={page}
								pageSize={PAGE_SIZE}
								total={entries.data.total}
								onChange={setPage}
							/>
						)
					}
				>
					{entries.isPending ? (
						<SkeletonRows columns={7} />
					) : entries.data.entries.length === 0 ? (
						<tr>
							<td colSpan={7} className="px-4 py-10 text-center text-sm text-subtle">
								No entries match.
							</td>
						</tr>
					) : (
						entries.data.entries.map((entry) => (
							<AuditRow key={entry.id} entry={entry} />
						))
					)}
				</Table>
			)}
		</>
	);
}
