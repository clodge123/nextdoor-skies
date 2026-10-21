import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Merged wave-1 vitest config: src unit/component tests (L1/L4/L5) +
// tests/** unit tests (L5/L6/L7). Component specs declare jsdom via
// @vitest-environment pragma; env default jsdom keeps node-less libs happy.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
  },
});
