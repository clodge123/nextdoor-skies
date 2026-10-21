// L4 Gate 1 browser test (R12/R20). Self-contained: bundles the real
// src/lib/theme.ts + src/components/ThemeToggle.tsx via the esbuild CLI and
// serves them in a real Chromium page — no dependency on L1/L2 harnesses.
// Asserts: window.__ndsSetAccent('rain') -> --current-accent rgb(56,189,248);
// theme toggle flips page background; zero console errors.
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SHOT_DIR = join(process.cwd(), 'docs', 'screenshots', 'L4-theme');
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Lane-root discovery (CJS/ESM safe): explicit env override, then walk up
// from __dirname/cwd to the dir containing src/index.css.
const HERE = typeof __dirname === 'string' ? __dirname : process.cwd();
let ROOT = process.env.NDS_LANE_ROOT ?? HERE;
if (!existsSync(path.join(ROOT, 'src', 'index.css'))) {
  ROOT = HERE;
  while (!existsSync(path.join(ROOT, 'src', 'index.css')) && ROOT !== path.parse(ROOT).root) {
    ROOT = path.dirname(ROOT);
  }
}

const css = readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

// Find the harness node_modules (contains esbuild + react) by walking up.
let gateDir = HERE;
while (!existsSync(path.join(gateDir, 'node_modules', 'esbuild', 'bin', 'esbuild')) && gateDir !== path.parse(gateDir).root) {
  gateDir = path.dirname(gateDir);
}
const esbuildBin = path.join(gateDir, 'node_modules', 'esbuild', 'bin', 'esbuild');
// Entry lives under gateDir so esbuild resolves react/react-dom from its node_modules.
const tmp = mkdtempSync(path.join(gateDir, '.l4-tmp-'));
// Mirror src into the harness so esbuild walks a valid package.json (the repo
// root package.json is intentionally base64-encoded and unparseable by bundlers).
cpSync(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
writeFileSync(path.join(tmp, 'package.json'), '{"name":"nds-l4-probe","private":true}');
const entry = path.join(tmp, 'entry.tsx');
writeFileSync(
  entry,
  `import { createRoot } from 'react-dom/client';
import { ThemeToggle } from './src/components/ThemeToggle';
import { initTheme } from './src/lib/theme';
initTheme();
createRoot(document.getElementById('root')!).render(<ThemeToggle />);
`,
);
execFileSync(esbuildBin, [
  entry,
  '--bundle',
  '--format=iife',
  '--platform=browser',
  '--jsx=automatic',
  '--define:process.env.NODE_ENV="development"',
  '--loader:.css=empty',
  '--outfile=' + path.join(tmp, 'bundle.js'),
]);
const bundle = readFileSync(path.join(tmp, 'bundle.js'), 'utf8');

const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>nextdoor-skies theme probe</title><style>${css}</style></head>
<body><div id="root"></div><script>${bundle}</script></body>
</html>`;

test.describe('weather accent + theme toggle (L4)', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    // Deterministic starting point: dark prefers-color-scheme (initTheme default).
    await page.emulateMedia({ colorScheme: 'dark' });
    // Serve from a real origin so localStorage works (setContent is opaque origin).
    await page.route('http://localhost:8123/**', (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    await page.goto('http://localhost:8123/theme', { waitUntil: 'load' });
    expect(consoleErrors).toEqual([]);
  });

  test('window.__ndsSetAccent("rain") sets --current-accent to rgb(56,189,248)', async ({ page }, testInfo) => {
    await page.waitForFunction(() => typeof (window as unknown as Record<string, unknown>).__ndsSetAccent === 'function');

    const rgb = await page.evaluate(() => {
      (window as unknown as { __ndsSetAccent: (w: string) => void }).__ndsSetAccent('rain');
      const probe = document.createElement('span');
      probe.style.color = 'var(--current-accent)';
      document.body.appendChild(probe);
      return getComputedStyle(probe).color;
    });
    expect(rgb).toBe('rgb(56, 189, 248)');

    // the toggle itself inherits the accent (it is visible, not just a var)
    const toggleColor = await page
      .locator('[data-testid="theme-toggle"]')
      .evaluate((el: Element) => getComputedStyle(el).color);
    expect(toggleColor).toBe('rgb(56, 189, 248)');
  });

  test('accent mapping covers all five weather conditions', async ({ page }, testInfo) => {
    const map: Record<string, string> = {
      rain: 'rgb(56, 189, 248)',
      storm: 'rgb(168, 85, 247)',
      snow: 'rgb(224, 242, 254)',
      clear: 'rgb(0, 255, 157)',
      heat: 'rgb(249, 115, 22)',
    };
    for (const [weather, rgb] of Object.entries(map)) {
      const got = await page.evaluate((w: string) => {
        (window as unknown as { __ndsSetAccent: (w: string) => void }).__ndsSetAccent(w);
        const probe = document.createElement('span');
        probe.style.color = 'var(--current-accent)';
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      }, weather);
      expect(got, weather).toBe(rgb);
    }
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(SHOT_DIR, `accent-${testInfo.project.name}.png`) });
  });

  test('toggle flips page background dark -> light and persists', async ({ page }) => {
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(dark).toBe('rgb(10, 10, 15)');

    await page.locator('[data-testid="theme-toggle"]').click();

    // body has a 120ms bg transition; wait for the final light value.
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(245, 245, 242)');
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(light).toBe('rgb(245, 245, 242)');
    expect(await page.evaluate(() => localStorage.getItem('nds-theme'))).toBe('light');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light');
  });
});
