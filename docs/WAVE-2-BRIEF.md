# Wave 2 Brief — Run 2 (features)

Goal: make the app live — real weather, posts with map snapshots, feed, alerts.
All wave-1 laws carry forward (determinism, no rounded corners, honest states,
fetch-per-window, US-only data, ≤12 serverless functions, **browser traffic
law**). Deploy cadence: per-wave only.

## NEW LAW — live-egress assertion (wave-2 law)

Any lane touching an external API MUST include, in Gate 1, a live-egress
assertion: curl/fetch the REAL endpoint and assert HTTP 200 + parsed payload.
Mocked unit tests passing is NOT proof (the Open-Meteo batch 404 shipped past
13 green unit tests). Every external URL in the repo gets a live check in CI.

## Decisions (owner-approved 2026-10-21)

1. **Map snapshots**: canvas capture (`preserveDrawingBuffer: true`) → ~600px
   JPEG data URL stored IN the post row. No Blob, no server render, no upload.
2. **Identity**: nickname + town picker (search over 21,613 gazetteer towns +
   geolocation request, fallback to search). localStorage, NO accounts.
3. **Hot ranking**: replies + reactions + recency. Hot posts pinned at top,
   newest below. Reactions: 👍 ❤️ 😂, one per nickname per post.
4. **Alerts**: NWS points API → county FIPS (cached per town, one call ever).
   Active-alert banner on map + alert dot on affected town badges.
5. **Abuse**: per-IP rate limit (5 posts/hour) + flag button; post hidden
   after 3 flags. Same rules as run 1.
6. **Seed**: 20 metro areas × 5–10 posts each (headless Playwright seeder,
   real canvas snapshots) + small towns × ~5 text-only posts, sprinkled.
7. **Badge zoom rule (owner screenshot 2026-10-21)**: `TOWN_BADGE_MIN_ZOOM`
   6 → **9**. Below zoom 9: town NAMES only, no temperature badges. Zoom ≥9:
   temps fill center-out via priority queue; pan cancels stale queues.
   Server-side: viewport-bbox batching, ≤50 towns/request, ~5-min cache TTL.
8. **Weather 404 fix**: badge temps via server-side `/api/weather` proxy
   (per-town `v1/forecast` endpoint — proven live; batch endpoint dead).

## Lanes (parallel; browser runs gate-serialized)

- **W2-1 WEATHER-PROXY** — `/api/weather` function (viewport bbox → chunked
  per-town forecast, cache, ≤50/call); client refresher rewrite; zoom-9 badge
  rule; live-egress assertion. Fixes the production "awaiting feed" bug.
- **W2-2 ALERTS-PROXY** — `/api/alerts` function (points→FIPS cache, NWS UA
  server-side); banner + badge dots; live-egress assertion.
- **W2-3 IDENTITY** — nickname + town picker UI, geolocation→search fallback,
  localStorage session, sign-in gate on posting.
- **W2-4 POSTS-API** — `/api/posts`: GET per-town feed (hot-pinned + newest),
  POST w/ snapshot data URL, comments (one level), reactions, flags, IP rate
  limit. DB migrations: posts, comments, reactions, flags (idempotent,
  temporary endpoint, removed after).
- **W2-5 FEED-UI** — feed page consuming W2-4: hot-pinned section, newest
  list, post cards w/ snapshot images, reactions, replies, honest empty state.
- **W2-6 POLISH** — header/nav CSS (owner: renders unstyled/tiny), mobile
  parity, touch targets, badge zoom-tier visuals (names-only tier <9).
- **W2-7 GATE** — full Playwright 3-viewports, production smoke, screenshots,
  metrics rows, ledger updates. Stress spec: fast pan over 50 towns asserts
  ≤N upstream calls (counting mock) + live-egress checks on all endpoints.

Function budget: posts + weather + alerts = 3 new → ~4/12 total.

## Lane prompt header (verbatim in every lane)

> Browser runs: ALWAYS `scripts/e2e-gate.sh <cmd>`. Never run Playwright
> directly, never launch chromium outside a gated run, never leave a killed
> run's chrome processes behind. Exit 75 from the gate = queue and retry, do
> not bypass. External APIs: live-egress assertion required in Gate 1.
