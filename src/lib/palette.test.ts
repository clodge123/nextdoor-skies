// W3-C3 COMMAND PALETTE — registry/filtering/recents unit tests (node env;
// pure logic + sessionStorage recents). Determinism law: fixed inputs.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  COMMANDS,
  RECENTS_STORAGE_KEY,
  filterCommands,
  getRecents,
  pushRecent,
  recentCommands,
} from './palette'

describe('filterCommands', () => {
  it('empty query returns nothing (palette shows recents/towns instead)', () => {
    expect(filterCommands('')).toEqual([])
    expect(filterCommands('   ')).toEqual([])
  })

  it('label-prefix matches come first', () => {
    const out = filterCommands('go to')
    expect(out.map((c) => c.id)).toEqual(['nav-map', 'nav-feed', 'nav-alerts', 'go-town'])
  })

  it('keyword matches include theme/panel commands', () => {
    expect(filterCommands('theme').map((c) => c.id)).toContain('toggle-theme')
    expect(filterCommands('dark').map((c) => c.id)).toContain('toggle-theme')
    expect(filterCommands('panel').map((c) => c.id)).toContain('toggle-panel')
    expect(filterCommands('panel').map((c) => c.id)).toContain('open-alerts-center')
  })

  it('no-match returns empty (honest)', () => {
    expect(filterCommands('zzzz-no-such-thing')).toEqual([])
  })

  it('registry is fixed and complete for the session-3 surface', () => {
    expect(COMMANDS.map((c) => c.id)).toEqual([
      'nav-map',
      'nav-feed',
      'nav-alerts',
      'toggle-theme',
      'toggle-panel',
      'open-alerts-center',
      'go-town',
    ])
  })
})

describe('recents (sessionStorage, honest empty state)', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('starts empty — no ghost rows', () => {
    expect(getRecents()).toEqual([])
    expect(recentCommands()).toEqual([])
  })

  it('pushRecent dedupes, keeps most-recent-first, caps at 5', () => {
    pushRecent('nav-map')
    pushRecent('toggle-theme')
    pushRecent('nav-map') // re-run moves to front, no dup
    expect(getRecents()).toEqual(['nav-map', 'toggle-theme'])
    for (const id of ['nav-feed', 'nav-alerts', 'toggle-panel', 'open-alerts-center', 'go-town']) {
      pushRecent(id)
    }
    const r = getRecents()
    expect(r.length).toBe(5)
    expect(r[0]).toBe('go-town')
    expect(r).not.toContain('nav-map')
  })

  it('corrupt storage degrades to empty (never throws)', () => {
    window.sessionStorage.setItem(RECENTS_STORAGE_KEY, '{not json')
    expect(getRecents()).toEqual([])
    window.sessionStorage.setItem(RECENTS_STORAGE_KEY, '["nav-map",42,"ghost-id"]')
    expect(getRecents()).toEqual(['nav-map'])
  })
})
