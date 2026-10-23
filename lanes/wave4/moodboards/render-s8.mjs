#!/usr/bin/env node
/**
 * WAVE-4 S8 ART-DIRECTION FRAMES (V1/V2/V3) — offline mockups, design-target
 * only. Neon-green terminal theme (C-01), zero rounded corners (C-02).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const OUT = join(ROOT, 'lanes/wave4/moodboards');
mkdirSync(OUT, { recursive: true });

const { chromium } = await import('playwright');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const css = `
:root { --bg:#0a0f0a; --surface:#0f1610; --text:#d8ffd8; --muted:#6fa06f; --accent:#39ff14; --border:#1d3a1d; --radius:0px; }
body { margin:0; background:var(--bg); color:var(--text); font:14px/1.4 ui-monospace,'SFMono-Regular',Menlo,monospace; }
.note { display:inline-block; background:var(--accent); color:#000; font-weight:800; padding:6px 12px; letter-spacing:.5px; margin-bottom:12px; }
.card { border:1px solid var(--border); padding:12px; margin-bottom:12px; background:var(--surface); }
.snap { width:100%; aspect-ratio:16/9; position:relative; overflow:hidden;
  background:
    radial-gradient(circle at 30% 40%, #123a1e 0 12%, transparent 12%),
    radial-gradient(circle at 70% 60%, #0f2a16 0 18%, transparent 18%),
    repeating-linear-gradient(0deg, #0d1f10 0 2px, transparent 2px 46px),
    repeating-linear-gradient(90deg, #0d1f10 0 2px, transparent 2px 46px),
    linear-gradient(135deg,#0a140c,#101f12 55%,#0a140c); }
.snap .road { position:absolute; background:#1d3a1d; opacity:.8; }
.pin { position:absolute; top:10px; left:10px; background:#000d; border:1px solid var(--accent); color:var(--accent); font-weight:800; padding:4px 9px; }
.wx { position:absolute; top:10px; right:10px; background:#000d; border:1px solid var(--accent); padding:6px 10px; font-weight:800; color:var(--accent); }
.strip { position:absolute; left:0; right:0; bottom:0; display:flex; align-items:center; gap:10px; padding:10px 12px; background:#000d; border-top:2px solid var(--accent); }
.strip .t { font-weight:800; color:var(--accent); }
.strip .m { color:var(--muted); }
.strip .r { margin-left:auto; font-weight:800; color:var(--accent); }
.scan { position:absolute; inset:0; background:repeating-linear-gradient(0deg, #39ff1410 0 1px, transparent 1px 4px); pointer-events:none; }
.corner { position:absolute; width:16px; height:16px; border:2px solid var(--accent); }
.corner.tl{top:6px;left:6px;border-right:0;border-bottom:0} .corner.tr{top:6px;right:6px;border-left:0;border-bottom:0}
.corner.bl{bottom:6px;left:6px;border-right:0;border-top:0} .corner.br{bottom:6px;right:6px;border-left:0;border-top:0}
.meta { margin-top:10px; color:var(--muted) }
.author { font-weight:800; color:var(--text) }
h3 { margin:0 0 6px; color:var(--accent); letter-spacing:1px }
p.cap { color:var(--muted); max-width:640px }
`;

async function frame(name, label, html) {
  const file = join('/tmp', `${name}.html`);
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css}</style>${html}`);
  await page.goto(`file://${file}`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('frame', name);
}

const map = `<div class="road" style="left:0;top:44%;width:100%;height:3px"></div><div class="road" style="left:38%;top:0;width:3px;height:100%"></div>`;
const strip = `<div class="strip"><span class="t">Florissant, MO</span><span class="m">Oct 22 · 4:12 PM</span><span class="r">⛅ 79°F · Clearing</span></div>`;

await frame('S8-V1-data-strip', 'V1 Data-strip', `
<div style="padding:24px"><div class="note">S8 · V1 DATA-STRIP — minimal, image-forward</div>
<h3>⛅ 79°F · Florissant, MO · Oct 22 4:12 PM</h3>
<div class="card"><div class="snap">${map}${strip}</div>
<p class="meta"><span class="author">@glodge</span> · Storm rolling in from the west — heading to the big hill for the show. 🌦️<br>👍 12 · 💬 4 · <span style="color:var(--accent)">Florissant feed</span></p></div>
<p class="cap">Data lives below the image; the burned-in bottom bar is the only overlay. Cleanest feed density.</p></div>`);

await frame('S8-V2-terminal-readout', 'V2 Terminal readout', `
<div style="padding:24px"><div class="note">S8 · V2 TERMINAL READOUT — data at a glance</div>
<h3>⛅ 79°F · Florissant, MO · Oct 22 4:12 PM</h3>
<div class="card"><div class="snap">${map}<div class="pin">📍 Florissant</div><div class="wx">⛅ 79°</div>${strip}</div>
<p class="meta"><span class="author">@glodge</span> · Storm rolling in from the west — heading to the big hill for the show. 🌦️<br>👍 12 · 💬 4 · <span style="color:var(--accent)">Florissant feed</span></p></div>
<p class="cap">Bottom bar + top-right weather chip (big °F + icon) + top-left location pin. More data per glance, busier image.</p></div>`);

await frame('S8-V3-full-hud', 'V3 Full HUD', `
<div style="padding:24px"><div class="note">S8 · V3 FULL HUD — radar-scope identity</div>
<h3>⛅ 79°F · Florissant, MO · Oct 22 4:12 PM</h3>
<div class="card"><div class="snap">${map}<div class="scan"></div><div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div><div class="pin">📍 Florissant</div><div class="wx">⛅ 79°</div>${strip}</div>
<p class="meta"><span class="author">@glodge</span> · Storm rolling in from the west — heading to the big hill for the show. 🌦️<br>👍 12 · 💬 4 · <span style="color:var(--accent)">Florissant feed</span></p></div>
<p class="cap">V2 plus scanline texture + corner brackets. Strongest terminal identity; heaviest overlay — test against dense urban imagery.</p></div>`);

await browser.close();
console.log('done 3 frames');
