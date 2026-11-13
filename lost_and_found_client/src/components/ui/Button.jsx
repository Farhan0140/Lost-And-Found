/**
 * The one button used everywhere.
 *
 *     <Button onClick={save} loading={saving} icon={Save}>Save</Button>
 *     <Button variant="ghost" size="sm" as={Link} to="/reports">Back</Button>
 *
 * variant: primary (gradient + glow) · secondary · outline · ghost · danger · success
 * size:    sm · md · lg · icon
 */

import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { forwardRef } from 'react';

const VARIANTS = {
	primary:
		'bg-gradient-brand text-brand-ink shadow-[0_8px_30px_-10px_var(--glow)] hover:shadow-[0_12px_40px_-8px_var(--glow)] hover:brightness-110',
	secondary: 'bg-surface-2 text-ink hover:bg-surface-3 border border-line',
	outline: 'border border-line-strong text-ink hover:bg-surface-2 hover:border-brand/60',
	ghost: 'text-muted hover:text-ink hover:bg-surface-2',
	danger: 'bg-bad text-white hover:brightness-110 shadow-[0_8px_24px_-12px_var(--bad)]',
	success: 'bg-ok text-white hover:brightness-110',
};

const SIZES = {
	sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
	md: 'h-10 px-4 text-sm gap-2 rounded-xl',
	lg: 'h-12 px-6 text-base gap-2.5 rounded-2xl',
	icon: 'h-10 w-10 rounded-xl',
};

// motion.create() must not run on every render (it would remount the element), so cache it.
const motionCache = new Map();

function motionFor(Component) {
	if (typeof Component === 'string') {
		return motion[Component];
	}

	if (!motionCache.has(Component)) {
		motionCache.set(Component, motion.create(Component));
	}

	return motionCache.get(Component);
}

export const Button = forwardRef(function Button(
	{
		as: Component = 'button',
		variant = 'primary',
		size = 'md',
		icon: Icon,
		iconRight: IconRight,
		loading = false,
		disabled = false,
		className,
		children,
		type,
		...props
	},
	ref,
) {
	const MotionComponent = motionFor(Component);

	const isDisabled = disabled || loading;

	return (
		<MotionComponent
			ref={ref}
			type={Component === 'button' ? (type ?? 'button') : undefined}
			disabled={Component === 'button' ? isDisabled : undefined}
			aria-disabled={isDisabled || undefined}
			aria-busy={loading || undefined}
			whileTap={isDisabled ? undefined : { scale: 0.97 }}
			className={clsx(
				'group relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold',
				'transition-[background,box-shadow,filter,border-color,color] duration-200',
				VARIANTS[variant],
				SIZES[size],
				isDisabled && 'pointer-events-none opacity-55',
				className,
			)}
			{...props}
		>
			{/* light sweep across the primary button on hover */}
			{variant === 'primary' && (
				<span
					aria-hidden
					className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/25 opacity-0 blur-md transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100"
				/>
			)}

			{loading ? (
				<LoaderCircle className="size-4 animate-spin" aria-hidden />
			) : (
				Icon && <Icon className={clsx(size === 'lg' ? 'size-5' : 'size-4')} aria-hidden />
			)}

			{children && <span className="relative">{children}</span>}

			{IconRight && !loading && (
				<IconRight
					className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
					aria-hidden
				/>
			)}
		</MotionComponent>
	);
});
