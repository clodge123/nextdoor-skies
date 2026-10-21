// W5 unit tests — feed client parsing, hot ordering, optimistic reactions,
// honest states (docs/WAVE-2-CONTRACTS.md §S2–S4). No clock/RNG dependence.
import { describe, expect, it, vi } from 'vitest'
import {
  applyReaction,
  fetchPosts,
  formatStamp,
  getSession,
  normalizePost,
  parseComments,
  parsePosts,
  partitionHot,
  sortByNewest,
  pickTownSlug,
  sanitizeNickname,
  type FetchLike,
  type Post,
} from './feed'

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p_1',
    author: 'nick',
    town: 'springfield-39.78--89.65',
    text: 'rain incoming',
    snapshot: null,
    createdAt: '2026-10-21T12:00:00.000Z',
    reactions: { '👍': 0, '❤️': 0, '😂': 0 },
    myReaction: null,
    commentsCount: 0,
    hot: false,
    ...overrides,
  }
}

describe('client parsing (S2/S3)', () => {
  it('parses a full contract body', () => {
    const body = {
      posts: [
        {
          id: 'p_1',
          author: 'nick',
          town: 'springfield',
          text: 'rain incoming',
          snapshot: 'data:image/jpeg;base64,AAA',
          createdAt: '2026-10-21T12:00:00.000Z',
          reactions: { '👍': 2, '❤️': 1, '😂': 0 },
          myReaction: '👍',
          commentsCount: 3,
          hot: true,
        },
      ],
    }
    const posts = parsePosts(body)
    expect(posts).toHaveLength(1)
    expect(posts[0].author).toBe('nick')
    expect(posts[0].reactions['👍']).toBe(2)
    expect(posts[0].myReaction).toBe('👍')
    expect(posts[0].hot).toBe(true)
  })

  it('drops junk rows honestly, keeps valid ones', () => {
    const body = { posts: [{ id: 'p_ok', text: 'ok' }, null, { text: 'no id' }, 42] }
    const posts = parsePosts(body)
    expect(posts).toHaveLength(1)
    expect(posts[0].id).toBe('p_ok')
    expect(posts[0].author).toBe('unknown')
    expect(posts[0].snapshot).toBeNull()
  })

  it('empty / malformed bodies parse to []', () => {
    expect(parsePosts({})).toEqual([])
    expect(parsePosts({ posts: 'nope' })).toEqual([])
    expect(parseComments('nope')).toEqual([])
  })

  it('parses comment rows', () => {
    const rows = parseComments([
      { id: 'c_1', author: 'a', text: 'hi', createdAt: '2026-10-21T12:00:00.000Z' },
      { id: '', text: 'bad' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].author).toBe('a')
  })

  it('fetchPosts surfaces honest errors, never throws', async () => {
    const fetchImpl: FetchLike = vi.fn(
      async () => new Response(JSON.stringify({ error: 'db down' }), { status: 500 }),
    )
    const res = await fetchPosts({ town: 'springfield', sort: 'new', fetchImpl })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.status).toBe(500)
      expect(res.error).toBe('db down')
    }
  })

  it('fetchPosts network failure is an honest error state', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    })
    const res = await fetchPosts({ town: 'springfield', sort: 'new', fetchImpl })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('offline')
  })
})

describe('hot ordering (S2)', () => {
  const posts = [
    post({ id: 'a', hot: true, createdAt: '2026-10-20T10:00:00.000Z' }),
    post({ id: 'b', hot: false, createdAt: '2026-10-21T11:00:00.000Z' }),
    post({ id: 'c', hot: true, createdAt: '2026-10-19T09:00:00.000Z' }),
    post({ id: 'd', hot: false, createdAt: '2026-10-21T13:00:00.000Z' }),
  ]

  it('hot view: pinned first in server order, newest follows', () => {
    const { pinned, rest } = partitionHot(posts)
    expect(pinned.map((p) => p.id)).toEqual(['a', 'c'])
    expect(rest.map((p) => p.id)).toEqual(['b', 'd'])
  })

  it('new view: pure ISO sort, newest first, deterministic', () => {
    expect(sortByNewest(posts).map((p) => p.id)).toEqual(['d', 'b', 'a', 'c'])
    // stable under repeat
    expect(sortByNewest(posts).map((p) => p.id)).toEqual(['d', 'b', 'a', 'c'])
  })
})

describe('optimistic reactions (S4)', () => {
  it('toggles on: adds count + highlight', () => {
    const next = applyReaction(post(), '👍')
    expect(next.reactions['👍']).toBe(1)
    expect(next.myReaction).toBe('👍')
  })

  it('toggles off: same emoji twice removes it', () => {
    const first = applyReaction(post(), '❤️')
    const second = applyReaction(first, '❤️')
    expect(second.reactions['❤️']).toBe(0)
    expect(second.myReaction).toBeNull()
  })

  it('switching replaces the previous reaction', () => {
    const first = applyReaction(post(), '👍')
    const second = applyReaction(first, '😂')
    expect(second.reactions['👍']).toBe(0)
    expect(second.reactions['😂']).toBe(1)
    expect(second.myReaction).toBe('😂')
  })

  it('never goes negative', () => {
    const next = applyReaction(post({ reactions: { '👍': 0, '❤️': 0, '😂': 0 }, myReaction: '👍' }), '👍')
    expect(next.reactions['👍']).toBe(0)
  })
})

describe('session + identity helpers (S1 shape)', () => {
  it('getSession is null when absent or corrupt', () => {
    localStorage.clear()
    expect(getSession()).toBeNull()
    localStorage.setItem('nds-session', '{broken')
    expect(getSession()).toBeNull()
    localStorage.setItem('nds-session', JSON.stringify({ nickname: 'x' }))
    expect(getSession()).toBeNull()
  })

  it('getSession round-trips a valid session', () => {
    localStorage.setItem(
      'nds-session',
      JSON.stringify({ nickname: 'jordan', townSlug: 'springfield-39.78--89.65', townName: 'Springfield' }),
    )
    expect(getSession()).toEqual({
      nickname: 'jordan',
      townSlug: 'springfield-39.78--89.65',
      townName: 'Springfield',
    })
    localStorage.clear()
  })

  it('pickTownSlug resolves gazetteer towns deterministically', () => {
    // Highest-pop Springfield wins (MO, 37.22/-93.3); slug rule = slugify + round2.
    expect(pickTownSlug('Springfield')).toBe('springfield-37.22--93.3')
    expect(pickTownSlug('  SPRINGFIELD ')).toBe('springfield-37.22--93.3')
    expect(pickTownSlug('Atlantis')).toBe('atlantis-26.59--80.1')
    expect(pickTownSlug('Zznotatrealplace')).toBe('zznotatrealplace')
    expect(pickTownSlug('')).toBe('')
  })

  it('sanitizeNickname strips markup and control chars', () => {
    expect(sanitizeNickname('<b>jordan</b>')).toBe('jordan')
    expect(sanitizeNickname('a&b&#39;c')).toBe('abc')
    expect(sanitizeNickname('  spaced   out ')).toBe('spaced out')
  })
})

describe('formatStamp (deterministic formatting)', () => {
  it('slices ISO to "YYYY-MM-DD HH:MM"', () => {
    expect(formatStamp('2026-10-21T15:04:07.000Z')).toBe('2026-10-21 15:04')
  })
  it('passes non-ISO strings through untouched', () => {
    expect(formatStamp('sometime')).toBe('sometime')
  })
})

describe('normalizePost guards', () => {
  it('rejects non-objects and missing ids', () => {
    expect(normalizePost(null)).toBeNull()
    expect(normalizePost([])).toBeNull()
    expect(normalizePost({ text: 'x' })).toBeNull()
  })
})
