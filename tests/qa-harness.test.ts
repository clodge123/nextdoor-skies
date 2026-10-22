// W3-F QA HARNESS unit tests — the pure enumeration/reporting layer of
// scripts/qa-harness.mjs. No browser, no clock/RNG (R17).
import { describe, expect, it } from 'vitest'
import {
  buildTable,
  elementIdentity,
  qaRoutes,
  readyProbe,
  INTERACTIVE_SELECTOR,
} from '../scripts/qa-harness.mjs'

describe('qa-harness enumeration', () => {
  it('qaRoutes covers the six mandated routes with the slug/post ids', () => {
    const paths = qaRoutes('salina-38.84--97.61', 'p_qa1').map((r) => r.path)
    expect(paths).toEqual([
      '/',
      '/feed',
      '/t/salina-38.84--97.61',
      '/t/salina-38.84--97.61/feed',
      '/p/p_qa1',
      '/alerts',
    ])
  })

  it('every route carries a human label for the PASS/FAIL table', () => {
    for (const r of qaRoutes()) expect(r.label.length).toBeGreaterThan(0)
  })

  it('interactive selector enumerates the full control surface', () => {
    const sel = INTERACTIVE_SELECTOR
    for (const part of ['a[href]', 'button', 'input', 'textarea', 'select', '[role="button"]']) {
      expect(sel).toContain(part)
    }
  })

  it('elementIdentity dedupes by identity, not DOM position', () => {
    const a = elementIdentity({ tag: 'button', testid: 'theme-toggle', label: '', placeholder: '', text: 'Light', href: '' })
    const b = elementIdentity({ tag: 'button', testid: 'theme-toggle', label: '', placeholder: '', text: 'Dark', href: '' })
    expect(a).toBe(b) // same control re-rendered with new label -> one identity
    const c = elementIdentity({ tag: 'button', testid: '', label: 'zoom in', placeholder: '', text: '', href: '' })
    expect(c).not.toBe(a)
    const d = elementIdentity({ tag: 'a', testid: '', label: '', placeholder: '', text: 'Map', href: '/' })
    const e = elementIdentity({ tag: 'a', testid: '', label: '', placeholder: '', text: 'Feed', href: '/feed' })
    expect(d).not.toBe(e) // href-keyed links stay distinct
  })

  it('readyProbe maps every route to a real testid family', () => {
    expect(readyProbe('/').selector).toContain('map-view')
    expect(readyProbe('/feed').selector).toContain('feed-page')
    expect(readyProbe('/t/x/feed').selector).toContain('feed-page')
    expect(readyProbe('/t/x').selector).toContain('town-page')
    expect(readyProbe('/p/p1').selector).toContain('post-detail-page')
    expect(readyProbe('/alerts').selector).toContain('alerts-page')
  })
})

describe('qa-harness reporting', () => {
  const row = (over = {}) => ({
    path: '/feed',
    label: 'feed',
    clicks: 12,
    consoleErrors: [] as string[],
    apiFailures: [] as string[],
    pageErrors: [] as string[],
    ...over,
  })

  it('clean rows PASS with failures=0 semantics', () => {
    const table = buildTable([row(), row({ path: '/', label: 'map' })])
    expect(table).toContain('PASS')
    expect(table).not.toContain('FAIL')
    expect(table).toContain('console-errors=0')
    expect(table).toContain('api-failures=0')
    expect(table).toContain('failing-routes=0')
  })

  it('any console error / api failure / pageerror flips the route to FAIL', () => {
    expect(buildTable([row({ consoleErrors: ['boom'] })])).toContain('FAIL')
    expect(buildTable([row({ apiFailures: ['500 GET /api/posts'] })])).toContain('FAIL')
    expect(buildTable([row({ pageErrors: ['ReferenceError: x'] })])).toContain('FAIL')
  })

  it('zero-click route flags PASS(no-targets) — an enumeration gap, visible', () => {
    expect(buildTable([row({ clicks: 0 })])).toContain('PASS(no-targets)')
  })

  it('totals aggregate across routes', () => {
    const table = buildTable([
      row({ clicks: 3 }),
      row({ path: '/', label: 'map', clicks: 5, consoleErrors: ['e1'] }),
    ])
    expect(table).toContain('clicks=8')
    expect(table).toContain('console-errors=1')
    expect(table).toContain('failing-routes=1')
  })
})
