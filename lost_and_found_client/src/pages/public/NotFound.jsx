/**
 * 404 page + the router's error page (a render crash or a failed lazy chunk).
 */

import { ArrowLeft, PackageSearch, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useRouteError } from 'react-router';

import { Button } from '../../components/ui/Button.jsx';

function Centered({ icon: Icon, title, text, children }) {
	return (
		<div className="grid min-h-[70vh] place-items-center px-6 py-16">
			<div className="flex max-w-md flex-col items-center text-center">
				<motion.div
					initial={{ rotate: -20, scale: 0.6, opacity: 0 }}
					animate={{ rotate: 0, scale: 1, opacity: 1 }}
					transition={{ type: 'spring', stiffness: 200, damping: 12 }}
					className="relative"
				>
					<div
						className="absolute inset-0 rounded-3xl bg-brand/30 blur-2xl"
						aria-hidden
					/>
					<span className="relative grid size-20 place-items-center rounded-3xl bg-gradient-brand text-white animate-float">
						<Icon className="size-9" aria-hidden />
					</span>
				</motion.div>
				<h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
				<p className="mt-2 text-muted">{text}</p>
				<div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>
			</div>
		</div>
	);
}

export function NotFound() {
	return (
		<Centered
			icon={PackageSearch}
			title="This page got lost"
			text="Ironic, we know. Even our AI could not find it."
		>
			<Button as={Link} to="/" icon={ArrowLeft}>
				Back home
			</Button>
		</Centered>
	);
}

export function RouteError() {
	const error = useRouteError();

	// a new deployment replaced the JS chunks while this tab was open
	const chunkFailed =
		/dynamically imported module|Failed to fetch|Importing a module script failed/i.test(
			String(error?.message ?? ''),
		);

	return (
		<div className="min-h-screen bg-canvas">
			<Centered
				icon={RefreshCw}
				title={chunkFailed ? 'SmartFind was updated' : 'Something broke'}
				text={
					chunkFailed
						? 'A newer version is available. Reload the page to continue.'
						: 'An unexpected error happened on this page. Reloading usually fixes it.'
				}
			>
				<Button icon={RefreshCw} onClick={() => window.location.reload()}>
					Reload
				</Button>
				<Button as={Link} to="/" variant="outline" reloadDocument>
					Home
				</Button>
			</Centered>
		</div>
	);
}
