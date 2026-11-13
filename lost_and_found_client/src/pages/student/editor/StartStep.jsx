/**
 * Step 1 — photos or manual.
 *
 *   Photos: 2–5 photos → resized + metadata removed in the browser → the AI picks the
 *           category and pre-fills the answers. Photos are kept ONLY in this browser
 *           (IndexedDB) so the follow-up step can use them too.
 *   Manual: pick a category and answer everything yourself.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
	ArrowLeft,
	Camera,
	ImagePlus,
	ListChecks,
	RefreshCw,
	ScanSearch,
	ShieldCheck,
	Sparkles,
	Trash2,
	TriangleAlert,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { AiScanner } from '../../../components/AiScanner.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Callout } from '../../../components/ui/Feedback.jsx';
import { Select } from '../../../components/ui/Form.jsx';
import { api, ApiError } from '../../../lib/api.js';
import { percent } from '../../../lib/format.js';
import { IMAGE_ROLES, preparePhoto, toApiImages } from '../../../lib/images.js';
import { savePhotos } from '../../../lib/photoStore.js';
import { keys, useRules } from '../../../lib/queries.js';
import { CategoryGrid } from './CategoryGrid.jsx';

// ─────────────────────────────────────────────────────────────
//  Path chooser
// ─────────────────────────────────────────────────────────────

function PathCard({ icon: Icon, title, text, badge, onClick, highlight }) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileHover={{ y: -4 }}
			whileTap={{ scale: 0.98 }}
			className={clsx(
				'group relative flex flex-col items-start gap-3 overflow-hidden rounded-3xl border bg-surface p-6 text-left shadow-card transition-colors',
				highlight ? 'border-brand/50' : 'border-line hover:border-brand/40',
			)}
		>
			{highlight && (
				<div
					aria-hidden
					className="absolute -right-12 -top-12 size-40 rounded-full bg-brand/20 blur-3xl"
				/>
			)}

			<span
				className={clsx(
					'relative grid size-12 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6',
					highlight ? 'bg-gradient-brand text-white' : 'bg-surface-2 text-brand',
				)}
			>
				<Icon className="size-6" aria-hidden />
			</span>

			<div className="relative">
				<p className="flex items-center gap-2 text-lg font-bold text-ink">
					{title}
					{badge && (
						<span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
							{badge}
						</span>
					)}
				</p>
				<p className="mt-1 text-sm text-muted">{text}</p>
			</div>
		</motion.button>
	);
}

// ─────────────────────────────────────────────────────────────
//  Photo picker
// ─────────────────────────────────────────────────────────────

function PhotoTile({ photo, index, onRole, onRemove, disabled }) {
	return (
		<motion.div
			layout
			initial={{ opacity: 0, scale: 0.85, rotate: -3 }}
			animate={{ opacity: 1, scale: 1, rotate: 0 }}
			exit={{ opacity: 0, scale: 0.8 }}
			transition={{ type: 'spring', stiffness: 260, damping: 22 }}
			className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
		>
			<div className="relative aspect-square overflow-hidden bg-surface-2">
				<img
					src={photo.previewUrl}
					alt={`Photo ${index + 1}`}
					className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
				/>

				<span className="absolute left-2 top-2 rounded-lg bg-black/55 px-2 py-0.5 font-mono text-xs text-white backdrop-blur">
					{index + 1}
				</span>

				<button
					type="button"
					onClick={onRemove}
					disabled={disabled}
					aria-label={`Remove photo ${index + 1}`}
					className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur transition-opacity hover:bg-bad group-hover:opacity-100 focus:opacity-100"
				>
					<Trash2 className="size-4" />
				</button>
			</div>

			<div className="p-2">
				<Select
					aria-label={`What photo ${index + 1} shows`}
					value={photo.role}
					disabled={disabled}
					onChange={(event) => onRole(event.target.value)}
					className="h-9 text-xs"
				>
					{IMAGE_ROLES.map((role) => (
						<option key={role.value} value={role.value}>
							{role.label}
						</option>
					))}
				</Select>
			</div>
		</motion.div>
	);
}

function PhotoPath({ report, photos, setPhotos, onExtracted, onBack }) {
	const queryClient = useQueryClient();
	const input = useRef(null);
	const { data: rules } = useRules();

	const minPhotos = rules?.minPhotos ?? 2;
	const maxPhotos = rules?.maxPhotos ?? 5;

	const [preparing, setPreparing] = useState(false);
	const [dragging, setDragging] = useState(false);

	const updatePhotos = (next) => {
		setPhotos(next);
		savePhotos(report.id, next);
	};

	const addFiles = async (fileList) => {
		const files = [...fileList].slice(0, maxPhotos - photos.length);

		if (fileList.length > files.length) {
			toast.info(`At most ${maxPhotos} photos — the extra ones were skipped.`);
		}

		if (files.length === 0) {
			return;
		}

		setPreparing(true);

		const added = [];

		for (const file of files) {
			try {
				// first photo = the whole item, the rest = details (the user can change it)
				const role = photos.length + added.length === 0 ? 'overview' : 'detail';

				added.push(await preparePhoto(file, role));
			} catch (error) {
				toast.error(error.message);
			}
		}

		setPreparing(false);
		updatePhotos([...photos, ...added]);
	};

	const extract = useMutation({
		mutationFn: async () => {
			await savePhotos(report.id, photos);

			return api.post(`/reports/${report.id}/extract`, { images: toApiImages(photos) });
		},
		onSuccess: ({ report: updated }) => {
			queryClient.setQueryData(keys.report(report.id), updated);

			const confidence = updated.extraction?.confidence;

			toast.success(
				`Looks like ${updated.category?.name ?? 'your item'}` +
					(confidence ? ` (${percent(confidence)} sure)` : '') +
					' — please check the answers.',
			);

			onExtracted();
		},
		onError: (error) => {
			if (error instanceof ApiError && error.code === 'AI_UNAVAILABLE') {
				queryClient.invalidateQueries({ queryKey: keys.report(report.id) });
			}
		},
	});

	const aiDown = extract.error instanceof ApiError && extract.error.code === 'AI_UNAVAILABLE';

	// ── AI is reading the photos ──
	if (extract.isPending) {
		return (
			<div className="mx-auto max-w-2xl py-4">
				<div className="mb-6 text-center">
					<p className="text-lg font-bold text-ink">Reading your photos…</p>
					<p className="mt-1 text-sm text-muted">
						This usually takes 5–20 seconds. Please keep this page open.
					</p>
				</div>
				<AiScanner photos={photos} active />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-bold text-ink">Add photos</h2>
					<p className="text-sm text-muted">
						{minPhotos}–{maxPhotos} photos: the whole item, then close-ups of anything
						special (logo, stickers, scratches).
					</p>
				</div>

				<Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
					Choose another way
				</Button>
			</div>

			{/* ── drop zone ── */}
			{photos.length < maxPhotos && (
				<motion.button
					type="button"
					onClick={() => input.current?.click()}
					onDragOver={(event) => {
						event.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(event) => {
						event.preventDefault();
						setDragging(false);
						addFiles(event.dataTransfer.files);
					}}
					animate={{ scale: dragging ? 1.02 : 1 }}
					className={clsx(
						'group relative flex w-full flex-col items-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors',
						dragging
							? 'border-brand bg-brand/8'
							: 'border-line-strong hover:border-brand/60 hover:bg-surface-2/40',
					)}
				>
					<div className="absolute inset-0 bg-grid opacity-40" aria-hidden />

					<span className="relative grid size-16 place-items-center rounded-2xl bg-gradient-brand text-white shadow-[0_10px_30px_-10px_var(--glow)] transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-3">
						{preparing ? (
							<RefreshCw className="size-7 animate-spin" />
						) : (
							<ImagePlus className="size-7" />
						)}
					</span>

					<span className="relative font-semibold text-ink">
						{preparing ? 'Preparing photos…' : 'Tap to take or choose photos'}
					</span>
					<span className="relative text-sm text-muted">
						or drop them here · {photos.length}/{maxPhotos} added
					</span>

					<input
						ref={input}
						type="file"
						accept="image/*"
						multiple
						hidden
						onChange={(event) => {
							addFiles(event.target.files);
							event.target.value = '';
						}}
					/>
				</motion.button>
			)}

			{/* ── chosen photos ── */}
			{photos.length > 0 && (
				<motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
					<AnimatePresence mode="popLayout">
						{photos.map((photo, index) => (
							<PhotoTile
								key={photo.id}
								photo={photo}
								index={index}
								onRole={(role) =>
									updatePhotos(
										photos.map((item) =>
											item.id === photo.id ? { ...item, role } : item,
										),
									)
								}
								onRemove={() =>
									updatePhotos(photos.filter((item) => item.id !== photo.id))
								}
							/>
						))}
					</AnimatePresence>
				</motion.div>
			)}

			<p className="flex items-start gap-2 text-xs text-subtle">
				<ShieldCheck className="mt-px size-4 shrink-0 text-ok" aria-hidden />
				Photos are shrunk and stripped of location data on your device. They are sent to the
				AI only to read the item and are never stored on SmartFind servers.
			</p>

			{aiDown && (
				<Callout
					tone="warn"
					icon={TriangleAlert}
					title="The AI is taking a short break"
					action={
						<Button
							size="sm"
							variant="outline"
							icon={RefreshCw}
							onClick={() => extract.mutate()}
						>
							Try again
						</Button>
					}
				>
					Your draft and photos are saved on this device. Try again in a minute, or go
					back and answer the questions yourself.
				</Callout>
			)}

			{extract.isError && !aiDown && (
				<Callout tone="bad" icon={TriangleAlert} title="Could not read the photos">
					{extract.error.message}
				</Callout>
			)}

			<div className="flex justify-end">
				<Button
					size="lg"
					icon={ScanSearch}
					disabled={photos.length < minPhotos || preparing}
					onClick={() => extract.mutate()}
				>
					{photos.length < minPhotos
						? `Add ${minPhotos - photos.length} more photo${minPhotos - photos.length === 1 ? '' : 's'}`
						: 'Read my photos'}
				</Button>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  Manual path
// ─────────────────────────────────────────────────────────────

function ManualPath({ report, onPickCategory, busyId, onBack }) {
	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-bold text-ink">What kind of item is it?</h2>
					<p className="text-sm text-muted">
						Pick the closest category — the questions depend on it.
					</p>
				</div>

				<Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
					Choose another way
				</Button>
			</div>

			<CategoryGrid
				selectedId={report.category?.id}
				busyId={busyId}
				disabled={Boolean(busyId)}
				onSelect={onPickCategory}
			/>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
//  The step
// ─────────────────────────────────────────────────────────────

export function StartStep({
	report,
	photos,
	setPhotos,
	onExtracted,
	onPickCategory,
	pickingCategoryId,
}) {
	// the path the user is looking at (the report's own path is saved only once used)
	const [mode, setMode] = useState(report.path ?? (photos.length > 0 ? 'photo' : null));

	return (
		<AnimatePresence mode="wait">
			<motion.div
				key={mode ?? 'choose'}
				initial={{ opacity: 0, x: 24 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: -24 }}
				transition={{ duration: 0.25 }}
			>
				{mode === null && (
					<div className="space-y-5">
						<div>
							<h2 className="text-lg font-bold text-ink">
								How do you want to describe it?
							</h2>
							<p className="text-sm text-muted">
								Both ways end with the same short list of questions.
							</p>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<PathCard
								icon={Camera}
								title="With photos"
								badge="Fastest"
								highlight
								text={
									report.kind === 'found'
										? 'Snap 2–5 photos. The AI recognises the item and answers most questions for you.'
										: 'Have photos of your item? The AI reads them and fills in the answers.'
								}
								onClick={() => setMode('photo')}
							/>
							<PathCard
								icon={ListChecks}
								title="Answer myself"
								text="Pick a category and tap through the questions. Works without the AI."
								onClick={() => setMode('manual')}
							/>
						</div>

						<p className="flex items-center gap-2 text-xs text-subtle">
							<Sparkles className="size-3.5 text-accent" aria-hidden />
							The AI only suggests — you check and correct every answer before
							submitting.
						</p>
					</div>
				)}

				{mode === 'photo' && (
					<PhotoPath
						report={report}
						photos={photos}
						setPhotos={setPhotos}
						onExtracted={onExtracted}
						onBack={() => setMode(null)}
					/>
				)}

				{mode === 'manual' && (
					<ManualPath
						report={report}
						busyId={pickingCategoryId}
						onPickCategory={onPickCategory}
						onBack={() => setMode(null)}
					/>
				)}
			</motion.div>
		</AnimatePresence>
	);
}
