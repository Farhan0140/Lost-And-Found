/**
 * Locker view: the 3D cabinet when WebGL works, a 2D grid otherwise.
 *
 *     <LockerScene lockers={lockers} highlight="L1" className="h-80" />
 *     <LockerGrid lockers={lockers} />        the 2D grid alone (also the a11y view)
 *     <LockerLegend />
 *
 * three.js (~700 KB) is loaded only when a page actually shows the 3D view.
 */

import clsx from 'clsx';
import { Lock, LockOpen, WifiOff } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Component, lazy, Suspense, useMemo } from 'react';

import { lockerStatus, LOCKER_STATUS } from '../lib/statuses.js';
import { useTheme } from '../lib/theme.js';
import { Skeleton } from './ui/Feedback.jsx';

const LockerCabinet3D = lazy(() => import('./three/LockerCabinet3D.jsx'));

function hasWebGL() {
	try {
		const canvas = document.createElement('canvas');

		return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
	} catch {
		return false;
	}
}

/** If the 3D view crashes (old GPU driver, lost context), show the 2D grid instead. */
class SceneBoundary extends Component {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch(error) {
		console.warn('3D locker view failed, showing the 2D grid instead:', error);
	}

	render() {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}

export function LockerScene({
	lockers = [],
	highlight,
	demo,
	interactive = true,
	sparkles,
	onSelect,
	className,
	kioskMessage,
}) {
	const { dark } = useTheme();
	const reduceMotion = useReducedMotion();

	const webgl = useMemo(hasWebGL, []);

	const fallback = (
		<div className={clsx('grid place-items-center', className)}>
			<LockerGrid
				lockers={lockers}
				highlight={highlight}
				onSelect={onSelect}
				className="w-full max-w-sm"
			/>
		</div>
	);

	if (!webgl) {
		return fallback;
	}

	return (
		<div className={clsx('relative', className)}>
			<SceneBoundary fallback={fallback}>
				<Suspense
					fallback={
						<div className="grid size-full place-items-center">
							<div className="grid w-56 grid-cols-2 gap-2">
								{[0, 1, 2, 3].map((index) => (
									<Skeleton key={index} className="aspect-[5/4] rounded-xl" />
								))}
							</div>
						</div>
					}
				>
					<LockerCabinet3D
						lockers={lockers}
						dark={dark}
						highlight={highlight}
						demo={demo}
						interactive={interactive}
						sparkles={sparkles}
						onSelect={onSelect}
						reduceMotion={Boolean(reduceMotion)}
						kioskMessage={kioskMessage}
					/>
				</Suspense>
			</SceneBoundary>

			{/* screen readers get the same information as text */}
			<ul className="sr-only">
				{lockers.map((locker) => (
					<li key={locker.label}>
						Locker {locker.label}: {lockerStatus(locker.status, locker.online).label}
					</li>
				))}
			</ul>
		</div>
	);
}

/** 2D locker grid (used as fallback and in compact places). */
export function LockerGrid({ lockers = [], highlight, onSelect, className }) {
	const columns = lockers.length <= 4 ? 2 : 4;

	return (
		<div
			className={clsx('grid gap-3', columns === 2 ? 'grid-cols-2' : 'grid-cols-4', className)}
		>
			{lockers.map((locker, index) => {
				const status = lockerStatus(locker.status, locker.online);
				const isHighlight = locker.label === highlight;
				const Icon = !locker.online
					? WifiOff
					: locker.status === 'available'
						? LockOpen
						: Lock;

				return (
					<motion.button
						key={locker.label}
						type="button"
						onClick={() => onSelect?.(locker.label)}
						initial={{ opacity: 0, rotateX: -30, y: 10 }}
						animate={{ opacity: 1, rotateX: 0, y: 0 }}
						transition={{
							delay: index * 0.06,
							type: 'spring',
							stiffness: 260,
							damping: 22,
						}}
						whileHover={{ y: -3 }}
						style={{ transformPerspective: 600 }}
						className={clsx(
							'relative flex aspect-[5/4] flex-col justify-between rounded-2xl border bg-surface p-3 text-left shadow-card',
							isHighlight ? 'border-brand glow' : 'border-line',
						)}
					>
						<span
							className="absolute inset-x-3 top-2 h-1 rounded-full"
							style={{
								background: status.color,
								boxShadow: `0 0 12px ${status.color}`,
							}}
						/>
						<span className="mt-2 flex items-center justify-between">
							<span className="text-lg font-extrabold text-ink">{locker.label}</span>
							<Icon className="size-4 text-subtle" aria-hidden />
						</span>
						<span className="text-xs font-medium text-muted">{status.label}</span>
					</motion.button>
				);
			})}
		</div>
	);
}

export function LockerLegend({
	className,
	statuses = [
		'available',
		'reserved',
		'occupied',
		'needs_emptying',
		'open_unresolved',
		'maintenance',
	],
}) {
	return (
		<ul className={clsx('flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted', className)}>
			{statuses.map((key) => (
				<li key={key} className="flex items-center gap-1.5">
					<span
						className="size-2.5 rounded-full"
						style={{
							background: LOCKER_STATUS[key].color,
							boxShadow: `0 0 8px ${LOCKER_STATUS[key].color}`,
						}}
					/>
					{LOCKER_STATUS[key].label}
				</li>
			))}
		</ul>
	);
}
