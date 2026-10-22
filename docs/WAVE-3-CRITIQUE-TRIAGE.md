# Wave 2 Owner Critique — Triage & Evidence (2026-10-21 19:54 CDT)

Every claim probed against production/local before accepting. Status: confirmed / partially confirmed / needs-repro.

## C1. Weather slow, "awaiting feed" wall on pan, no smooth fade-in — CONFIRMED
- Prod probe: `/api/weather` responds in ~1.1 s per window, but a window fans
  out per-town `/v1/forecast` calls (≤50 towns, ≤10 concurrent). Panning fast
  = every new viewport starts cold; badges sit "awaiting feed" until the whole
  window resolves.
- Cache TTL is 5 min, town-keyed, in-memory (per-function-instance, cold
  starts every deploy/region). No cross-window prefetch, no fade-in.
- Wave-3 fix candidates: hourly cache (owner suggestion), tile-region prefetch
  of neighbors, optimistic last-known temps while refreshing, CSS fade-in.

## C2. Temp badges cover town/city names — CONFIRMED
- `TownBadges` positions the chip exactly at `map.project([lon,lat])` — the
  town point, directly over the map label. Needs vertical offset above the
  label (owner: "slightly above it").

## C3. UI disappears after zoom/pan (map-only, no nav) — REPRODUCES SUSPECTED
- Layering audit: alert-banner z-index 6, map controls z-index 2, page
  sections relative. No static cause found; prime suspect is an overlay
  (banner/dot container) growing over the header, or a map-zoom CSS effect.
- Wave-3 lane: repro spec (zoom/pan stress + header visibility assertion),
  then fix.

## C4. Alerts cover the whole screen — CONFIRMED (design gap)
- Banner is top-center absolute; many active alerts stack lines over the map.
  Owner direction: side panels, not overlays. Wave-3 UI-design study.

## C5. No search / no clickable places / bare-bones UI — CONFIRMED
- No town detail view, no click-to-inspect, no search box (identity picker
  town search exists but only sets your town). Layout study + detail panel
  in wave 3.

## C6. Reactions error in feed — CONFIRMED PRODUCTION BUG (root cause found)
- Prod probe: `POST /api/posts/{id}/reactions` → **HTTP 404 NOT_FOUND**;
  `?path={id}/reactions` form → 200. Same for comments.
- Root cause: Vercel filesystem routing sends only `/api/posts` (exact) to
  `api/posts.js`; subpaths `/api/posts/{id}/reactions` don't match the single
  file and fall through to the SPA rewrite → 404. The `?path=` fallback works
  but the client (feed.ts) uses the subpath form.
- Why gates missed it: local e2e mocks `/api/posts/**` routes in Playwright,
  so the mock never exercised Vercel's real router. Exactly the class of bug
  the "deploy == local" law targets — the local harness must route through
  the same shape as production (vercel dev / real handler, not mocked routes).
- Fix: client switches to `?path=` form (server already supports it), and the
  prod smoke gains a reaction/comment round-trip check.

## C7. Seeded posts have black images — CONFIRMED (seeder capture bug)
- Prod data: snapshot JPEGs exist (50 KB each) — but Chicago's three sampled
  posts carry byte-identical 50,491-char payloads = the same image, and a
  uniform black canvas compresses to exactly that. The seeder captured the
  canvas before maplibre painted tiles (preserveDrawingBuffer reads the raw
  buffer). Text posts render fine.
- Fix: seeder must await style-load + a paint frame (`requestAnimationFrame`
  after `moveend`) before capture; re-seed images.

## C8. Seed data "not showing" — EXPLAINED (two causes)
- Feed is identity-gated: you must pick the matching town (e.g. Chicago) in
  the picker before posts appear; other towns honestly show "No posts in X".
- Hot view pins 0 posts on seeded towns: hot score = replies×2 + reactions×1
  + decay, and seeded posts have zero engagement, so nothing clears the hot
  bar. Wave 3: seed engagement (reactions/comments) so hot view is alive.

## Standing laws recorded this cycle
- Deploy ONLY as the final wave gate (1–2 per wave); all testing local.
- Mandatory closeout process sweep (chrome zombies + exec anchors).

## Wave 3 brainstorm agenda (owner: sessions per topic)
1. Weather UX: caching model (hourly?), prefetch, fade-in, last-known-wins.
2. Map UI: badge offset, detail-on-click, search, layout (side/bottom panels),
   alert presentation.
3. Weather card: rich card (temp + conditions icon) on map + feed + posts.
4. Feed correctness: subpath→query-param fix, real-API local harness,
   engagement seed, snapshot capture fix.
5. QA bar: click-every-button manual pass + production-shaped local harness.
