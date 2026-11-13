/**
 * The draft editor: Start → Answers → Follow-ups → Review.
 *
 *     <DraftWizard report={report} />
 *
 * - The step shown first is where the server says the draft is (draft.current),
 *   so a draft continued on another device opens at the right place.
 * - Edits autosave (see useDraftAutosave). Photos live only in IndexedDB.
 * - "Waiting for AI" drafts explain what stopped and what happens next.
 */

import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
	ArrowLeft,
	Check,
	CloudOff,
	CloudCheck,
	Hourglass,
	LoaderCircle,
	Sparkles,
	Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button } from '../../../components/ui/Button.jsx';
import { Callout } from '../../../components/ui/Feedback.jsx';
import { PageHeader } from '../../../components/ui/Layout.jsx';
import { ConfirmDialog, Modal } from '../../../components/ui/Modal.jsx';
import { api, ApiError } from '../../../lib/api.js';
import { formatDay } from '../../../lib/format.js';
import { deletePhotos, loadPhotos } from '../../../lib/photoStore.js';
import { keys } from '../../../lib/queries.js';
import { AnswersStep } from './AnswersStep.jsx';
import { CategoryGrid } from './CategoryGrid.jsx';
import { FollowupsStep } from './FollowupsStep.jsx';
import { ReviewStep } from './ReviewStep.jsx';
import { StartStep } from './StartStep.jsx';
import { clearDraftMirror, useDraftAutosave } from './useDraftAutosave.js';

const STEP_ORDER = ['start', 'answers', 'followups', 'review'];

const STEP_LABELS = {
	start: 'Photos or manual',
	answers: 'Questions',
	followups: 'Follow-ups',
	review: 'Review',
};

/** Server error code → the form field it belongs to. */
const FIELD_FOR_CODE = {
	DATE_IN_FUTURE: 'occurredOn',
	DATE_TOO_OLD: 'occurredOn',
	UNKNOWN_ZONE: 'zoneId',
	PERSONAL_DATA_NOT_ALLOWED: 'placeNote',
};

// ─────────────────────────────────────────────────────────────
//  Stepper + save indicator
// ─────────────────────────────────────────────────────────────

function Stepper({ step, reachable, onGo }) {
	const currentIndex = STEP_ORDER.indexOf(step);

	return (
		<ol className="flex items-center gap-1.5 sm:gap-3" aria-label="Steps">
			{STEP_ORDER.map((key, index) => {
				const done = index < currentIndex;
				const active = index === currentIndex;
				const canGo = index <= reachable && !active;

				return (
					<li key={key} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
						<button
							type="button"
							disabled={!canGo}
							onClick={() => onGo(key)}
							aria-current={active ? 'step' : undefined}
							className={clsx(
								'group flex min-w-0 items-center gap-2',
								canGo && 'cursor-pointer',
							)}
						>
							<span
								className={clsx(
									'relative grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold transition-colors',
									active && 'border-transparent text-white',
									done && 'border-brand bg-brand/12 text-brand',
									!active && !done && 'border-line-strong text-subtle',
									canGo && 'group-hover:border-brand',
								)}
							>
								{active && (
									<motion.span
										layoutId="wizard-step"
										className="absolute inset-0 rounded-full bg-gradient-brand shadow-[0_6px_20px_-8px_var(--glow)]"
										transition={{ type: 'spring', stiffness: 400, damping: 30 }}
									/>
								)}
								<span className="relative">
									{done ? (
										<Check className="size-4" strokeWidth={3} />
									) : (
										index + 1
									)}
								</span>
							</span>

							<span
								className={clsx(
									'hidden truncate text-sm font-semibold md:inline',
									active ? 'text-ink' : 'text-muted',
								)}
							>
								{STEP_LABELS[key]}
							</span>
						</button>

						{index < STEP_ORDER.length - 1 && (
							<span className="relative h-0.5 min-w-3 flex-1 overflow-hidden rounded-full bg-line">
								<motion.span
									className="absolute inset-0 origin-left bg-gradient-brand"
									initial={false}
									animate={{ scaleX: done ? 1 : 0 }}
									transition={{ duration: 0.4 }}
								/>
							</span>
						)}
					</li>
				);
			})}
		</ol>
	);
}

function SaveIndicator({ state }) {
	const view = {
		idle: null,
		pending: {
			icon: LoaderCircle,
			text: 'Unsaved changes',
			className: 'text-subtle',
			spin: false,
		},
		saving: { icon: LoaderCircle, text: 'Saving…', className: 'text-muted', spin: true },
		saved: { icon: CloudCheck, text: 'Saved', className: 'text-ok' },
		error: { icon: CloudOff, text: 'Not saved', className: 'text-bad' },
	}[state];

	return (
		<AnimatePresence mode="wait">
			{view && (
				<motion.span
					key={state}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					className={clsx(
						'inline-flex items-center gap-1.5 text-xs font-medium',
						view.className,
					)}
					role="status"
				>
					<view.icon
						className={clsx('size-3.5', view.spin && 'animate-spin')}
						aria-hidden
					/>
					{view.text}
				</motion.span>
			)}
		</AnimatePresence>
	);
}

// ─────────────────────────────────────────────────────────────
//  The wizard
// ─────────────────────────────────────────────────────────────

export function DraftWizard({ report }) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const [step, setStep] = useState(() => report.draft?.current ?? 'start');
	const [photos, setPhotos] = useState([]);
	const [serverErrors, setServerErrors] = useState({});
	const [pickingCategoryId, setPickingCategoryId] = useState(null);
	const [categoryModal, setCategoryModal] = useState(false);
	const [confirmCategory, setConfirmCategory] = useState(null);
	const [confirmDiscard, setConfirmDiscard] = useState(false);
	const [discarding, setDiscarding] = useState(false);

	// ── autosave, with field errors shown next to the field ──
	const saver = useDraftAutosave(report.id, {
		onFieldError: (error, changes) => {
			const field =
				FIELD_FOR_CODE[error.code] ??
				Object.keys(changes).find((key) => key !== 'answers' && key !== 'draftStep') ??
				Object.keys(changes.answers ?? {})[0];

			if (field) {
				setServerErrors((current) => ({ ...current, [field]: error.message }));
			}

			toast.error(error.message, { id: 'draft-field-error' });
		},
	});

	// ── photos from this browser ──
	useEffect(() => {
		let cancelled = false;

		loadPhotos(report.id).then((stored) => {
			if (!cancelled && stored.length > 0) {
				setPhotos(stored);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [report.id]);

	const goTo = useCallback((next) => {
		setStep(next);
		setServerErrors({});
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}, []);

	// how far the user may jump ahead = as far as the server says the draft got
	const reachable = Math.max(
		STEP_ORDER.indexOf(report.draft?.current ?? 'start'),
		STEP_ORDER.indexOf(step),
	);

	// ── choose / change category (resets answers + follow-ups on the server) ──
	const pickCategory = async (category) => {
		if (category.id === report.category?.id) {
			setCategoryModal(false);
			goTo('answers');

			return;
		}

		setPickingCategoryId(category.id);

		try {
			await saver.flush();

			const send = () => {
				const current = queryClient.getQueryData(keys.report(report.id));

				return api.patch(`/reports/${report.id}`, {
					version: current.version,
					path: current.path ?? 'manual',
					categoryId: category.id,
					draftStep: 'answers',
				});
			};

			let result;

			try {
				result = await send();
			} catch (error) {
				if (!(error instanceof ApiError) || error.code !== 'VERSION_CONFLICT') {
					throw error;
				}

				await queryClient.refetchQueries({ queryKey: keys.report(report.id), exact: true });
				result = await send();
			}

			queryClient.setQueryData(keys.report(report.id), result.report);
			setCategoryModal(false);
			setConfirmCategory(null);
			goTo('answers');
		} catch (error) {
			toast.error(error.message);
		} finally {
			setPickingCategoryId(null);
		}
	};

	// ── discard ──
	const discard = async () => {
		setDiscarding(true);

		try {
			await api.delete(`/reports/${report.id}`);
			await deletePhotos(report.id);
			clearDraftMirror(report.id);

			queryClient.removeQueries({ queryKey: keys.report(report.id) });
			queryClient.invalidateQueries({ queryKey: keys.reports() });

			toast.success('Draft discarded');
			navigate('/dashboard?tab=drafts', { replace: true });
		} catch (error) {
			toast.error(error.message);
			setDiscarding(false);
		}
	};

	const draft = report.draft;

	return (
		<div className="mx-auto max-w-4xl">
			<PageHeader
				back={
					<Button
						as={Link}
						to="/dashboard?tab=drafts"
						variant="ghost"
						size="sm"
						icon={ArrowLeft}
						className="-ml-3 mb-3"
					>
						My reports
					</Button>
				}
				eyebrow={report.kind === 'found' ? 'Found item · draft' : 'Lost item · draft'}
				title={
					report.kind === 'found'
						? 'Report something you found'
						: 'Report something you lost'
				}
				description={
					draft?.expiresAt
						? `Saved automatically. Kept until ${formatDay(draft.expiresAt)} if you stop here.`
						: 'Saved automatically as you go.'
				}
				actions={
					<>
						<SaveIndicator state={saver.state} />
						<Button
							variant="ghost"
							size="sm"
							icon={Trash2}
							onClick={() => setConfirmDiscard(true)}
						>
							Discard
						</Button>
					</>
				}
			/>

			<div className="mb-6 rounded-2xl border border-line bg-surface/70 p-3 backdrop-blur sm:p-4">
				<Stepper step={step} reachable={reachable} onGo={goTo} />
			</div>

			{draft?.waitingForAi && (
				<Callout tone="warn" icon={Hourglass} title="Waiting for the AI" className="mb-6">
					{draft.stoppedBecause}{' '}
					{draft.waitingStep === 'extraction'
						? 'Try reading the photos again in a minute, or go back and choose “Answer myself”.'
						: 'We keep trying in the background and notify you when it is ready — you can close this page.'}
				</Callout>
			)}

			<AnimatePresence mode="wait">
				<motion.div
					key={step === 'answers' ? `answers-${report.questionSetId}` : step}
					initial={{ opacity: 0, y: 18, filter: 'blur(4px)' }}
					animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
					exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
					transition={{ duration: 0.28 }}
				>
					{step === 'start' && (
						<StartStep
							report={report}
							photos={photos}
							setPhotos={setPhotos}
							pickingCategoryId={pickingCategoryId}
							onPickCategory={(category) =>
								report.category && category.id !== report.category.id
									? setConfirmCategory(category)
									: pickCategory(category)
							}
							onExtracted={() => goTo('answers')}
						/>
					)}

					{step === 'answers' &&
						(report.questionSet ? (
							<AnswersStep
								report={report}
								saver={saver}
								serverErrors={serverErrors}
								onBack={() => goTo('start')}
								onNext={() => goTo('followups')}
								onChangeCategory={() => setCategoryModal(true)}
							/>
						) : (
							<Callout tone="info" icon={Sparkles} title="Choose a category first">
								<Button size="sm" className="mt-2" onClick={() => goTo('start')}>
									Go to step 1
								</Button>
							</Callout>
						))}

					{step === 'followups' && (
						<FollowupsStep
							report={report}
							photos={photos}
							onBack={() => goTo('answers')}
							onNext={() => goTo('review')}
							onIncomplete={() => goTo('answers')}
						/>
					)}

					{step === 'review' && (
						<ReviewStep
							report={report}
							onGoTo={goTo}
							onSubmitted={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
						/>
					)}
				</motion.div>
			</AnimatePresence>

			{/* ── change category ── */}
			<Modal
				open={categoryModal}
				onClose={() => setCategoryModal(false)}
				title="Choose the right category"
				description="Changing the category clears your answers and follow-up questions."
				size="xl"
			>
				<CategoryGrid
					selectedId={report.category?.id}
					busyId={pickingCategoryId}
					disabled={Boolean(pickingCategoryId)}
					onSelect={pickCategory}
				/>
			</Modal>

			<ConfirmDialog
				open={Boolean(confirmCategory)}
				onClose={() => setConfirmCategory(null)}
				onConfirm={() => pickCategory(confirmCategory)}
				loading={Boolean(pickingCategoryId)}
				title={`Switch to ${confirmCategory?.name ?? 'this category'}?`}
				description="Your answers and follow-up questions will be cleared, because each category asks different questions."
				confirmLabel="Switch category"
				variant="primary"
			/>

			<ConfirmDialog
				open={confirmDiscard}
				onClose={() => setConfirmDiscard(false)}
				onConfirm={discard}
				loading={discarding}
				title="Discard this draft?"
				description="Everything you entered and the photos on this device are deleted. This cannot be undone."
				confirmLabel="Discard draft"
			/>
		</div>
	);
}
