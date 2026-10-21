import type { Route } from '@playwright/test';

/**
 * Shared tile relay (L5 pattern, now used by golden-path too).
 *
 * This host egresses through an authenticating HTTP proxy that strips CORS
 * headers, so the browser cannot fetch OpenFreeMap tiles directly. Node-side
 * fetch honors the env proxy and re-serves the bytes with CORS added. Tile
 * failures are fulfilled as 502 — tile errors are WARNINGS (law #4): the UI
 * must not flip to a stuck error state.
 */
export async function relayOfm(route: Route): Promise<void> {
  const url = route.request().url();
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
  } catch (e) {
    await route.fulfill({ status: 502, body: String(e) });
  }
}

/** Attach the relay to a page (OpenFreeMap tile URLs only). */
export async function attachTileRelay(page: {
  route: (pattern: string, handler: (route: Route) => void) => Promise<void>;
}): Promise<void> {
  await page.route('**openfreemap.org/**', relayOfm);
}
