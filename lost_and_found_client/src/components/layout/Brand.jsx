/**
 * The SmartFind logo (four lockers in a rounded square) + small shared header bits.
 */

import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router';

import { useTheme } from '../../lib/theme.js';

export function LogoMark({ className }) {
	return (
		<motion.span
			whileHover={{ rotate: -8, scale: 1.06 }}
			transition={{ type: 'spring', stiffness: 400, damping: 15 }}
			className={clsx(
				'grid size-9 grid-cols-2 gap-[3px] rounded-xl bg-gradient-brand p-[7px] shadow-[0_6px_20px_-6px_var(--glow)]',
				className,
			)}
			aria-hidden
		>
			<span className="rounded-[3px] bg-white/95" />
			<span className="rounded-[3px] bg-white/50" />
			<span className="rounded-[3px] bg-white/50" />
			<span className="rounded-[3px] bg-white/95" />
		</motion.span>
	);
}

export function Logo({ to = '/', className }) {
	return (
		<Link
			to={to}
			className={clsx('flex items-center gap-2.5', className)}
			aria-label="SmartFind home"
		>
			<LogoMark />
			<span className="text-lg font-extrabold tracking-tight text-ink">
				Smart<span className="text-gradient">Find</span>
			</span>
		</Link>
	);
}

export function ThemeToggle() {
	const { dark, toggle } = useTheme();

	return (
		<button
			type="button"
			onClick={toggle}
			className="relative grid size-10 place-items-center overflow-hidden rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink"
			aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
		>
			<AnimatePresence mode="wait" initial={false}>
				<motion.span
					key={dark ? 'moon' : 'sun'}
					initial={{ y: -20, rotate: -90, opacity: 0 }}
					animate={{ y: 0, rotate: 0, opacity: 1 }}
					exit={{ y: 20, rotate: 90, opacity: 0 }}
					transition={{ duration: 0.25 }}
				>
					{dark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
				</motion.span>
			</AnimatePresence>
		</button>
	);
}
