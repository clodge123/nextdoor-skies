# GATE 3 PRODUCTION SMOKE PROTOCOL (L9, wave 1 run 2)

Playwright-driven smoke against the deployed app. NOT curl. Target wall-clock:
**< 5 minutes** per full run (3 viewports × 4 checks ≈ 90–150 s on warm cache).

## Exact commands

From repo root (main tip, after `vercel deploy --prod` succeeds):

```bash
# 1. Full production smoke (default base https://nextdoor-skies-run2.vercel.app)
npm run smoke:prod

# 2. Against a preview URL (e.g. nextdoor-skies-git-<branch>-clodge123.vercel.app)
SMOKE_BASE_URL=https://nextdoor-skies-git-r2w1-L8-integration-clodge123.vercel.app \
  npm run smoke:prod

# 3. Dry run against local preview (NOT production)
npm run build
npm run preview -- --port 4399 --host 127.0.0.1 &
node scripts/smoke-prod.mjs --base-url http://127.0.0.1:4399 \
  --out docs/screenshots/prod-smoke/dryrun
```

Exit code 0 = PASS, 1 = FAIL. Machine-readable verdict:
`docs/screenshots/prod-smoke/smoke-result.json` (`failures` field must be 0).

## What it asserts (per viewport: phone 390x844, tablet 768x1024, desktop 1280x800)

| # | Check | Mechanism |
|---|-------|-----------|
| 1 | `/` loads, map canvas renders | `getByTestId('map-view') canvas` visible; `ndsMap.isStyleLoaded()` true; glyphs from `openfreemap.org`, never `demotiles.maplibre.org` (law #1) |
| 2 | Town labels appear after zoom | `ndsMap.jumpTo(Austin, zoom 12.5)` → `areTilesLoaded()` && `queryRenderedFeatures(layers:['nds-labels-town']).length > 0` |
| 3 | Theme toggle flips bg | click `[data-testid=theme-toggle]` → `body` computed `background-color` changes AND `html[data-theme] ∈ {light,dark}` |
| 4 | `/feed` honest state | heading "Feed" visible; `<main>` text matches `/awaiting feed/i` (wave-1 placeholder — no fabricated posts) |
| — | Console errors | collector on every page fails on ANY app-origin `console.error`/`warning`/`pageerror`. Documented exclusions (mirror of `tests/map.spec.ts`): `GL Driver Message`, maplibre style-spec `Expected value to be of type ... null` noise from parsing the THIRD-PARTY OpenFreeMap style. |

Screenshots archived to `docs/screenshots/prod-smoke/<project>-<page>.png`
(`-map`, `-map-zoom`, `-map-theme`, `-feed`; `-<check>-FAILED.png` on failure).
All runs must be committed into the tree (`git add -f docs/screenshots/...` —
the dir is gitignored, add with `-f` like L6/L7 evidence).

## Pass criteria

`smoke-result.json` has `"failures": 0` **and** all 12 screenshots (3 viewports ×
4 pages) present, non-empty, and committed. Any console error, any missing
canvas, any zero-label zoom result, any `/feed` text that is not the honest
placeholder = FAIL.

## Fix-loop rule (Gate 3 law)

Any defect found: **fix → redeploy → re-smoke**, max **3 loops**. After loop 3,
escalate to owner — do not ship, do not loop further. One loop = one coherent
fix commit to main + one `vercel deploy --prod` + one full `npm run smoke:prod`.

## Host-environment notes

- Browser launches with `args: ['--no-proxy-server']` and node side gets
  `NO_PROXY='*'` (set inside the script). This host's authenticating egress
  proxy 407s loopback traffic; browsers must go direct. Direct public egress
  (vercel.app, tiles.openfreemap.org) is proven working.
- Tile request failures are warnings (law #4) — counted by the app, never
  flips UI; smoke asserts canvas + labels, not tile HTTP codes.
- R17 determinism: script contains no `Math.random` / `Date.now` / `new Date`.

## Known dry-run finding (2026-10-20, run 2)

Dry run against local preview passes check 4 (feed, all viewports, zero console
errors) and correctly FAILS checks 1–3: on main tip `src/pages/MapPage.tsx` is
still the "Awaiting map shell" placeholder and `ThemeToggle` is not mounted in
the shell. The kit is proven working (it catches exactly the defects Gate 3
exists to catch); production smoke will PASS only once the integration lane
mounts MapView + ThemeToggle. This is NOT a smoke-kit defect.
