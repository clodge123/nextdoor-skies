#!/usr/bin/env node
/**
 * W4-B2 ZOOM-MATCH PROBE — evidence for per-tier badge zoom gates.
 *
 * Drives the REAL app (scripts/e2e-serve.mjs dual build, real MapView with
 * the nds-labels-{country,state,city,town} symbol layers) and, for one sample
 * town per tier, sweeps zoom 3..14 centered on the town and asks the map
 * ITSELF which of its labels are rendered at each zoom:
 *
 *   map.queryRenderedFeatures({ layers: [...label layers] })
 *
 * A town's label counts as VISIBLE at zoom z iff a feature carrying that
 * exact name comes back from any label layer. This is the map's ground truth
 * (collision-detected, layer-zoom-filtered), not a style-spec guess.
 *
 * Output: JSON table { tier, town, visibleAt: {z: true/false}, firstVisible }
 * on stdout + docs/metrics/W4-B2-label-visibility.json.
 *
 * Run inside the fleet browser gate:
 *   scripts/e2e-gate.sh node scripts/probe-label-visibility.mjs
 * (expects the app already served on E2E_PORT, default 43117 — start
 *  scripts/e2e-serve.mjs 43117 in the same gate invocation).
 */
import { chromium } from 'playwright';

const PORT = Number(process.env.E2E_PORT ?? 43117);
const BASE = `http://127.0.0.1:${PORT}`;
const ZOOMS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const LABEL_LAYERS = ['nds-labels-country', 'nds-labels-state', 'nds-labels-city', 'nds-labels-town'];

// One sample per tier (top-population town of that tier in data/towns).
const SAMPLES = [
  { tier: 'country', name: 'New York City', lon: -74.006, lat: 40.7143 },
  { tier: 'state', name: 'Austin', lon: -97.7431, lat: 30.2672 },
  { tier: 'city', name: 'Kenosha', lon: -87.8212, lat: 42.5847 },
  { tier: 'town', name: 'Cross Lanes', lon: -81.7907, lat: 38.4204 },
];

async function relayOfm(route) {
  const url = route.request().url();
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await route.fulfill({
        status: 200,
        body: buf,
        headers: {
          'access-control-allow-origin': '*',
          'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        },
      });
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  await route.fulfill({ status: 502, body: String(lastErr) });
}

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e).slice(0, 200)));
await page.route('**tiles.openfreemap.org/**', relayOfm);

const table = [];
for (const s of SAMPLES) {
  await page.goto(`${BASE}/?ndsCenter=${s.lon},${s.lat}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 60_000 },
  );
  const row = { tier: s.tier, name: s.name, visibleAt: {}, layers: {} };
  for (const z of ZOOMS) {
    const hits = await page.evaluate(
      async ({ z, layers, name, lon, lat }) => {
        const m = window.ndsMap;
        m.jumpTo({ center: [lon, lat], zoom: z });
        await new Promise((res) => {
          const t = setTimeout(res, 3000);
          m.once('idle', () => { clearTimeout(t); res(); });
        });
        const feats = m.queryRenderedFeatures({ layers });
        const found = feats.filter((f) => f.properties?.name === name);
        return found.map((f) => f.layer.id);
      },
      { z, layers: LABEL_LAYERS, name: s.name, lon: s.lon, lat: s.lat },
    ).catch(() => []);
    row.visibleAt[z] = hits.length > 0;
    if (hits.length) row.layers[z] = [...new Set(hits)];
  }
  row.firstVisible = Object.entries(row.visibleAt).find(([, v]) => v)?.[0] ?? null;
  table.push(row);
  console.log(JSON.stringify(row));
}
await browser.close();

import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('docs/metrics', { recursive: true });
writeFileSync('docs/metrics/W4-B2-label-visibility.json', JSON.stringify(table, null, 2));
console.log('WROTE docs/metrics/W4-B2-label-visibility.json');
