/**
 * Step 4 — check everything, then submit.
 *
 * Submit outcomes:
 *   SUBMITTED       found → "bring it to a locker" (the report page shows the code button)
 *                   lost  → "searching for a match"
 *   ITEM_TOO_LARGE  found item does not fit → bring it to the admin desk
 *   400 REPORT_INCOMPLETE → jump to the step that is missing something
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeft,
	CalendarDays,
	Lock,
	MapPin,
	PencilLine,
	Box,
	Send,
	Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { api, ApiError } from '../../../lib/api.js';
import { formatDay } from '../../../lib/format.js';
import { deletePhotos } from '../../../lib/photoStore.js';
import { keys } from '../../../lib/queries.js';
import { categoryIcon } from '../../../lib/statuses.js';
import { describeAnswer } from './answers.js';
import { clearDraftMirror } from './useDraftAutosave.js';

/** Which wizard step fixes each "missing" entry from REPORT_INCOMPLETE. */
function stepFor(missing = []) {
	if (missing.includes('category')) {
		return 'start';
	}

	if (
		missing.some(
			(item) =>
				['occurredOn', 'zoneId', 'fitsInLocker'].includes(item) ||
				item.startsWith('answers'),
		)
	) {
		return 'answers';
	}

	return 'followups';
}

function followupAnswerText(followup) {
	const answer = followup.answer;

	if (!answer) {
		return '—';
	}

	if (answer.kind === 'option') {
		return (
			followup.options?.find((option) => option.code === answer.code)?.label ?? answer.code
		);
	}

	if (answer.kind === 'other') {
		return `“${answer.text}”`;
	}

	return answer.kind === 'none' ? 'None of these' : "Don't remember";
}

function Section({ title, onEdit, children, delay = 0 }) {
	return (
		<motion.section
			initial={{ opacity: 0, y: 14 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay }}
			className="rounded-2xl border border-line bg-surface p-5"
		>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h3 className="font-bold text-ink">{title}</h3>
				{onEdit && (
					<Button variant="ghost" size="sm" icon={PencilLine} onClick={onEdit}>
						Edit
					</Button>
				)}
			</div>
			{children}
		</motion.section>
	);
}

export function ReviewStep({ report, onGoTo, onSubmitted }) {
	const queryClient = useQueryClient();
	const CategoryIcon = categoryIcon(report.category?.icon);
	const isFound = report.kind === 'found';

	const submit = useMutation({
		mutationFn: () => api.post(`/reports/${report.id}/submit`),
		onSuccess: async (result) => {
			clearDraftMirror(report.id);
			await deletePhotos(report.id);

			queryClient.setQueryData(keys.report(report.id), result.report);
			queryClient.invalidateQueries({ queryKey: keys.reports() });

			if (result.outcome === 'ITEM_TOO_LARGE') {
				toast.info(
					'Submitted. Please bring the item to the admin desk — it is too big for a locker.',
				);
			} else if (isFound) {
				toast.success('Submitted! Get your locker code when you are at the locker.');
			} else {
				toast.success('Submitted! We will notify you as soon as a match turns up.');
			}

			onSubmitted(result);
		},
		onError: (error) => {
			if (error instanceof ApiError && error.code === 'REPORT_INCOMPLETE') {
				toast.error('Something is still missing — taking you there.');
				onGoTo(stepFor(error.details?.missing));

				return;
			}

			toast.error(error.message);
		},
	});

	const questions = report.questionSet?.questions ?? [];

	return (
		<div className="space-y-4">
			<motion.div
				initial={{ opacity: 0, scale: 0.97 }}
				animate={{ opacity: 1, scale: 1 }}
				className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6"
			>
				<div className="absolute inset-0 aurora opacity-50" aria-hidden />

				<div className="relative flex flex-wrap items-center gap-4">
					<span className="grid size-14 place-items-center rounded-2xl bg-gradient-brand text-white shadow-[0_10px_30px_-10px_var(--glow)] animate-float">
						<CategoryIcon className="size-7" aria-hidden />
					</span>

					<div className="min-w-0 flex-1">
						<p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">
							{isFound ? 'Found item' : 'Lost item'}
						</p>
						<h2 className="text-2xl font-extrabold tracking-tight text-ink">
							{report.category?.name}
						</h2>
					</div>

					{report.path === 'photo' && (
						<Badge tone="accent" icon={Sparkles}>
							Described from photos
						</Badge>
					)}
				</div>

				<div className="relative mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
					<span className="inline-flex items-center gap-1.5">
						<CalendarDays className="size-4" /> {formatDay(report.occurredOn)}
					</span>
					<span className="inline-flex items-center gap-1.5">
						<MapPin className="size-4" /> {report.zone?.name ?? '—'}
						{report.placeNote ? ` · ${report.placeNote}` : ''}
					</span>
					{isFound && (
						<span className="inline-flex items-center gap-1.5">
							<Box className="size-4" />{' '}
							{report.fitsInLocker ? 'Fits in a locker' : 'Too big for a locker'}
						</span>
					)}
				</div>
			</motion.div>

			<Section title="Description" onEdit={() => onGoTo('answers')} delay={0.05}>
				<dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
					{questions.map((question) => (
						<div key={question.key}>
							<dt className="text-xs font-medium text-subtle">{question.text}</dt>
							<dd className="mt-0.5 text-sm font-medium text-ink">
								{describeAnswer(question, report.answers?.[question.key]) ?? (
									<span className="text-subtle">—</span>
								)}
							</dd>
						</div>
					))}
				</dl>
			</Section>

			<Section title="Follow-up answers" onEdit={() => onGoTo('followups')} delay={0.1}>
				<dl className="space-y-3">
					{(report.followups ?? []).map((followup) => (
						<div key={followup.id}>
							<dt className="text-xs font-medium text-subtle">{followup.text}</dt>
							<dd className="mt-0.5 text-sm font-medium text-ink">
								{followupAnswerText(followup)}
							</dd>
						</div>
					))}
				</dl>

				<p className="mt-4 flex items-center gap-2 text-xs text-subtle">
					<Lock className="size-3.5 text-ok" /> Only you and the admins can see these.
				</p>
			</Section>

			<div className="flex flex-col-reverse items-stretch justify-between gap-3 pt-2 sm:flex-row sm:items-center">
				<Button variant="ghost" icon={ArrowLeft} onClick={() => onGoTo('followups')}>
					Back
				</Button>

				<Button
					size="lg"
					icon={Send}
					loading={submit.isPending}
					onClick={() => submit.mutate()}
				>
					Submit report
				</Button>
			</div>
		</div>
	);
}
