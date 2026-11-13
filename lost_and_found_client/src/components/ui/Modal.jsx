/**
 * Dialogs.
 *
 *     <Modal open={open} onClose={close} title="Create device">…</Modal>
 *
 *     <ReasonDialog open={…} title="Force-open L2?" confirmLabel="Open locker"
 *         onConfirm={(reason) => mutate(reason)} loading={isPending} />
 *
 * Every admin decision needs a reason (≥ 5 characters, stored in the audit log).
 */

import clsx from 'clsx';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './Button.jsx';
import { Field, Textarea } from './Form.jsx';

export function Modal({ open, onClose, title, description, size = 'md', children, footer }) {
	const titleId = useId();
	const panelRef = useRef(null);

	// Kept in a ref so a new onClose function on every render does not re-run the effect.
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	// Escape closes; focus moves into the dialog; the page behind does not scroll.
	useEffect(() => {
		if (!open) {
			return undefined;
		}

		const onKey = (event) => {
			if (event.key === 'Escape') {
				onCloseRef.current?.();
			}
		};

		document.addEventListener('keydown', onKey);

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const previousFocus = document.activeElement;

		setTimeout(() => {
			panelRef.current
				?.querySelector('input, textarea, select, button:not([data-close])')
				?.focus();
		}, 50);

		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = previousOverflow;
			previousFocus?.focus?.();
		};
	}, [open]);

	const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

	return createPortal(
		<AnimatePresence>
			{open && (
				<div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
					<motion.div
						className="absolute inset-0 bg-black/55 backdrop-blur-sm"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
					/>

					<motion.div
						ref={panelRef}
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
						initial={{ opacity: 0, y: 40, scale: 0.96, rotateX: 8 }}
						animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
						exit={{ opacity: 0, y: 24, scale: 0.97 }}
						transition={{ type: 'spring', stiffness: 380, damping: 30 }}
						className={clsx(
							'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl',
							widths[size],
						)}
						style={{ transformPerspective: 900 }}
					>
						<div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
							<div>
								<h2 id={titleId} className="text-lg font-bold text-ink">
									{title}
								</h2>
								{description && (
									<p className="mt-0.5 text-sm text-muted">{description}</p>
								)}
							</div>

							<button
								type="button"
								data-close
								onClick={onClose}
								className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-ink"
								aria-label="Close"
							>
								<X className="size-4" />
							</button>
						</div>

						<div className="overflow-y-auto px-6 py-5">{children}</div>

						{footer && (
							<div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/40 px-6 py-4">
								{footer}
							</div>
						)}
					</motion.div>
				</div>
			)}
		</AnimatePresence>,
		document.body,
	);
}

/** Asks for the reason an admin decision needs (≥ 5 characters). */
export function ReasonDialog({
	open,
	onClose,
	onConfirm,
	title,
	description,
	confirmLabel = 'Confirm',
	variant = 'primary',
	loading = false,
	children,
}) {
	const [reason, setReason] = useState('');
	const [touched, setTouched] = useState(false);

	useEffect(() => {
		if (open) {
			setReason('');
			setTouched(false);
		}
	}, [open]);

	const tooShort = reason.trim().length < 5;

	const submit = (event) => {
		event?.preventDefault();
		setTouched(true);

		if (!tooShort) {
			onConfirm(reason.trim());
		}
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={title}
			description={description}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant={variant} loading={loading} onClick={submit}>
						{confirmLabel}
					</Button>
				</>
			}
		>
			<form onSubmit={submit} className="space-y-4">
				{children}

				<Field
					label="Reason"
					required
					hint="Saved in the audit log with your admin ID."
					error={
						touched && tooShort ? 'Please give a reason (at least 5 characters).' : null
					}
				>
					<Textarea
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						placeholder="Why are you doing this?"
						maxLength={500}
					/>
				</Field>
			</form>
		</Modal>
	);
}

/** Simple yes / no confirmation (no reason needed). */
export function ConfirmDialog({
	open,
	onClose,
	onConfirm,
	title,
	description,
	confirmLabel = 'Confirm',
	variant = 'danger',
	loading,
}) {
	return (
		<Modal
			open={open}
			onClose={onClose}
			title={title}
			size="sm"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant={variant} loading={loading} onClick={onConfirm}>
						{confirmLabel}
					</Button>
				</>
			}
		>
			<p className="text-sm text-muted">{description}</p>
		</Modal>
	);
}
