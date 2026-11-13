/**
 * All notifications (latest 50). Click → mark read + open the link.
 */

import clsx from 'clsx';
import { Bell, BellOff, CheckCheck, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router';

import { useNotificationActions } from '../../components/layout/NotificationBell.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, SkeletonCards } from '../../components/ui/Feedback.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { formatDateTime, timeAgo } from '../../lib/format.js';
import { usePageTitle } from '../../lib/hooks.js';
import { useNotifications } from '../../lib/queries.js';

export function NotificationsPage() {
	usePageTitle('Notifications');

	const navigate = useNavigate();
	const notifications = useNotifications(true);
	const { markRead, markAll } = useNotificationActions();

	const unread = (notifications.data ?? []).filter((item) => !item.read_at).length;

	const open = (item) => {
		if (!item.read_at) {
			markRead.mutate(item.id);
		}

		if (item.link) {
			navigate(item.link);
		}
	};

	return (
		<div className="mx-auto max-w-3xl">
			<PageHeader
				title="Notifications"
				description={unread > 0 ? `${unread} unread` : 'You are all caught up.'}
				actions={
					unread > 0 && (
						<Button
							variant="outline"
							size="sm"
							icon={CheckCheck}
							loading={markAll.isPending}
							onClick={() => markAll.mutate()}
						>
							Mark all read
						</Button>
					)
				}
			/>

			{notifications.isError ? (
				<ErrorState error={notifications.error} onRetry={notifications.refetch} />
			) : notifications.isPending ? (
				<SkeletonCards count={5} />
			) : notifications.data.length === 0 ? (
				<EmptyState
					icon={BellOff}
					title="No notifications yet"
					description="Matches, locker codes and updates on your reports appear here."
				/>
			) : (
				<ul className="space-y-2">
					<AnimatePresence initial>
						{notifications.data.map((item, index) => (
							<motion.li
								key={item.id}
								layout
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: Math.min(index, 10) * 0.03 }}
							>
								<button
									type="button"
									onClick={() => open(item)}
									className={clsx(
										'group flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all duration-300 hover:-translate-y-0.5',
										item.read_at
											? 'border-line bg-surface hover:border-line-strong'
											: 'border-brand/30 bg-brand/6 hover:border-brand/60',
									)}
								>
									<span
										className={clsx(
											'relative grid size-10 shrink-0 place-items-center rounded-xl',
											item.read_at
												? 'bg-surface-2 text-subtle'
												: 'bg-gradient-brand text-white',
										)}
									>
										<Bell className="size-4.5" aria-hidden />
										{!item.read_at && (
											<span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-surface" />
										)}
									</span>

									<div className="min-w-0 flex-1">
										<p
											className={clsx(
												'text-sm',
												item.read_at
													? 'text-ink'
													: 'font-semibold text-ink',
											)}
										>
											{item.title}
										</p>
										{item.body && (
											<p className="mt-0.5 text-sm text-muted">{item.body}</p>
										)}
										<p
											className="mt-1.5 text-xs text-subtle"
											title={formatDateTime(item.created_at)}
										>
											{timeAgo(item.created_at)}
										</p>
									</div>

									{item.link && (
										<ChevronRight className="mt-2 size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-1 group-hover:text-brand" />
									)}
								</button>
							</motion.li>
						))}
					</AnimatePresence>
				</ul>
			)}
		</div>
	);
}
