// W4-E1 ALL-FEED scope parsing (?scope= deep link) — pure transforms, R17.
import { describe, expect, it } from 'vitest'
import { parseScope, scopeHref } from './scope'

describe('parseScope', () => {
  it('defaults to hot (canonical URL, no param)', () => {
    expect(parseScope('')).toBe('hot')
    expect(parseScope('?')).toBe('hot')
    expect(parseScope('?tab=alerts')).toBe('hot')
  })

  it('accepts ?scope=latest from search, href, and junk forms', () => {
    expect(parseScope('?scope=latest')).toBe('latest')
    expect(parseScope('scope=latest')).toBe('latest')
    expect(parseScope('/feed?scope=latest')).toBe('latest')
    expect(parseScope('/feed?x=1&scope=latest')).toBe('latest')
  })

  it('unrecognized values fall to hot, never crash', () => {
    expect(parseScope('?scope=whatever')).toBe('hot')
    expect(parseScope('?scope=')).toBe('hot')
    expect(parseScope('?scope=%')).toBe('hot')
  })

  it('is deterministic (same input -> same output)', () => {
    for (const s of ['?scope=latest', '?scope=hot', '']) {
      expect(parseScope(s)).toBe(parseScope(s))
    }
  })
})

describe('scopeHref', () => {
  it('latest sets the param; hot removes it (canonical URL stays clean)', () => {
    expect(scopeHref('/feed', '', 'latest')).toBe('/feed?scope=latest')
    expect(scopeHref('/feed', '?scope=latest', 'hot')).toBe('/feed')
    expect(scopeHref('/feed', '?scope=latest', 'latest')).toBe('/feed?scope=latest')
  })

  it('preserves every other query param', () => {
    expect(scopeHref('/feed', '?x=1&scope=hot', 'latest')).toBe('/feed?x=1&scope=latest')
    expect(scopeHref('/t/springfield/feed', '?x=1&scope=latest', 'hot')).toBe('/t/springfield/feed?x=1')
  })
})
