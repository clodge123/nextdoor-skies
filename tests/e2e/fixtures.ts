import { expect, test as base, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * L2 harness fixtures — the gate foundation every lane plugs into.
 *
 * - console-error collector: any console error (or uncaught pageerror) fails
 *   the test. Warnings are collected and surfaced in the failure message.
 * - screenshot archiving: archiveScreenshot() writes into
 *   docs/screenshots/<test>/<project>-<name>.png (Gate 1 evidence).
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export type ConsoleBundle = {
  errors: string[];
  warnings: string[];
};

export const test = base.extend<{ consoleBundle: ConsoleBundle }>({
  // auto: true — the collector attaches to EVERY test automatically, even
  // when the test body never requests the fixture (lazy-fixture trap).
  consoleBundle: [
    async ({ page }, use) => {
      const bundle: ConsoleBundle = { errors: [], warnings: [] };

      const attach = (target: Page) => {
        target.on('console', (msg) => {
          const text = `${target === page ? '' : '[worker] '}${msg.type()}: ${msg.text()}`;
          if (msg.type() === 'error') bundle.errors.push(text);
          else if (msg.type() === 'warning') bundle.warnings.push(text);
        });
        target.on('pageerror', (err) => bundle.errors.push(`pageerror: ${err.message}`));
        target.on('websocketerror', (err) => bundle.errors.push(`websocketerror: ${err}`));
      };
      attach(page);
      page.on('popup', attach);

      await use(bundle);

      if (bundle.errors.length > 0) {
        const detail = [...new Set(bundle.errors)].join('\n  ');
        const warnNote =
          bundle.warnings.length > 0
            ? `\nwarnings:\n  ${[...new Set(bundle.warnings)].join('\n  ')}`
            : '';
        expect(
          false,
          `console errors during test (zero-error budget):\n  ${detail}${warnNote}`,
        ).toBeTruthy();
      }
    },
    { auto: true },
  ],
});

/** Archive a full-page screenshot under docs/screenshots/<safe-test-title>/. */
export async function archiveScreenshot(
  page: Page,
  testInfo: { title: string; project?: { name?: string } },
  name: string,
): Promise<string> {
  const safeTest = testInfo.title.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  const dir = join(repoRoot, 'docs', 'screenshots', safeTest);
  mkdirSync(dir, { recursive: true });
  const project = testInfo.project?.name ?? 'default';
  const path = join(dir, `${project}-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

export { expect };
