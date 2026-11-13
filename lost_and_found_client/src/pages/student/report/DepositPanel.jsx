/**
 * Finder: "bring it to a locker".
 *
 *   1. Press "Get my locker code" when you are AT the locker (the code lasts 30 min).
 *   2. Type the code on the kiosk → the door opens → put the item in → close the door.
 *   3. The kiosk reports "stored" and this panel turns into "Safe in locker L3".
 *
 * All lockers busy → the server queues the finder (status awaiting_locker) and sends a
 * notification when one frees up. Each finder has a limited number of codes.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Hourglass, KeyRound, ListOrdered, RefreshCw, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LockerScene } from '../../../components/LockerScene.jsx';
import { OtpDisplay } from '../../../components/OtpDisplay.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { Callout, Skeleton } from '../../../components/ui/Feedback.jsx';
import { ConfirmDialog } from '../../../components/ui/Modal.jsx';
import { api } from '../../../lib/api.js';
import { keys, usePublicLockers, useReportOtp, useRules } from '../../../lib/queries.js';

const HOW_TO = [
	'Walk to the SmartFind lockers.',
	'Type the 6-digit code on the kiosk keypad and press #.',
	'The shown locker opens — put the item inside and close the door.',
];

export function DepositPanel({ report }) {
	const queryClient = useQueryClient();
	const { data: rules } = useRules();
	const { data: lockers = [] } = usePublicLockers({ live: true });

	const hasActiveCode = Boolean(report.activeOtp);
	const otp = useReportOtp(report.id, { enabled: hasActiveCode });

	const [queueInfo, setQueueInfo] = useState(null);
	const [confirmNew, setConfirmNew] = useState(false);

	const deposit = report.deposit ?? {};
	const used = deposit.generations ?? 0;
	const limit = deposit.generationLimit ?? rules?.depositGenerationLimit ?? 5;
	const left = Math.max(0, limit - used);
	const minutes = deposit.otpValidMinutes ?? rules?.depositOtpMinutes ?? 30;

	const issue = useMutation({
		mutationFn: () => api.post(`/reports/${report.id}/deposit-otp`),
		onSuccess: (result) => {
			setConfirmNew(false);

			if (result.queued) {
				setQueueInfo(result);
				toast.info(result.message);
			} else {
				setQueueInfo(null);
				queryClient.setQueryData(keys.reportOtp(report.id), {
					code: result.code,
					action: 'deposit',
					expiresAt: result.expiresAt,
					lockerLabel: result.lockerLabel,
					generation: result.generation,
				});
				toast.success(`Locker ${result.lockerLabel} is reserved for you.`);
			}

			queryClient.invalidateQueries({ queryKey: keys.report(report.id) });
			queryClient.invalidateQueries({ queryKey: keys.publicLockers() });
		},
		onError: (error) => {
			setConfirmNew(false);
			toast.error(error.message);
		},
	});

	const code = hasActiveCode ? otp.data : null;
	const queued = report.status === 'awaiting_locker';

	return (
		<Card
			title="Bring it to a locker"
			icon={DoorOpen}
			description={`Codes left: ${left} of ${limit}`}
		>
			<div className="grid gap-6">
				{/* ── the code / the button ── */}
				<div className="flex min-w-0 flex-col justify-center">
					{hasActiveCode && otp.isPending ? (
						<Skeleton className="mx-auto size-56 rounded-full" />
					) : code ? (
						<div className="space-y-4">
							<OtpDisplay
								code={code.code}
								expiresAt={code.expiresAt}
								totalSeconds={minutes * 60}
								lockerLabel={code.lockerLabel}
								action="deposit"
								generation={code.generation}
								generationLimit={limit}
								onExpired={() => {
									queryClient.invalidateQueries({
										queryKey: keys.report(report.id),
									});
									queryClient.invalidateQueries({
										queryKey: keys.reportOtp(report.id),
									});
								}}
							/>

							{left > 0 && (
								<Button
									variant="ghost"
									size="sm"
									icon={RefreshCw}
									className="mx-auto flex"
									onClick={() => setConfirmNew(true)}
								>
									Get a new code
								</Button>
							)}
						</div>
					) : queued ? (
						<motion.div
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							className="flex flex-col items-center gap-4 text-center"
						>
							<div className="relative grid size-24 place-items-center">
								<span
									className="absolute inset-0 rounded-full bg-warn/20 animate-ping-soft"
									aria-hidden
								/>
								<span className="relative grid size-20 place-items-center rounded-full bg-warn/15 text-warn">
									<Hourglass className="size-9 animate-spin-slow" aria-hidden />
								</span>
							</div>
							<div>
								<p className="font-bold text-ink">All lockers are busy</p>
								<p className="mt-1 text-sm text-muted">
									{queueInfo?.position
										? `You are number ${queueInfo.position} in the queue. `
										: 'You are in the queue. '}
									We send you a notification the moment a locker is free.
								</p>
							</div>
							<Button
								variant="outline"
								icon={ListOrdered}
								loading={issue.isPending}
								onClick={() => issue.mutate()}
								disabled={left === 0}
							>
								Check again
							</Button>
						</motion.div>
					) : left === 0 ? (
						<Callout tone="warn" icon={TriangleAlert} title="All codes used">
							Please hand the item to the admin desk — they will store it for you.
						</Callout>
					) : (
						<div className="flex flex-col items-center gap-5 text-center">
							<motion.span
								animate={{ rotate: [0, -8, 8, 0] }}
								transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5 }}
								className="grid size-20 place-items-center rounded-3xl bg-gradient-brand text-white shadow-[0_14px_40px_-12px_var(--glow)]"
							>
								<KeyRound className="size-9" aria-hidden />
							</motion.span>
							<div>
								<p className="text-lg font-bold text-ink">Ready when you are</p>
								<p className="mt-1 text-sm text-muted">
									The code works for {minutes} minutes — get it when you are near
									the lockers.
								</p>
							</div>
							<Button
								size="lg"
								icon={KeyRound}
								loading={issue.isPending}
								onClick={() => issue.mutate()}
							>
								Get my locker code
							</Button>
						</div>
					)}
				</div>

				{/* ── 3D locker view + how-to ── */}
				<div className="grid min-w-0 items-center gap-5 border-t border-line pt-6 sm:grid-cols-2">
					<LockerScene
						lockers={lockers}
						highlight={code?.lockerLabel}
						className="h-64 sm:h-72"
						kioskMessage={
							code ? [`LOCKER ${code.lockerLabel}`, 'ENTER CODE'] : undefined
						}
					/>

					<ol className="space-y-2">
						{HOW_TO.map((text, index) => (
							<li key={text} className="flex items-start gap-3 text-sm text-muted">
								<span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2 font-mono text-xs font-bold text-brand">
									{index + 1}
								</span>
								{text}
							</li>
						))}
					</ol>
				</div>
			</div>

			<ConfirmDialog
				open={confirmNew}
				onClose={() => setConfirmNew(false)}
				onConfirm={() => issue.mutate()}
				loading={issue.isPending}
				variant="primary"
				title="Get a new code?"
				description={`The current code stops working. You keep the same locker if it is still reserved. ${left} code${left === 1 ? '' : 's'} left.`}
				confirmLabel="New code"
			/>
		</Card>
	);
}
