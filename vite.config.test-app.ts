import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * L6 Gate 1 harness target: builds test-app/index.html -> src/test-app/main.tsx
 * (deterministic map stub + TownBadges overlay) so tests/badges.spec.ts can
 * drive zoom deterministically. Selected via E2E_TARGET=test-app in
 * scripts/e2e-serve.mjs.
 *
 * JSX is transformed by esbuild (the .e2e toolchain has no @vitejs/plugin-react;
 * esbuild honours tsconfig's "jsx": "react-jsx", so no plugin is needed).
 */
export default defineConfig({
  root: fileURLToPath(new URL('./test-app', import.meta.url)),
  base: '/',
  appType: 'spa',
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1', strictPort: true },
});
