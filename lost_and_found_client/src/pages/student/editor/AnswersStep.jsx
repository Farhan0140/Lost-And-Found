/**
 * Step 2 — the category's questions + when / where / does it fit in a locker.
 *
 * The form keeps its own copy of the answers (instant typing) and hands every change
 * to the autosaver. The wizard re-mounts this step when the category changes
 * (key = questionSetId), which resets the copy to the server's answers.
 */

import clsx from 'clsx';
import {
	ArrowLeft,
	ArrowRight,
	Box,
	CalendarDays,
	MapPin,
	PackageX,
	RefreshCw,
	Sparkles,
	TriangleAlert,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';

import { Button } from '../../../components/ui/Button.jsx';
import { Callout } from '../../../components/ui/Feedback.jsx';
import { ChoiceChip, Field, Input, Select, Textarea } from '../../../components/ui/Form.jsx';
import { daysAgoInCampus, todayInCampus } from '../../../lib/format.js';
import { useZones } from '../../../lib/queries.js';
import { categoryIcon } from '../../../lib/statuses.js';
import {
	looksPersonal,
	missingAnswers,
	SELECT_TYPES,
	toFormAnswers,
	toggleCode,
} from './answers.js';

const MAX_DAYS_BACK = 90;

// ─────────────────────────────────────────────────────────────
//  One question
// ─────────────────────────────────────────────────────────────

function Question({ question, index, answer, serverAnswer, error, onChange }) {
	const aiCodes =
		serverAnswer?.source === 'ai' || serverAnswer?.aiCodes ? (serverAnswer.aiCodes ?? []) : [];
	const aiText = serverAnswer?.aiText;

	return (
		<motion.fieldset
			id={`question-${question.key}`}
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: Math.min(index, 10) * 0.04 }}
			className={clsx(
				'rounded-2xl border bg-surface p-5 transition-colors',
				error ? 'border-bad/50' : 'border-line',
			)}
		>
			<legend className="sr-only">{question.text}</legend>

			<div className="mb-3 flex items-start justify-between gap-3">
				<p className="font-semibold text-ink">
					<span className="mr-2 font-mono text-xs text-subtle">
						{String(index + 1).padStart(2, '0')}
					</span>
					{question.text}
				</p>

				{question.type === 'multi_select' && (
					<span className="shrink-0 text-xs text-subtle">Pick all that apply</span>
				)}
			</div>

			{SELECT_TYPES.includes(question.type) ? (
				<div className="flex flex-wrap gap-2" role="group" aria-label={question.text}>
					{question.options.map((option) => (
						<ChoiceChip
							key={option.code}
							selected={answer?.codes?.includes(option.code) ?? false}
							aiSuggested={aiCodes.includes(option.code)}
							onClick={() =>
								onChange({
									codes: toggleCode(question, answer?.codes ?? [], option.code),
								})
							}
						>
							{option.label}
						</ChoiceChip>
					))}
				</div>
			) : question.type === 'brand' ? (
				<Input
					aria-label={question.text}
					value={answer?.text ?? ''}
					maxLength={60}
					placeholder={
						question.placeholder ?? 'e.g. Samsung — leave empty if there is none'
					}
					onChange={(event) => onChange({ text: event.target.value })}
				/>
			) : (
				<>
					<Textarea
						aria-label={question.text}
						value={answer?.text ?? ''}
						maxLength={300}
						rows={3}
						placeholder={
							question.placeholder ??
							'Stickers, scratches, engravings… (no names or numbers)'
						}
						onChange={(event) => onChange({ text: event.target.value })}
					/>
					{looksPersonal(answer?.text ?? '') && (
						<p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
							<TriangleAlert className="size-3.5" /> Please leave out names, phone or
							ID numbers.
						</p>
					)}
				</>
			)}

			{aiText && answer?.text !== aiText && (
				<p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
					<Sparkles className="size-3.5 text-accent" /> AI read: “{aiText}”
				</p>
			)}

			{error && <p className="mt-3 text-xs font-medium text-bad">{error}</p>}
		</motion.fieldset>
	);
}

// ─────────────────────────────────────────────────────────────
//  The step
// ─────────────────────────────────────────────────────────────

export function AnswersStep({ report, saver, serverErrors, onBack, onNext, onChangeCategory }) {
	const zones = useZones();
	const isFound = report.kind === 'found';
	const questions = report.questionSet?.questions ?? [];

	// ── local copy of everything this step edits ──
	const [answers, setAnswers] = useState(() => toFormAnswers(report.answers));
	const [occurredOn, setOccurredOn] = useState(report.occurredOn ?? '');
	const [zoneId, setZoneId] = useState(report.zone?.id ?? '');
	const [placeNote, setPlaceNote] = useState(report.placeNote ?? '');
	const [fitsInLocker, setFitsInLocker] = useState(report.fitsInLocker);

	const [errors, setErrors] = useState({});
	const [continuing, setContinuing] = useState(false);

	const today = todayInCampus();
	const oldest = daysAgoInCampus(MAX_DAYS_BACK);

	const setAnswer = (key, value) => {
		setAnswers((current) => ({ ...current, [key]: value }));
		setErrors((current) => ({ ...current, [key]: undefined }));

		// saved after a short pause, so fast tapping / typing becomes one request
		saver.queue({ answers: { [key]: value } });
	};

	const aiCount = useMemo(
		() =>
			Object.values(report.answers ?? {}).filter((answer) => answer?.source === 'ai').length,
		[report.answers],
	);

	const answeredCount = questions.filter((question) =>
		SELECT_TYPES.includes(question.type)
			? answers[question.key]?.codes?.length > 0
			: Boolean(answers[question.key]?.text),
	).length;

	// ── validate + save + next ──
	const next = async () => {
		const found = {};

		for (const key of missingAnswers(report.questionSet, answers)) {
			found[key] = 'Please pick an answer ("Don\'t know" is fine).';
		}

		if (!occurredOn) {
			found.occurredOn = `When did you ${isFound ? 'find' : 'lose'} it?`;
		} else if (occurredOn > today || occurredOn < oldest) {
			found.occurredOn = `Pick a date in the last ${MAX_DAYS_BACK} days.`;
		}

		if (!zoneId) {
			found.zoneId = 'Pick the campus area.';
		}

		if (isFound && (fitsInLocker === null || fitsInLocker === undefined)) {
			found.fitsInLocker = 'Tell us if the item fits in a locker.';
		}

		if (looksPersonal(placeNote)) {
			found.placeNote = 'Please leave out names, phone or ID numbers.';
		}

		setErrors(found);

		const firstKey = Object.keys(found)[0];

		if (firstKey) {
			document
				.getElementById(
					questions.some((question) => question.key === firstKey)
						? `question-${firstKey}`
						: `detail-${firstKey}`,
				)
				?.scrollIntoView({ behavior: 'smooth', block: 'center' });

			return;
		}

		setContinuing(true);

		saver.queue({ draftStep: 'followups' });

		const saved = await saver.flush();

		setContinuing(false);

		if (saved) {
			onNext();
		}
	};

	const fieldError = (key) => errors[key] ?? serverErrors?.[key];

	const CategoryIcon = categoryIcon(report.category?.icon);

	return (
		<div className="space-y-6">
			{/* ── category header ── */}
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2/40 p-4">
				<div className="flex items-center gap-3">
					<span className="grid size-11 place-items-center rounded-xl bg-gradient-brand text-white">
						<CategoryIcon className="size-5" aria-hidden />
					</span>
					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-subtle">
							Category
						</p>
						<p className="font-bold text-ink">{report.category?.name}</p>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<span className="text-sm text-muted tabular-nums">
						{answeredCount}/{questions.length} answered
					</span>
					<Button variant="outline" size="sm" icon={RefreshCw} onClick={onChangeCategory}>
						Wrong category?
					</Button>
				</div>
			</div>

			{report.path === 'photo' && aiCount > 0 && (
				<Callout
					tone="brand"
					icon={Sparkles}
					title={`The AI answered ${aiCount} question${aiCount === 1 ? '' : 's'}`}
				>
					Answers marked <b className="text-accent">AI</b> came from your photos. Please
					check each one and fix anything that is wrong.
				</Callout>
			)}

			{/* ── the questions ── */}
			<div className="space-y-3">
				{questions.map((question, index) => (
					<Question
						key={question.key}
						question={question}
						index={index}
						answer={answers[question.key]}
						serverAnswer={report.answers?.[question.key]}
						error={fieldError(question.key)}
						onChange={(value) => setAnswer(question.key, value)}
					/>
				))}
			</div>

			{/* ── when / where ── */}
			<div className="rounded-2xl border border-line bg-surface p-5">
				<h3 className="mb-4 font-bold text-ink">When and where</h3>

				<div className="grid gap-5 md:grid-cols-2">
					<div id="detail-occurredOn">
						<Field
							label={isFound ? 'Found on' : 'Lost on'}
							required
							error={fieldError('occurredOn')}
							action={
								<div className="flex gap-1">
									{[
										{ label: 'Today', value: today },
										{ label: 'Yesterday', value: daysAgoInCampus(1) },
									].map((quick) => (
										<button
											key={quick.label}
											type="button"
											onClick={() => {
												setOccurredOn(quick.value);
												setErrors((current) => ({
													...current,
													occurredOn: undefined,
												}));
												saver.queue({ occurredOn: quick.value });
											}}
											className={clsx(
												'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
												occurredOn === quick.value
													? 'bg-brand text-white'
													: 'bg-surface-2 text-muted hover:text-ink',
											)}
										>
											{quick.label}
										</button>
									))}
								</div>
							}
						>
							<Input
								type="date"
								icon={CalendarDays}
								value={occurredOn}
								min={oldest}
								max={today}
								onChange={(event) => {
									const value = event.target.value;

									setOccurredOn(value);
									setErrors((current) => ({ ...current, occurredOn: undefined }));

									if (value && value <= today && value >= oldest) {
										saver.queue({ occurredOn: value });
									}
								}}
							/>
						</Field>
					</div>

					<div id="detail-zoneId">
						<Field label="Campus area" required error={fieldError('zoneId')}>
							<Select
								value={zoneId}
								onChange={(event) => {
									const value = Number(event.target.value);

									setZoneId(value || '');
									setErrors((current) => ({ ...current, zoneId: undefined }));

									if (value) {
										saver.queue({ zoneId: value });
									}
								}}
							>
								<option value="">
									{zones.isPending ? 'Loading…' : 'Choose an area'}
								</option>
								{(zones.data ?? []).map((zone) => (
									<option key={zone.id} value={zone.id}>
										{zone.name}
										{zone.department ? ` — ${zone.department}` : ''}
									</option>
								))}
							</Select>
						</Field>
					</div>

					<div id="detail-placeNote" className="md:col-span-2">
						<Field
							label="Exact spot (optional)"
							hint="e.g. “second row of the library reading room, under the desk”"
							error={fieldError('placeNote')}
						>
							<Input
								icon={MapPin}
								value={placeNote}
								maxLength={200}
								placeholder="Where exactly?"
								onChange={(event) => {
									setPlaceNote(event.target.value);
									setErrors((current) => ({ ...current, placeNote: undefined }));
									saver.queue({ placeNote: event.target.value || null });
								}}
							/>
						</Field>
					</div>
				</div>
			</div>

			{/* ── locker size (finders only) ── */}
			{isFound && (
				<div
					id="detail-fitsInLocker"
					className={clsx(
						'rounded-2xl border bg-surface p-5 transition-colors',
						fieldError('fitsInLocker') ? 'border-bad/50' : 'border-line',
					)}
				>
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div className="flex items-start gap-3">
							<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
								<Box className="size-5" aria-hidden />
							</span>
							<div>
								<p className="font-semibold text-ink">Does it fit in a locker?</p>
								<p className="text-sm text-muted">
									A locker is about the size of a shoebox (30 × 30 × 40 cm).
								</p>
							</div>
						</div>

						<div
							className="flex shrink-0 gap-2"
							role="radiogroup"
							aria-label="Fits in a locker"
						>
							{[
								{ value: true, label: 'Yes, it fits' },
								{ value: false, label: 'No, too big' },
							].map((choice) => (
								<ChoiceChip
									key={choice.label}
									selected={fitsInLocker === choice.value}
									onClick={() => {
										setFitsInLocker(choice.value);
										setErrors((current) => ({
											...current,
											fitsInLocker: undefined,
										}));
										saver.queue(
											{ fitsInLocker: choice.value },
											{ immediate: true },
										);
									}}
								>
									{choice.label}
								</ChoiceChip>
							))}
						</div>
					</div>

					{fitsInLocker === false && (
						<Callout tone="warn" icon={PackageX} className="mt-4">
							No problem — after you submit, please hand the item to the admin desk
							instead of a locker.
						</Callout>
					)}

					{fieldError('fitsInLocker') && (
						<p className="mt-3 text-xs font-medium text-bad">
							{fieldError('fitsInLocker')}
						</p>
					)}
				</div>
			)}

			<div className="flex items-center justify-between gap-3 pt-2">
				<Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
					Back
				</Button>
				<Button size="lg" iconRight={ArrowRight} loading={continuing} onClick={next}>
					Continue
				</Button>
			</div>
		</div>
	);
}
