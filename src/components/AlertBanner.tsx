import { useEffect, useRef, useState } from 'react'
import {
  createAlertsRefresher,
  type AlertsFetch,
  type AlertBounds,
  type Alert,
} from '../lib/weather/alerts'

/**
 * S6 ALERTS-PROXY — map banner listing active NWS alerts for the viewport.
 * Wave-2 integration: mounted by MapPage (MapBadges) alongside the town
 * badges; the SAME refresher state feeds the badge alert-dots (contract
 * consumer seam alertDotForTown) so one poll per window drives both surfaces.
 * Square geometry (R20: zero border-radius), theme accent via CSS var (L4 seam).
 *
 * Honest states (R19): "No active alerts" only after a SUCCESSFUL poll with
 * zero alerts. Pre-first-poll says "Checking alerts…" and any failed window
 * keeps prior data (law 3) — never a fake list, never an error wall.
 *
 * Determinism (R17): no Math.random / Date.now / new Date; cadence comes
 * from the refresher's injected scheduler.
 */

export interface BannerState {
  entries: { id: string; line: string }[]
  stale: boolean
  loaded: boolean
  /** Raw last-good payload — feeds alertDotForTown for badge dots. */
  alerts: Alert[]
}

/**
 * One viewport-bounded alerts refresher per window (fetch-per-window law),
 * shared by the banner and the badge dots. Returns the banner state plus the
 * raw alert list. No Math.random / Date.now / new Date (R17).
 */
export function useAlerts(
  getViewport: () => AlertBounds,
  fetchImpl: AlertsFetch = fetch,
): BannerState {
  const [state, setState] = useState<BannerState>({
    entries: [],
    stale: false,
    loaded: false,
    alerts: [],
  })

  // Keep the latest viewport getter in a ref so the refresher stays ONE
  // instance across renders: fetch-per-window law means polling on the
  // window cadence ONLY, never per pan/zoom re-render.
  const getViewportRef = useRef(getViewport)
  getViewportRef.current = getViewport

  useEffect(() => {
    const refresher = createAlertsRefresher({
      getViewport: () => getViewportRef.current(),
      fetchImpl,
      onAlerts: (payload) =>
        setState({
          entries: payload.alerts.map((a) => ({
            id: a.id,
            line: `${a.event}${a.severity && a.severity !== 'Unknown' ? ` (${a.severity})` : ''}`,
          })),
          stale: payload.stale === true,
          loaded: true,
          alerts: payload.alerts,
        }),
    })
    refresher.start()
    return () => refresher.stop()
  }, [fetchImpl])

  return state
}

export interface AlertBannerProps {
  state: BannerState
}

export function AlertBanner({ state }: AlertBannerProps) {
  if (!state.loaded) {
    return (
      <div className="alert-banner alert-banner-checking" data-testid="alert-banner">
        Checking alerts…
      </div>
    )
  }

  if (state.entries.length === 0) {
    return (
      <div className="alert-banner alert-banner-clear" data-testid="alert-banner">
        No active alerts
      </div>
    )
  }

  return (
    <div
      className={`alert-banner alert-banner-active${state.stale ? ' alert-banner-stale' : ''}`}
      data-testid="alert-banner"
      role="status"
    >
      {state.entries.map((entry) => (
        <div key={entry.id} className="alert-banner-line">
          {entry.line}
        </div>
      ))}
      {state.stale && <div className="alert-banner-note">data may be outdated</div>}
    </div>
  )
}
