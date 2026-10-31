# Nextdoor Skies

A neighborhood weather app: a live map of real towns, real temperatures, and
the people talking about the weather around them. Built to be honest — every
badge on the map shows measured data, and where there's no data, the map says
so by showing nothing.

**Live demo:** https://nextdoor-skies-run2.vercel.app
**Source:** github.com/clodge123/nextdoor-skies (Run 2)
Run 1 history: github.com/clodge123/nextdoor-skies-run1 (archived)

## What you can do

- **Explore the map** — town badges show current temperature and conditions,
  with a sky tint driven by the actual weather. Click a badge (or its label)
  to open the town panel; drag anywhere, including over badges, to pan.
- **Search any town** — type a town name in the header; the map flies to it
  and opens its panel. URLs stay shareable (`/?panel=springfield-37.22--93.3`).
- **Read the neighborhood feed** — `/feed` with Hot (engagement-ranked),
  New (recency), and Global views. Posts carry reactions, replies, and flags.
- **Track alerts** — `/alerts` lists active weather alerts by severity,
  grouped by town, with per-town mute.
- **Snapshots** — posts can attach a map snapshot: a real render of the town's
  geography, burned in with attribution.
- **Command palette** — `Ctrl/Cmd+K` to jump to any town, switch theme, open
  feed/alerts. First visit gets a guided tour.
- **Comforts** — dark/light theme, °F/°C toggle, mobile-first touch targets
  (≥44px), keyboard-accessible controls.

The app ships seeded demo towns (Springfield MO, Salina KS, Amarillo TX,
Flagstaff AZ, Santa Fe NM) with posts, reactions, and alerts so the feed is
alive on first visit.

## Running it locally

Requires Node 22.x.

```bash
git clone https://github.com/clodge123/nextdoor-skies.git
cd nextdoor-skies
npm install
npm run dev        # http://localhost:5173
```

Environment variables (all optional for local dev): `DATABASE_URL` (Postgres;
falls back to an in-memory store), `NDS_ADMIN_SECRET` (enables admin API routes).

## Verifying it yourself

The project's central promise: **nothing ships on an agent's say-so.** Every
claim is backed by executable gates.

```bash
npm run typecheck          # tsc -b
npm test                   # vitest — 584 unit tests, ~20 s
npm run check:all          # determinism / corner-radius / import hygiene scans
npx playwright test        # 220 browser tests, phone + tablet + desktop (~46 min)
npm run smoke:prod         # probe the deployed app matches local behavior
```

Browser tests assert the app's visual laws as measurements: touch targets
≥ 44px, square corners, badge boxes never covering town labels, drag-over-a-
badge pans the map, missing weather data renders no badge.

## How it's built

React 19 + TypeScript + Vite, MapLibre GL for maps, Open-Meteo for weather,
serverless API routes (Vercel) over Postgres. The codebase was written by a
fleet of parallel AI coding agents working in isolated git worktrees, merged
through the gate stack above — 4 waves, 316 commits. The method is public:
see the *Local AI Coding Fleet* article series (Parts 1–5) and its companion
playbook.

## Project docs

- `docs/WAVE-1-BRIEF.md` … `docs/WAVE-3-STATE.md` — how each wave was scoped
- `docs/DEFINITION-OF-DONE.md` — the gate stack in full
- `docs/REQUIREMENTS-LEDGER.md` — requirement-by-requirement status
- `docs/DEMO-SCRIPT.md` — guided walkthrough of every feature
- `docs/metrics/` — per-wave ledgers: agent-minutes, gate catches, wall clock
- `docs/SNAPSHOT-API.md` — snapshot capture/storage contract
