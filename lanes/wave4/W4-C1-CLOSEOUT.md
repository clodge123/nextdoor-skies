# W4-C1 FETCH-HYGIENE — closeout (IN PROGRESS)

Lane: feed loading experience (docs/WAVE-4-BRAINSTORM.md session 2 DECIDED).
Branch: r4w4/C1-fetch (base f08d33b). Author: clodge123.

## Plan (approved 2026-10-22 23:29 CDT via sessions_send)
1. src/lib/net.ts — 10s timeout (AbortController), 1 retry (300ms backoff),
   per-key ABORT of superseded requests (Google Maps rule). All app fetch
   paths route through it (feed.ts, weather refresher, alerts refresher,
   panel).
2. src/components/Skeleton.tsx — shimmer, real card shapes, square corners,
   neon tokens; replaces "awaiting feed"/"Loading posts…" (~300ms fade).
   Cached-first posts (SWR, extend weather pattern).
3. Honest error card: "Feed unavailable — <town>" + Try again
   (feed-error / feed-retry). NO silent fallback.
4. Gates: vitest (timeout/retry/supersede/skeleton), tsc -b, build, ONE
   gated Playwright run: REAL_API=1 scripts/e2e-gate.sh npx playwright test
   tests/loading.spec.ts (desktop project; NDS_API_DELAY fixture).
5. Push r4w4/C1-fetch via REST (/tmp/push_branch_c1.py); merge main tip
   6f9aad1 (A1 units) first.

## Status
Survival commit landed first (this file). Implementation follows.
