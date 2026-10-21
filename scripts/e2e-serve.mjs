#!/usr/bin/env node
/**
 * L2 harness web server (L12 wiring update): builds BOTH the real app (root
 * vite project) and the L2 fixtures app, then serves them via `vite preview`:
 *
 *   - real app    on <port>     (default target; map/badges specs hit '/')
 *   - fixtures    on <port>+1   (golden-path harness content lives here)
 *
 * Rationale: wave 1 lanes wrote specs against the fixtures stand-in while the
 * real shell was a placeholder. L12 mounts the real MapView, so '/' must be
 * the real app; golden-path keeps asserting fixtures content on its own port.
 *
 * E2E_TARGET=fixtures keeps the legacy fixtures-only mode (app skipped);
 * E2E_TARGET=test-app keeps the L6 test-app bundle. Default = dual serve.
 *
 * Usage: node scripts/e2e-serve.mjs <port>
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] ?? 4173);
if (!Number.isInteger(port) || port <= 0) {
  console.error('e2e-serve: pass a valid port as first argument');
  process.exit(1);
}

const mode = process.env.E2E_TARGET ?? 'dual';

const viteBin = join(repoRoot, '.e2e', 'node_modules', '.bin', 'vite');
if (!existsSync(viteBin)) {
  console.error('e2e-serve: vite not found in .e2e. Run: node scripts/e2e-setup.mjs');
  process.exit(1);
}

const configs = {
  app: join(repoRoot, 'vite.config.ts'),
  fixtures: join(repoRoot, 'tests', 'fixtures', 'vite.config.ts'),
  'test-app': join(repoRoot, 'vite.config.test-app.ts'),
};

function run(cmd, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: repoRoot });
    child.on('exit', (code) =>
      code === 0 ? resolveRun() : rejectRun(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    );
    child.on('error', rejectRun);
  });
}

const servers = [];

async function serve(target, targetPort) {
  const config = configs[target];
  if (!config) {
    console.error(`e2e-serve: unknown target ${target}`);
    process.exit(1);
  }
  console.log(`[e2e-serve] target=${target} port=${targetPort} config=${config}`);
  try {
    await run(viteBin, ['build', '-c', config]);
  } catch (err) {
    console.error('[e2e-serve] build failed:', err.message);
    process.exit(1);
  }
  const preview = spawn(viteBin, ['preview', '-c', config, '--port', String(targetPort), '--host', '127.0.0.1'], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
  preview.on('exit', (code) => process.exit(code ?? 0));
  servers.push(preview);
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) throw new Error(`e2e-serve: ${url} never answered 200`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

if (mode === 'fixtures') {
  await serve('fixtures', port);
} else if (mode === 'test-app') {
  await serve('test-app', port);
} else {
  // Dual serve: real app owns the main port, fixtures live on port+1.
  // Build both first, then start both previews — golden-path specs hit
  // port+1, so it must be listening before the runner launches browsers.
  await serve('app', port);
  await serve('fixtures', port + 1);
  await waitForHttp(`http://127.0.0.1:${port + 1}/`, 30_000);
}

process.on('SIGINT', () => servers.forEach((s) => s.kill('SIGINT')));
process.on('SIGTERM', () => servers.forEach((s) => s.kill('SIGTERM')));
