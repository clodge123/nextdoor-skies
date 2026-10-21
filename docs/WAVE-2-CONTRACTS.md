# Wave 2 Seam Contracts (day-0, merged before lane launch)

Frozen contracts. Lanes implement exactly these signatures; deviations need an
orchestrator-approved amendment in this file.

## S1 Session (owner: W3-IDENTITY; consumers: W4, W5)

`src/lib/session.ts`:

```ts
export interface Session { nickname: string; townSlug: string; townName: string }
export function getSession(): Session | null      // localStorage 'nds-session', null if absent
export function setSession(s: Session): void
export function clearSession(): void
export function pickTownSlug(name: string): string // slugify(name) + lat/lon rounded -> gazetteer match
```

No accounts. Nickname 2–24 chars, sanitized (no HTML).

## S2 Posts API (owner: W4-POSTS; consumer: W5-FEED)

`GET /api/posts?town=<slug>&sort=hot|new` →
```json
{ "posts": [ { "id": "p_...", "author": "nick", "town": "slug", "text": "...",
  "snapshot": "data:image/jpeg;base64,...", "createdAt": "ISO-8601",
  "reactions": {"👍": 0, "❤️": 0, "😂": 0}, "myReaction": null,
  "commentsCount": 0, "hot": true } ] }
```
`POST /api/posts` body `{ town, text, snapshot? }` (needs session header
`x-nds-session`, JSON-encoded) → 201 Post | 401 no session | 429 rate-limited.
Hot = replies + reactions + recency score; `sort=hot` returns hot-pinned
first, newest follows. Rate limit: 5 posts/hour per IP. Flag:
`POST /api/posts/:id/flag` → hidden after 3 distinct flags.

## S3 Comments (owner: W4; consumer: W5)

`GET /api/posts/:id/comments` → `[{ id, author, text, createdAt }]`
`POST /api/posts/:id/comments` body `{ text }` (session required).
One level only: post → replies. No nested threads.

## S4 Reactions (owner: W4; consumer: W5)

`POST /api/posts/:id/reactions` body `{ emoji: "👍" | "❤️" | "😂" }` —
toggle: same emoji twice removes it. One reaction per nickname per post.

## S5 Weather (owner: W1-WEATHER; consumer: map badges)

`GET /api/weather?bbox=<lng1>,<lat1>,<lng2>,<lat2>&zoom=<n>` →
`{ "temps": { "<townSlug>": 72.1 }, "stale": false }`
Server-side: towns inside bbox at zoom ≥9, chunked per-town
`api.open-meteo.com/v1/forecast` calls, ≤50 towns/request, 5-min cache TTL.
Client refresher keeps fetch-per-window law (one fetch per viewport window).
`TOWN_BADGE_MIN_ZOOM = 9` — W1 owns the constant (src/components/TownBadges.tsx);
W6 owns badge CSS only.

## S6 Alerts (owner: W2-ALERTS; consumers: map banner, badge dots)

`GET /api/alerts?bbox=<lng1>,<lat1>,<lng2>,<lat2>` →
`{ "alerts": [ { "id", "event", "town", "severity", "expires" } ] }`
Server resolves town→county FIPS via NWS points API, cached per town.

## S7 Snapshots (owner: W4 storage; producer: client + seed seeder)

Canvas capture (`preserveDrawingBuffer: true`) downscaled ~600px JPEG,
data URL ≤120 KB, stored in post row. No Blob, no upload.

## S8 DB migrations (owner: W4)

Idempotent `db/schema.sql` additions: posts, comments, reactions, flags.
Applied via temporary `/api/migrate` endpoint, removed after success
(wave-1 pattern).
