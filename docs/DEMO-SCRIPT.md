# DEMO-SCRIPT — Recruiter Demo Walkthrough (W3-E1)

The seeded data tells a story: five demo towns (Springfield MO, Salina KS,
Amarillo TX, Flagstaff AZ, Santa Fe NM) each carry storm-chase / heat-wave /
snow / fog posts, one live map snapshot, visible reactions + replies, and
hot-pinned variety. Production base URL: `https://nextdoor-skies-run2.vercel.app`
(local harness: `http://127.0.0.1:43118`). Slugs are canonical
`slugify(name)-<lat2dp>-<lon2dp>`.

1. **Map first-glance** — open `/` → town badges with temps + condition icons,
   weather-driven sky tint, labels/dots clickable below zoom 9.
2. **Badges & icons** — badges pulse a ring on active alerts; lucide WMO icons
   read cleanly in both themes (toggle theme in header).
3. **Search fly-to** — type "Salina" in the header search, Enter → the map
   flies (eased ~1.8s) to Salina KS and opens the town panel. URL stays
   honest: `/?panel=salina-38.84--97.61`.
4. **Town panel** — `/?panel=springfield-37.22--93.3` (or click the badge):
   slide-over with conditions card, town alerts, recent posts, "Open town
   feed". Full page: `/t/springfield-37.22--93.3`.
5. **Feed hot view** — `/feed` (session town) → "Hot right now" pins the
   engagement-bearing posts: the Springfield storm-chase post carries a map
   snapshot, reactions counts, and replies. Switch "New" to see recency sort.
6. **Post detail + lightbox + share** — click any author line → `/p/<id>`
   full-thread page; tap the snapshot → full-screen lightbox (swipe/Esc);
   Copy-link button + native share on mobile. Deep-link proof: seeded post
   URLs work cold.
7. **Alerts center** — `/alerts` (or panel toggle `P`) → severity-sorted,
   color-coded, grouped by town, per-row "mute town"; replaces the old banner.
8. **Command palette** — `Ctrl/Cmd+K` → jump to town, switch theme, open
   feed/alerts, toggle panel; recents persist per session.
9. **Tour** — first-visit 3-step spotlight (pick town → explore map → open
   feed), replayable from the header (lands with W3-E2).

Demo tips: open a town panel, hit "View on map" on a post card to show the
fly-to law; open `/p/` a snapshot post and copy the link to show shareable
URLs; the Hot view is alive because every seeded post carries deterministic
engagement (3–8 reactions, 0–3 comments; polish posts ≥1 comment).

## What to run post-deploy (wave-end deploy law)

Prod runs wave-2 code until the wave-end deploy ships the merged tip. Then:

```bash
# 1. Seed the 20 new polish posts (plan is index-stable; text-match skip makes
#    re-dispatch safe). CI workflow seed-wave2.yml shards cover plan[177..196]
#    with shard_size 5 (dispatch shards 35+; extend matrix) OR direct-DB:
node scripts/seed-wave2.mjs --db --offset 177 --count 20   # POSTGRES_URL

# 2. Capture real snapshots for the 5 new demo towns (paint-fixed C7 capture,
#    admin PATCH route must be live + NDS_ADMIN_SECRET set). Reseed offsets
#    are TOWN indices: the 5 polish towns sit at 20..24 of the metro roster.
node scripts/seed-wave2.mjs --reseed --offset 20 --count 5   # towns 20-24

# 3. Engagement top-up (idempotent; polish pattern 3-8 reactions + 1-3 comments):
node scripts/seed-wave2.mjs --engagement --offset 177 --count 20
```

Local verification (no prod writes — this is what the gated seed spec proves):

```bash
node scripts/api-serve.mjs 43118 &
node scripts/polish-seeds.mjs          # seeds the full polished plan (197 posts)
REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/seed.spec.ts
```
