# W4-E1 all-feed — lane notes (round 2)

Branch `r4w4/E1-all-feed`, base main tip `0615b69`.

## Plan (survival)
- API: `GET /api/posts?sort=hot|new` WITHOUT `town` = global list (all towns).
  Verified: api/posts.js GET currently 400s without town; db.listPosts filters
  by town — make town optional (omit WHERE), keep sort + flag-hide + session
  myReaction paths identical.
- Client seam: `fetchPosts({ town?, sort })` — omit `town=` param for global.
- `src/lib/scope.ts` (new, pure): `parseScope(search)` → 'hot' | 'latest'
  (default 'hot'; ?scope= deep link), `scopeHref(pathname, search, scope)`.
- FeedPage: tabs Hot | Latest (role=tablist, ≥44px, square, neon-active,
  arrow-key nav). /feed = GLOBAL stream (all towns); /t/<slug>/feed stays
  town-scoped with the same tabs. Scope lives in `?scope=` (deep-link
  restores tab; tab click pushes URL).
- Town chip per post row (FeedPostCard) → `panelOpenHref(search, slug)`
  (existing `?panel=<slug>` scheme, src/lib/panel.ts).
- Latest = createdAt desc, tie-break id (determinism law). Hot = server
  engagement score (comments*2 + reactions + recency), hot-pinned first.
- Honest empty: global "Awaiting feed — no posts anywhere yet."

## Deviations (planned, honest)
- Infinite scroll (S4 brainstorm) NOT in this lane — API has no pagination;
  W4-C2 feed-load owns it. Acceptance "global newest-first scroll works" =
  full list, newest-first.
- Global /feed no longer gates on session (browsing is town-free); composer
  shows the inline IdentityPicker when unsigned (existing picker surface).
