/**
 * Live locker view (public): 3D cabinet + per-locker cards, refreshed every 5 s.
 */

import { Boxes, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { LockerGrid, LockerLegend, LockerScene } from '../../components/LockerScene.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { AnimatedNumber, PageHeader } from '../../components/ui/Layout.jsx';
import { usePageTitle } from '../../lib/hooks.js';
import { usePublicLockers } from '../../lib/queries.js';
import { lockerStatus } from '../../lib/statuses.js';

export function LockersPage() {
	usePageTitle('Lockers');

	const { data: lockers, isPending, isError, error, refetch, isFetching } = usePublicLockers();
	const [selected, setSelected] = useState(null);

	const free =
		lockers?.filter((locker) => locker.online && locker.status === 'available').length ?? 0;
	const online = lockers?.some((locker) => locker.online);

	const selectedLocker = lockers?.find((locker) => locker.label === selected);

	return (
		<div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
			<PageHeader
				eyebrow="Live"
				title="Smart lockers"
				description="Drag the cabinet to look around. Click a door to see its state. Updates every few seconds."
				actions={
					<Badge
						tone={online ? 'ok' : 'bad'}
						dot
						pulse={online}
						icon={online ? Wifi : WifiOff}
					>
						{isFetching ? 'Updating…' : online ? 'Kiosk online' : 'Kiosk offline'}
					</Badge>
				}
			/>

			{isError ? (
				<ErrorState error={error} onRetry={refetch} />
			) : isPending ? (
				<div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
					<Skeleton className="h-[420px] rounded-3xl" />
					<Skeleton className="h-[420px] rounded-3xl" />
				</div>
			) : lockers.length === 0 ? (
				<EmptyState
					icon={Boxes}
					title="No lockers yet"
					description="An admin has not registered a kiosk yet."
				/>
			) : (
				<div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
					<Card padded={false} className="relative overflow-hidden">
						<div className="aurora opacity-60" aria-hidden />
						<LockerScene
							lockers={lockers}
							highlight={selected}
							onSelect={(label) =>
								setSelected((current) => (current === label ? null : label))
							}
							className="h-[420px]"
						/>
						<LockerLegend className="relative border-t border-line px-5 py-3" />
					</Card>

					<div className="space-y-4">
						<Card>
							<p className="text-sm text-muted">Free right now</p>
							<p className="mt-1 text-5xl font-extrabold text-ink">
								<AnimatedNumber value={free} />
								<span className="text-2xl text-subtle"> / {lockers.length}</span>
							</p>
							<div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3">
								<motion.div
									className="h-full rounded-full bg-gradient-brand"
									initial={{ width: 0 }}
									animate={{ width: `${(free / lockers.length) * 100}%` }}
									transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
								/>
							</div>
						</Card>

						<Card
							title={
								selectedLocker ? `Locker ${selectedLocker.label}` : 'All lockers'
							}
						>
							{selectedLocker ? (
								<div className="space-y-2">
									<Badge
										tone={
											lockerStatus(
												selectedLocker.status,
												selectedLocker.online,
											).tone
										}
										dot
									>
										{
											lockerStatus(
												selectedLocker.status,
												selectedLocker.online,
											).label
										}
									</Badge>
									<p className="text-sm text-muted">
										Slot {selectedLocker.slot} on the kiosk. Contents are
										private — only the finder and the matched owner can see
										which item is inside.
									</p>
								</div>
							) : (
								<LockerGrid
									lockers={lockers}
									highlight={selected}
									onSelect={setSelected}
								/>
							)}
						</Card>

						<button
							type="button"
							onClick={() => refetch()}
							className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
						>
							<RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />{' '}
							Refresh now
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
