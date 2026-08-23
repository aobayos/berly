import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // The packaged app loads dist/index.html over file://, where a root-absolute
  // '/assets/...' resolves to the drive root rather than the asar — leaving a
  // blank window. Must stay relative.
  base: './',
  plugins: [react()],
})
