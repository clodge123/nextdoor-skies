# Wave 3 Brainstorm Brief (2026-10-21)

Owner mandate: **creative freedom granted** — build the polished, professional,
impressive app, not just the literal ask. Fill the gaps unprompted (navigation,
detail views, panels, "obvious" features recruiters/users expect). Every item
below is a brainstorm topic with options and open questions; decisions land in
the session, this doc is the agenda.

## Gap census (what exists → what's missing)

| Surface | Exists | Missing (fill it) |
| --- | --- | --- |
| Map | badges, temps, zoom, pan | click-any-badge→town page; search; hover/press affordances; weather condition icons; smooth fade-in |
| Navigation | Map/Feed header tabs | no way to reach a town's feed from the map; no breadcrumbs/back; no mobile nav (drawer); no keyboard shortcuts |
| Town detail | nothing | town page: current conditions card, alerts, local posts, "jump to feed" |
| Alerts | top-center banner | side panel / alert center, per-alert detail, severity styling, "muted towns" |
| Feed | posts, reactions (broken route), replies, flags | images render black (capture bug); hot view dead (no engagement); no post detail page; no share; no pull-to-refresh |
| Identity | picker + geolocation | no profile chip/menu, no town switcher in header, no multi-town following |
| Polish | tokens, dark/light, square geometry | skeletons not spinners, motion/micro-interactions, typography scale, empty-state art, onboarding first-run tour |

## Session 1 — Weather UX ✅ DECIDED (2026-10-21 20:48 CDT)

All five decisions locked, plus the map-tint extra:
1. **Cache: 60-minute town cache, server-side, stale-while-revalidate.**
   Cache warms by gathering everything in view; users scrolling pull from the
   cache, the next ring prefetches quietly. No visible "awaiting feed" for
   seen towns. (Demo app — 60 min is plenty; fresher not needed.)
2. **Condition icons: lucide icon set, theme-neutral** — must read cleanly on
   BOTH dark and light themes (owner requirement; contrast verified in gates).
3. **Card tier trigger: tap/click** the small chip to expand into the detail
   card (mobile-safe).
4. **Full card**: temp big + condition icon + feels-like + wind + humidity
   ("like a real weather app"). Same card on map-expand, town page, feed posts.
5. **Alerts**: severity dots + pulsing ring on badges; browser-based alerts
   (current shape fine).
6. **Weather-driven map tint**: YES — subtle sky-tone wash by dominant
   condition in view.

Fade-in law (~200ms CSS) confirmed as part of the model. Source stays
Open-Meteo via proxy, ≤50 towns/request, live-egress proof required.

## Session 2 — Navigation & IA ✅ DECIDED (2026-10-21 21:01 CDT)

All five accepted, plus an animation law:
1. **Town detail: slide-over panel on map + full page at `/t/<slug>`** (same
   components). Panel = weather card + town alerts + recent posts + "Open
   town feed". Mobile: bottom sheet.
2. **Real URLs**: `/t/<slug>`, `/t/<slug>/feed`, `/p/<id>`, `/alerts`.
   Shareable links = the path out of demo phase (owner: "if enough people
   share it"). Back-button works, seeded posts deep-link.
3. **Header search box** (towns combobox) + "My town" chip. All jumps are
   ANIMATED, never snapped (owner law, Google Earth style: zoom-and-fly with
   easing ~1.5-2s; search results, "View on map", badge taps all fly-to).
4. **Every target clickable**: badges (44px), town/city labels below zoom 9,
   AND low-zoom state/city dots — no dead zones at any zoom level.
5. **"View on map" on post cards** → animated fly-to that town.
6. **Post detail: full page** (`/p/<id>`) with comment thread.

**Animation law (new, wave 3)**: map transitions use `flyTo`-style eased
zoom+pan (~1.5-2s, cubic easing); UI panels slide/fade ~200ms; nothing snaps.

Creative-freedom grant extended: fill remaining gaps unprompted to make the
app impressive, polished, usable, intuitive, friendly.

## Session 3 — Layout system & visual polish ✅ DECIDED (2026-10-21 22:39 CDT)

1. **Visual direction: OPTION C (hybrid)** — square geometry stays the
   signature (R20 NOT waived); add elevation shadows, weather iconography,
   color-coded severity accents, skeleton shimmer, subtle gradients. Distinct
   design language that sticks with recruiters.
2. **Side panel: open by default on desktop** (shows alert center), collapsed
   on mobile (bottom sheet). Collapsible, keyboard toggle (`P`).
3. **Alert center: severity-grouped list, color-coded left borders, grouped by
   town, per-row "mute town" — replaces the overlay banner entirely.**
4. **Command palette (`Ctrl+K`) + keyboard shortcuts: YES** (jump to town,
   switch theme, open feed, toggle panel).
5. **Onboarding: quick 3-step spotlight tour** (pick town → explore map →
   open feed). Demo-appropriate.

**Wave planning note (owner):** wave 3 = features; budget a FINAL POLISH WAVE
(wave 4) after. Keep the 4-wave shape in mind when scheduling lanes.

## Session 4 — Feed correctness & demo liveliness ✅ DECIDED (2026-10-21 22:51 CDT)

All five accepted:
1. **Engagement seeding**: ~3–8 reactions + 0–3 comments per seeded post,
   deterministic fixed pattern per post index (no randomness).
2. **Hot formula: keep** replies×2 + reactions×1 + 12h decay.
3. **Sharing: both** — Copy-link button + native Web Share API on mobile.
4. **Image lightbox: yes** — tap post image → full-screen, swipe between
   images in a post.
5. **Comments: flat one-level** (Nextdoor-style, demo-appropriate).

Carried fixes (from critique triage, non-negotiable): production routing fix
(`?path=` form), seeder canvas-paint capture fix + re-seed, real-API local
harness (no mocked routes), click-every-button manual pass in Definition of
Done, pull-to-refresh + refresh button with animated skeletons, post detail
page `/p/<id>`.

## Session 5 — Acceptance criteria & wave scoping (IN PROGRESS)
- Fix production routing bug (subpath → `?path=` form + real-API local harness
  so mocked-route blind spots die).
- Fix seeder canvas capture (await paint frame) → real map images in posts.
- Seed engagement (reactions/comments on seeded posts) so Hot view is alive.
- Post detail page, share link, pull-to-refresh, image lightbox.
- QA bar: click-every-button manual pass + production-shaped local harness
  (vercel dev), no mocked routes.

## Session 5 — Acceptance criteria & wave scoping
- Define per-feature "done" gates (first-glance test, mobile parity, 44px,
  honest states, determinism) + demo script for the recruiter showcase.
- Lane sketch (draft, post-brainstorm): W3-A weather-cache+fade, W3-B town
  detail+click/nav, W3-C layout/panel system, W3-D feed fixes+engagement
  seed, W3-E visual polish pass, W3-F QA harness (real-API local).
- Laws carried: deploy-once-per-wave, closeout sweep, browser serialization,
  live-egress, no silent fallbacks.

## Standing constraints (non-negotiable, from owner history)
No silent fallbacks / honest empty states · fetch-per-window · determinism
(no Math.random/Date.now in app logic) · mobile parity · 44px targets ·
square geometry (waiver = open question) · live-egress proof for API lanes.
