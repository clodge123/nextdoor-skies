# L2 PLAYWRIGHT-HARNESS — metrics (run 2, wave 1)

Lane: L2 | Branch: r2w1/L2-playwright | Owner lane: gate foundation

## ACTIVE minutes (active-time-only accounting, R18)

| started (CDT) | ended (CDT) | active min | what | catches |
|---|---|---|---|---|
| 2026-10-20 20:02 | 2026-10-20 20:47 | 45 | harness build: config, fixtures app, collector fixture, golden path, CI, selftest | 5 (below) |

Total active: **45 min** (idle gaps excluded).

## Gate counters

| gate | result | evidence |
|---|---|---|
| Gate 0 (lane code) | ✅ PASS | harness runs green locally: `npm run test:e2e` → 6/6 passed (12.6s) |
| Gate 1 (browser) | ✅ PASS | golden path ×3 viewports (phone 390×844 / tablet 768×1024 / desktop 1280×800), zero console errors, 6 screenshots archived to docs/screenshots/loads_home_asserts_heading_navigates_to_feed/ |
| Console collector selftest | ✅ PASS | scripts/e2e-selftest.mjs: probe page logging console.error correctly FAILS (proves collector gates every lane) |
| e2e CI job | ✅ written | .github/workflows/e2e.yml (setup→selftest→run→upload screenshots) |

## Catches

1. Root package.json is base64-encoded in-tree (git-transport convention) → node/npm can't parse it. Fix: decoded valid JSON in tree (L1's fields preserved verbatim) + valid-JSON shield package.json files in tests/e2e, scripts/, tests/harness-probe.
2. npm cannot install into repo root (invalid root package.json at the time) → isolated `.e2e/` deps dir; root node_modules is a symlink to it. L1's package.json untouched by installs.
3. Node 24 env-proxy (NODE_USE_ENV_PROXY) hijacked localhost health-checks ("Host must match request authority") → NO_PROXY=127.0.0.1,localhost injected in e2e-run.mjs + configs.
4. Port 4173 squatted by a foreign app on this host (vite preview default silently proxied to it) → harness uses dedicated port 43117 (probe: 43118), reuseExistingServer:false.
5. Console collector initially lazy (only fired when fixture requested) → made `auto: true`; negative selftest proves it fires on every test.

## Files delivered

playwright.config.ts · tests/e2e/fixtures.ts (console collector + archiveScreenshot) · tests/e2e/golden-path.spec.ts · tests/fixtures/* (self-sufficient mini app: index.html, router.js, vite.config.ts) · tests/harness-probe/* (negative selftest) · scripts/e2e-{setup,serve,run,selftest}.mjs · .github/workflows/e2e.yml · package.json scripts (e2e:setup/e2e:selftest/test:e2e) · docs/metrics/L2-playwright.md
