/**
 * Small pieces shared by the admin pages.
 *
 *     const action = useAdminAction({ success: 'Locker opened' });
 *     action.mutate({ path: '/admin/lockers/2/force-open', body: { reason } });
 *
 *     <StatCard icon={Lock} label="Stored items" value={12} tone="ok" />
 *     <JsonBlock value={breakdown} />
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { motion } from 'motion/react';
import { toast } from 'sonner';

import { AnimatedNumber, TiltCard } from '../../components/ui/Layout.jsx';
import { api } from '../../lib/api.js';

/**
 * POST / PUT / PATCH / DELETE for admin decisions. Refreshes every admin query
 * (and the public locker grid) afterwards, so all tables show the new state.
 */
export function useAdminAction({ success, method = 'post', onDone } = {}) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ path, body, method: override }) => api[override ?? method](path, body),
		onSuccess: (result, variables) => {
			queryClient.invalidateQueries({ queryKey: ['admin'] });
			queryClient.invalidateQueries({ queryKey: ['meta'] });

			const message = typeof success === 'function' ? success(result, variables) : success;

			if (message) {
				toast.success(message);
			}

			onDone?.(result, variables);
		},
		onError: (error) => toast.error(error.message),
	});
}

const TONES = {
	brand: 'from-brand/20 text-brand',
	accent: 'from-accent/20 text-accent',
	ok: 'from-ok/20 text-ok',
	warn: 'from-warn/20 text-warn',
	bad: 'from-bad/20 text-bad',
	info: 'from-info/20 text-info',
	neutral: 'from-surface-3 text-muted',
};

/** Number tile with a 3D tilt and a count-up. */
export function StatCard({
	icon: Icon,
	label,
	value,
	tone = 'brand',
	hint,
	index = 0,
	to,
	onClick,
}) {
	const Component = onClick ? 'button' : 'div';

	return (
		<motion.div
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: index * 0.05 }}
		>
			<TiltCard className="h-full rounded-2xl" max={8}>
				<Component
					type={onClick ? 'button' : undefined}
					onClick={onClick}
					className={clsx(
						'relative flex h-full w-full flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-5 text-left shadow-card',
						onClick && 'transition-colors hover:border-brand/40',
					)}
				>
					<div
						aria-hidden
						className={clsx(
							'absolute -right-8 -top-8 size-28 rounded-full bg-gradient-to-br to-transparent blur-2xl',
							TONES[tone],
						)}
					/>
					<span
						className={clsx(
							'relative grid size-10 place-items-center rounded-xl bg-gradient-to-br to-transparent [transform:translateZ(30px)]',
							TONES[tone],
						)}
					>
						{Icon && <Icon className="size-5" aria-hidden />}
					</span>
					<div className="relative [transform:translateZ(20px)]">
						<p className="text-3xl font-extrabold tracking-tight text-ink">
							<AnimatedNumber value={Number(value ?? 0)} />
						</p>
						<p className="mt-0.5 text-sm text-muted">{label}</p>
						{hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
					</div>
				</Component>
			</TiltCard>
		</motion.div>
	);
}

/** Pretty JSON for technical details (breakdowns, raw events). */
export function JsonBlock({ value, className }) {
	return (
		<pre
			className={clsx(
				'max-h-96 overflow-auto rounded-xl border border-line bg-surface-2/60 p-4 font-mono text-xs leading-relaxed text-muted',
				className,
			)}
		>
			{JSON.stringify(value, null, '\t')}
		</pre>
	);
}

/** Toolbar row above a table (filters on the left, actions on the right). */
export function Toolbar({ children, actions }) {
	return (
		<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
			{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
		</div>
	);
}

/** Table cell helpers */
export function Cell({ children, className, mono }) {
	return (
		<td className={clsx('px-4 py-3 align-middle', mono && 'font-mono text-xs', className)}>
			{children}
		</td>
	);
}

export function EmptyRow({ columns, text = 'Nothing here.' }) {
	return (
		<tr>
			<td colSpan={columns} className="px-4 py-10 text-center text-sm text-subtle">
				{text}
			</td>
		</tr>
	);
}

/** Small "page" state in the URL-less admin tables. */
export const PAGE_SIZE = 25;
