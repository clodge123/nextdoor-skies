import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWindow, resetFetchWindow } from './fetch-window';

// Law #2: fetch per ~5-min window, NOT per pan. Uses fake timers so no
// Date.now leaks into logic (R17).
describe('fetchWindow (per-window dedupe, law #2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFetchWindow();
  });
  afterEach(() => vi.useRealTimers());

  it('coalesces multiple calls in the same window into ONE fetch', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', spy);
    const urls = Array.from({ length: 20 }, () => 'https://api.example/batch?box=1');
    await Promise.all(urls.map((u) => fetchWindow(u)));
    // advance 1 min, pan storm again — must reuse cached response
    vi.advanceTimersByTime(60_000);
    await Promise.all(urls.map((u) => fetchWindow(u)));
    expect(spy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('refetches after the window elapses', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', spy);
    await fetchWindow('https://api.example/x');
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await fetchWindow('https://api.example/x');
    expect(spy).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
