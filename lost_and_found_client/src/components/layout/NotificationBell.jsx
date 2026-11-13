/**
 * Bell with the unread count (polled every 20 s) and a dropdown of the latest notifications.
 * Clicking one marks it read and opens its link (e.g. /reports/…).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { api } from '../../lib/api.js';
import { timeAgo } from '../../lib/format.js';
import { usePrevious } from '../../lib/hooks.js';
import { keys, useNotifications, useUnreadCount } from '../../lib/queries.js';
import { Spinner } from '../ui/Feedback.jsx';

export function useNotificationActions() {
	const queryClient = useQueryClient();

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: keys.notifications() });
	};

	const markRead = useMutation({
		mutationFn: (id) => api.post(`/notifications/${id}/read`),
		onSuccess: refresh,
	});

	const markAll = useMutation({
		mutationFn: () => api.post('/notifications/read-all'),
		onSuccess: refresh,
	});

	return { markRead, markAll };
}

export function NotificationBell() {
	const [open, setOpen] = useState(false);
	const panel = useRef(null);
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: unread = 0 } = useUnreadCount();
	const { data: notifications, isPending } = useNotifications(open);
	const { markRead, markAll } = useNotificationActions();

	// When new notifications arrive, refresh the pages they are about.
	const previousUnread = usePrevious(unread);

	useEffect(() => {
		if (unread > (previousUnread ?? unread)) {
			queryClient.invalidateQueries({ queryKey: keys.reports() });
			queryClient.invalidateQueries({ queryKey: ['matches'] });
		}
	}, [unread, previousUnread, queryClient]);

	// close on outside click / Escape
	useEffect(() => {
		if (!open) {
			return undefined;
		}

		const onClick = (event) => {
			if (!panel.current?.contains(event.target)) {
				setOpen(false);
			}
		};

		const onKey = (event) => event.key === 'Escape' && setOpen(false);

		document.addEventListener('mousedown', onClick);
		document.addEventListener('keydown', onKey);

		return () => {
			document.removeEventListener('mousedown', onClick);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	const openNotification = (notification) => {
		setOpen(false);

		if (!notification.read_at) {
			markRead.mutate(notification.id);
		}

		if (notification.link) {
			navigate(notification.link);
		}
	};

	const Icon = unread > 0 ? BellRing : Bell;

	return (
		<div className="relative" ref={panel}>
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="relative grid size-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink"
				aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
				aria-expanded={open}
			>
				<motion.span
					key={unread}
					animate={unread > 0 ? { rotate: [0, -16, 14, -10, 6, 0] } : {}}
					transition={{ duration: 0.7 }}
				>
					<Icon className="size-[18px]" />
				</motion.span>

				<AnimatePresence>
					{unread > 0 && (
						<motion.span
							initial={{ scale: 0 }}
							animate={{ scale: 1 }}
							exit={{ scale: 0 }}
							className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-surface"
						>
							{unread > 99 ? '99+' : unread}
						</motion.span>
					)}
				</AnimatePresence>
			</button>

			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: -8, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -6, scale: 0.98 }}
						transition={{ duration: 0.16 }}
						className="absolute right-0 top-12 z-40 w-[min(92vw,380px)] origin-top-right overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
					>
						<div className="flex items-center justify-between border-b border-line px-4 py-3">
							<p className="font-semibold text-ink">Notifications</p>
							{unread > 0 && (
								<button
									type="button"
									onClick={() => markAll.mutate()}
									className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
								>
									<CheckCheck className="size-3.5" /> Mark all read
								</button>
							)}
						</div>

						<div className="max-h-[60vh] overflow-y-auto">
							{isPending ? (
								<div className="grid place-items-center py-10">
									<Spinner />
								</div>
							) : notifications?.length ? (
								<ul className="divide-y divide-line">
									{notifications.slice(0, 8).map((notification, index) => (
										<motion.li
											key={notification.id}
											initial={{ opacity: 0, x: 10 }}
											animate={{ opacity: 1, x: 0 }}
											transition={{ delay: index * 0.03 }}
										>
											<button
												type="button"
												onClick={() => openNotification(notification)}
												className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
											>
												<span
													className={clsx(
														'mt-1.5 size-2 shrink-0 rounded-full',
														notification.read_at
															? 'bg-transparent'
															: 'bg-brand',
													)}
												/>
												<span className="min-w-0">
													<span className="block text-sm font-semibold text-ink">
														{notification.title}
													</span>
													<span className="mt-0.5 line-clamp-2 block text-sm text-muted">
														{notification.body}
													</span>
													<span className="mt-1 block text-xs text-subtle">
														{timeAgo(notification.created_at)}
													</span>
												</span>
											</button>
										</motion.li>
									))}
								</ul>
							) : (
								<p className="px-4 py-10 text-center text-sm text-muted">
									You are all caught up.
								</p>
							)}
						</div>

						<Link
							to="/notifications"
							onClick={() => setOpen(false)}
							className="block border-t border-line px-4 py-3 text-center text-sm font-semibold text-brand hover:bg-surface-2"
						>
							See all notifications
						</Link>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
