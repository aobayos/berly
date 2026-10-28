import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
	// The packaged app loads dist/index.html over file://, where a root-absolute
	// '/assets/...' resolves to the drive root rather than the asar — leaving a
	// blank window. Must stay relative.
	base: './',
	plugins: [react()],
	// Mirrors "paths" in tsconfig.app.json. Renderer only: the Electron program
	// compiles a few src/ files with plain tsc, which doesn't rewrite aliases.
	resolve: {
		alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
	},
});
