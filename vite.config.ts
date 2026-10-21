import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Merged wave-1 config (L1 shell + L5 build + L2 preview ports).
// Vitest config lives in vitest.config.ts.
export default defineConfig({
  plugins: [react()],
  server: { port: 5176 },
  preview: { strictPort: true },
  build: { sourcemap: true },
});
