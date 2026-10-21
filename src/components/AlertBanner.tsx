import { useEffect, useState } from 'react'
import {
  createAlertsRefresher,
  type AlertsFetch,
  type AlertBounds,
} from '../lib/weather/alerts'

/**
 * S6 ALERTS-PROXY — map banner listing active NWS alerts for the viewport.
 * Exported only; integration mounts it (wave-2 lane split). Square geometry
 * (R20: zero border-radius), theme accent via CSS var (L4 seam).
 *
 * Honest states (R19): "No active alerts" only after a SUCCESSFUL poll with
 * zero alerts. Pre-first-poll says "Checking alerts…" and any failed window
 * keeps prior data (law 3) — never a fake list, never an error wall.
 *
 * Determinism (R17): no Math.random / Date.now / new Date; cadence comes
 * from the refresher's injected scheduler.
 */

export interface AlertBannerProps {
  getViewport: () => AlertBounds
  fetchImpl?: AlertsFetch
}

interface BannerState {
  entries: { id: string; line: string }[]
  stale: boolean
  loaded: boolean
}

export function AlertBanner({ getViewport, fetchImpl = fetch }: AlertBannerProps) {
  const [state, setState] = useState<BannerState>({
    entries: [],
    stale: false,
    loaded: false,
  })

  useEffect(() => {
    const refresher = createAlertsRefresher({
      getViewport,
      fetchImpl,
      onAlerts: (payload) =>
        setState({
          entries: payload.alerts.map((a) => ({
            id: a.id,
            line: `${a.event}${a.severity && a.severity !== 'Unknown' ? ` (${a.severity})` : ''}`,
          })),
          stale: payload.stale === true,
          loaded: true,
        }),
    })
    refresher.start()
    return () => refresher.stop()
  }, [getViewport, fetchImpl])

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
