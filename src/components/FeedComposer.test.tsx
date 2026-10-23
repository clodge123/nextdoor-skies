// W4-D2 SNAPSHOT COMPOSER tests — capture button POSTs /api/snapshot,
// burned preview renders, post ships snapshot + snapshotId + view coords,
// loud 502 shows the exact S7#4 message with RETRY / POST-WITHOUT-IMAGE,
// town chip renders, no-coordinate town disables capture. fetchImpl seam =
// no real network; R17-safe.
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedComposer } from './FeedComposer'
import { SESSION_STORAGE_KEY, type FetchLike, type Session } from '../lib/feed'

const SESSION: Session = { nickname: 'jordan', townSlug: 'springfield-37.22--93.3', townName: 'Springfield' }

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  } as Response
}

/** Fake canvas so burnInStrip works in jsdom (no real 2d raster). */
function stubCanvas() {
  const original = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          arc: vi.fn(),
          closePath: vi.fn(),
          strokeRect: vi.fn(),
          fillText: vi.fn(),
          measureText: (t: string) => ({ width: t.length * 8 }),
          set font(_v: string) {},
          set fillStyle(_v: string) {},
          set strokeStyle(_v: string) {},
          set lineWidth(_v: number) {},
          set lineCap(_v: string) {},
          set lineJoin(_v: string) {},
          set textBaseline(_v: string) {},
          set textAlign(_v: string) {},
        }),
        toDataURL: () => 'data:image/jpeg;base64,' + 'A'.repeat(60_000),
      } as unknown as HTMLCanvasElement
    }
    return original(tag)
  })
}

/** jsdom never loads <img> resources — fake Image fires onload synchronously
 *  so decodeJpeg resolves (the burn-in path draws onto the stub canvas). */
function stubImage() {
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_v: string) {
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', FakeImage)
}

/**
 * Route seam: POST /api/snapshot -> capture (status configurable),
 * GET /api/snapshots -> JPEG bytes, GET /api/weather -> temps/codes,
 * POST /api/posts -> 201 echo.
 */
function apiFor(opts: { snapshotStatus?: number; snapshotError?: string } = {}): FetchLike & { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const u = new URL(url, 'http://localhost')
    if (u.pathname === '/api/snapshot' && init?.method === 'POST') {
      if (opts.snapshotStatus && opts.snapshotStatus !== 201) {
        return jsonResponse({ error: opts.snapshotError ?? 'snapshot failed' }, opts.snapshotStatus)
      }
      return jsonResponse(
        { id: 'snap_k3m9d2', url: '/api/snapshots?path=snap_k3m9d2', lat: 37.22, lon: -93.3, zoom: 6, bytes: 43223 },
        201,
        { date: 'Fri, 23 Oct 2026 07:56:00 GMT' },
      )
    }
    if (u.pathname === '/api/snapshots') {
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([0xff, 0xd8]).buffer } as Response
    }
    if (u.pathname === '/api/weather') {
      return jsonResponse({ temps: { 'springfield-37.22--93.3': 70 }, codes: { 'springfield-37.22--93.3': 0 }, stale: false })
    }
    if (u.pathname === '/api/posts' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      return jsonResponse({
        post: {
          id: 'p_new',
          author: SESSION.nickname,
          town: body.town,
          text: body.text,
          snapshot: body.snapshot ?? null,
          snapshotId: body.snapshotId ?? null,
          lat: body.lat ?? null,
          lon: body.lon ?? null,
          zoom: body.zoom ?? null,
          createdAt: '2026-10-23T07:56:00.000Z',
          reactions: { '👍': 0, '❤️': 0, '😂': 0 },
          myReaction: null,
          commentsCount: 0,
          hot: false,
        },
      }, 201)
    }
    return jsonResponse({}, 404)
  }) as unknown as FetchLike & { calls: typeof calls }
  fn.calls = calls
  return fn
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SESSION))
  vi.restoreAllMocks()
  stubCanvas()
  stubImage()
})

describe('FeedComposer snapshot capture (W4-D2)', () => {
  it('renders the town chip in the composer row', () => {
    render(<FeedComposer session={SESSION} fetchImpl={apiFor()} onPosted={() => {}} />)
    expect(screen.getByTestId('composer-town-chip')).toHaveTextContent('Springfield')
    expect(screen.getByTestId('composer-capture')).toBeEnabled()
  })

  it('capture -> burned preview -> post ships snapshot + snapshotId + view coords', async () => {
    const api = apiFor()
    const onPosted = vi.fn()
    render(<FeedComposer session={SESSION} fetchImpl={api} onPosted={onPosted} />)
    fireEvent.change(screen.getByTestId('composer-text'), { target: { value: 'storm rolling in' } })
    fireEvent.click(screen.getByTestId('composer-capture'))

    // Preview appears after capture + strip burn-in.
    await screen.findByTestId('composer-preview-img')
    expect(screen.getByTestId('composer-preview-img').getAttribute('src')).toMatch(/^data:image\/jpeg;base64,/)

    fireEvent.click(screen.getByTestId('composer-send'))
    await waitFor(() => expect(onPosted).toHaveBeenCalled())
    const postCall = api.calls.find((c) => c.url.startsWith('/api/posts'))
    expect(postCall).toBeTruthy()
    const body = JSON.parse(String(postCall?.init?.body))
    expect(body.snapshotId).toBe('snap_k3m9d2')
    expect(body.snapshot).toMatch(/^data:image\/jpeg;base64,/)
    expect(body.lat).toBe(37.22)
    expect(body.lon).toBe(-93.3)
    expect(body.zoom).toBe(6) // normalized raster zoom from the capture response
  })

  it('POST /api/snapshot body carries the town coords + capture zoom', async () => {
    const api = apiFor()
    render(<FeedComposer session={SESSION} fetchImpl={api} onPosted={() => {}} />)
    fireEvent.click(screen.getByTestId('composer-capture'))
    await screen.findByTestId('composer-preview-img')
    const snapCall = api.calls.find((c) => c.url === '/api/snapshot')
    const body = JSON.parse(String(snapCall?.init?.body))
    expect(body).toEqual({ lat: 37.22, lon: -93.3, zoom: 11 })
  })

  it('502 shows the exact loud message + RETRY + POST-WITHOUT-IMAGE (S7#4)', async () => {
    const api = apiFor({ snapshotStatus: 502, snapshotError: 'snapshot failed — post without image, or retry' })
    render(<FeedComposer session={SESSION} fetchImpl={api} onPosted={() => {}} />)
    fireEvent.change(screen.getByTestId('composer-text'), { target: { value: 'ghost sky' } })
    fireEvent.click(screen.getByTestId('composer-capture'))

    const box = await screen.findByTestId('composer-snapshot-error')
    expect(box).toHaveTextContent('snapshot failed — post without image, or retry')
    expect(screen.getByTestId('composer-retry')).toBeInTheDocument()
    expect(screen.getByTestId('composer-post-without-image')).toBeInTheDocument()

    // POST-WITHOUT-IMAGE ships a text-only post — no snapshot fields.
    fireEvent.click(screen.getByTestId('composer-post-without-image'))
    await waitFor(() => {
      const postCall = api.calls.find((c) => c.url.startsWith('/api/posts'))
      expect(postCall).toBeTruthy()
      const body = JSON.parse(String(postCall?.init?.body))
      expect(body.snapshot).toBeUndefined()
      expect(body.snapshotId).toBeUndefined()
    })
  })

  it('401 missing session -> loud identity prompt', async () => {
    const api = apiFor({ snapshotStatus: 401, snapshotError: 'missing session' })
    render(<FeedComposer session={SESSION} fetchImpl={api} onPosted={() => {}} />)
    fireEvent.click(screen.getByTestId('composer-capture'))
    const box = await screen.findByTestId('composer-snapshot-error')
    expect(box).toHaveTextContent('Session missing')
  })

  it('town slug without coordinates disables capture + loud chip error', () => {
    const bad: Session = { nickname: 'jordan', townSlug: 'springfield', townName: 'Springfield' }
    render(<FeedComposer session={bad} fetchImpl={apiFor()} onPosted={() => {}} />)
    expect(screen.getByTestId('composer-town-error')).toBeInTheDocument()
    expect(screen.getByTestId('composer-capture')).toBeDisabled()
  })

  it('plain post (no capture) sends text-only — legacy path intact', async () => {
    const api = apiFor()
    const onPosted = vi.fn()
    render(<FeedComposer session={SESSION} fetchImpl={api} onPosted={onPosted} />)
    fireEvent.change(screen.getByTestId('composer-text'), { target: { value: 'just words' } })
    fireEvent.click(screen.getByTestId('composer-send'))
    await waitFor(() => expect(onPosted).toHaveBeenCalled())
    const postCall = api.calls.find((c) => c.url.startsWith('/api/posts'))
    const body = JSON.parse(String(postCall?.init?.body))
    expect(body.snapshot).toBeUndefined()
    expect(body.town).toBe('springfield-37.22--93.3')
  })
})
