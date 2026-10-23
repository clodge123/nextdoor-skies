// @vitest-environment jsdom
// W3-B2 TOWN PANEL — panel content + dismiss contract (unit level; the
// browser gate lives in tests/town-panel.spec.ts).
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TownPanel } from './TownPanel';
import { resetPostsCache } from './Skeleton';
import type { Alert } from '../lib/weather/alerts';

const SALINA = 'salina-38.84--97.61';

// W4-C1: module-level SWR posts cache must not leak across panel tests.
vi.mock('./Skeleton', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./Skeleton')>();
  return { ...mod, readPostsCache: () => undefined };
});

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function postsFetch(posts: unknown[]) {
  return vi.fn(async (url: string) => {
    if (url.includes('/api/posts')) return jsonResponse({ posts });
    return jsonResponse({});
  });
}

const post = {
  id: 'p1',
  author: 'maria',
  town: SALINA,
  text: 'farmers market this weekend',
  snapshot: null,
  createdAt: '2026-10-21T15:04:00.000Z',
  reactions: { '👍': 2, '❤️': 0, '😂': 0 },
  myReaction: null,
  commentsCount: 1,
  hot: false,
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof TownPanel>> = {}) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <TownPanel slug={SALINA} name="Salina" onClose={onClose} fetchImpl={postsFetch([post])} {...overrides} />
    </MemoryRouter>,
  );
  return { onClose };
}

describe('TownPanel', () => {
  it('renders name, temp, condition icon, alerts link, posts, and town-page link', async () => {
    const alerts: Alert[] = [
      { id: 'a1', event: 'Flood Warning', town: SALINA, severity: 'Severe', expires: null },
    ];
    renderPanel({ tempC: 21.5, weathercode: 61, alerts });

    expect(screen.getByTestId('town-panel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Salina' })).toBeInTheDocument();
    // Temp converted+rounded (21.5°C -> 71°F, F default) + lucide icon mapped from WMO 61 (rain).
    expect(screen.getByTestId('town-panel-temp')).toHaveTextContent('71°F');
    const icon = screen.getByTestId('town-panel-icon');
    expect(icon).toHaveAttribute('data-weathercode', '61');
    expect(icon).toHaveAttribute('data-weather-bucket', 'rain');
    expect(icon.querySelector('svg')).not.toBeNull();

    // Alert count badge -> /alerts.
    const alertsLink = screen.getByTestId('town-panel-alerts');
    expect(alertsLink).toHaveAttribute('href', '/alerts');
    expect(alertsLink).toHaveTextContent('1 active alert');

    // Recent posts (fetched via lib/feed) + "see all" -> /t/<slug>/feed.
    await waitFor(() => expect(screen.getByTestId('panel-post-p1')).toBeInTheDocument());
    expect(screen.getByTestId('panel-post-p1')).toHaveTextContent('farmers market this weekend');
    expect(screen.getByTestId('town-panel-see-all')).toHaveAttribute('href', `/t/${SALINA}/feed`);

    // "Open town page" -> /t/<slug>.
    expect(screen.getByTestId('town-panel-open')).toHaveAttribute('href', `/t/${SALINA}`);
  });

  it('honest states: no temp => "awaiting feed", no weathercode => NO icon, zero alerts', () => {
    renderPanel({ alerts: [] });
    expect(screen.getByTestId('town-panel-temp')).toHaveTextContent('awaiting feed');
    expect(screen.queryByTestId('town-panel-icon')).toBeNull();
    expect(screen.getByTestId('town-panel-alerts')).toHaveTextContent('No active alerts');
  });

  it('empty feed says "No posts here yet" (R19 honest empty)', async () => {
    renderPanel({ fetchImpl: postsFetch([]) });
    await waitFor(() => expect(screen.getByTestId('town-panel-posts-empty')).toBeInTheDocument());
  });

  it('feed failure says "Feed unavailable", never fake posts', async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    renderPanel({ fetchImpl: failing });
    await waitFor(() => expect(screen.getByTestId('town-panel-posts-error')).toBeInTheDocument());
    expect(screen.queryByTestId('town-panel-posts')).toBeNull();
  });

  it('close button dismisses', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByTestId('town-panel-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc key dismisses', () => {
    const { onClose } = renderPanel();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click-outside scrim dismisses', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByTestId('town-panel-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mobile drag past the threshold dismisses (drag-to-dismiss)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('max-width'),
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    const { onClose } = renderPanel();
    const handle = screen.getByTestId('town-panel-handle');
    // jsdom lacks PointerEvent; native Event + clientY assignment drives the
    // React pointer handlers exactly like a touch drag would.
    const drag = (type: string, y: number) => {
      const ev = new Event(type, { bubbles: true });
      Object.assign(ev, { clientY: y, clientX: 0, pointerId: 1 });
      handle.dispatchEvent(ev);
    };
    drag('pointerdown', 100);
    drag('pointermove', 240);
    drag('pointerup', 240);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('small drags do NOT dismiss (threshold law)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('max-width'),
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    const { onClose } = renderPanel();
    const handle = screen.getByTestId('town-panel-handle');
    const drag = (type: string, y: number) => {
      const ev = new Event(type, { bubbles: true });
      Object.assign(ev, { clientY: y, clientX: 0, pointerId: 1 });
      handle.dispatchEvent(ev);
    };
    drag('pointerdown', 100);
    drag('pointermove', 140);
    drag('pointerup', 140);
    expect(onClose).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('fetches posts for the URL town slug (sort=new)', async () => {
    const fetchImpl = postsFetch([post]);
    renderPanel({ fetchImpl });
    await waitFor(() => expect(screen.getByTestId('panel-post-p1')).toBeInTheDocument());
    expect(String(fetchImpl.mock.calls[0][0])).toContain(`town=${encodeURIComponent(SALINA)}`);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('sort=new');
  });
});
