/**
 * Form controls with one consistent look.
 *
 *     <Field label="Student ID" error={errors.studentId} hint="As on your ID card">
 *         <Input value={…} onChange={…} />
 *     </Field>
 *
 *     <ChoiceChip selected={…} onClick={…}>Navy</ChoiceChip>
 */

import clsx from 'clsx';
import { Check, Eye, EyeOff, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { forwardRef, useId, useState, cloneElement, isValidElement } from 'react';

const CONTROL =
	'w-full rounded-xl border border-line bg-surface-2/60 px-3.5 text-sm text-ink placeholder:text-subtle ' +
	'transition-[border-color,box-shadow,background] duration-200 ' +
	'hover:border-line-strong focus:border-brand focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand/15 ' +
	'disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-bad aria-[invalid=true]:ring-bad/15';

/** Label + control + hint / error. Passes id + aria-* to its single child. */
export function Field({ label, hint, error, required, className, children, action }) {
	const id = useId();
	const messageId = `${id}-message`;

	const child = isValidElement(children)
		? cloneElement(children, {
				id: children.props.id ?? id,
				'aria-invalid': error ? true : undefined,
				'aria-describedby': hint || error ? messageId : undefined,
			})
		: children;

	return (
		<div className={clsx('space-y-1.5', className)}>
			{(label || action) && (
				<div className="flex items-center justify-between gap-2">
					{label && (
						<label
							htmlFor={children?.props?.id ?? id}
							className="text-sm font-medium text-ink"
						>
							{label}
							{required && <span className="ml-0.5 text-bad">*</span>}
						</label>
					)}
					{action}
				</div>
			)}

			{child}

			{(error || hint) && (
				<motion.p
					id={messageId}
					initial={error ? { opacity: 0, y: -4 } : false}
					animate={{ opacity: 1, y: 0 }}
					className={clsx('text-xs', error ? 'text-bad' : 'text-subtle')}
				>
					{error || hint}
				</motion.p>
			)}
		</div>
	);
}

export const Input = forwardRef(function Input({ className, icon: Icon, ...props }, ref) {
	if (!Icon) {
		return <input ref={ref} className={clsx(CONTROL, 'h-11', className)} {...props} />;
	}

	return (
		<div className="relative">
			<Icon
				className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
				aria-hidden
			/>
			<input ref={ref} className={clsx(CONTROL, 'h-11 pl-10', className)} {...props} />
		</div>
	);
});

export const PasswordInput = forwardRef(function PasswordInput({ className, ...props }, ref) {
	const [visible, setVisible] = useState(false);

	return (
		<div className="relative">
			<input
				ref={ref}
				type={visible ? 'text' : 'password'}
				className={clsx(CONTROL, 'h-11 pr-11', className)}
				{...props}
			/>
			<button
				type="button"
				onClick={() => setVisible((value) => !value)}
				className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:bg-surface-3 hover:text-ink"
				aria-label={visible ? 'Hide password' : 'Show password'}
			>
				{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
			</button>
		</div>
	);
});

export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...props }, ref) {
	return (
		<textarea
			ref={ref}
			rows={rows}
			className={clsx(CONTROL, 'resize-y py-2.5', className)}
			{...props}
		/>
	);
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
	return (
		<select
			ref={ref}
			className={clsx(CONTROL, 'h-11 cursor-pointer pr-8', className)}
			{...props}
		>
			{children}
		</select>
	);
});

export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
	return (
		<Input
			icon={Search}
			type="search"
			value={value}
			onChange={(event) => onChange(event.target.value)}
			placeholder={placeholder}
			className={className}
		/>
	);
}

/** Accessible on/off switch. */
export function Switch({ checked, onChange, label, disabled }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={clsx(
				'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-50',
				checked ? 'border-brand bg-brand' : 'border-line-strong bg-surface-3',
			)}
		>
			<motion.span
				layout
				transition={{ type: 'spring', stiffness: 600, damping: 32 }}
				className={clsx(
					'size-4.5 rounded-full bg-white shadow',
					checked ? 'ml-[22px]' : 'ml-[3px]',
				)}
			/>
		</button>
	);
}

/**
 * Selectable chip for answer options (single or multi select).
 * `aiSuggested` shows a small sparkle — the AI pre-filled this choice.
 */
export function ChoiceChip({ selected, onClick, children, disabled, aiSuggested, className }) {
	return (
		<motion.button
			type="button"
			role="checkbox"
			aria-checked={selected}
			disabled={disabled}
			onClick={onClick}
			whileTap={{ scale: 0.95 }}
			whileHover={{ y: -1 }}
			className={clsx(
				'relative inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors duration-200',
				selected
					? 'border-brand bg-brand/12 text-ink shadow-[0_6px_20px_-12px_var(--glow)]'
					: 'border-line bg-surface-2/50 text-muted hover:border-line-strong hover:text-ink',
				disabled && 'pointer-events-none opacity-50',
				className,
			)}
		>
			<span
				className={clsx(
					'grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors',
					selected ? 'border-brand bg-brand text-white' : 'border-line-strong',
				)}
			>
				{selected && (
					<motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
						<Check className="size-3" strokeWidth={3} />
					</motion.span>
				)}
			</span>

			{children}

			{aiSuggested && (
				<span className="ml-0.5 rounded-md bg-accent/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-accent">
					AI
				</span>
			)}
		</motion.button>
	);
}
