/**
 * Step 3 — 3–4 follow-up questions written by the AI for THIS item.
 *
 * Opening the step generates them once (the server stores them, so a reload shows the
 * same questions). Every answer is saved as soon as it is picked; "Other" text is saved
 * after a short pause.
 *
 * Only the reporter and admins ever see these answers — they are what tells two
 * similar items apart.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
	ArrowLeft,
	ArrowRight,
	Lock,
	MessageCircleQuestion,
	RefreshCw,
	TriangleAlert,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AiThinking } from '../../../components/AiScanner.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Callout } from '../../../components/ui/Feedback.jsx';
import { ChoiceChip, Input } from '../../../components/ui/Form.jsx';
import { api, ApiError } from '../../../lib/api.js';
import { toApiImages } from '../../../lib/images.js';
import { keys } from '../../../lib/queries.js';

const SPECIAL_CHOICES = [
	{ kind: 'other', label: 'Something else' },
	{ kind: 'none', label: 'None of these' },
	{ kind: 'dont_remember', label: "I don't remember" },
];

function isComplete(answer) {
	if (!answer?.kind) {
		return false;
	}

	if (answer.kind === 'other') {
		return (answer.text ?? '').trim().length >= 2;
	}

	return true;
}

function toRequest(followupId, answer) {
	return {
		followupId,
		kind: answer.kind,
		...(answer.kind === 'option' ? { code: answer.code } : {}),
		...(answer.kind === 'other' ? { text: answer.text.trim() } : {}),
	};
}

// ─────────────────────────────────────────────────────────────
//  One follow-up question
// ─────────────────────────────────────────────────────────────

function Followup({ followup, index, answer, onChange, error }) {
	return (
		<motion.fieldset
			id={`followup-${followup.id}`}
			initial={{ opacity: 0, y: 16, rotateX: -10 }}
			animate={{ opacity: 1, y: 0, rotateX: 0 }}
			transition={{ delay: index * 0.12, type: 'spring', stiffness: 180, damping: 20 }}
			className={clsx(
				'rounded-2xl border bg-surface p-5 [transform-origin:top]',
				error ? 'border-bad/50' : isComplete(answer) ? 'border-ok/40' : 'border-line',
			)}
		>
			<legend className="sr-only">{followup.text}</legend>

			<p className="mb-3 font-semibold text-ink">
				<span className="mr-2 inline-grid size-6 place-items-center rounded-lg bg-gradient-brand text-xs text-white">
					{index + 1}
				</span>
				{followup.text}
			</p>

			<div className="flex flex-wrap gap-2" role="radiogroup" aria-label={followup.text}>
				{(followup.options ?? []).map((option) => (
					<ChoiceChip
						key={option.code}
						selected={answer?.kind === 'option' && answer.code === option.code}
						onClick={() => onChange({ kind: 'option', code: option.code })}
					>
						{option.label}
					</ChoiceChip>
				))}

				{SPECIAL_CHOICES.map((choice) => (
					<ChoiceChip
						key={choice.kind}
						selected={answer?.kind === choice.kind}
						onClick={() => onChange({ kind: choice.kind, text: answer?.text ?? '' })}
						className="border-dashed"
					>
						{choice.label}
					</ChoiceChip>
				))}
			</div>

			{answer?.kind === 'other' && (
				<motion.div
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: 'auto' }}
					className="mt-3"
				>
					<Input
						autoFocus
						value={answer.text ?? ''}
						maxLength={200}
						placeholder="Describe it in a few words"
						aria-label={`Your answer to: ${followup.text}`}
						onChange={(event) => onChange({ kind: 'other', text: event.target.value })}
					/>
				</motion.div>
			)}

			{error && <p className="mt-3 text-xs font-medium text-bad">{error}</p>}
		</motion.fieldset>
	);
}

// ─────────────────────────────────────────────────────────────
//  The step
// ─────────────────────────────────────────────────────────────

export function FollowupsStep({ report, photos, onBack, onNext, onIncomplete }) {
	const queryClient = useQueryClient();
	const followups = report.followups ?? [];

	const [answers, setAnswers] = useState(() =>
		Object.fromEntries(
			followups
				.filter((followup) => followup.answer)
				.map((followup) => [
					followup.id,
					{ ...followup.answer, text: followup.answer.text ?? '' },
				]),
		),
	);

	const [errors, setErrors] = useState({});
	const textTimers = useRef({});

	// ── generate the questions (once) ──
	const generate = useMutation({
		mutationFn: () => {
			const images =
				report.path === 'photo' && photos.length > 0
					? toApiImages(photos.slice(0, 5))
					: undefined;

			return api.post(`/reports/${report.id}/followups/generate`, images ? { images } : {});
		},
		onSuccess: ({ report: updated }) => {
			queryClient.setQueryData(keys.report(report.id), updated);
		},
		onError: (error) => {
			if (error instanceof ApiError && error.code === 'ANSWERS_INCOMPLETE') {
				toast.error(error.message);
				onIncomplete();
			}

			if (error instanceof ApiError && error.code === 'AI_UNAVAILABLE') {
				queryClient.invalidateQueries({ queryKey: keys.report(report.id) });
			}
		},
	});

	const started = useRef(false);

	useEffect(() => {
		if (followups.length === 0 && !started.current) {
			started.current = true;
			generate.mutate();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [followups.length]);

	// the server may generate them in the background (after "Waiting for AI") — pick them up
	useEffect(() => {
		if (followups.length > 0) {
			setAnswers((current) => {
				const next = { ...current };

				for (const followup of followups) {
					if (followup.answer && !next[followup.id]) {
						next[followup.id] = {
							...followup.answer,
							text: followup.answer.text ?? '',
						};
					}
				}

				return next;
			});
		}
	}, [followups]);

	// ── save answers ──
	const save = useMutation({
		mutationFn: (list) => api.put(`/reports/${report.id}/followups/answers`, { answers: list }),
		onSuccess: ({ report: updated }) => {
			queryClient.setQueryData(keys.report(report.id), updated);
		},
		onError: (error, list) => {
			const id = list[0]?.followupId;

			if (id) {
				setErrors((current) => ({ ...current, [id]: error.message }));
			} else {
				toast.error(error.message);
			}
		},
	});

	const change = (followupId, answer) => {
		setAnswers((current) => ({ ...current, [followupId]: answer }));
		setErrors((current) => ({ ...current, [followupId]: undefined }));

		clearTimeout(textTimers.current[followupId]);

		if (answer.kind === 'other') {
			// wait for a pause in typing, and only send something the server accepts
			if (isComplete(answer)) {
				textTimers.current[followupId] = setTimeout(() => {
					delete textTimers.current[followupId];
					save.mutate([toRequest(followupId, answer)]);
				}, 800);
			}

			return;
		}

		save.mutate([toRequest(followupId, answer)]);
	};

	useEffect(() => {
		const timers = textTimers.current;

		return () => Object.values(timers).forEach(clearTimeout);
	}, []);

	const answered = followups.filter((followup) => isComplete(answers[followup.id])).length;

	const next = async () => {
		const missing = {};

		for (const followup of followups) {
			if (!isComplete(answers[followup.id])) {
				missing[followup.id] =
					answers[followup.id]?.kind === 'other'
						? 'Please write at least 2 characters.'
						: 'Please pick an answer.';
			}
		}

		setErrors(missing);

		const first = Object.keys(missing)[0];

		if (first) {
			document
				.getElementById(`followup-${first}`)
				?.scrollIntoView({ behavior: 'smooth', block: 'center' });

			return;
		}

		// send everything once more (covers "Other" text still waiting for its timer)
		Object.values(textTimers.current).forEach(clearTimeout);
		textTimers.current = {};

		try {
			await save.mutateAsync(
				followups.map((followup) => toRequest(followup.id, answers[followup.id])),
			);
			onNext();
		} catch {
			// error shown by onError
		}
	};

	// ── states ──
	const aiDown = generate.error instanceof ApiError && generate.error.code === 'AI_UNAVAILABLE';

	if (followups.length === 0) {
		if (generate.isPending || (!generate.isError && !report.draft?.waitingForAi)) {
			return (
				<div className="rounded-3xl border border-line bg-surface">
					<AiThinking active title="Writing questions about your item" />
				</div>
			);
		}

		return (
			<div className="space-y-5">
				<Callout
					tone={aiDown || report.draft?.waitingForAi ? 'warn' : 'bad'}
					icon={TriangleAlert}
					title={
						aiDown || report.draft?.waitingForAi
							? 'The AI is taking a short break'
							: 'Could not write the questions'
					}
					action={
						<Button
							size="sm"
							variant="outline"
							icon={RefreshCw}
							loading={generate.isPending}
							onClick={() => generate.mutate()}
						>
							Try again
						</Button>
					}
				>
					{aiDown || report.draft?.waitingForAi
						? 'Your draft is saved. We keep trying in the background and send you a notification when the questions are ready — you can close this page.'
						: generate.error?.message}
				</Callout>

				<Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
					Back to the answers
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-start gap-3">
					<span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
						<MessageCircleQuestion className="size-5" aria-hidden />
					</span>
					<div>
						<h2 className="text-lg font-bold text-ink">
							A few questions only the {report.kind === 'found' ? 'item' : 'owner'}{' '}
							can answer
						</h2>
						<p className="text-sm text-muted">
							They help tell apart two items that look alike.
						</p>
					</div>
				</div>
				<span className="text-sm text-muted tabular-nums">
					{answered}/{followups.length} answered
				</span>
			</div>

			<p className="flex items-center gap-2 text-xs text-subtle">
				<Lock className="size-3.5 text-ok" aria-hidden />
				Your answers here are private: only you and the SmartFind admins can see them.
			</p>

			<div className="space-y-3 [perspective:1200px]">
				{[...followups]
					.sort((a, b) => a.position - b.position)
					.map((followup, index) => (
						<Followup
							key={followup.id}
							followup={followup}
							index={index}
							answer={answers[followup.id]}
							error={errors[followup.id]}
							onChange={(answer) => change(followup.id, answer)}
						/>
					))}
			</div>

			<div className="flex items-center justify-between gap-3 pt-2">
				<Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
					Back
				</Button>
				<Button
					size="lg"
					iconRight={ArrowRight}
					loading={save.isPending && answered === followups.length}
					onClick={next}
				>
					Review
				</Button>
			</div>
		</div>
	);
}
