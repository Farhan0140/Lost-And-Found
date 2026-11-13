/**
 * Loading + empty + error states.
 *
 *     <Skeleton className="h-6 w-40" />
 *     <SkeletonCards count={3} />
 *     <Spinner />
 *     <EmptyState icon={Inbox} title="No reports yet" action={…} />
 *     <ErrorState error={error} onRetry={refetch} />
 */

import clsx from 'clsx';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

import { errorMessage } from '../../lib/api.js';
import { Button } from './Button.jsx';

export function Skeleton({ className }) {
	return <div aria-hidden className={clsx('skeleton', className)} />;
}

/** Placeholder cards while a list loads. */
export function SkeletonCards({ count = 3, className }) {
	return (
		<div className={clsx('grid gap-4', className)} aria-busy="true" aria-label="Loading">
			{Array.from({ length: count }, (_, index) => (
				<div key={index} className="rounded-2xl border border-line bg-surface p-5">
					<div className="flex items-center gap-3">
						<Skeleton className="size-11 rounded-xl" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-1/3" />
							<Skeleton className="h-3 w-1/2" />
						</div>
						<Skeleton className="h-6 w-24 rounded-full" />
					</div>
				</div>
			))}
		</div>
	);
}

/** Placeholder rows while a table loads. */
export function SkeletonRows({ rows = 6, columns = 5 }) {
	return Array.from({ length: rows }, (_, row) => (
		<tr key={row}>
			{Array.from({ length: columns }, (_, column) => (
				<td key={column} className="px-4 py-3">
					<Skeleton className={clsx('h-4', column === 0 ? 'w-28' : 'w-20')} />
				</td>
			))}
		</tr>
	));
}

/** Three bouncing dots — the small "working" indicator. */
export function Spinner({ className, label = 'Loading' }) {
	return (
		<span
			role="status"
			aria-label={label}
			className={clsx('inline-flex items-center gap-1', className)}
		>
			{[0, 1, 2].map((index) => (
				<motion.span
					key={index}
					className="size-1.5 rounded-full bg-brand"
					animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
					transition={{ duration: 0.8, repeat: Infinity, delay: index * 0.14 }}
				/>
			))}
		</span>
	);
}

/** Full-area loader with the SmartFind mark spinning in 3D. */
export function PageLoader({ label = 'Loading…' }) {
	return (
		<div className="grid min-h-[50vh] place-items-center" role="status" aria-label={label}>
			<div className="flex flex-col items-center gap-5">
				<div className="relative size-16 [perspective:400px]">
					<motion.div
						className="absolute inset-0 grid grid-cols-2 gap-1.5 [transform-style:preserve-3d]"
						animate={{ rotateY: [0, 180, 360], rotateX: [0, 20, 0] }}
						transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
					>
						{[0, 1, 2, 3].map((index) => (
							<motion.span
								key={index}
								className="rounded-md bg-gradient-brand"
								animate={{ opacity: [0.35, 1, 0.35] }}
								transition={{
									duration: 1.1,
									repeat: Infinity,
									delay: index * 0.18,
								}}
							/>
						))}
					</motion.div>
				</div>
				<p className="text-sm text-muted">{label}</p>
			</div>
		</div>
	);
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			className={clsx(
				'flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center',
				className,
			)}
		>
			{Icon && (
				<div className="relative mb-4">
					<div className="absolute inset-0 rounded-2xl bg-brand/20 blur-xl" aria-hidden />
					<span className="relative grid size-14 place-items-center rounded-2xl border border-line bg-surface text-brand animate-float">
						<Icon className="size-6" aria-hidden />
					</span>
				</div>
			)}

			<h3 className="font-semibold text-ink">{title}</h3>

			{description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}

			{action && <div className="mt-5">{action}</div>}
		</motion.div>
	);
}

export function ErrorState({ error, onRetry, className }) {
	return (
		<div
			role="alert"
			className={clsx(
				'flex flex-col items-center rounded-2xl border border-bad/30 bg-bad/5 px-6 py-10 text-center',
				className,
			)}
		>
			<CircleAlert className="size-8 text-bad" aria-hidden />
			<p className="mt-3 font-semibold text-ink">Could not load this</p>
			<p className="mt-1 max-w-md text-sm text-muted">{errorMessage(error)}</p>

			{error?.requestId && (
				<p className="mt-1 font-mono text-xs text-subtle">Request {error.requestId}</p>
			)}

			{onRetry && (
				<Button
					variant="outline"
					size="sm"
					icon={RefreshCw}
					onClick={onRetry}
					className="mt-4"
				>
					Try again
				</Button>
			)}
		</div>
	);
}

/** Inline coloured message box. */
export function Callout({ tone = 'info', icon: Icon, title, children, action, className }) {
	const tones = {
		info: 'border-info/30 bg-info/8 text-info',
		ok: 'border-ok/30 bg-ok/8 text-ok',
		warn: 'border-warn/35 bg-warn/8 text-warn',
		bad: 'border-bad/30 bg-bad/8 text-bad',
		brand: 'border-brand/30 bg-brand/8 text-brand',
	};

	return (
		<div className={clsx('flex gap-3 rounded-2xl border p-4', tones[tone], className)}>
			{Icon && <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />}

			<div className="min-w-0 flex-1">
				{title && <p className="font-semibold">{title}</p>}
				{children && <div className="mt-0.5 text-sm text-ink/80">{children}</div>}
			</div>

			{action && <div className="shrink-0 self-center">{action}</div>}
		</div>
	);
}
