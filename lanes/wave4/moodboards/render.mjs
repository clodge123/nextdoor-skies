#!/usr/bin/env node
/**
 * WAVE-4 MOODBOARD RENDERER (brainstorm artifact — app tree untouched)
 * Two kinds of frames, per wave-brainstorm-sessions law:
 *  A) REAL-ENGINE captures: headless Playwright against the live local app
 *     (dist + api-serve, REAL_API=1, zero mocks) — shows CURRENT state.
 *  B) TARGET mockups: offline HTML (design-target only, clearly labeled) —
 *     shows what wave 4 decisions lock in.
 * Output: lanes/wave4/moodboards/*.png + frames.json manifest.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const OUT = join(ROOT, 'lanes/wave4/moodboards');
mkdirSync(OUT, { recursive: true });

const API_PORT = 43129; // moodboard lane port (outside 43117/43118 harness range)
const BASE = `http://127.0.0.1:${API_PORT}`;
// Host law (playwright.config.ts): Node 24 fetch honors the egress env proxy,
// which intercepts loopback health-checks. Keep 127.0.0.1 off-proxy here.
process.env.NO_PROXY = '127.0.0.1,localhost,::1';
process.env.no_proxy = '127.0.0.1,localhost,::1';

const { chromium } = await import('playwright');
const api = spawn('node', ['scripts/api-serve.mjs', String(API_PORT)], { cwd: ROOT, stdio: 'pipe' });
api.stdout.on('data', () => {});
api.stderr.on('data', () => {});

async function waitForHttp(url, ms = 30_000) {
  const end = Date.now() + ms;
  for (;;) {
    try { if ((await fetch(url)).ok) return; } catch { /* not yet */ }
    if (Date.now() > end) throw new Error(`no answer from ${url}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}
await waitForHttp(`${BASE}/`);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const manifest = [];
async function shot(page, name, label, kind) {
  const file = `${name}.png`;
  await page.screenshot({ path: join(OUT, file) });
  manifest.push({ file, label, kind });
  console.log(`frame ${file} (${kind})`);
}
async function newPage(viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('nds-tour-seen', '1'); } catch {}
  });
  return { ctx, page };
}

// ---------- A) REAL-ENGINE CURRENT-STATE FRAMES ----------
{
  const { ctx, page } = await newPage();
  // F1: OKC cluster zoom — current badges, temps, label coverage
  await page.goto(`${BASE}/?ndsCenter=-97.5164,35.4676#zoom=10`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ndsMap?.isStyleLoaded?.() === true, null, { timeout: 45_000 });
  await page.waitForTimeout(3500);
  await shot(page, 'A1-map-current-okc', 'CURRENT: Oklahoma City metro zoom-10 — badges, temps (C), label coverage', 'real-engine');
  await ctx.close();
}
{
  const { ctx, page } = await newPage();
  // F2: town panel for Jeffersonville (owner's stuck "awaiting feed" case)
  await page.goto(`${BASE}/?panel=jeffersonville-38.2776--85.7372`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ndsMap?.isStyleLoaded?.() === true, null, { timeout: 45_000 });
  await page.waitForTimeout(5000);
  await shot(page, 'A2-panel-jeffersonville', 'CURRENT: Jeffersonville town panel — the "awaiting feed" stall surface', 'real-engine');
  await ctx.close();
}
{
  const { ctx, page } = await newPage();
  // F3: global feed (Hot) — user-post image state
  await page.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await shot(page, 'A3-feed-hot-current', 'CURRENT: /feed Hot view — seeded images vs user-post images', 'real-engine');
  await ctx.close();
}
{
  const { ctx, page } = await newPage();
  // F4: alerts page rows (fly-to target = town name only, today)
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await shot(page, 'A4-alerts-rows', 'CURRENT: /alerts rows — click target scope today', 'real-engine');
  await ctx.close();
}

// ---------- B) TARGET MOCKUP FRAMES (offline, design-target) ----------
const mockCss = `
:root { --bg:#0d1117; --surface:#161b22; --text:#f0f6fc; --muted:#8b949e; --accent:#58a6ff; --border:#30363d; --radius:0px; }
body { margin:0; background:var(--bg); color:var(--text); font:14px/1.4 ui-sans-serif,system-ui,sans-serif; }
.map { position:relative; height:100vh; background:linear-gradient(135deg,#123,#1a2b3a 60%,#234); overflow:hidden; }
.grid { position:absolute; inset:0; background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px); background-size:64px 64px; opacity:.25; }
.town { position:absolute; display:flex; flex-direction:column; align-items:center; gap:4px; }
.town .label { font-weight:700; text-shadow:0 1px 3px #000; white-space:nowrap; }
.badge { display:inline-flex; align-items:center; gap:6px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:4px 10px; font-weight:700; box-shadow:0 2px 8px #0008; }
.badge .icon { width:18px; height:18px; border-radius:50%; background:radial-gradient(circle,#ffd75a 40%,#f66 100%); }
.badge .deg { color:var(--accent); }
.cluster .badge { border-color:var(--accent); }
.panel { position:absolute; top:64px; right:0; width:360px; bottom:0; background:var(--surface); border-left:2px solid var(--border); padding:16px; overflow:hidden; }
.card { border:1px solid var(--border); border-radius:var(--radius); padding:12px; margin-bottom:12px; background:var(--bg); }
.skeleton { position:relative; overflow:hidden; }
.skeleton::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent,#ffffff22,transparent); animation:sh 1.2s infinite; }
@keyframes sh { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
.sk-line { height:12px; background:#21262d; margin:8px 0; border-radius:2px; }
.err { border:1px solid #f85149; }
.btn { display:inline-block; padding:8px 14px; border:1px solid var(--accent); color:var(--accent); font-weight:700; }
.snap { width:100%; aspect-ratio:16/9; background:linear-gradient(120deg,#1c2f3f,#2c4a5f); position:relative; border:1px solid var(--border); }
.snap .strip { position:absolute; left:0; right:0; bottom:0; display:flex; align-items:center; gap:10px; padding:10px 12px; background:#0d1117d8; border-top:2px solid var(--accent); }
.snap .pin { position:absolute; top:12px; left:12px; background:#f85149; color:#fff; font-weight:800; padding:3px 8px; }
.snap .wx { position:absolute; top:12px; right:12px; background:#0d1117d8; border:1px solid var(--border); padding:6px 10px; font-weight:800; }
.tabs { display:flex; gap:0; border-bottom:2px solid var(--border); margin-bottom:12px; }
.tab { padding:10px 18px; font-weight:700; }
.tab.on { border-bottom:2px solid var(--accent); color:var(--accent); margin-bottom:-2px; }
.chip { display:inline-block; border:1px solid var(--border); padding:2px 8px; font-size:12px; color:var(--muted); }
.row { display:flex; align-items:center; gap:12px; border:1px solid var(--border); padding:14px; margin-bottom:8px; cursor:pointer; }
.row:hover,.row.hot { border-color:var(--accent); background:#1f6feb14; }
.sev { width:6px; align-self:stretch; background:#f85149; }
.note { position:absolute; top:12px; left:12px; background:#f85149; color:#fff; font-weight:800; padding:6px 12px; letter-spacing:.5px; }
.header { position:absolute; top:0; left:0; right:0; height:56px; background:var(--surface); border-bottom:2px solid var(--border); display:flex; align-items:center; gap:12px; padding:0 16px; z-index:5; }
.toggle { border:1px solid var(--accent); color:var(--accent); font-weight:800; padding:8px 12px; }
`;

async function mockup(name, label, html, viewport = { width: 1280, height: 800 }) {
  const file = join('/tmp', `${name}.html`);
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${mockCss}</style>${html}`);
  const { ctx, page } = await newPage(viewport);
  await page.goto(`file://${file}`);
  await page.waitForTimeout(300);
  await shot(page, name, label, 'mockup-target');
  await ctx.close();
}

// M1: badge-above-label + zoom-match + de-cluster, Fahrenheit
await mockup('M1-badge-above-label', 'TARGET: badges ABOVE town labels, °F, zoom-matched, same-temp cluster badge', `
<div class="map"><div class="grid"></div>
<div class="note">TARGET STATE — not the current app</div>
<div class="town" style="left:24%;top:30%"><div class="badge"><span class="icon"></span>Oklahoma City <span class="deg">75°F</span></div><div class="label">Oklahoma City</div></div>
<div class="town cluster" style="left:52%;top:52%"><div class="badge"><span class="icon"></span>Moore +2 · 75°F</div><div class="label">Moore +2</div></div>
<div class="town" style="left:70%;top:26%"><div class="badge"><span class="icon"></span>Tulsa <span class="deg">79°F</span></div><div class="label">Tulsa</div></div>
<div class="town" style="left:14%;top:66%"><div class="badge"><span class="icon"></span>Wichita <span class="deg">72°F</span></div><div class="label">Wichita</div></div>
<div class="town" style="left:80%;top:70%"><div class="label" style="color:var(--muted)">Norman</div></div>
<p style="position:absolute;bottom:16px;left:16px;color:var(--muted);max-width:520px">Badge appears exactly when the map shows the label. Same-temp neighbors collapse to ONE badge ("Moore +2") until you zoom. Names never covered.</p>
</div>`);

// M2: loading law — skeleton, honest error, instant cache
await mockup('M2-loading-law', 'TARGET: skeleton shimmer while fetching · honest error + retry · cached-first', `
<div style="padding:24px;max-width:760px">
<div class="note" style="position:static;display:inline-block;margin-bottom:12px">TARGET STATE — not the current app</div>
<div class="card skeleton"><div class="sk-line" style="width:40%"></div><div class="sk-line" style="width:85%"></div><div class="sk-line" style="width:65%"></div></div>
<div class="card err"><b>Feed unavailable — Jeffersonville</b><br><span style="color:var(--muted)">Request timed out after 10s (2 tries).</span><br><span class="btn">Try again</span></div>
<div class="card"><b>Jeffersonville, IN</b> <span class="chip">75°F · Partly cloudy</span><br>Real post, shown instantly from cache while refreshing in background.</div>
<p style="color:var(--muted)">No "awaiting feed" limbo: skeleton → content, cached-first, fast pans cancel stale requests.</p>
</div>`);

// M3: snapshot card with data overlay + composer
await mockup('M3-snapshot-overlay', 'TARGET: user-post snapshot — real map render, weather strip, location chip, NO fallback', `
<div style="padding:24px;max-width:640px">
<div class="note" style="position:static;display:inline-block;margin-bottom:12px">TARGET STATE — not the current app</div>
<div class="card">
<div class="snap"><div class="pin">📍 Florissant, MO</div><div class="wx">⛅ 79°F</div><div class="strip"><b>Florissant, MO</b><span style="color:var(--muted)">Oct 22 · 4:12 PM</span><span style="margin-left:auto;color:var(--accent)">⛅ 79°F · Clearing</span></div></div>
<p style="margin:12px 0 0">Storm rolling in from the west — heading to the big hill for the show. 🌦️</p>
<div style="margin-top:10px;color:var(--muted)">👍 12 · 💬 4 · <span class="chip">Florissant feed</span></div>
</div>
<p style="color:var(--muted)">Composer: map view (defaults to your screen) → town chip auto-filled → text → snapshot auto-attached (server-side tile render, burned-in data). Works for every user, every time.</p>
</div>`);

// M4: all feed tabs + infinite scroll
await mockup('M4-all-feed', 'TARGET: Feed tabs Hot | Latest (global stream), town chips, infinite scroll', `
<div style="padding:24px;max-width:680px">
<div class="note" style="position:static;display:inline-block;margin-bottom:12px">TARGET STATE — not the current app</div>
<div class="tabs"><div class="tab">Hot</div><div class="tab on">Latest — all towns</div></div>
<div class="card"><b>Marfa, TX</b> <span class="chip">Marfa</span><br>Chin rest on the wall, wind at zero. <span style="color:var(--muted)">1h</span></div>
<div class="card"><b>Santa Fe, NM</b> <span class="chip">Santa Fe</span><br>First frost on the plaza grass this morning. <span style="color:var(--muted)">2h</span></div>
<div class="card"><b>Kodiak, AK</b> <span class="chip">Kodiak</span><br>Fog so thick the ferries are blind. <span style="color:var(--muted)">3h</span></div>
<div class="card skeleton"><div class="sk-line" style="width:45%"></div><div class="sk-line" style="width:80%"></div></div>
<p style="color:var(--muted)">Newest-first across every town; town chip opens the panel; next page loads as you scroll.</p>
</div>`);

// M5: alerts whole-row fly-to
await mockup('M5-alerts-whole-row', 'TARGET: entire alert row = fly-to target, hover/focus affordance', `
<div style="padding:24px;max-width:680px">
<div class="note" style="position:static;display:inline-block;margin-bottom:12px">TARGET STATE — not the current app</div>
<div class="row hot"><div class="sev"></div><div><b>Severe Thunderstorm Warning</b><br><span style="color:var(--muted)">Jeffersonville, IN · 2:41 PM · radar-tracked</span></div><div style="margin-left:auto;color:var(--accent);font-weight:800">FLY TO →</div></div>
<div class="row"><div class="sev" style="background:#d29922"></div><div><b>Heat Advisory</b><br><span style="color:var(--muted)">Tulsa, OK · 1:05 PM</span></div><div style="margin-left:auto;color:var(--muted)">FLY TO →</div></div>
<p style="color:var(--muted)">Whole card clickable (not just the town name); one Tab stop per row, Enter flies.</p>
</div>`);

await browser.close();
api.kill('SIGTERM');
writeFileSync(join(OUT, 'frames.json'), JSON.stringify(manifest, null, 2));
console.log('done', manifest.length, 'frames');
