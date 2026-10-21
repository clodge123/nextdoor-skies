/**
 * Minimal feed page fixture for the L7 Playwright gate (Gate 1).
 * Fetches /api/reports and renders posts; rows with seeded:true get an
 * honest "Demo data" badge (docs/SEED-CONTRACT.md). Wave 2 replaces this
 * fixture with the real feed UI — same label contract.
 */
export const FEED_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nextdoor Skies — Town Feed</title>
<style>
  :root { --radius: 0px; }
  body { font-family: system-ui, sans-serif; margin: 0; background: #0b1020; color: #e8ecf4; }
  main { max-width: 640px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; }
  .post { border: 1px solid #2a3550; border-radius: var(--radius); padding: 12px; margin-bottom: 12px; }
  .post .meta { font-size: 12px; color: #93a0bd; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .demo-label { background: #3b2f6b; color: #cbb8ff; font-size: 11px; padding: 2px 6px; border-radius: var(--radius); text-transform: uppercase; letter-spacing: 0.04em; }
  .post .body { margin: 8px 0 4px; }
  .comments { margin-top: 8px; border-top: 1px solid #2a3550; padding-top: 8px; }
  .comment { font-size: 13px; margin: 4px 0; }
  .comment .author { color: #93a0bd; }
  .type { font-weight: 600; text-transform: capitalize; }
</style>
</head>
<body>
<main>
  <h1>Town Feed</h1>
  <div id="feed"></div>
</main>
<script>
async function load() {
  const res = await fetch('/api/reports');
  const data = await res.json();
  const feed = document.getElementById('feed');
  const byPost = new Map();
  for (const c of (data.comments ?? [])) {
    if (!byPost.has(c.report_id)) byPost.set(c.report_id, []);
    byPost.get(c.report_id).push(c);
  }
  const posts = [...data.reports].sort((a, b) => b.ts.localeCompare(a.ts));
  for (const p of posts) {
    const el = document.createElement('article');
    el.className = 'post';
    el.dataset.postId = p.id;
    el.dataset.seeded = String(p.seeded === true);
    const comments = (byPost.get(p.id) ?? [])
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .map((c) => '<div class="comment"><span class="author">' + c.author + ':</span> ' + c.body + '</div>')
      .join('');
    el.innerHTML =
      '<div class="meta"><span class="type">' + p.type + '</span>' +
      '<span>' + p.town + '</span><span>' + new Date(p.ts).toLocaleString() + '</span>' +
      (p.seeded === true ? '<span class="demo-label">Demo data</span>' : '') +
      '</div><div class="body">' + p.body + '</div>' +
      (comments ? '<div class="comments">' + comments + '</div>' : '');
    feed.appendChild(el);
  }
}
load();
</script>
</body>
</html>`;
