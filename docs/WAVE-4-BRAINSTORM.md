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

## Session 2 — LOADING EXPERIENCE (queued)
Research-first: how do Google Maps / Apple Maps / X handle map-adjacent
loading (tile prefetch, skeleton shimmer, request cancellation, SWR). Fix
the stuck "awaiting feed" (Jeffersonville) — diagnose the panel fetch path
(timeout/retry/empty-honest), add skeletons, prefetch neighbor towns.
Open Q: skeleton shimmer vs progressive fade?

## Session 3 — USER-POST IMAGE PIPELINE (queued)
Research-first: static map image APIs / tile compositing (the way other
apps burn a real map render into the post). Capture map center → town
(geocode/gazetteer nearest), render real tiles + weather badge into the
snapshot, guarantee never-black (variance gate + honest text fallback).
Open Q: server-side tile compositor vs client canvas?

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
