/**
 * Surfaces.
 *
 *     <Card>…</Card>                       plain surface with border + shadow
 *     <Card interactive>…</Card>           lifts and glows on hover
 *     <Card title="Lockers" action={…}>    with a header row
 */

import clsx from 'clsx';
import { motion } from 'motion/react';

export function Card({
	title,
	description,
	icon: Icon,
	action,
	interactive = false,
	padded = true,
	className,
	children,
	...props
}) {
	return (
		<motion.div
			whileHover={interactive ? { y: -3 } : undefined}
			transition={{ type: 'spring', stiffness: 320, damping: 24 }}
			className={clsx(
				'relative rounded-2xl border border-line bg-surface shadow-card',
				interactive &&
					'cursor-pointer transition-[border-color,box-shadow] duration-300 hover:border-brand/50 hover:shadow-[0_16px_40px_-18px_var(--glow)]',
				className,
			)}
			{...props}
		>
			{(title || action) && (
				<div
					className={clsx(
						'flex items-start justify-between gap-4',
						padded ? 'px-5 pt-5' : 'px-5 py-4',
						!padded && 'border-b border-line',
					)}
				>
					<div className="flex min-w-0 items-start gap-3">
						{Icon && (
							<span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
								<Icon className="size-[18px]" aria-hidden />
							</span>
						)}

						<div className="min-w-0">
							{title && <h3 className="truncate font-semibold text-ink">{title}</h3>}
							{description && (
								<p className="mt-0.5 text-sm text-muted">{description}</p>
							)}
						</div>
					</div>

					{action && <div className="shrink-0">{action}</div>}
				</div>
			)}

			<div className={clsx(padded && 'p-5', padded && (title || action) && 'pt-4')}>
				{children}
			</div>
		</motion.div>
	);
}

/** Small label + value pair used in detail views. */
export function Detail({ label, children, className }) {
	return (
		<div className={className}>
			<dt className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</dt>
			<dd className="mt-1 text-sm text-ink">{children ?? '—'}</dd>
		</div>
	);
}
