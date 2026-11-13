/**
 * Grid of item categories (manual path, or "wrong category?" on the answers step).
 *
 *     <CategoryGrid selectedId={report.category?.id} onSelect={(category) => …} busyId={…} />
 */

import clsx from 'clsx';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';

import { ErrorState, Skeleton } from '../../../components/ui/Feedback.jsx';
import { useCategories } from '../../../lib/queries.js';
import { categoryIcon } from '../../../lib/statuses.js';

export function CategoryGrid({ selectedId, onSelect, busyId, disabled }) {
	const categories = useCategories();

	if (categories.isError) {
		return <ErrorState error={categories.error} onRetry={categories.refetch} />;
	}

	if (categories.isPending) {
		return (
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				{Array.from({ length: 8 }, (_, index) => (
					<Skeleton key={index} className="h-28 rounded-2xl" />
				))}
			</div>
		);
	}

	// only categories that have an active question set can be used
	const usable = categories.data.filter((category) => category.hasActiveSet);

	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
			{usable.map((category, index) => {
				const Icon = categoryIcon(category.icon);
				const selected = category.id === selectedId;
				const busy = category.id === busyId;

				return (
					<motion.button
						key={category.id}
						type="button"
						disabled={disabled}
						onClick={() => onSelect(category)}
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: Math.min(index, 12) * 0.03 }}
						whileHover={{ y: -4, rotateX: 6 }}
						whileTap={{ scale: 0.96 }}
						className={clsx(
							'group relative flex flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-colors [transform-style:preserve-3d] disabled:cursor-wait',
							selected
								? 'border-brand bg-brand/10 shadow-[0_12px_30px_-16px_var(--glow)]'
								: 'border-line bg-surface hover:border-brand/40',
						)}
					>
						{selected && (
							<span className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-brand text-white">
								<Check className="size-3" strokeWidth={3} />
							</span>
						)}

						<span
							className={clsx(
								'grid size-12 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6',
								selected
									? 'bg-gradient-brand text-white'
									: 'bg-brand-soft text-brand',
								busy && 'animate-pulse',
							)}
						>
							<Icon className="size-6" aria-hidden />
						</span>

						<span className="text-sm font-semibold text-ink">{category.name}</span>
					</motion.button>
				);
			})}
		</div>
	);
}
