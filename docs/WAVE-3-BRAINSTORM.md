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

## Session 5 — Acceptance criteria & wave scoping ✅ DECIDED (2026-10-21 23:08 CDT)
Owner rulings: (1) split into smaller lanes, orchestrator parallelizes; (2)
wave 4 = GAP after owner feedback; (3) demo script approved as acceptance
test + tour first-visit-only with header replay. Final breakdown below.

### Per-feature "done" gates (every lane, all viewports)
- First-glance test: layer teaches itself in ~2s, no clicks needed.
- Mobile parity + 44px targets; honest states (no silent fallbacks, skeletons
  not spinners); determinism scan clean; theme-neutral icons (both themes).
- Animation law: fly-to ~1.5-2s eased, panels ~200ms, nothing snaps.
- Real-API local harness (vercel-dev shape, no mocked routes) +
  click-every-button manual pass recorded per feature.
- Live-egress proof for any lane touching external APIs.

### Recruiter demo script (wave-3 acceptance run)
1. Land → map alive with temps fading in, weather-driven tint, alert dots.
2. Search "Austin" → fly-to, town panel, conditions card + alerts + posts.
3. Tap badge → expand full weather card → "Open town feed" (animated).
4. React 👍 (instant, persists), reply, tap post image → lightbox.
5. Ctrl+K → jump to Chicago → share link `/p/<id>` → open in new tab.
6. Phone viewport: bottom sheet, pull-to-refresh, Web Share sheet.
Total < 90 seconds, zero console errors, zero dead clicks.

### final lane breakdown (owner: split smaller — 16 lanes, one topic each)
| Lane | Topic | Depends |
| --- | --- | --- |
| W3-A1 | Weather cache: 60-min server cache + SWR + neighbor prefetch (live-egress) | — |
| W3-A2 | Lucide condition icons (theme-neutral, both themes) + fade-in | A1 |
| W3-A3 | Weather-driven map tint (dominant-condition wash) | A1 |
| W3-B1 | Routing: `/t/<slug>`, `/t/<slug>/feed`, `/p/<id>`, `/alerts`; deep links | — |
| W3-B2 | Town panel + town page: weather card, alerts, recent posts, "Open feed" | A2,B1 |
| W3-B3 | Click-to-detail: badges + labels + low-zoom dots (no dead zones) | B2 |
| W3-B4 | Search box, my-town chip, fly-to animation law, "View on map" | B1 |
| W3-C1 | Layout shell: side panel (desktop open / mobile bottom sheet), banner removal, drawer | — |
| W3-C2 | Alert center: severity-grouped, color-coded borders, mute town | C1 |
| W3-C3 | Command palette `Ctrl+K` + keyboard shortcuts | C1 |
| W3-D1 | Feed routing fix (`?path=`) + real-API local harness + smoke round-trips | — |
| W3-D2 | Seeder capture fix + re-seed + engagement seed (deterministic) | D1 |
| W3-D3 | Post detail page, lightbox, share (copy-link + Web Share), pull-to-refresh | B1,D1 |
| W3-E1 | Polish seeds: skeletons, micro-interactions, identicons, typography scale | B2,C1 |
| W3-E2 | Onboarding tour: 3-step, FIRST-VISIT-ONLY (localStorage + IP/userId seen-flag), header "▶ Demo" replay button | B3,C3 |
| W3-F | QA harness: click-every-button suite, demo-script e2e, prod smoke additions | all |

Wave 4 (polish pass): scheduled as a GAP — owner plays with wave 3, gives
feedback, then wave 4. Not started with wave 3.

### Tour visibility law (owner)
First visit only — seen flag keyed on localStorage (+ IP/userId where
available); never repeats. Discreet "▶ Demo" replay in header. Must not
block first paint for returning users.

## Standing constraints (non-negotiable, from owner history)
No silent fallbacks / honest empty states · fetch-per-window · determinism
(no Math.random/Date.now in app logic) · mobile parity · 44px targets ·
square geometry (waiver = open question) · live-egress proof for API lanes.
