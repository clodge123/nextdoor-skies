// W3-D3 POST DETAIL page tests — full render (author/text/stamp/snapshot/
// reactions/comments), deep-link 404 -> honest NotFoundPage, lightbox
// open/close from the detail snapshot, share copy-link feedback, optimistic
// reply. fetchImpl seam = no real network; R17-safe (no Date.now/Math.random).
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PostDetailPage from './PostDetailPage'
import { SESSION_STORAGE_KEY, type FetchLike } from '../lib/feed'

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const POST = {
  id: 'p_detail',
  author: 'maria',
  town: 'springfield-37.22--93.3',
  text: 'storm cell moving in fast',
  snapshot: 'data:image/jpeg;base64,QUJD',
  createdAt: '2026-10-21T10:00:00.000Z',
  reactions: { '👍': 3, '❤️': 1, '😂': 0 },
  myReaction: null,
  commentsCount: 2,
  hot: true,
}

const COMMENTS = [
  { id: 'c_1', author: 'sam', text: 'how fast?', createdAt: '2026-10-21T10:30:00.000Z' },
  { id: 'c_2', author: 'lee', text: 'seen this before', createdAt: '2026-10-21T10:45:00.000Z' },
]

/** Route seam: GET ?path=p_detail -> post, GET ?path=p_detail/comments -> rows. */
function apiFor({ post = POST, comments = COMMENTS, postStatus = 200 }: Partial<{ post: unknown; comments: unknown; postStatus: number }> = {}): FetchLike {
  return vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost')
    const path = u.searchParams.get('path') ?? ''
    if (path === 'p_detail/comments') return jsonResponse(comments)
    if (path === 'p_detail') return jsonResponse(postStatus === 200 ? { post } : { error: 'post not found' }, postStatus)
    return jsonResponse({ error: 'not found' }, 404)
  })
}

function setSession() {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ nickname: 'jordan', townSlug: 'springfield-37.22--93.3', townName: 'Springfield' }),
  )
}

function renderDetail(fetchImpl: FetchLike) {
  return render(
    <MemoryRouter initialEntries={['/p/p_detail']}>
      <Routes>
        <Route path="/p/:id" element={<PostDetailPage fetchImpl={fetchImpl} />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => localStorage.clear())

describe('PostDetailPage render', () => {
  it('renders the full post: author, text, timestamp, snapshot, reactions, comments', async () => {
    renderDetail(apiFor())
    expect(await screen.findByTestId('post-detail-text')).toHaveTextContent('storm cell moving in fast')
    expect(screen.getByTestId('post-detail-stamp')).toHaveTextContent('2026-10-21 10:00')
    expect(screen.getByText('maria')).toBeInTheDocument()
    expect(screen.getByTestId('snapshot-p_detail')).toHaveAttribute('src', POST.snapshot)
    expect(screen.getByTestId('react-p_detail-👍')).toHaveTextContent('3')
    expect(await screen.findByTestId('comment-c_1')).toHaveTextContent('how fast?')
    expect(screen.getByTestId('comment-c_2')).toHaveTextContent('seen this before')
  })

  it('unknown id -> honest NotFoundPage (deep-link law, never a fake post)', async () => {
    renderDetail(apiFor({ postStatus: 404 }))
    expect(await screen.findByTestId('not-found-page')).toBeInTheDocument()
    expect(screen.queryByTestId('post-detail-text')).toBeNull()
  })

  it('network failure -> honest error with retry, not a fabricated post', async () => {
    renderDetail(apiFor({ postStatus: 500 }))
    expect(await screen.findByTestId('post-detail-error')).toBeInTheDocument()
    expect(screen.getByTestId('post-detail-retry')).toBeInTheDocument()
  })
})

describe('PostDetailPage lightbox', () => {
  it('snapshot click opens the lightbox; Esc closes it', async () => {
    renderDetail(apiFor())
    await screen.findByTestId('snapshot-p_detail')
    expect(screen.queryByTestId('lightbox')).toBeNull()
    fireEvent.click(screen.getByTestId('snapshot-button-p_detail'))
    expect(screen.getByTestId('lightbox')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('lightbox')).toBeNull())
  })

  it('close button dismisses the lightbox', async () => {
    renderDetail(apiFor())
    fireEvent.click(await screen.findByTestId('snapshot-button-p_detail'))
    fireEvent.click(screen.getByTestId('lightbox-close'))
    await waitFor(() => expect(screen.queryByTestId('lightbox')).toBeNull())
  })
})

describe('PostDetailPage share', () => {
  it('copy-link writes the /p/<id> URL and shows Copied! feedback', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderDetail(apiFor())
    fireEvent.click(await screen.findByTestId('share-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0]?.[0]).toMatch(/\/p\/p_detail$/)
    expect(screen.getByTestId('share-copied')).toBeInTheDocument()
  })

  it('clipboard failure reports an honest error', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => { throw new Error('denied') }) },
      configurable: true,
    })
    renderDetail(apiFor())
    fireEvent.click(await screen.findByTestId('share-copy'))
    expect(await screen.findByTestId('share-failed')).toBeInTheDocument()
  })

  it('native share button appears only when navigator.share exists', async () => {
    renderDetail(apiFor())
    await screen.findByTestId('post-detail-text')
    expect(screen.queryByTestId('share-native')).toBeNull() // jsdom has no navigator.share
    const original = navigator.share
    Object.defineProperty(navigator, 'share', { value: vi.fn(async () => undefined), configurable: true })
    renderDetail(apiFor())
    await screen.findByTestId('post-detail-text')
    expect(screen.getByTestId('share-native')).toBeInTheDocument()
    Object.defineProperty(navigator, 'share', { value: original, configurable: true })
  })
})

describe('PostDetailPage engagement', () => {
  it('optimistic reply posts through the API seam', async () => {
    setSession()
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, 'http://localhost')
      const path = u.searchParams.get('path') ?? ''
      if (path === 'p_detail/comments') {
        if ((init?.method ?? 'GET') === 'POST') {
          return jsonResponse({ id: 'c_new', author: 'jordan', text: 'thanks', createdAt: '2026-10-21T11:00:00.000Z' }, 201)
        }
        return jsonResponse([])
      }
      if (path === 'p_detail') return jsonResponse({ post: POST })
      return jsonResponse({ error: 'not found' }, 404)
    }) satisfies FetchLike
    render(
      <MemoryRouter initialEntries={['/p/p_detail']}>
        <Routes>
          <Route path="/p/:id" element={<PostDetailPage fetchImpl={fetchImpl} />} />
        </Routes>
      </MemoryRouter>,
    )
    const input = await screen.findByTestId('post-detail-reply-input')
    fireEvent.change(input, { target: { value: 'thanks' } })
    fireEvent.click(screen.getByTestId('post-detail-reply-send'))
    expect(await screen.findByTestId('comment-c_new')).toHaveTextContent('thanks')
  })
})
