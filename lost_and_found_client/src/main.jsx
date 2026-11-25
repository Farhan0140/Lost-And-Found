/**
 * Entry point: providers + router.
 *
 *   QueryClientProvider   server data cache (lib/queries.js)
 *   AuthProvider          who is logged in (lib/auth.jsx)
 *   LiveUpdates           live "what changed" stream → refetches at once (lib/live.js)
 *   MotionConfig          respects "reduce motion" in the OS settings
 *   Toaster               toast messages (sonner)
 */

import './styles/index.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';

import { router } from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { LiveUpdates } from './lib/live.js';
import { cleanupOldPhotos } from './lib/photoStore.js';
import { queryClient } from './lib/queries.js';
import { useTheme } from './lib/theme.js';

function ThemedToaster() {
	const { dark } = useTheme();

	return (
		<Toaster
			theme={dark ? 'dark' : 'light'}
			position="top-center"
			richColors
			closeButton
			toastOptions={{ style: { fontFamily: 'var(--font-sans)', borderRadius: '14px' } }}
		/>
	);
}

// Draft photos older than 8 days are removed from this browser.
cleanupOldPhotos();

createRoot(document.getElementById('root')).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<LiveUpdates />
				<MotionConfig reducedMotion="user">
					<RouterProvider router={router} />
					<ThemedToaster />
				</MotionConfig>
			</AuthProvider>
		</QueryClientProvider>
	</StrictMode>,
);
