/**
 * /matches/:id — the owner's view of a match.
 *
 *   - how strong the match is (band) and which details agree / differ
 *     (only flags — never the finder's actual answers)
 *   - how long the item is held for them
 *   - the collection code: valid 5 minutes, so it is generated AT the locker
 *
 * The finder sees only that the item was matched (handled on the report page).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
	ArrowLeft,
	Check,
	CircleDashed,
	Hourglass,
	KeyRound,
	PartyPopper,
	ShieldQuestion,
	TriangleAlert,
	X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { LockerScene } from '../../components/LockerScene.jsx';
import { OtpDisplay } from '../../components/OtpDisplay.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import {
	Callout,
	EmptyState,
	ErrorState,
	PageLoader,
	Skeleton,
} from '../../components/ui/Feedback.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { api, ApiError } from '../../lib/api.js';
import { formatCountdown, formatDateTime, humanize } from '../../lib/format.js';
import { useCountdown, usePageTitle } from '../../lib/hooks.js';
import { keys, useMatch, useMatchOtp, usePublicLockers, useRules } from '../../lib/queries.js';
import { BAND, FLAG, matchStatus } from '../../lib/statuses.js';

const FLAG_ICON = { agree: Check, conflict: X, missing: CircleDashed };

const FLAG_STYLE = {
	agree: 'bg-ok/12 text-ok',
	conflict: 'bg-bad/12 text-bad',
	missing: 'bg-surface-3 text-subtle',
};

function pollFor(match) {
	if (!match) return false;
	if (match.status === 'otp_issued') return 5_000;
	if (['review', 'auto_matched', 'approved'].includes(match.status)) return 20_000;

	return false;
}

// ─────────────────────────────────────────────────────────────
//  Pieces
// ─────────────────────────────────────────────────────────────

function FlagRow({ label, flag, index }) {
	const Icon = FLAG_ICON[flag] ?? CircleDashed;

	return (
		<motion.li
			initial={{ opacity: 0, x: -10 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{ delay: index * 0.04 }}
			className="flex items-center justify-between gap-3 py-2.5"
		>
			<span className="text-sm text-ink">{label}</span>
			<span
				className={clsx(
					'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold',
					FLAG_STYLE[flag],
				)}
			>
				<Icon className="size-3.5" strokeWidth={3} aria-hidden />
				{FLAG[flag]?.label ?? flag}
			</span>
		</motion.li>
	);
}

function BandMeter({ band }) {
	const level = { low: 1, medium: 2, high: 3 }[band] ?? 0;

	return (
		<div className="flex items-end gap-1.5" aria-label={BAND[band]?.label}>
			{[1, 2, 3].map((bar) => (
				<motion.span
					key={bar}
					initial={{ scaleY: 0 }}
					animate={{ scaleY: 1 }}
					transition={{
						delay: 0.2 + bar * 0.12,
						type: 'spring',
						stiffness: 260,
						damping: 16,
					}}
					className={clsx(
						'w-3 origin-bottom rounded-md',
						bar <= level ? 'bg-gradient-brand' : 'bg-surface-3',
						bar === 1 ? 'h-4' : bar === 2 ? 'h-7' : 'h-10',
					)}
				/>
			))}
		</div>
	);
}

function HoldTimer({ expiresAt }) {
	const secondsLeft = useCountdown(expiresAt);

	if (!expiresAt) {
		return null;
	}

	const hours = Math.floor(secondsLeft / 3600);

	return (
		<div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/40 p-4">
			<Hourglass className="size-5 shrink-0 text-warn" aria-hidden />
			<div>
				<p className="text-sm font-semibold text-ink">
					Held for you for{' '}
					{hours >= 1
						? `${hours} more hour${hours === 1 ? '' : 's'}`
						: formatCountdown(secondsLeft)}
				</p>
				<p className="text-xs text-muted">
					Until {formatDateTime(expiresAt)}. After that the item goes back to the pool.
				</p>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  Collect panel
// ─────────────────────────────────────────────────────────────

function CollectPanel({ match }) {
	const queryClient = useQueryClient();
	const { data: rules } = useRules();
	const { data: lockers = [] } = usePublicLockers({ live: true });

	const otp = useMatchOtp(match.id, {
		enabled: ['otp_issued', 'auto_matched', 'approved'].includes(match.status),
	});
	const [confirm, setConfirm] = useState(false);

	const minutes = rules?.collectOtpMinutes ?? 5;
	const left = Math.max(0, (match.collectGenerationLimit ?? 5) - (match.collectGenerations ?? 0));

	const issue = useMutation({
		mutationFn: () => api.post(`/matches/${match.id}/collect-otp`),
		onSuccess: (result) => {
			setConfirm(false);
			queryClient.setQueryData(keys.matchOtp(match.id), {
				code: result.code,
				action: 'collect',
				expiresAt: result.expiresAt,
				lockerLabel: result.lockerLabel,
				generation: result.generation,
			});
			queryClient.invalidateQueries({ queryKey: keys.match(match.id) });
			toast.success(`Go to locker ${result.lockerLabel}`);
		},
		onError: (error) => {
			setConfirm(false);
			toast.error(error.message);
		},
	});

	const code = otp.data;

	return (
		<Card title="Collect your item" icon={KeyRound} description={`Codes left: ${left}`}>
			<div className="grid gap-6">
				<div className="flex min-w-0 flex-col justify-center">
					{otp.isPending && otp.fetchStatus !== 'idle' ? (
						<Skeleton className="mx-auto size-56 rounded-full" />
					) : code ? (
						<div className="space-y-4">
							<OtpDisplay
								code={code.code}
								expiresAt={code.expiresAt}
								totalSeconds={minutes * 60}
								lockerLabel={code.lockerLabel}
								action="collect"
								generation={code.generation}
								generationLimit={match.collectGenerationLimit}
								onExpired={() => {
									queryClient.invalidateQueries({
										queryKey: keys.matchOtp(match.id),
									});
									queryClient.invalidateQueries({
										queryKey: keys.match(match.id),
									});
								}}
							/>
							{match.canGetOtp && (
								<Button
									variant="ghost"
									size="sm"
									className="mx-auto flex"
									onClick={() => setConfirm(true)}
								>
									Get a new code
								</Button>
							)}
						</div>
					) : match.canGetOtp ? (
						<div className="flex flex-col items-center gap-5 text-center">
							<motion.span
								animate={{ y: [0, -6, 0] }}
								transition={{ duration: 2, repeat: Infinity }}
								className="grid size-20 place-items-center rounded-3xl bg-gradient-brand text-white shadow-[0_14px_40px_-12px_var(--glow)]"
							>
								<KeyRound className="size-9" aria-hidden />
							</motion.span>
							<Callout tone="warn" icon={TriangleAlert} className="text-left">
								{match.otpWarning}
							</Callout>
							<Button size="lg" icon={KeyRound} onClick={() => setConfirm(true)}>
								I am at the locker — get my code
							</Button>
						</div>
					) : (
						<Callout tone="warn" icon={TriangleAlert} title="No codes left">
							Please visit the admin desk with your student ID to collect the item.
						</Callout>
					)}
				</div>

				<LockerScene
					lockers={lockers}
					highlight={code?.lockerLabel}
					className="h-64 border-t border-line pt-6 sm:h-72"
					kioskMessage={code ? [`LOCKER ${code.lockerLabel}`, 'ENTER CODE'] : undefined}
				/>
			</div>

			<ConfirmDialog
				open={confirm}
				onClose={() => setConfirm(false)}
				onConfirm={() => issue.mutate()}
				loading={issue.isPending}
				variant="primary"
				title="Are you at the locker?"
				description={`The code works for only ${minutes} minutes. ${left} code${left === 1 ? '' : 's'} left.`}
				confirmLabel="Yes, show my code"
			/>
		</Card>
	);
}

// ─────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────

export function MatchPage() {
	usePageTitle('Match');

	const { id } = useParams();
	const navigate = useNavigate();
	const match = useMatch(id, { poll: pollFor });

	if (match.isPending) {
		return <PageLoader label="Loading match…" />;
	}

	if (match.isError) {
		if (match.error instanceof ApiError && [403, 404].includes(match.error.status)) {
			return (
				<EmptyState
					icon={ShieldQuestion}
					title="Match not found"
					description="It may have expired or been replaced by a better one."
					action={
						<Button as={Link} to="/dashboard" icon={ArrowLeft}>
							My reports
						</Button>
					}
				/>
			);
		}

		return <ErrorState error={match.error} onRetry={match.refetch} />;
	}

	const data = match.data;
	const status = matchStatus(data.status);
	const band = BAND[data.band];
	const isOwnerView = Array.isArray(data.fields);
	const live = ['auto_matched', 'approved', 'otp_issued'].includes(data.status);

	return (
		<div className="mx-auto max-w-5xl">
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
				eyebrow="Match"
				title={
					data.status === 'collected'
						? 'Collected — welcome back!'
						: (band?.label ?? 'Possible match')
				}
				actions={
					<Badge tone={status.tone} dot pulse={live}>
						{status.label}
					</Badge>
				}
			/>

			{data.status === 'collected' && (
				<Callout tone="ok" icon={PartyPopper} title="All done" className="mb-6">
					You collected the item. Thanks for using SmartFind!
				</Callout>
			)}

			{data.status === 'review' && (
				<Callout
					tone="info"
					icon={ShieldQuestion}
					title="An admin is checking this match"
					className="mb-6"
				>
					{data.reviewNote ?? 'You will be notified as soon as it is approved.'}
				</Callout>
			)}

			{['rejected', 'expired', 'superseded'].includes(data.status) && (
				<Callout tone="warn" icon={TriangleAlert} title={status.label} className="mb-6">
					This match is no longer active. Your report stays open and we keep looking.
				</Callout>
			)}

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="space-y-6 lg:col-span-2">
					{isOwnerView && live && <CollectPanel match={data} />}

					{isOwnerView && (
						<Card
							title="How it compares with your description"
							description="Only matches / differs is shown — never the finder’s own answers."
						>
							<ul className="divide-y divide-line">
								{data.fields.map((field, index) => (
									<FlagRow
										key={field.key}
										label={field.question}
										flag={field.flag}
										index={index}
									/>
								))}
								{data.followups.map((followup, index) => (
									<FlagRow
										key={followup.aspect}
										label={`Follow-up: ${humanize(followup.aspect)}`}
										flag={followup.flag}
										index={data.fields.length + index}
									/>
								))}
							</ul>
						</Card>
					)}
				</div>

				<div className="space-y-6">
					<Card>
						<div className="flex items-center justify-between gap-4">
							<div>
								<p className="text-xs font-semibold uppercase tracking-wide text-subtle">
									Match strength
								</p>
								<p className="mt-1 text-lg font-bold text-ink">
									{band?.label ?? '—'}
								</p>
								<p className="mt-0.5 text-xs text-muted">
									Found {formatDateTime(data.createdAt)}
								</p>
							</div>
							<BandMeter band={data.band} />
						</div>
					</Card>

					{isOwnerView && live && <HoldTimer expiresAt={data.holdExpiresAt} />}
				</div>
			</div>
		</div>
	);
}
