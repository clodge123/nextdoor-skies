// L5 law #2: fetch PER ~5-min WINDOW, never per pan. This is the shared
// cadence seam L6 uses for weather batches. Uses performance.now() (no
// Date.now/new Date in logic — R17 determinism law).
export const WINDOW_MS = 5 * 60 * 1000;

type InFlight = { promise: Promise<Response>; settledAt: number };

const cache = new Map<string, InFlight>();

/**
 * Return a promise for `url`'s response. Within one 5-minute window, all
 * callers share ONE request (dedupe + cache). A pan that lands in the same
 * window reuses the cached response — no refetch storm.
 */
export function fetchWindow(url: string, windowMs: number = WINDOW_MS): Promise<Response> {
  const now = performance.now();
  const hit = cache.get(url);
  if (hit && now - hit.settledAt < windowMs) return hit.promise;
  const p = fetch(url).then((res) => {
    cache.set(url, { promise: p, settledAt: performance.now() });
    return res;
  });
  cache.set(url, { promise: p, settledAt: now });
  return p;
}

/** Test seam: clear the window cache. */
export function resetFetchWindow(): void {
  cache.clear();
}
