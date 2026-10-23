# W4-C2 FEED-LOAD — lane notes (survival commit)

Base: main tip 1345a99 (remote 82dcd14 verified tree-identical).
Plan:
1. api/posts.js: `page` param — absent/page=1 -> FULL list (byte-identical
   law); page>=2 -> deterministic slice [(page-1)*PAGE_SIZE, page*PAGE_SIZE).
2. src/lib/feed-prefetch.ts: LRU(3) prefetch, key `prefetch:posts:<town>:<sort>`
   (never aborts user `posts:*` keys), dedupe per key, SWR write to page-1 key.
3. TownBadges hover/focus -> prefetch seam; MapPage wires it.
4. FeedPage: IntersectionObserver sentinel appends page 2+, id-dedupe append,
   <=3 pages in flight, honest end marker, per-page cache keys.
5. content-visibility:auto + contain-intrinsic-size on .feed-card rows.
