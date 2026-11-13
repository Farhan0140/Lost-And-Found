/**
 * Question sets (the frozen questions per category).
 *
 *   /admin/question-sets       every version per category; new draft (copy / AI-generated)
 *   /admin/question-sets/:id   preview + JSON editor (drafts only) + activate / delete
 *
 * Rules (enforced by the server):
 *   - only DRAFT sets can be edited; ACTIVE sets are frozen
 *   - question match weights must add up to about 1.00
 *   - activating a set retires the previous one; existing reports keep their version
 */

import clsx from 'clsx';
import {
	ArrowLeft,
	Bot,
	CheckCircle2,
	Copy,
	FileJson,
	ListChecks,
	Save,
	Sparkles,
	Trash2,
	Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, Detail } from '../../components/ui/Card.jsx';
import { Callout, ErrorState, PageLoader, SkeletonRows } from '../../components/ui/Feedback.jsx';
import { Field, Select, Textarea } from '../../components/ui/Form.jsx';
import { PageHeader, Table, Tabs } from '../../components/ui/Layout.jsx';
import { ConfirmDialog, Modal, ReasonDialog } from '../../components/ui/Modal.jsx';
import { formatDateTime, timeAgo } from '../../lib/format.js';
import { usePageTitle } from '../../lib/hooks.js';
import { useAdmin, useCategories } from '../../lib/queries.js';
import { Cell, EmptyRow, useAdminAction } from './shared.jsx';

const STATUS_TONE = { active: 'ok', draft: 'warn', retired: 'neutral' };

// ─────────────────────────────────────────────────────────────
//  List
// ─────────────────────────────────────────────────────────────

function NewSetModal({ open, onClose, defaultCategoryId }) {
	const navigate = useNavigate();
	const categories = useCategories();
	const [categoryId, setCategoryId] = useState('');
	const [mode, setMode] = useState('copy');

	useEffect(() => {
		if (open) {
			setCategoryId(defaultCategoryId ?? '');
			setMode('copy');
		}
	}, [open, defaultCategoryId]);

	// "copy" needs the active set's questions → load the list for that category
	const sets = useAdmin(
		'/admin/question-sets',
		{ categoryId: categoryId || undefined },
		{ enabled: open && Boolean(categoryId) },
	);
	const activeSet = sets.data?.questionSets?.find((set) => set.status === 'active');
	const active = useAdmin(`/admin/question-sets/${activeSet?.id}`, undefined, {
		enabled: Boolean(activeSet?.id),
	});

	const create = useAdminAction({
		success:
			mode === 'ai'
				? 'Draft generated — please review it before activating.'
				: 'Draft created',
		onDone: (result) => {
			onClose();

			const id = result?.id ?? result?.questionSet?.id;

			if (id) {
				navigate(`/admin/question-sets/${id}`);
			}
		},
	});

	const submit = () => {
		if (!categoryId) {
			toast.error('Choose a category');

			return;
		}

		if (mode === 'ai') {
			create.mutate({
				path: '/admin/question-sets/generate',
				body: { categoryId: Number(categoryId) },
			});

			return;
		}

		const source = active.data?.questionSet;

		create.mutate({
			path: '/admin/question-sets',
			body: {
				categoryId: Number(categoryId),
				questions: source?.questions ?? [],
				aspects: source?.aspects ?? [],
				notes: source ? `Copy of v${source.version}` : 'New set',
			},
		});
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="New question-set draft"
			description="Drafts are not used by students until you activate them."
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button
						icon={mode === 'ai' ? Sparkles : Copy}
						loading={create.isPending}
						onClick={submit}
					>
						{mode === 'ai' ? 'Generate with AI' : 'Create draft'}
					</Button>
				</>
			}
		>
			<div className="space-y-4">
				<Field label="Category" required>
					<Select
						value={categoryId}
						onChange={(event) => setCategoryId(event.target.value)}
					>
						<option value="">Choose…</option>
						{(categories.data ?? []).map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</Select>
				</Field>

				<div className="grid gap-3 sm:grid-cols-2">
					{[
						{
							value: 'copy',
							icon: Copy,
							title: 'Copy the active version',
							text: 'Start from the current questions and edit them.',
						},
						{
							value: 'ai',
							icon: Bot,
							title: 'Generate with AI',
							text: 'Gemini drafts questions + aspects. Review before activating.',
						},
					].map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => setMode(option.value)}
							className={clsx(
								'flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors',
								mode === option.value
									? 'border-brand bg-brand/8'
									: 'border-line hover:border-line-strong',
							)}
						>
							<option.icon className="size-5 text-brand" />
							<span className="font-semibold text-ink">{option.title}</span>
							<span className="text-xs text-muted">{option.text}</span>
						</button>
					))}
				</div>

				{mode === 'copy' && categoryId && !activeSet && sets.isSuccess && (
					<Callout tone="info">
						This category has no active set yet — the draft starts empty.
					</Callout>
				)}
			</div>
		</Modal>
	);
}

export function AdminQuestionSets() {
	usePageTitle('Question sets');

	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const categoryId = params.get('category') ?? '';

	const categories = useCategories();
	const sets = useAdmin('/admin/question-sets', { categoryId: categoryId || undefined });
	const [creating, setCreating] = useState(false);

	return (
		<>
			<PageHeader
				eyebrow="Admin"
				title="Question sets"
				description="One active, frozen set of questions per category. New versions start as drafts."
				actions={
					<Button icon={ListChecks} onClick={() => setCreating(true)}>
						New draft
					</Button>
				}
			/>

			<div className="mb-4 w-full sm:w-64">
				<Select
					aria-label="Category"
					value={categoryId}
					onChange={(event) =>
						setParams(event.target.value ? { category: event.target.value } : {}, {
							replace: true,
						})
					}
				>
					<option value="">All categories</option>
					{(categories.data ?? []).map((category) => (
						<option key={category.id} value={category.id}>
							{category.name}
							{category.hasActiveSet ? '' : ' (no active set)'}
						</option>
					))}
				</Select>
			</div>

			{sets.isError ? (
				<ErrorState error={sets.error} onRetry={sets.refetch} />
			) : (
				<Table
					head={[
						'Category',
						'Version',
						'Status',
						'Questions',
						'Source',
						'Reports',
						'Created',
					]}
				>
					{sets.isPending ? (
						<SkeletonRows columns={7} />
					) : sets.data.questionSets.length === 0 ? (
						<EmptyRow columns={7} text="No question sets." />
					) : (
						sets.data.questionSets.map((set) => (
							<tr
								key={set.id}
								className="cursor-pointer"
								onClick={() => navigate(`/admin/question-sets/${set.id}`)}
							>
								<Cell className="font-medium text-ink">{set.category_name}</Cell>
								<Cell mono>v{set.version}</Cell>
								<Cell>
									<Badge
										tone={STATUS_TONE[set.status]}
										dot={set.status === 'active'}
									>
										{set.status}
									</Badge>
								</Cell>
								<Cell className="text-muted">
									{set.question_count} questions · {set.aspect_count} aspects
								</Cell>
								<Cell>
									{set.source === 'ai' ? (
										<Badge tone="accent" icon={Sparkles}>
											AI
										</Badge>
									) : (
										<span className="text-sm text-muted">Manual</span>
									)}
								</Cell>
								<Cell className="tabular-nums text-muted">{set.report_count}</Cell>
								<Cell className="text-muted">{timeAgo(set.created_at)}</Cell>
							</tr>
						))
					)}
				</Table>
			)}

			<NewSetModal
				open={creating}
				onClose={() => setCreating(false)}
				defaultCategoryId={categoryId}
			/>
		</>
	);
}

// ─────────────────────────────────────────────────────────────
//  One set
// ─────────────────────────────────────────────────────────────

function QuestionPreview({ questions = [] }) {
	const total = questions.reduce((sum, question) => sum + Number(question.match_weight ?? 0), 0);

	return (
		<div className="space-y-3">
			<p
				className={clsx(
					'text-xs font-semibold',
					Math.abs(total - 1) > 0.05 ? 'text-bad' : 'text-ok',
				)}
			>
				Weights add up to {total.toFixed(2)}{' '}
				{Math.abs(total - 1) > 0.05 ? '(should be ≈ 1.00)' : '✓'}
			</p>

			{questions.map((question, index) => (
				<motion.div
					key={question.key ?? index}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: Math.min(index, 12) * 0.03 }}
					className="rounded-xl border border-line bg-surface-2/40 p-4"
				>
					<div className="flex flex-wrap items-start justify-between gap-2">
						<p className="font-semibold text-ink">{question.text}</p>
						<div className="flex gap-1.5">
							<Badge tone="neutral">{question.type}</Badge>
							<Badge tone="brand">
								w {Number(question.match_weight ?? 0).toFixed(2)}
							</Badge>
						</div>
					</div>
					<p className="mt-0.5 font-mono text-xs text-subtle">
						{question.key}
						{question.canon ? ` · canon: ${question.canon}` : ''}
					</p>
					{question.options?.length > 0 && (
						<div className="mt-2 flex flex-wrap gap-1.5">
							{question.options.map((option) => (
								<span
									key={option.code}
									className="rounded-lg border border-line bg-surface px-2 py-0.5 text-xs text-muted"
								>
									{option.label}
								</span>
							))}
						</div>
					)}
				</motion.div>
			))}
		</div>
	);
}

function AspectPreview({ aspects = [] }) {
	return (
		<div className="space-y-3">
			{aspects.map((aspect) => (
				<div key={aspect.key} className="rounded-xl border border-line bg-surface-2/40 p-4">
					<p className="font-semibold text-ink">{aspect.label}</p>
					<p className="font-mono text-xs text-subtle">{aspect.key}</p>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{(aspect.values ?? []).map((value) => (
							<span
								key={value.code}
								className="rounded-lg border border-line bg-surface px-2 py-0.5 text-xs text-muted"
							>
								{value.label}
							</span>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

function parseJson(text) {
	try {
		const value = JSON.parse(text);

		return Array.isArray(value) ? { value } : { error: 'Must be a JSON array [ … ].' };
	} catch (error) {
		return { error: error.message };
	}
}

export function AdminQuestionSet() {
	usePageTitle('Question set');

	const { id } = useParams();
	const navigate = useNavigate();
	const result = useAdmin(`/admin/question-sets/${id}`);

	const [tab, setTab] = useState('questions');
	const [questionsText, setQuestionsText] = useState('');
	const [aspectsText, setAspectsText] = useState('');
	const [notes, setNotes] = useState('');
	const [dirty, setDirty] = useState(false);
	const [activating, setActivating] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const set = result.data?.questionSet;

	useEffect(() => {
		if (set && !dirty) {
			setQuestionsText(JSON.stringify(set.questions, null, '\t'));
			setAspectsText(JSON.stringify(set.aspects, null, '\t'));
			setNotes(set.notes ?? '');
		}
	}, [set, dirty]);

	const parsedQuestions = useMemo(() => parseJson(questionsText), [questionsText]);
	const parsedAspects = useMemo(() => parseJson(aspectsText), [aspectsText]);

	const save = useAdminAction({
		method: 'put',
		success: 'Draft saved',
		onDone: () => setDirty(false),
	});
	const activate = useAdminAction({
		success: (response) => response?.note ?? 'Activated',
		onDone: () => setActivating(false),
	});
	const remove = useAdminAction({
		method: 'delete',
		success: 'Draft deleted',
		onDone: () => navigate('/admin/question-sets', { replace: true }),
	});

	if (result.isPending) {
		return <PageLoader label="Loading question set…" />;
	}

	if (result.isError) {
		return <ErrorState error={result.error} onRetry={result.refetch} />;
	}

	const isDraft = set.status === 'draft';
	const jsonError = parsedQuestions.error || parsedAspects.error;

	return (
		<>
			<PageHeader
				back={
					<Button
						as={Link}
						to="/admin/question-sets"
						variant="ghost"
						size="sm"
						icon={ArrowLeft}
						className="-ml-3 mb-3"
					>
						Question sets
					</Button>
				}
				eyebrow={`Question set #${set.id}`}
				title={`${set.category_name ?? 'Category'} · v${set.version}`}
				actions={
					<>
						<Badge tone={STATUS_TONE[set.status]} dot>
							{set.status}
						</Badge>
						{isDraft && (
							<>
								<Button
									variant="ghost"
									size="sm"
									icon={Trash2}
									onClick={() => setDeleting(true)}
								>
									Delete
								</Button>
								<Button
									variant="outline"
									icon={Save}
									disabled={!dirty || Boolean(jsonError)}
									loading={save.isPending}
									onClick={() =>
										save.mutate({
											path: `/admin/question-sets/${set.id}`,
											body: {
												questions: parsedQuestions.value,
												aspects: parsedAspects.value,
												notes: notes || undefined,
											},
										})
									}
								>
									Save draft
								</Button>
								<Button
									icon={Zap}
									disabled={dirty}
									onClick={() => setActivating(true)}
								>
									Activate
								</Button>
							</>
						)}
					</>
				}
			/>

			{!isDraft && (
				<Callout tone="info" icon={CheckCircle2} className="mb-6">
					{set.status === 'active'
						? 'This set is active and frozen. To change questions, create a new draft (copy) from the list.'
						: 'This set is retired. Reports made with it keep using it.'}
				</Callout>
			)}

			{dirty && (
				<Callout tone="warn" className="mb-6">
					Unsaved changes — save the draft before activating.
				</Callout>
			)}

			<div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
				<Card title="Preview" icon={ListChecks}>
					<Tabs
						id="qs-preview"
						className="mb-4"
						value={tab}
						onChange={setTab}
						items={[
							{
								value: 'questions',
								label: 'Questions',
								count: parsedQuestions.value?.length,
							},
							{
								value: 'aspects',
								label: 'Follow-up aspects',
								count: parsedAspects.value?.length,
							},
						]}
					/>
					{tab === 'questions' ? (
						parsedQuestions.error ? (
							<p className="text-sm text-bad">{parsedQuestions.error}</p>
						) : (
							<QuestionPreview questions={parsedQuestions.value} />
						)
					) : parsedAspects.error ? (
						<p className="text-sm text-bad">{parsedAspects.error}</p>
					) : (
						<AspectPreview aspects={parsedAspects.value} />
					)}
				</Card>

				<div className="space-y-6">
					<Card title="Details">
						<dl className="grid grid-cols-2 gap-4">
							<Detail label="Source">
								{set.source === 'ai'
									? `AI (${set.ai_model ?? 'Gemini'})`
									: 'Manual'}
							</Detail>
							<Detail label="Created">{formatDateTime(set.created_at)}</Detail>
							<Detail label="Activated">{formatDateTime(set.activated_at)}</Detail>
							<Detail label="Status">{set.status}</Detail>
						</dl>
						<Field label="Notes" className="mt-4">
							<Textarea
								value={notes}
								maxLength={500}
								disabled={!isDraft}
								onChange={(event) => {
									setNotes(event.target.value);
									setDirty(true);
								}}
							/>
						</Field>
					</Card>

					<Card
						title="JSON"
						icon={FileJson}
						description={isDraft ? 'Edit, then save the draft.' : 'Read only.'}
					>
						<div className="space-y-4">
							<Field label="questions" error={parsedQuestions.error}>
								<Textarea
									rows={14}
									spellCheck={false}
									value={questionsText}
									disabled={!isDraft}
									className="font-mono text-xs"
									onChange={(event) => {
										setQuestionsText(event.target.value);
										setDirty(true);
									}}
								/>
							</Field>
							<Field label="aspects" error={parsedAspects.error}>
								<Textarea
									rows={10}
									spellCheck={false}
									value={aspectsText}
									disabled={!isDraft}
									className="font-mono text-xs"
									onChange={(event) => {
										setAspectsText(event.target.value);
										setDirty(true);
									}}
								/>
							</Field>
						</div>
					</Card>
				</div>
			</div>

			<ReasonDialog
				open={activating}
				onClose={() => setActivating(false)}
				loading={activate.isPending}
				title={`Activate v${set.version} for ${set.category_name}?`}
				description="New reports use this version from now on. The current active version is retired; existing reports keep theirs."
				confirmLabel="Activate"
				onConfirm={(reason) =>
					activate.mutate({
						path: `/admin/question-sets/${set.id}/activate`,
						body: { reason },
					})
				}
			/>

			<ConfirmDialog
				open={deleting}
				onClose={() => setDeleting(false)}
				loading={remove.isPending}
				title="Delete this draft?"
				description="Only unused drafts can be deleted."
				confirmLabel="Delete draft"
				onConfirm={() => remove.mutate({ path: `/admin/question-sets/${set.id}` })}
			/>
		</>
	);
}
