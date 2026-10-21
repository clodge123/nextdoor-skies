import { defineConfig } from 'vite';

// L2 harness fixtures target: built and previewed by scripts/e2e-serve.mjs.
// SPA appType gives history fallback so /feed resolves under `vite preview`.
export default defineConfig({
  root: import.meta.dirname,
  base: '/',
  appType: 'spa',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
