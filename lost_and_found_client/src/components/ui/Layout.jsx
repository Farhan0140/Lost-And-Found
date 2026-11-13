/**
 * Page-level building blocks.
 *
 *     <PageHeader title="My reports" description="…" actions={<Button…/>} />
 *     <Tabs value={tab} onChange={setTab} items={[{ value: 'active', label: 'Active', count: 3 }]} />
 *     <TiltCard>…</TiltCard>         3D tilt that follows the pointer
 *     <AnimatedNumber value={42} />  counts up when it appears
 *     <Pagination page={1} pageSize={25} total={80} onChange={setPage} />
 *     <Table head={['Name', 'Status']}>…rows…</Table>
 *     <CopyButton value="sfd_…" />
 */

import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import {
	animate,
	motion,
	useInView,
	useMotionTemplate,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from './Button.jsx';

// ─────────────────────────────────────────────────────────────
//  Page header
// ─────────────────────────────────────────────────────────────

export function PageHeader({ title, description, eyebrow, actions, back }) {
	return (
		<motion.header
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.35 }}
			className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
		>
			<div className="min-w-0">
				{back}
				{eyebrow && (
					<p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-brand">
						{eyebrow}
					</p>
				)}
				<h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
					{title}
				</h1>
				{description && (
					<p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>
				)}
			</div>

			{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
		</motion.header>
	);
}

// ─────────────────────────────────────────────────────────────
//  Tabs with a sliding indicator
// ─────────────────────────────────────────────────────────────

export function Tabs({ items, value, onChange, className, id = 'tabs' }) {
	return (
		<div
			role="tablist"
			className={clsx(
				'inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1',
				className,
			)}
		>
			{items.map((item) => {
				const active = item.value === value;

				return (
					<button
						key={item.value}
						role="tab"
						type="button"
						aria-selected={active}
						onClick={() => onChange(item.value)}
						className={clsx(
							'relative flex h-9 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors',
							active ? 'text-brand-ink' : 'text-muted hover:text-ink',
						)}
					>
						{active && (
							<motion.span
								layoutId={`${id}-indicator`}
								className="absolute inset-0 rounded-xl bg-gradient-brand shadow-[0_6px_20px_-10px_var(--glow)]"
								transition={{ type: 'spring', stiffness: 420, damping: 34 }}
							/>
						)}

						<span className="relative">{item.label}</span>

						{item.count !== undefined && item.count !== null && (
							<span
								className={clsx(
									'relative rounded-md px-1.5 text-xs',
									active ? 'bg-white/20' : 'bg-surface-2',
								)}
							>
								{item.count}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  3D tilt card (follows the pointer, with a moving shine)
// ─────────────────────────────────────────────────────────────

export function TiltCard({ children, className, max = 10, glare = true, ...props }) {
	const reduceMotion = useReducedMotion();

	const x = useMotionValue(0.5);
	const y = useMotionValue(0.5);

	const springX = useSpring(x, { stiffness: 200, damping: 20 });
	const springY = useSpring(y, { stiffness: 200, damping: 20 });

	const rotateX = useTransform(springY, [0, 1], [max, -max]);
	const rotateY = useTransform(springX, [0, 1], [-max, max]);

	const glareX = useTransform(springX, [0, 1], ['0%', '100%']);
	const glareY = useTransform(springY, [0, 1], ['0%', '100%']);
	const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.18), transparent 55%)`;

	const onMove = (event) => {
		if (reduceMotion) {
			return;
		}

		const rect = event.currentTarget.getBoundingClientRect();

		x.set((event.clientX - rect.left) / rect.width);
		y.set((event.clientY - rect.top) / rect.height);
	};

	const onLeave = () => {
		x.set(0.5);
		y.set(0.5);
	};

	return (
		<div className="[perspective:1000px]">
			<motion.div
				onPointerMove={onMove}
				onPointerLeave={onLeave}
				style={
					reduceMotion ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }
				}
				className={clsx('relative', className)}
				{...props}
			>
				{children}

				{glare && !reduceMotion && (
					<motion.div
						aria-hidden
						className="pointer-events-none absolute inset-0 rounded-[inherit]"
						style={{ background: glareBackground }}
					/>
				)}
			</motion.div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  Number that counts up when it scrolls into view
// ─────────────────────────────────────────────────────────────

export function AnimatedNumber({ value, className, format = (number) => Math.round(number) }) {
	const ref = useRef(null);
	const inView = useInView(ref, { once: true });
	const reduceMotion = useReducedMotion();

	const [display, setDisplay] = useState(0);

	useEffect(() => {
		const target = Number(value) || 0;

		if (!inView) {
			return undefined;
		}

		if (reduceMotion) {
			setDisplay(target);

			return undefined;
		}

		const controls = animate(display, target, {
			duration: 1.1,
			ease: [0.16, 1, 0.3, 1],
			onUpdate: setDisplay,
		});

		return () => controls.stop();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value, inView, reduceMotion]);

	return (
		<span ref={ref} className={clsx('tabular-nums', className)}>
			{format(display)}
		</span>
	);
}

// ─────────────────────────────────────────────────────────────
//  Pagination
// ─────────────────────────────────────────────────────────────

export function Pagination({ page, pageSize, total, onChange }) {
	const pages = Math.max(1, Math.ceil((total ?? 0) / pageSize));

	if (pages <= 1) {
		return null;
	}

	const from = (page - 1) * pageSize + 1;
	const to = Math.min(total, page * pageSize);

	return (
		<div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
			<p className="text-muted">
				{from}–{to} of {total}
			</p>

			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					size="sm"
					icon={ChevronLeft}
					disabled={page <= 1}
					onClick={() => onChange(page - 1)}
					aria-label="Previous page"
				/>
				<span className="px-2 tabular-nums text-muted">
					{page} / {pages}
				</span>
				<Button
					variant="ghost"
					size="sm"
					icon={ChevronRight}
					disabled={page >= pages}
					onClick={() => onChange(page + 1)}
					aria-label="Next page"
				/>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  Table
// ─────────────────────────────────────────────────────────────

export function Table({ head, children, footer, className }) {
	return (
		<div
			className={clsx(
				'overflow-hidden rounded-2xl border border-line bg-surface shadow-card',
				className,
			)}
		>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[640px] text-left text-sm">
					<thead className="border-b border-line bg-surface-2/50 text-xs uppercase tracking-wide text-subtle">
						<tr>
							{head.map((column) => (
								<th key={column} scope="col" className="px-4 py-3 font-semibold">
									{column}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-line [&>tr]:transition-colors [&>tr:hover]:bg-surface-2/40">
						{children}
					</tbody>
				</table>
			</div>
			{footer}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  Copy to clipboard
// ─────────────────────────────────────────────────────────────

export function CopyButton({ value, label = 'Copy', size = 'sm', variant = 'outline' }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			toast.success('Copied');
			setTimeout(() => setCopied(false), 1500);
		} catch {
			toast.error('Could not copy — select the text and copy it by hand.');
		}
	};

	return (
		<Button variant={variant} size={size} icon={copied ? Check : Copy} onClick={copy}>
			{copied ? 'Copied' : label}
		</Button>
	);
}
