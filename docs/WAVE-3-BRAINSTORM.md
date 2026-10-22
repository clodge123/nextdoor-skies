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

## Session 1 — Weather UX (recommend first: shapes the card + map lanes)
- **Cache model**: hourly town cache (owner suggestion) vs tile-region cache;
  shared server-side (Redis/Vercel KV?) vs in-memory + stale-while-revalidate.
  Recommendation: 60-min TTL + SWR + neighbor-ring prefetch (pan lands show
  last-known temps instantly, refresh quietly).
- **Fade-in law**: badge enters at 0% opacity, animates in when data arrives
  (CSS transition, deterministic). "Awaiting feed" only for genuinely cold
  towns; never a wall.
- **Rich weather card** (the centerpiece): temp + condition icon + wind/humidity
  strip, square geometry, same card renders on map badge-expanded, town page,
  AND inside feed posts (the "social card"). Open Q: card size tiers (chip →
  card on hover/click)?
- Open Q: hourly is NWS-accurate enough? Cache key per town vs per tile?

## Session 2 — Navigation & information architecture
- **Click-to-detail**: tap any badge/map label → town slide-over panel
  (conditions card + alerts + recent posts + "open town feed"). Tap post →
  post detail page. This fixes "click on a temperature nothing happens."
- **Search**: header search box (towns, states, "my feed") reusing the
  identity-picker combobox.
- **Routing**: real URLs (`/t/<slug>`, `/t/<slug>/feed`, `/p/<id>`) — shareable,
  back-button works, seed posts link into feeds.
- Open Q: panel vs full page for town detail? URL scheme? State-level browsing?

## Session 3 — Layout system & visual polish (the "jazz it up" session)
- **Layout**: map + right side panel (alerts/feed/details, collapsible), bottom
  sheet on mobile. Alert banner leaves the map center.
- **Visual direction options**: (A) keep dark-terminal aesthetic, add depth:
  elevation shadows, accent glow, gradient accents, motion 150-200ms; (B) go
  consumer-app: lighter surfaces, rounded corners (needs owner waiver of the
  square-geometry law R20 — ASK), icon set, avatar chips; (C) hybrid — keep
  square geometry, add color-coded severity accents, weather iconography,
  skeleton shimmer.
- Skeleton loaders everywhere (no spinner walls); first-glance 2-second rule
  per layer; micro-interactions (reaction pop, badge pulse on alert).
- Open Q: R20 waiver? Font pairing? Icon set (lucide)? Avatar generation for
  nicknames?

## Session 4 — Feed correctness & demo liveliness
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
