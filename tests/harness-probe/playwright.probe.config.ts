import { defineConfig } from '@playwright/test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Mini config for the harness selftest probe (console-collector negative test). */
export default defineConfig({
  testDir: import.meta.dirname,
  timeout: 20_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:43118' },
  projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `node ${join(repoRoot, 'scripts', 'e2e-serve.mjs')} 43118`,
    url: 'http://127.0.0.1:43118',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
  },
});
