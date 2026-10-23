# W4-C2 FEED-LOAD — CLOSEOUT (wave 4, round 2)

Branch `r4w4/C2-feed-load` · base main tip `1345a99` (remote `82dcd14`,
tree verified identical) · final `ae2b1ed`.

## What landed

1. **Server `page` param** (`api/posts.js`): absent `page` → FULL list,
   byte-identical to every pre-C2 response (TownPanel / feed-all / detail
   consumers unchanged). `page=N` → deterministic slice of the SAME sorted
   list `[(N-1)*30, N*30)` — sort before slice, id tie-break (R17), pages
   tile exactly (no overlap/skip). Junk page → loud 400, never silent
   fallback. `PAGE_SIZE = 30` exported.
2. **Prefetch (ring law → posts)** (`src/lib/feed-prefetch.ts`): badge /
   label-target hover+focus (and cluster badges → every member town)
   prefetches page 1. Key `prefetch:posts:<town>:<sort>` — NEVER shares a
   supersession key with user `posts:*` (C1 contract: prefetches can't
   abort user requests; LRU eviction aborts only prefetch keys). Per-key
   dedupe (no storms), LRU cap 3 (monotonic counter, R17), SWR write-through
   into the page-1 cache key. Seams: `__ndsPrefetchKeys` (in-flight),
   `__ndsPrefetchTowns` (LRU).
3. **Infinite scroll** (`src/pages/FeedPage.tsx`): IntersectionObserver
   sentinel (800px rootMargin) appends the next page; Load-more button is
   the honest keyboard fallback (≥44px). Append is id-dedupe (`appendUnique`
   pure) — existing rows keep identity/keys (no churn), live-list straddles
   never duplicate. ≤3 page requests in flight (hard cap). Short page =
   honest end marker "You're all caught up" (sentinel gone, zero fake
   rows). Append failure = inline honest retry, last-good rows stay.
   Page keys: page 1 legacy `posts:<town>:<sort>`, pages ≥2 `...:p<N>` so
   appends never abort the page-1 view (per-page Google-Maps keying).
4. **content-visibility: auto + contain-intrinsic-size auto 150px** on
   `.feed-card` rows (off-screen rows skip paint; keyboard Tab reaches
   them; scroll height stays honest).
5. **Cached-first per-page** (`Skeleton.tsx` `postsCacheKey(town, sort,
   page)`): page 1 keeps the legacy key shape (TownPanel byte-identical);
   pages ≥2 use `<town>|<sort>|<page>`. Cached page appends render with
   zero network (proven in test).

## Gates

- vitest **576/576** (554 base + 7 page-param server + 8 FeedPage infinite
  scroll + 7 prefetch) after F1 sync; tsc -b clean; vite build clean;
  check:determinism / radius / no-cwc clean.
- ONE gated Playwright run (`REAL_API=1 scripts/e2e-gate.sh npx playwright
  test tests/feed-load.spec.ts tests/feed-all.spec.ts --project=desktop`):
  **6/6 passed** — page 2 appends on scroll (35 real posts seeded via POST
  /api/posts, 30+5 rows, no dupes), honest end marker, content-visibility
  CSS asserted, prefetch fires on Salina badge hover (network log +
  `__ndsPrefetchTowns` key proof, zero user-key traffic), E1 tabs restored.
- loading.spec.ts (3) + feed-all.spec.ts (4) re-run green.

## Deviations (honest)

1. **`api/posts.test.js` does not exist** in this repo (vitest include is
   `src/**/*.test.*` + `tests/**/*.test.*`). Server page-param tests went
   into `tests/posts-api.test.ts` (the canonical posts-API suite, 7 new
   cases) — same coverage, repo pattern.
2. **FeedPage page-1 URL changed** `/api/posts?sort=new` →
   `...&page=1` (explicit slice = correct paging semantics). One E1 unit
   assertion updated; panel/other consumers untouched (they send no page).
3. **Merge-disease fix**: main tip's B3 merge had DROPPED E1's
   `.feed-tabs`/`.feed-town-chip` CSS (tabs rendered 21px, breaking E1's
   44px gate — feed-all.spec failed on base). Restored the canonical
   `ec071d0` block (the identical fix W4-G1 carries in round 3). Not my
   lane's scope, but "keep E1 intact" required it.
4. **F1 sync mid-lane**: remote main moved to `b392a1d` (tour lane merged)
   during the run; merged its files in (blob-fetch, zero conflicts).
5. Prefetch fires on hover/focus (badge/label ring) rather than idle-poll
   of the visible ring — the ring law's "visible town + neighbors" maps to
   attention events; an idle viewport poll would be a request storm for
   zoom-3 continental views (21k towns) and hits the LRU cap anyway.

## Closeout sweep

No leftover chrome-headless/service children (all 34 host procs were
pre-existing zombies, 0 RSS; lane spawned none that survived). No
api-serve/vite preview children left (playwright webServer exits with the
runner). No scheduler/cron added.
