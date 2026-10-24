// W4-BF TEXT-ONLY COMPOSER tests (owner round #2: "take the images out").
// The snapshot capture flow is REMOVED: no CAPTURE button, no preview, no
// snapshot fields on the POST body — text + town chip only. fetchImpl seam
// = no real network; R17-safe.
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedComposer } from './FeedComposer'
import { SESSION_STORAGE_KEY, type FetchLike, type Session } from '../lib/feed'

const SESSION: Session = { nickname: 'jordan', townSlug: 'springfield-37.22--93.3', townName: 'Springfield' }

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

/** Route seam: POST /api/posts -> 201 echo. Snapshot endpoints 404 (the
 *  composer must never call them). */
function apiFor(): FetchLike & { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const u = new URL(url, 'http://localhost')
    if (u.pathname === '/api/posts' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      return jsonResponse(
        {
          post: {
            id: 'p_new',
            author: SESSION.nickname,
            town: body.town,
            text: body.text,
            snapshot: null,
            snapshotId: null,
            lat: null,
            lon: null,
            zoom: null,
            createdAt: '2026-10-23T07:56:00.000Z',
            reactions: { '👍': 0, '❤️': 0, '😂': 0 },
            myReaction: null,
            commentsCount: 0,
            hot: false,
          },
        },
        201,
      )
    }
    return jsonResponse({ error: 'not found' }, 404)
  }) as unknown as FetchLike & { calls: typeof calls }
  fn.calls = calls
  return fn
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SESSION))
})

describe('FeedComposer text-only (W4-BF)', () => {
  it('renders the town chip and NO capture button', () => {
    render(<FeedComposer session={SESSION} fetchImpl={apiFor()} onPosted={() => {}} />)
    expect(screen.getByTestId('composer-town-chip')).toHaveTextContent('Springfield')
    expect(screen.queryByTestId('composer-capture')).toBeNull()
    // Empty text -> send disabled (typing enables it; see next test).
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    fireEvent.change(screen.getByTestId('composer-text'), { target: { value: 'hi' } })
    expect(screen.getByTestId('composer-send')).toBeEnabled()
  })

  it('post ships text + town only — no snapshot fields, no snapshot calls', async () => {
    const api = apiFor()
    const onPosted = vi.fn()
    render(<FeedComposer session={SESSION} fetchImpl={api} onPosted={onPosted} />)
    fireEvent.change(screen.getByTestId('composer-text'), { target: { value: 'storm rolling in' } })
    fireEvent.click(screen.getByTestId('composer-send'))
    await waitFor(() => expect(onPosted).toHaveBeenCalled())
    const postCall = api.calls.find((c) => c.url.startsWith('/api/posts'))
    expect(postCall).toBeTruthy()
    const body = JSON.parse(String(postCall?.init?.body))
    expect(body.text).toBe('storm rolling in')
    expect(body.town).toBe('springfield-37.22--93.3')
    expect(body.snapshot).toBeUndefined()
    expect(body.snapshotId).toBeUndefined()
    expect(body.lat).toBeUndefined()
    // The composer must not touch the snapshot API at all.
    expect(api.calls.some((c) => c.url.includes('/api/snapshot'))).toBe(false)
  })

  it('empty text disables send; typing enables it', () => {
    render(<FeedComposer session={SESSION} fetchImpl={apiFor()} onPosted={() => {}} />)
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    fireEvent.change(screen.getByTestId('composer-text'), { target: { value: 'x' } })
    expect(screen.getByTestId('composer-send')).toBeEnabled()
  })

  it('401 missing session -> loud identity prompt', async () => {
    const api = vi.fn(async () => jsonResponse({ error: 'missing session' }, 401)) as unknown as FetchLike
    render(<FeedComposer session={SESSION} fetchImpl={api} onPosted={() => {}} />)
    fireEvent.change(screen.getByTestId('composer-text'), { target: { value: 'ghost sky' } })
    fireEvent.click(screen.getByTestId('composer-send'))
    expect(await screen.findByTestId('composer-error')).toHaveTextContent('Session missing')
  })

  it('network failure -> loud post-not-sent error', async () => {
    const api = vi.fn(async () => jsonResponse({ error: 'boom' }, 500)) as unknown as FetchLike
    render(<FeedComposer session={SESSION} fetchImpl={api} onPosted={() => {}} />)
    fireEvent.change(screen.getByTestId('composer-text'), { target: { value: 'ghost sky' } })
    fireEvent.click(screen.getByTestId('composer-send'))
    expect(await screen.findByTestId('composer-error')).toHaveTextContent('Post not sent')
  })
})
