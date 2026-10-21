# W2 ALERTS-PROXY — Metrics (R18)

Lane: r2w2/W2-alerts | Run 2, Wave 2 | Branch: r2w2/W2-alerts

## Active-time accounting (wall-clock, fleet gaps excluded)

| Phase | Start (CDT) | End (CDT) | Active min |
|-------|-------------|-----------|------------|
| Brief/contract read + env probe | 11:12 | 11:20 | 8 |
| Live NWS API probe (points/alerts shape discovery) | 11:20 | 11:26 | 6 |
| api/alerts.js + client lib + AlertBanner | 11:26 | 11:34 | 8 |
| Vitest debug loop (zone regex, JSON import attr, async flush) | 11:34 | 11:41 | 7 |
| Live-egress script + limit param fix | 11:41 | 11:47 | 6 |
| Gates (vitest/tsc/build/scans) + survival commits | 11:47 | 11:55 | ~8 |
| Live handler smoke + attribution defect fix + final gates | 11:55 | 12:05 | ~10 |
| **Total** | | | **~53** |

## Gate counters

| Gate | Result | Evidence |
|------|--------|----------|
| vitest | PASS | tests/alerts.test.ts (14) + tests/alerts-client.test.ts (9) = 23 new; full suite 79/79 (12 files) green |
| tsc -b exit 0 | PASS | exit 0, no output |
| npm run build exit 0 | PASS | exit 0, dist/ emitted (chunk-size warning pre-existing, not lane-owned) |
| Determinism scan (R17) | PASS | lane-scans.sh: zero hits in lane files; 6 comment-text hits are pre-existing on main tip (exit 1 identical on main) — server Date.now documented, not in src/ |
| Radius scan (R20) | PASS | zero border-radius literals |
| No CWC imports | PASS | grep zero |
| LIVE-EGRESS (Gate 1, mandatory) | PASS | scripts/live-egress-alerts.mjs — see proof below |
| LIVE-EGRESS (Gate 1, mandatory) | PASS | scripts/live-egress-alerts.mjs — ALL PASS, run twice (pre/post attribution fix), proof below |
| eslint (lane files) | PASS | exit 0 |
| Function budget | PASS | api/ = probe.js + alerts.js; 1 new endpoint function (wave budget: 3 new -> ~4/12) |

## LIVE-EGRESS proof (real api.weather.gov, production UA)

```
$ node scripts/live-egress-alerts.mjs
live-egress W2 alerts @ 2026-10-21T16:58:1xZ (script clock, not app logic)
PASS points 200 — HTTP 200
PASS points JSON payload
PASS county zone parsed — zone=TXC453
PASS points city sanity — city=Austin
PASS alerts 200 — HTTP 200
PASS alerts JSON features array — count=1
PASS alert shape has id/event/severity/expires — event=Air Quality Alert severity=Unknown
INFO control: no-UA request HTTP 200 (UA is NWS's documented requirement; production always sends it)
LIVE-EGRESS: ALL PASS
```

Handler-level live smoke (`handler({query:{bbox:'-97.75,30.26,-97.73,30.28'}})` against real NWS):
`200 alerts=1 stale=false`, sample `{id:"urn:oid:…",event:"Air Quality Alert",town:"austin-30.27--97.74",severity:"Unknown",expires:"2026-10-21T19:00:00-05:00"}`.

## Defects caught per gate level

- Gate 0: zone-id regex missed the literal `C` in `TXC453` (2 letters + C + 3 digits); JSON import needed `with { type: 'json' }` under Node ESM; client test needed a macrotask flush for the async fetch chain.
- Live-egress: `alerts/active?zone=TXC453&limit=100` → HTTP 400 (NWS rejects `limit` on this deployment); dropped the param. **Attribution defect:** the first live run returned 200 through the handler but `alerts=0` — filtering features by `affectedZones` county ids dropped everything, because NWS populates `affectedZones` with FORECAST zones (TXZ…), never county zones. Fix: trust the query scoping (the `zone=` param already restricts to the county); live re-run returns 1 alert. Control "no-UA → 4xx" assertion is informational only: edge nodes return 200 to no-UA; the UA law is enforced in production code, proven by the header-presence unit test.

## Deviations

- Contract `region={countyFIPS}` style query is implemented as `zone={STATE}C{FIPS}` (NWS's actual working param; `region=` returns 400). Same semantics, documented here.
- node_modules symlinked from the main checkout (lockfile-identical); no dependency changes.
