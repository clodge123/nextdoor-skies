# W4-E1 all-feed — CLOSEOUT (wave 4, round 2)

Branch `r4w4/E1-all-feed` (base main tip `0615b69`).
Commits: `0741ad5` survival notes → `ec071d0` implementation → `2e0948c`
S4-law fix (Latest = global) + e2e fixes + screenshots.

## What landed
- **API (api/posts.js):** `GET /api/posts` WITHOUT `town` = global list
  (every town). Same sort/flag-hide/session-myReaction paths; db.listPosts
  takes `town|null` (optional WHERE in createPgDb, stubs in
  tests/posts-api.test.ts + scripts/api-serve.mjs match). `cmpNewest` now
  tie-breaks by id ascending (determinism law — equal timestamps never
  inherit row order). No second route, no silent fallbacks.
- **src/lib/scope.ts (new, pure):** `parseScope(search)` → 'hot'|'latest'
  (default hot), `scopeHref(pathname, search, scope)` — selecting Hot
  REMOVES `?scope=` (canonical URL), Latest sets it, other params preserved.
- **FeedPage:** Hot | Latest tabs (`role=tablist`, `aria-selected`,
  arrow-key nav activating, 46px box / ≥44px content, square, neon-active
  via `var(--current-accent)`). Tab state lives in the URL (`?scope=`) —
  deep link restores, back/forward switches. **Scope drives town (S4 law):**
  Latest = the ALL feed (global newest-first, every town); Hot = the
  curated view (session town when signed in); `/t/<slug>/feed` keeps both
  tabs town-scoped.
- **FeedPostCard:** town chip per row (≥44px, square, neon focus) →
  `/?panel=<slug>` — the EXISTING panel scheme (src/lib/panel.ts), built
  from empty search so the feed's own `?scope=` doesn't leak into the map
  URL. Chip → panel → fly-to reuse the canonical gazetteer slug key.
- **Global browsing needs no session** (browsing is town-free; posting
  still requires identity — inline IdentityPicker where the old gate was,
  beside an honest browsable feed). Global empty state: "Awaiting feed —
  no posts anywhere yet." (never fake rows).

## Gates (measured, honest)
- vitest: **475/475** (44 files) — 464 baseline + 11 new (scope.test.ts 6,
  FeedPage E1 block 5 incl. global-fetch URL shape, chip href, deep-link
  tab restore, arrow-key nav, honest global empty).
- posts-api.test.ts: old "GET requires town → 400" contract REPLACED by
  "GET without town = global list, newest-first" + sort-validation 400.
- tsc -b: clean. vite build: clean. check-determinism: OK (53 files).
- Playwright ONE gated run (scripts/e2e-gate.sh, desktop): **10/10** —
  tests/feed-all.spec.ts 4/4 (tabs switch global streams + ≥44px box;
  deep-link restores tab; chip opens panel w/ real panel content; keyboard
  Tab-reachability + arrow activation) + tests/feed.spec.ts 6/6 (existing
  feed gates, tab testids renamed, mock teaches town-omitted = global).
  Screenshots: docs/screenshots/W4-E1/*.png.

### Gate history (honest)
- Run 1: 6/10. Four feed-all failures exposed a REAL design bug (session
  town forced for both tabs → "global" stream showed one town). Fixed per
  S4 law: `feedTown = townSlug ?? (scope==='latest' ? '' : session?.townSlug ?? '')`.
- Run 2: 8/10. Keyboard assert counted hidden mobile-drawer clones (not
  Tab-reachable) inflating stops to 18 → count `:visible` focusables only.
  feed.spec.ts mock returned [] for the global (town-less) request →
  fixture treats town-omitted as global.
- Run 3: **10/10**.

## Deviations (honest)
1. **Infinite scroll NOT in this lane.** The API has no pagination seam;
   W4-C2 feed-load owns prefetch/infinite-scroll. Acceptance "global
   newest-first scroll works" = full unpaginated list, newest-first.
2. **Session gate relaxed on plain /feed** (global browsing). Town feeds
   and posting are unchanged. Old App.test gate expectation ("identity
   picker first-click on /feed") still passes — the picker renders inline.
3. Hot tab on the global stream uses the server's engagement score
   (comments*2 + reactions + recency decay, HOT_SCORE_MIN=3) — read from
   api/posts.js, not re-implemented.

## Closeout sweep
- Leftover chrome-headless / playwright / vite-preview children: swept
  after the gated run (see report). No /tmp locks held.
