// W4-D2 C-03 LAW tests — author name + timestamp render BELOW the snapshot
// image in feed chrome (never burned into the image, never above it).
// Covers FeedPostCard DOM order + the loud snapshot-error card (no black
// placeholder image, no silent fallback). fetchImpl seam, R17-safe.
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
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
    snapshot: 'data:image/jpeg;base64,QUJD',
    snapshotId: 'snap_k3m9d2',
    lat: 37.22,
    lon: -93.3,
    zoom: 6,
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

describe('C-03 author-below placement (feed card)', () => {
  it('meta row (author + stamp) appears AFTER the snapshot image in DOM order', () => {
    const { container } = renderCard(post())
    const img = container.querySelector('[data-testid="snapshot-p_snap"]')
    const meta = container.querySelector('[data-testid="meta-p_snap"]')
    expect(img).not.toBeNull()
    expect(meta).not.toBeNull()
    // Both live inside the same card; meta must come later in the tree.
    const all = Array.from(container.querySelectorAll('.feed-card > *'))
    expect(all.indexOf(meta!)).toBeGreaterThan(all.indexOf(img!))
  })

  it('author + stamp render below the image with the view-post link', () => {
    renderCard(post())
    const meta = screen.getByTestId('meta-p_snap')
    expect(meta).toHaveTextContent('maria')
    expect(meta).toHaveTextContent('2026-10-23 07:56')
    expect(screen.getByTestId('view-post-p_snap')).toHaveAttribute('href', '/p/p_snap')
  })

  it('text-only posts keep the same below-image meta placement', () => {
    const { container } = renderCard(post({ snapshot: null, snapshotId: null }))
    expect(container.querySelector('[data-testid="snapshot-p_snap"]')).toBeNull()
    const meta = screen.getByTestId('meta-p_snap')
    expect(meta).toHaveTextContent('maria')
  })
})

describe('loud snapshot error state (no black placeholder)', () => {
  it('broken image -> loud error card, the <img> is replaced, never a black box', () => {
    renderCard(post())
    fireEvent.error(screen.getByTestId('snapshot-p_snap'))
    expect(screen.getByTestId('snapshot-error-p_snap')).toBeInTheDocument()
    expect(screen.getByTestId('snapshot-error-p_snap')).toHaveTextContent('unavailable')
    expect(screen.queryByTestId('snapshot-p_snap')).toBeNull()
    // Author/time chrome stays honest below the failed image.
    expect(screen.getByTestId('meta-p_snap')).toHaveTextContent('maria')
  })
})
