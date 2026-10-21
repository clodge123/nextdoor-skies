# Wave 1 lane briefs (run 2) — all lanes read this + docs/WAVE-1-BRIEF.md + docs/DEFINITION-OF-DONE.md

Common law (every lane):
- Worktree: ~/.openclaw/worktrees/r2/w1-L<n>, branch r2w1/L<n>-<name>. Commit early (≤10 min), then every ≤15 min. 4h cap.
- T0 = 2026-10-20 19:45 CDT. Record ACTIVE minutes per lane in docs/metrics/<lane>.md (started/ended/catches).
- No imports from crypto-weather-central. No Math.random/Date.now/new Date in render/logic (seeded RNG allowed only in seed sim). Zero border-radius (var(--radius)=0px). Free/keyless APIs only.
- Gate 0: tsc/eslint/build exit 0 + vitest green. Gate 1: at least ONE Playwright browser test for your feature, 3 viewports, zero console errors, screenshot archived to docs/screenshots/<lane>/.
- Do NOT deploy. Do NOT touch files owned by other lanes (see ownership). If you need a shared seam, write it under src/lib/<lane>/ and expose an API.
- Commit author: clodge123 <clodge123@users.noreply.github.com>. Push branch to origin via GitHub API (git transport is proxy-blocked; gh api contents/trees/refs works).

L1 SCAFFOLD (src/, package.json root, tsconfig, eslint, vite config, CI)
Vite+React+TS+Router app shell, ESLint/Prettier, vitest config, CI workflow (.github/workflows/ci.yml) running tsc/eslint/build/vitest + determinism scan (grep Math.random|Date.now|new Date in src excluding tests/.test.) + radius scan (grep border-radius: [^v] in src/index.css) + no-CWC import scan. App shell: header nav (Map/Feed), routes / and /feed placeholder pages. Deliver Playwright config too? NO — L2 owns Playwright. L1 adds vitest component test rendering shell.

L2 PLAYWRIGHT-HARNESS (playwright.config.ts, tests/**, .github/workflows/e2e.yml, scripts/e2e-*.mjs)
Playwright day 1: config with 3 projects (phone 390x844, tablet 768x1024, desktop 1280x800), webServer auto-start (vite preview), console-error collector fixture (fail test on console error), screenshot archiving to docs/screenshots/<test>/, golden-path test skeleton (load /, assert h1, click nav). e2e CI job (install browsers, run, upload screenshots). This lane IS the gate foundation — every other lane's Gate 1 test plugs into it.

L3 DEPLOY-PIPELINE (scripts/deploy-preflight.mjs, .vercel/project.json guidance, db/migrate.mjs, db/schema.sql, docs/DEPLOY.md)
Author preflight (git log author email must be valid GitHub email), function-count check (api/**/*.js count ≤12, fail if more), env-var audit (POSTGRES_URL present in production via vercel env ls), migration runner (db/migrate.mjs runs db/schema.sql idempotently; schema.sql: reports(id uuid pk, lat double, lon double, text text, type text, ts timestamptz, author_token_hash text, seeded bool, created_at timestamptz) + comments + flags + reactions + rate_limit tables, CREATE IF NOT EXISTS). Wire "buildCommand"/"installCommand" notes in vercel.json if needed.

L4 DESIGN-TOKENS-THEME (src/index.css, src/lib/theme.ts, src/components/ThemeToggle.tsx)
Design tokens: --bg #0a0a0f dark / #f5f5f2 light, --surface, --text, --border, --accent #00ff9d, --warn, --radius: 0px. data-theme on <html>, localStorage nds-theme, prefers-color-scheme default. Weather accent mapping (setAccent): rain→#38bdf8, storm→#a855f7, snow→#e0f2fe, clear→#00ff9d, heat→#f97316. --current-accent consumed by components. ThemeToggle button (sun/moon, square). Playwright test: setAccent('rain') → --current-accent rgb(56,189,248) visible in computed style; toggle theme flips bg.

L5 MAP-SHELL-GAZETTEER (src/components/MapView.tsx, src/lib/map/*, data/towns/*)
MapLibre GL + OpenFreeMap basemap (https://tiles.openfreemap.org/styles/bright, keyless). Zoom tiers country→state→city→town. GeoNames US towns ≥500 pop: download cities+populated places dump (https://download.geonames.org/export/dump/), filter US ≥500, bake static JSON (data/towns/us-towns.json, tiered by pop), render zoom-graded labels (symbol layers, minzoom per tier). Town-sized borders: skip ZIP polygons this wave (nice-to-have). Laws: production basemap only, fetch-per-window, tile-errors-are-warnings, coord-key debounce. Playwright: map renders (canvas present), zoom-in shows town label, 3 viewports, console clean.

L6 TOWN-WEATHER-BADGES (src/lib/weather/*, src/components/TownBadges.tsx)
Open-Meteo batch API (keyless, POST /v1/batch up to 1000 coords): fetch temps for visible towns (viewport-bounded, ≤1000, throttle per 5-min window NOT per pan), temp-number badges on town labels (HTML overlay divs positioned via map.project, square, --current-accent border). Determinism: fetch cadence via interval, no Date.now in render. Playwright: badge shows a temp number over a town when zoomed; mobile viewport.

L7 SEED-DEMO-INFRA (server/lib/seed.ts, db/seed.sql, scripts/seed.mjs)
Seed-once: on first GET /api/reports (empty table), insert ~30 demo posts spread across US towns (lat/lon on real town coords, varied types rain/storm/snow/clear/heat, honest ts within last 24h of seed time, seeded=true, "Demo data" visible label in UI contract). Migration-safe (INSERT ON CONFLICT DO NOTHING). Comments seeded 1-level per post (3-6 per post). api/probe.js stays until wave close (preflight evidence). Playwright: fresh DB (test uses isolated REPORTS_FILE json fallback, NOT prod Neon) shows seeded posts.

Integration seams (orchestrator resolves at merge): MapView exposes map instance via context; TownBadges consumes it; theme setAccent called by feed/map weather state; CI runs all lane tests in one suite.
