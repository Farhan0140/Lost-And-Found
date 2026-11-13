import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],

	server: {
		port: 5173,
	},

	build: {
		// three.js (~1 MB) is NOT listed here on purpose: it is only reached through the lazy
		// import in LockerScene.jsx, so the bundler already puts it in its own chunk that loads
		// when a page shows the 3D lockers. (A manual "three" chunk made the entry import it.)
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes('node_modules/motion') || id.includes('framer-motion')) {
						return 'motion';
					}

					return undefined;
				},
			},
		},
	},
});
