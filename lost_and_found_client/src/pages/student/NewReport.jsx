/**
 * "New report": pick found or lost → a draft is created → the draft wizard opens.
 *
 * Nothing is created just by opening this page (drafts are limited to 3 at a time),
 * only when a card is clicked. `?kind=found` highlights that card.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
	ArrowLeft,
	ArrowRight,
	Camera,
	HandHeart,
	Lock,
	PackageSearch,
	Bell,
	Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { Button } from '../../components/ui/Button.jsx';
import { Callout } from '../../components/ui/Feedback.jsx';
import { PageHeader, TiltCard } from '../../components/ui/Layout.jsx';
import { api, ApiError } from '../../lib/api.js';
import { usePageTitle } from '../../lib/hooks.js';
import { keys } from '../../lib/queries.js';

const KINDS = [
	{
		kind: 'found',
		icon: HandHeart,
		title: 'I found something',
		text: 'Help it get home. Takes about two minutes.',
		steps: [
			{ icon: Camera, text: 'Take 2–5 photos — the AI fills in most answers' },
			{ icon: Sparkles, text: 'Confirm a few details' },
			{ icon: Lock, text: 'Drop it in a smart locker with a one-time code' },
		],
		gradient: 'bg-gradient-brand',
		glow: 'bg-brand/25',
	},
	{
		kind: 'lost',
		icon: PackageSearch,
		title: 'I lost something',
		text: 'Describe it once — we keep looking for you.',
		steps: [
			{ icon: Sparkles, text: 'Answer questions about your item' },
			{ icon: Bell, text: 'Get notified the moment a match is found' },
			{ icon: Lock, text: 'Collect it from the locker with your code' },
		],
		gradient: 'bg-gradient-to-br from-warn to-bad',
		glow: 'bg-warn/25',
	},
];

export function NewReport() {
	usePageTitle('New report');

	const [params] = useSearchParams();
	const preselected = params.get('kind');

	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const create = useMutation({
		mutationFn: (kind) => api.post('/reports', { kind }),
		onSuccess: ({ report }) => {
			queryClient.setQueryData(keys.report(report.id), report);
			queryClient.invalidateQueries({ queryKey: keys.reports() });
			navigate(`/reports/${report.id}`, { replace: true });
		},
		onError: (error) => {
			if (
				!(error instanceof ApiError) ||
				!['TOO_MANY_DRAFTS', 'DAILY_REPORT_LIMIT'].includes(error.code)
			) {
				toast.error(error.message);
			}
		},
	});

	const limitReached =
		create.error instanceof ApiError &&
		['TOO_MANY_DRAFTS', 'DAILY_REPORT_LIMIT'].includes(create.error.code);

	return (
		<div className="mx-auto max-w-4xl">
			<PageHeader
				back={
					<Button
						as={Link}
						to="/dashboard"
						variant="ghost"
						size="sm"
						icon={ArrowLeft}
						className="-ml-3 mb-3"
					>
						My reports
					</Button>
				}
				eyebrow="New report"
				title="What happened?"
				description="Pick one. Your draft is saved as you go, so you can stop and continue later on any device."
			/>

			{limitReached && (
				<Callout
					tone="warn"
					title={
						create.error.code === 'TOO_MANY_DRAFTS'
							? 'Too many unfinished drafts'
							: 'Daily limit reached'
					}
					className="mb-6"
					action={
						create.error.code === 'TOO_MANY_DRAFTS' && (
							<Button
								as={Link}
								to="/dashboard?tab=drafts"
								size="sm"
								variant="outline"
							>
								Open drafts
							</Button>
						)
					}
				>
					{create.error.message}
				</Callout>
			)}

			<div className="grid gap-5 md:grid-cols-2">
				{KINDS.map((item, index) => {
					const Icon = item.icon;
					const highlighted = preselected === item.kind;
					const busy = create.isPending && create.variables === item.kind;

					return (
						<motion.div
							key={item.kind}
							initial={{ opacity: 0, y: 24, rotateX: -12 }}
							animate={{ opacity: 1, y: 0, rotateX: 0 }}
							transition={{
								delay: index * 0.1,
								type: 'spring',
								stiffness: 160,
								damping: 18,
							}}
							className="[perspective:1000px]"
						>
							<TiltCard className="h-full rounded-3xl" max={7}>
								<button
									type="button"
									disabled={create.isPending}
									onClick={() => create.mutate(item.kind)}
									className={clsx(
										'group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border bg-surface p-7 text-left shadow-card transition-colors disabled:cursor-wait',
										highlighted
											? 'border-brand ring-4 ring-brand/15'
											: 'border-line hover:border-brand/40',
									)}
								>
									<div
										aria-hidden
										className={clsx(
											'absolute -right-16 -top-16 size-56 rounded-full blur-3xl transition-opacity duration-500',
											item.glow,
											highlighted
												? 'opacity-100'
												: 'opacity-50 group-hover:opacity-100',
										)}
									/>

									<span
										className={clsx(
											'relative grid size-16 place-items-center rounded-2xl text-white shadow-lg [transform:translateZ(50px)]',
											item.gradient,
										)}
									>
										<Icon className="size-7" aria-hidden />
									</span>

									<h2 className="relative mt-6 text-2xl font-extrabold tracking-tight text-ink [transform:translateZ(30px)]">
										{item.title}
									</h2>
									<p className="relative mt-1 text-muted">{item.text}</p>

									<ol className="relative mt-6 space-y-3">
										{item.steps.map((step, stepIndex) => {
											const StepIcon = step.icon;

											return (
												<li
													key={step.text}
													className="flex items-center gap-3 text-sm text-ink/90"
												>
													<span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand">
														<StepIcon className="size-4" aria-hidden />
													</span>
													<span>
														<span className="mr-1 font-mono text-xs text-subtle">
															{stepIndex + 1}.
														</span>
														{step.text}
													</span>
												</li>
											);
										})}
									</ol>

									<span className="relative mt-8 inline-flex items-center gap-2 font-semibold text-brand">
										{busy ? 'Creating your draft…' : 'Start'}
										<ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1.5" />
									</span>
								</button>
							</TiltCard>
						</motion.div>
					);
				})}
			</div>
		</div>
	);
}
