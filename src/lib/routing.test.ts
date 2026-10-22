// W3-B1 ROUTING — route parsing + gazetteer slug resolution unit tests.
import { describe, expect, it } from 'vitest'
import { parseRoute, resolveTown } from './routing'
import townsData from '../../data/towns/us-towns.json'
import type { TownsFile } from './map/gazetteer'
import { townSlug } from './session'

const TOWNS: TownsFile = townsData as TownsFile
const SPRINGFIELD = 'springfield-37.22--93.3'

describe('parseRoute', () => {
  it('root is the map', () => {
    expect(parseRoute('/')).toEqual({ kind: 'map' })
    expect(parseRoute('')).toEqual({ kind: 'map' })
  })

  it('feed and alerts are exact', () => {
    expect(parseRoute('/feed')).toEqual({ kind: 'feed' })
    expect(parseRoute('/alerts')).toEqual({ kind: 'alerts' })
    expect(parseRoute('/feed/extra')).toEqual({ kind: 'not-found' })
    expect(parseRoute('/alerts/x')).toEqual({ kind: 'not-found' })
  })

  it('post detail carries the id', () => {
    expect(parseRoute('/p/abc123')).toEqual({ kind: 'post', id: 'abc123' })
    expect(parseRoute('/p/')).toEqual({ kind: 'not-found' })
    expect(parseRoute('/p/a/b')).toEqual({ kind: 'not-found' })
  })

  it('town feed parses with the slug', () => {
    expect(parseRoute(`/t/${SPRINGFIELD}/feed`)).toEqual({ kind: 'town-feed', slug: SPRINGFIELD })
  })

  it('query strings and hashes are stripped', () => {
    expect(parseRoute('/feed?x=1#top')).toEqual({ kind: 'feed' })
    expect(parseRoute(`/t/${SPRINGFIELD}/feed?sort=new`)).toEqual({ kind: 'town-feed', slug: SPRINGFIELD })
  })

  it('unknown town slug -> not-found, slug kept for the 404 search', () => {
    expect(parseRoute('/t/no-such-town-0.0-0.0')).toEqual({ kind: 'not-found', slug: 'no-such-town-0.0-0.0' })
    expect(parseRoute('/t/no-such-town-0.0-0.0/feed')).toEqual({ kind: 'not-found', slug: 'no-such-town-0.0-0.0' })
  })

  it('garbage paths -> not-found without a slug', () => {
    expect(parseRoute('/wat')).toEqual({ kind: 'not-found' })
    expect(parseRoute('/t')).toEqual({ kind: 'not-found' })
    expect(parseRoute('/t/x/y/z')).toEqual({ kind: 'not-found' })
  })
})

describe('resolveTown (baked gazetteer validation)', () => {
  it('resolves every canonical townSlug in the gazetteer', () => {
    for (const t of TOWNS.towns.slice(0, 50)) {
      expect(resolveTown(townSlug(t))).toBe(t)
    }
  })

  it('Springfield MO resolves by canonical slug', () => {
    const town = resolveTown(SPRINGFIELD)
    expect(town?.name).toBe('Springfield')
    expect(town?.lat).toBeCloseTo(37.2153, 3)
  })

  it('unknown slugs resolve to null', () => {
    expect(resolveTown('nope-0.0-0.0')).toBeNull()
    expect(resolveTown('')).toBeNull()
  })
})
