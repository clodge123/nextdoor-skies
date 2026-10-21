import { defineConfig, devices } from '@playwright/test';

/**
 * Wave 1 merged Playwright harness (L2 foundation + L4/L6/L7 lane specs).
 *
 * Three viewport projects (R13): phone 390x844, tablet 768x1024, desktop
 * 1280x800. webServer auto-starts scripts/e2e-serve.mjs, which builds the
 * real app (root vite project) and serves it via `vite preview` on the
 * requested port. Self-contained specs (theme/badges/seed) bundle their own
 * page content and need no server routes.
 *
 * --no-proxy-server: this host routes through an egress proxy that 407s
 * local loopback traffic; browsers must talk direct.
 *
 * Everything is deterministic: no Math.random / Date.now / new Date.
 */

const PORT = Number(process.env.E2E_PORT ?? 43117);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// This host egresses through an authenticating HTTP proxy (NODE_USE_ENV_PROXY=1,
// HTTP(S)_PROXY set). Node 24's fetch — used by Playwright's webServer
// health-check — honors those env proxies, so a loopback GET / gets intercepted
// and dies with "Host in options.headers must match the request authority".
// Keep every loopback address off the proxy for this whole process (the runner
// performs the health-check, not the webServer child).
const LOOPBACK_NO_PROXY = '127.0.0.1,localhost,::1';
function mergeNoProxy(existing: string | undefined): string {
  const parts = (existing ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  for (const host of LOOPBACK_NO_PROXY.split(',')) if (!parts.includes(host)) parts.push(host);
  return parts.join(',');
}
for (const key of ['NO_PROXY', 'no_proxy']) {
  process.env[key] = mergeNoProxy(process.env[key]);
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  // L2 selftest probe runs in its own process (scripts/e2e-selftest.mjs) and
  // is DESIGNED to fail (proves the console collector gates) — never in the
  // main suite.
  testIgnore: '**/harness-probe/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    launchOptions: { args: ['--no-proxy-server'] },
  },
  projects: [
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        // L12: isMobile defaults dpr=2, which doubles every tile request.
        // The map spec relays tiles node-side through the host proxy, so
        // dpr 2 starves the settle window. dpr 1 keeps viewport + touch
        // semantics and makes tile settling deterministic on this host.
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `node scripts/e2e-serve.mjs ${PORT}`,
    url: BASE_URL,
    // Node 24 honors env proxies; keep the localhost health-check off the egress proxy.
    env: { NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
