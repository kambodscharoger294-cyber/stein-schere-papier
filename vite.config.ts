import { defineConfig } from 'vite';

// base './' damit dist/ auf jedem statischen Host (auch Subpfade) läuft
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
  },
});