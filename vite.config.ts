import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' lets the built app run from any folder or a GitHub Pages sub-path.
export default defineConfig({
  plugins: [react()],
  base: './',
});
