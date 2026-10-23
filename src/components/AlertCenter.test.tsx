// W3-C2 ALERT CENTER — unit tests (Gate 0): severity sort law, honest
// empty/stale/checking states, row expand, fly-to seam wiring.
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AlertCenter, { AlertRow, townLabel } from './AlertCenter'
import { sortAlertsBySeverity, type Alert } from '../lib/weather/alerts'
import type { BannerState } from './AlertBanner'
import { subscribeFlyTo } from '../lib/map/fly-to'

afterEach(() => cleanup())

function alert(over: Partial<Alert> = {}): Alert {
  return {
    id: 'urn:oid:x',
    event: 'Flood Warning',
    town: 'salina-38.84--97.61',
    severity: 'Severe',
    expires: '2026-10-21T19:00:00-05:00',
    ...over,
  }
}

function state(
  over: Partial<BannerState> & { alerts?: readonly Alert[] } = {},
): BannerState {
  const alerts = (over.alerts ?? []) as Alert[]
  return { entries: [], stale: false, loaded: true, alerts, ...over }
}

describe('sortAlertsBySeverity', () => {
  it('orders Extreme > Severe > Moderate > Minor', () => {
    const sorted = sortAlertsBySeverity([
      alert({ id: 'm', severity: 'Minor' }),
      alert({ id: 'x', severity: 'Extreme' }),
      alert({ id: 'd', severity: 'Moderate' }),
      alert({ id: 's', severity: 'Severe' }),
    ])
    expect(sorted.map((a) => a.id)).toEqual(['x', 's', 'd', 'm'])
  })

  it('breaks ties by id ascending (deterministic, R17)', () => {
    const sorted = sortAlertsBySeverity([
      alert({ id: 'b', severity: 'Severe' }),
      alert({ id: 'a', severity: 'Severe' }),
    ])
    expect(sorted.map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('ranks unknown severities below known ones', () => {
    const sorted = sortAlertsBySeverity([
      alert({ id: 'u', severity: 'Unknown' }),
      alert({ id: 'n', severity: 'Minor' }),
    ])
    expect(sorted.map((a) => a.id)).toEqual(['n', 'u'])
  })

  it('does not mutate the input', () => {
    const input = [alert({ id: 'b' }), alert({ id: 'a' })]
    sortAlertsBySeverity(input)
    expect(input.map((a) => a.id)).toEqual(['b', 'a'])
  })
})

describe('AlertCenter rendering', () => {
  it('renders rows sorted by severity with badges', () => {
    render(
      <AlertCenter
        state={state({
          alerts: [
            alert({ id: '1', severity: 'Minor', event: 'Heat Advisory' }),
            alert({ id: '2', severity: 'Extreme', event: 'Tornado Warning' }),
          ],
        })}
      />,
    )
    const rows = screen.getAllByTestId('alert-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContainElement(screen.getByText('Tornado Warning'))
    expect(rows[0].querySelector('.alert-sev-extreme')).not.toBeNull()
    expect(rows[1].querySelector('.alert-sev-minor')).not.toBeNull()
  })

  it('renders deterministic effective/expiry stamps (formatStamp law)', () => {
    render(
      <AlertCenter
        state={state({
          alerts: [
            alert({
              id: '1',
              effective: '2026-10-21T15:04:00-05:00',
              expires: '2026-10-21T19:00:00-05:00',
            }),
          ],
        })}
      />,
    )
    const row = screen.getByTestId('alert-row')
    expect(row.textContent).toContain('2026-10-21 15:04')
    expect(row.textContent).toContain('2026-10-21 19:00')
  })

  it('expands the headline on whole-row click (truncated -> full)', () => {
    render(
      <AlertCenter
        state={state({
          alerts: [
            alert({
              id: '1',
              headline: 'A'.repeat(120),
              summary: 'B'.repeat(120),
            }),
          ],
        })}
      />,
    )
    const row = screen.getByTestId('alert-row-control')
    expect(row).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    const expanded = screen.getByTestId('alert-row').querySelector('.alert-row-headline')
    expect(expanded!.className).toContain('is-expanded')
    // Click again collapses.
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the town label from the gazetteer (Salina, KS — no fake towns)', () => {
    render(<AlertCenter state={state({ alerts: [alert()] })} />)
    expect(screen.getByTestId('alert-row-town')).toHaveTextContent('Salina')
    expect(townLabel('no-such-0.0-0.0')).toBe('no-such-0.0-0.0')
  })
})

describe('honest states (R19)', () => {
  it('checking: pre-first-poll says "Checking alerts…"', () => {
    render(<AlertCenter state={state({ loaded: false, alerts: [] })} />)
    expect(screen.getByTestId('alert-center-checking')).toHaveTextContent('Checking alerts…')
    expect(screen.queryByTestId('alert-center-empty')).toBeNull()
  })

  it('empty: successful zero-alert poll says "No active alerts"', () => {
    render(<AlertCenter state={state({ alerts: [] })} />)
    expect(screen.getByTestId('alert-center-empty')).toHaveTextContent('No active alerts')
    expect(screen.queryByTestId('alert-center-checking')).toBeNull()
  })

  it('stale: shows "Feed unavailable — showing last known" over last data', () => {
    render(
      <AlertCenter
        state={state({ alerts: [alert({ id: '1', severity: 'Severe' })], stale: true })}
      />,
    )
    const stale = screen.getByTestId('alert-center-stale')
    expect(stale).toHaveTextContent('Feed unavailable — showing last known')
    expect(screen.getByTestId('alert-center')).toHaveAttribute('data-stale', 'true')
    // Last-known rows keep rendering (law 3: never flip to an error wall).
    expect(screen.getAllByTestId('alert-row')).toHaveLength(1)
  })

  it('stale + zero last-known rows: stale indicator alongside the empty state', () => {
    render(<AlertCenter state={state({ alerts: [], stale: true })} />)
    expect(screen.getByTestId('alert-center-stale')).toBeInTheDocument()
    expect(screen.getByTestId('alert-center-empty')).toBeInTheDocument()
  })
})

describe('whole-row fly-to (W4-E2, panel mode)', () => {
  it('clicking ANYWHERE on the row requests a fly to the gazetteer coordinates', () => {
    const seen: Array<{ lon: number; lat: number }> = []
    const off = subscribeFlyTo((req) => seen.push({ lon: req.lon, lat: req.lat }))
    render(<AlertCenter state={state({ alerts: [alert()] })} mode="panel" />)
    fireEvent.click(screen.getByTestId('alert-row-control'))
    off()
    // Salina, KS gazetteer coords (deterministic, from baked data).
    expect(seen).toEqual([{ lon: -97.6114, lat: 38.8403 }])
  })

  it('keyboard Enter on the row flies (native button semantics, one Tab stop)', () => {
    const seen: Array<{ lon: number; lat: number }> = []
    const off = subscribeFlyTo((req) => seen.push({ lon: req.lon, lat: req.lat }))
    render(<AlertCenter state={state({ alerts: [alert()] })} mode="panel" />)
    const row = screen.getByTestId('alert-row-control')
    // The row IS a native <button type="button"> — Enter/Space activate it
    // natively (no custom key handler to rot). Assert that contract, then
    // fire the activation the keyboard produces.
    expect(row.tagName).toBe('BUTTON')
    expect(row).toHaveAttribute('type', 'button')
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.click(row) // jsdom: Enter activation == click on a button
    off()
    expect(seen).toEqual([{ lon: -97.6114, lat: 38.8403 }])
  })

  it('the row is ONE focusable control — no nested links/buttons', () => {
    render(
      <AlertCenter
        state={state({ alerts: [alert({ id: 'a' }), alert({ id: 'b', severity: 'Minor' })] })}
        mode="panel"
      />,
    )
    const rows = screen.getAllByTestId('alert-row')
    expect(rows).toHaveLength(2)
    // Row order is severity-sorted: Severe first, Minor second; both name
    // their town + alert type in the accessible label.
    const names = rows.map((row) => within(row).getByRole('button').getAttribute('aria-label'))
    expect(names[0]).toMatch(/Salina/)
    expect(names[0]).toMatch(/Severe Flood Warning/)
    expect(names[1]).toMatch(/Salina/)
    expect(names[1]).toMatch(/Minor Flood Warning/)
    for (const row of rows) {
      // One Tab stop per row: exactly one button/link inside.
      const focusables = row.querySelectorAll('button, a, [tabindex]:not([tabindex="-1"])')
      expect(focusables).toHaveLength(1)
    }
  })

  it('page mode routes row activation to the app town opener (fly via map route)', () => {
    const opened: string[] = []
    render(
      <AlertCenter
        state={state({ alerts: [alert()] })}
        mode="page"
        onOpenTown={(slug) => opened.push(slug)}
      />,
    )
    fireEvent.click(screen.getByTestId('alert-row-control'))
    expect(opened).toEqual(['salina-38.84--97.61'])
    // The row expands in place too (headline preview -> full, same law).
    expect(screen.getByTestId('alert-row-control')).toHaveAttribute('aria-expanded', 'true')
  })

  it('page mode renders the town label inside the row (no inert island)', () => {
    render(<AlertCenter state={state({ alerts: [alert()] })} mode="page" />)
    expect(screen.getByTestId('alert-row-town')).toHaveTextContent('Salina')
    expect(screen.getByTestId('alert-row-control')).toBeInTheDocument()
  })
})

describe('AlertRow standalone', () => {
  it('renders severity badge + event + stamps without headline', () => {
    render(
      <AlertRow
        alert={alert({ headline: undefined, summary: undefined })}
        expanded={false}
        onActivate={() => {}}
      />,
    )
    expect(screen.getByTestId('alert-severity')).toHaveTextContent('Severe')
    expect(screen.getByTestId('alert-row')).toContainElement(screen.getByText('Flood Warning'))
  })
})
