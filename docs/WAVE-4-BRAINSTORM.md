# Wave 4 Brainstorm — Polish Wave

Trigger: owner played the deployed app (nextdoor-skies-run2.vercel.app,
deployed 2026-10-22 16:54 CDT) and delivered a live critique. This doc is the
contract of record: one topic per session, every decision committed the
moment it's made. Sessions run sequentially; leftovers queue.

## Owner critique (captured 2026-10-22 20:50 CDT)

1. **Units** — temps show Celsius; "this is America." Need Fahrenheit, and a
   toggle was suggested.
2. **Loading experience** — cards cluster at certain zoom levels ("too much
   going on"); feed panels get stuck on "awaiting feed" and never load
   (Jeffersonville example); scrolling away and back makes them load. "There
   is a way to do it — research how other apps do this."
3. **User-created posts** — seeded demo posts show images fine (LA), but
   posts created by a real user render black. The user post also didn't
   capture the map location (owner lives in Florissant; it wasn't set).
   Snapshot should carry the map render AND the weather badge/temperature.
   Suggested rendering the real map (static tiles) into the picture.
4. **Feed** — works (messages, emojis), per-town feeds exist (LA feed), but
   there is no ALL feed: one global scrollable stream of every post.
5. **Alerts panel** — clicking the town name should zoom to it; clicking the
   whole card should do the same. (Nitpick — zoom animation itself: "looks
   really good, works really good.")
6. **Badges vs town names** — weather cards cover the town name on the map
   at certain zooms. They should sit right ABOVE the name, and appear the
   moment the name appears — matching the map's natural label zoom levels.
   Rancho Rio Rancho-style overlay when zoomed out is fine.
7. **Clustering** — same-temp neighbors (Oklahoma City / Mustang / Moore,
   all 21°C) stack cards on top of each other. De-cluster at low zoom; F
   conversion will add natural variation.

## Gap census (audit + critique)

| Surface | Exists | Missing (fill it) |
| --- | --- | --- |
| Units | C only, hardcoded | °F default, °F/°C toggle, persisted, F everywhere (badges, panel, feed, detail, tour) |
| Badge placement | Fixed offset above point, zoom-9 global gate | Per-town zoom matching map label visibility; badge ABOVE label, never over it; de-cluster same-temp groups |
| Feed loading | Fetch-on-mount, "awaiting feed" text | Reliable load (retry/timeout), skeleton shimmer, honest empty ("No posts in <town> — be the first"), infinite scroll, ALL feed route |
| User posts | Text + reactions + comments work | Location capture from map view, real map-tile snapshot render, weather badge burned into snapshot, image never black |
| Alerts panel | Row fly-to exists | Whole-row click target (name included), deep-link parity |
| Tour | 3-step spotlight | Update step copy for F + all-feed (wave-4 surfaces) |
| QA gates | Click-every-button sweep | New specs: unit toggle, all-feed, user-post image non-black, badge-above-label, zoom-match visibility |

Creative-freedom fills (unprompted): post composer town picker (map-center
→ town), feed infinite scroll, panel skeleton states, badge de-clustering,
snapshot tile renderer.

## Standing constraints (carried laws)

Deploy-once-at-wave-end · closeout sweep every lane · browser serialization
(e2e-gate.sh) · live-egress proof · author clodge123 · survival commit
≤15 min · REST push (push_tree.py) · NO silent fallbacks (honest states) ·
first-glance test · controls discoverable first-try · fly-to animation law
(never teleport) · square geometry (R20) · ≥44px targets (R13) · determinism
(no Math.random/Date.now in shipped code paths) · **NEW (owner 2026-10-22):
research how existing apps solve it before building custom — "we are
reinventing the wheel and we just don't need to."**

---

## Session 1 — UNITS + WEATHER DISPLAY LAW ✅ DECIDED (2026-10-22 21:05 CDT)

Opening position: units are the root of the critique — F fixes the
"everything is 21°" monotony (75/72/68 shows variation), and badge placement
is a geometry problem the maplibre label layer already solves. Recommendation
is to tie our zoom gates to the map's own label visibility, not invent new
thresholds.

Decisions (locked):
1. **Fahrenheit is the default unit.** All surfaces (badges, side panel,
   town panel, feed cards, post detail, alerts, tour copy) show °F.
2. **A °F/°C toggle lives in the header** (pill next to the theme toggle,
   ≥44px, discoverable first-try). Choice persists per browser
   (localStorage `nds-units`); honest default F in private mode.
3. **Badge sits ABOVE the town label, never over it.** Offset = label
   height + gap; the label text always stays readable.
4. **Badge visibility matches the map's natural label zoom.** A town's
   badge appears exactly when its map label appears (per-town label zoom
   from gazetteer population tier), replacing the global zoom-9 gate.
   Zoomed-out metro overlay style (Rancho Rio Rancho pattern) is allowed
   where the map shows grouped labels.
5. **Same-temp de-clustering:** at zooms where multiple neighboring towns
   share a rounded value, show ONE badge for the cluster (representative
   town); tap/zoom-in expands to individuals. F first — variation mostly
   solves it.

Wave-4 consequence: tour step 1 copy updated to reference °F + the toggle.

## Session 2 — LOADING EXPERIENCE ✅ DECIDED (2026-10-22 21:15 CDT)

Research (owner law: follow existing apps, don't reinvent):
- **Google Maps**: prefetches tiles/data for the current viewport + a ring
  beyond it; cancels requests for off-screen content; progressive tile
  draw-in (no white-box stalls).
- **X / social timelines**: skeleton shimmer placeholders while fetching,
  SWR (show cached data instantly, revalidate in background), infinite
  scroll with cached pagination.
- **web.dev `content-visibility: auto`**: browser skips layout/paint of
  off-screen list rows until needed (~7x render boost on long chunks).
- Root cause of stuck "awaiting feed" (Jeffersonville): panel fetch has no
  timeout, no retry, and no cancellation of superseded requests — a slow/
  dropped request hangs the card forever; scrolling away/back remounts and
  retries, which is why it "loads when you leave."

Decisions (locked):
1. **Skeleton shimmer** (X-style) replaces the static "awaiting feed" text
   while fetching — real card shapes, animated, ~300ms fade to content.
2. **Request hygiene**: every feed/panel fetch gets a 10s timeout + 1
   retry with backoff; pan/zoom fast ABORTS superseded requests (Google
   Maps rule — never let an old request block a new one). After retry
   fails: honest error card "Feed unavailable — [Try again]", never a
   lookalike render (silent-fallback law).
3. **Feed prefetch**: extend the A1 neighbor-ring prefetch law to posts —
   on idle, prefetch the visible town's feed + ring neighbors, SWR-cached
   so the next tap shows data instantly. Cached-first render (show last-good
   immediately, revalidate in background).
4. **Infinite scroll** on feed lists with cached pagination (`page` param,
   IntersectionObserver sentinel, ≤3 pages prefetched); long lists use
   `content-visibility: auto` so off-screen rows cost nothing.
5. **Honest empty**: "No posts in <town> — be the first" + composer CTA.
   Zero posts renders as a real zero, never blanks.

Queued leftovers: map tile cluster density tuning moves to session 4 (feed
structure) since the zoom-match law from session 1 covers badge density.

## Session 3 — USER-POST IMAGE PIPELINE 🔶 REVISED (owner ruling 2026-10-22 21:41 CDT)

Owner ruling overrides the "honest text fallback" decision (#3): **NO
fallbacks.** A lookalike/text card because the capture failed is banned.
The method must work every time — when the owner does it, when any user
does it. If cross-origin is the blocker, change the method entirely until
it works. Snapshot cards carry burned-in weather data (temperature,
condition type, town, date) styled as a data overlay; card art direction
is creative-freedom. Deeper method brainstorm continues next session.

Research: social apps with map posts use **server-side static-map
compositing** (Mapbox Static Images API pattern) — the client sends
lat/lng/zoom, the server stitches the 3×3 tile grid into one JPEG. Client
canvas capture is NOT viable: openfreemap tiles are cross-origin, so
canvas.toDataURL() taints and throws (the current black-image root cause —
the seeder's C7 fix already learned this and moved server-side).

Decisions (locked):
1. **Location capture**: composer reads the map center and resolves the
   nearest gazetteer town (Florissant → shows as "Florissant"); shown as an
   editable town chip. Post row stores lat/lng + town slug.
2. **Server-side snapshot compositor** `POST /api/snapshot` (session-gated):
   fetches the 3×3 tile grid at zoom 11-12, stitches, burns in the weather
   badge strip (town name + °F + condition icon, fetched live), returns
   JPEG. Same paint-fixed capture law as the seeder (style-load → idle →
   two rAF frames → encode).
3. **No-fallback law (revised)**: variance gate (≥16) + repaint retries
   until success; the pipeline must be reliable by construction (deterministic
   tile fetch, no WebGL dependency, no cross-origin canvas). A post with a
   snapshot request either gets a real map image or the POST fails loudly —
   never a black box, never a text stand-in. Method deep-dive continues
   next session (owner: brainstorm more on exactly how we fix this).
4. **Data overlay on the card (creative freedom)**: burned-in weather strip
   (town, °F, condition icon) + date + author overlay, styled like a data
   overlay on the image; card art direction open (moodboard frames).
5. **Composer flow**: pick map location (defaults to current view) → town
   chip → text → optional snapshot auto-attached → post. Mobile parity:
   bottom-sheet composer reusing the map center.
6. Seeded demo posts keep existing snapshots; user posts use this pipeline.

## Session 4 — FEED STRUCTURE: ALL FEED ✅ DECIDED (2026-10-22 21:24 CDT)

Decisions (locked):
1. **Feed header tabs: Hot | Latest.** Latest IS the all feed — global
   newest-first stream across every town, infinite scroll. Hot stays the
   curated view. Town feeds (`/t/<slug>/feed`) keep both tabs scoped.
2. **Infinite scroll** (IntersectionObserver sentinel, ≤3 pages prefetched,
   cached pages, `page` param) per session-2 loading law; off-screen rows
   get `content-visibility: auto`.
3. **Town chip per card** (post's town) → click opens the town panel
   (`?panel=<slug>` scheme). Deep-link `?scope=` for shareable tab state.

## Session 5 — ALERTS PANEL NITS ✅ DECIDED (2026-10-22 21:25 CDT)

Decisions (locked):
1. **Whole alert card is the fly-to target** (row-level click, not just the
   town name) — same seam, same 1800ms ease animation.
2. Hover/focus affordance on the whole row (cursor + subtle highlight),
   keyboard: row is one button, Tab to it, Enter flies. Mobile: whole row
   tap (44px law already met).
3. No other panel nitpicks queued — owner flagged only this one.

## Session 6 — QA GATES FOR WAVE 4 ✅ DECIDED (2026-10-22 21:26 CDT)

Decisions (locked) — new gated specs, all production-shaped (REAL_API=1):
1. `units.spec.ts` — F default everywhere, toggle persists (`nds-units`),
   private-mode honest F default, badge/panel/feed/detail all follow unit.
2. `badge-placement.spec.ts` — badge ABOVE label (bbox: badge.bottom ≤
   label.top), zoom-match: badge visible iff map label visible (per-town
   tier), cluster badge = 1 per same-temp group at low zoom.
3. `loading.spec.ts` — skeleton shimmer present during fetch, 10s timeout
   + retry fires honest error card, fast pan aborts superseded requests,
   infinite scroll appends page 2, `content-visibility` rows skip paint.
4. `snapshot.spec.ts` — user-created post (real API, real session) snapshot
   variance ≥16, weather strip burned in, town chip matches map center.
5. `feed-all.spec.ts` — Latest tab streams global posts, town chip → panel.
6. Extend QA harness routes: /feed tabs, composer surface, /alerts rows.

---

## Lane sketch (wave 4, 6 lanes)

| Lane | Cluster | Acceptance |
| --- | --- | --- |
| G1 units-law | F default, header toggle, all surfaces, tour copy | first-glance: badge shows 75° not 24° |
| G2 badge-placement | label-above geometry, zoom-match per-town, de-cluster | no name ever covered; badge appears with label |
| G3 loading-hygiene | skeletons, timeout/retry/cancel, prefetch, infinite scroll, content-visibility | Jeffersonville-class stall impossible; honest error on failure |
| G4 snapshot-pipeline | server compositor, weather burn-in, location capture, composer flow | user post shows real map image, never black |
| G5 feed-alerts | Latest/all feed tabs, town chips, whole-card alert fly-to | global scroll, whole row flies |
| G6 qa-gates | session-6 specs + harness routes, closeout sweeps | all new specs green in one gated run |

Laws carried: deploy-once-at-wave-end · honest states · fly-to law · square
geometry · ≥44px · determinism · REST push · closeout sweeps · research-
before-build. Wave-end: single deploy + seed-wave3.yml (needs
NDS_ADMIN_SECRET — still unset as of 2026-10-22).

## Kickoff gate (owner law, 2026-10-22 21:41 CDT)
**No wave kickoff until the owner says "greenlight."** Brainstorming
continues across sessions; moodboard frames (real-engine captures) render
on request and get numbered critique rulings (C-NN) in the next session.
Nothing in wave 4 spawns worktrees/lanes before greenlight.

## Moodboard critique (2026-10-22 22:14 CDT) — ✅ APPROVED WITH RULES

Frames rendered: A1–A4 real-engine (current app), M1–M5 target mockups
(`lanes/wave4/moodboards/`). Owner: "these mock ups look really good… I
like these mock ups."

Rulings:
- **C-01** — Design language: keep the **thin neon green** accent (the
  terminal-green we already use). No new palettes; all wave-4 surfaces
  (badges, panels, tabs, snapshot overlays, skeletons) inherit the neon-
  terminal theme tokens. Mockups approved as design targets.
- **C-02** — **No rounded corners anywhere** (reaffirms R20 square-
  geometry law against the mockup CSS drift: the mockups used 2px radii
  on skeleton lines/chips — shipped code uses `var(--radius)` = 0px).
- No other changes requested — M1 badge-above-label, M2 loading law, M3
  snapshot overlay, M4 all-feed, M5 alerts whole-row all accepted as-is.

Consequence: wave-4 lane briefs reference these frames as acceptance
visuals; G6 QA adds a no-rounded-corners scan (computed border-radius =
0px on all interactive chrome) and neon-accent token audit.

## Session 4 — FEED STRUCTURE: ALL FEED (queued)
Global /feed-all (or /feed?scope=all) — newest-first infinite scroll across
every town, town chip per card (click → town panel). Hot view stays.
Open Q: infinite scroll vs paged?

## Session 5 — ALERTS PANEL NITS (queued)
Whole alert card = fly-to target (not just town name); consistent hover.
Open Q: any other panel nitpicks from owner?

## Session 6 — QA GATES FOR WAVE 4 (queued)
Specs for unit toggle, all-feed, user-post image non-black, badge-above-
label, zoom-match visibility; extend QA harness routes.
