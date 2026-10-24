// W4-BF TEXT-ONLY FEED CARD tests (owner round #2: "take the images out").
// The snapshot image is REMOVED from the feed surface: no <img>, no
// lightbox, no error card. Author + timestamp stay in feed chrome below
// the text (C-03 geometry). fetchImpl seam, R17-safe.
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { FeedPostCard } from './FeedPostCard'
import type { Post } from '../lib/feed'

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p_snap',
    author: 'maria',
    town: 'springfield-37.22--93.3',
    text: 'storm cell moving in fast',
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
    ...overrides,
  }
}

function renderCard(p: Post) {
  return render(
    <MemoryRouter>
      <FeedPostCard post={p} session={null} fetchImpl={vi.fn()} />
    </MemoryRouter>,
  )
}

describe('text-only feed card (W4-BF image removal)', () => {
  it('renders text + author + stamp, no snapshot image anywhere', () => {
    const { container } = renderCard(post())
    expect(screen.getByText('storm cell moving in fast')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-testid^="snapshot-"]')).toBeNull()
  })

  it('meta row (author + stamp) renders in feed chrome below the text', () => {
    const { container } = renderCard(post())
    const text = container.querySelector('.feed-card-text')
    const meta = container.querySelector('[data-testid="meta-p_snap"]')
    expect(text).not.toBeNull()
    expect(meta).not.toBeNull()
    const all = Array.from(container.querySelectorAll('.feed-card > *'))
    expect(all.indexOf(meta!)).toBeGreaterThan(all.indexOf(text!))
  })

  it('author + stamp render with the view-post link', () => {
    renderCard(post())
    const meta = screen.getByTestId('meta-p_snap')
    expect(meta).toHaveTextContent('maria')
    expect(meta).toHaveTextContent('2026-10-23 07:56')
    expect(screen.getByTestId('view-post-p_snap')).toHaveAttribute('href', '/p/p_snap')
  })

  it('legacy posts that CARRY a snapshot field render NO image (surface is text-only)', () => {
    // Old DB rows may still carry snapshot bytes; the surface must not
    // render them (owner call: take the images out, keep text/reactions/
    // replies). Honest absence, not a broken-image card.
    const { container } = renderCard(post({ snapshot: 'data:image/jpeg;base64,QUJD', snapshotId: 'snap_k3m9d2' }))
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-testid="snapshot-p_snap"]')).toBeNull()
    expect(screen.getByTestId('meta-p_snap')).toHaveTextContent('maria')
  })

  it('reactions + replies controls ride the same card', () => {
    renderCard(post())
    expect(screen.getByTestId('react-p_snap-👍')).toBeInTheDocument()
    expect(screen.getByTestId('reply-toggle-p_snap')).toBeInTheDocument()
    expect(screen.getByTestId('flag-p_snap')).toBeInTheDocument()
  })
})
