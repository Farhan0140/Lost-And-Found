/**
 * Coloured status pill.
 *
 *     <Badge tone="ok">Stored</Badge>
 *     <Badge tone="warn" dot pulse>Waiting for AI</Badge>
 */

import clsx from 'clsx';

const TONES = {
	neutral: 'bg-surface-2 text-muted border-line',
	brand: 'bg-brand/12 text-brand border-brand/25',
	accent: 'bg-accent/12 text-accent border-accent/25',
	ok: 'bg-ok/12 text-ok border-ok/25',
	warn: 'bg-warn/12 text-warn border-warn/30',
	bad: 'bg-bad/12 text-bad border-bad/25',
	info: 'bg-info/12 text-info border-info/25',
};

const DOTS = {
	neutral: 'bg-subtle',
	brand: 'bg-brand',
	accent: 'bg-accent',
	ok: 'bg-ok',
	warn: 'bg-warn',
	bad: 'bg-bad',
	info: 'bg-info',
};

export function Badge({
	tone = 'neutral',
	dot = false,
	pulse = false,
	icon: Icon,
	className,
	children,
}) {
	return (
		<span
			className={clsx(
				'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
				TONES[tone] ?? TONES.neutral,
				className,
			)}
		>
			{dot && (
				<span className="relative flex size-1.5">
					{pulse && (
						<span
							className={clsx(
								'absolute inline-flex size-full rounded-full animate-ping-soft',
								DOTS[tone],
							)}
						/>
					)}
					<span
						className={clsx('relative inline-flex size-1.5 rounded-full', DOTS[tone])}
					/>
				</span>
			)}

			{Icon && <Icon className="size-3.5" aria-hidden />}

			{children}
		</span>
	);
}
