// W4-D2 SNAPSHOT COMPOSER — real map snapshots in the composer flow
// (docs/SNAPSHOT-API.md, S7 decisions, C-03 law).
//
// Flow (S7#5): town chip (session town, coordinates loud-checked) → text →
// CAPTURE button POSTs /api/snapshot at the poster's view (center = session
// town coords, zoom CAPTURE_ZOOM) → the clean map JPEG comes back → the V1
// bottom strip (town · time · °F · icon, units-law formatTemp) is burned in
// client-side ONCE at upload → preview → POST /api/posts carries the burned
// inline JPEG (wave-2 storage seam) + snapshotId (provenance, validated
// server-side) + lat/lon/zoom.
//
// No-fallback law (S7#4): a failed capture shows the exact loud message
// "snapshot failed — post without image, or retry" with RETRY and
// POST-WITHOUT-IMAGE buttons. A snapshot-referencing post with a dead image
// never ships, and a black box never renders.
//
// R17: clock/RNG-free — the strip time comes from the response `date`
// header (server clock edge); all math is pure.
import { useCallback, useState } from 'react'
import { createPost, type FetchLike, type Session } from '../lib/feed'
import {
  CAPTURE_ZOOM,
  SNAPSHOT_FAILED_MESSAGE,
  buildStripData,
  composeBurnedSnapshot,
  fetchTownWeather,
  parseTownCoords,
  requestSnapshot,
  type SnapshotCapture,
} from '../lib/snapshot-overlay'

export interface FeedComposerProps {
  session: Session
  fetchImpl?: FetchLike
  onPosted: () => void
}

type Phase = 'idle' | 'capturing' | 'ready' | 'failed'

interface Captured {
  capture: SnapshotCapture
  dataUrl: string
}

export function FeedComposer({ session, fetchImpl, onPosted }: FeedComposerProps) {
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [captured, setCaptured] = useState<Captured | null>(null)
  const [status, setStatus] = useState<'idle' | 'sending'>('idle')
  const [error, setError] = useState('')

  // Town chip law: the composer captures AT the session town; coordinates
  // come from the canonical slug tail. Unresolvable = loud chip error, the
  // capture button disables (never a guessed center).
  const coords = parseTownCoords(session.townSlug)

  const capture = useCallback(async () => {
    if (!coords) return
    setPhase('capturing')
    setError('')
    const res = await requestSnapshot({ ...coords, zoom: CAPTURE_ZOOM }, session, fetchImpl)
    if (!res.ok) {
      setPhase('failed')
      setError(res.status === 401 ? 'Session missing — set your identity first.' : res.error)
      return
    }
    // Weather strip (units law: formatTemp applies the active F/C display).
    const weather = await fetchTownWeather(res.data.lat, res.data.lon, fetchImpl)
    const strip = buildStripData(session.townName, session.townSlug, weather, res.data.stamp)
    const burned = await composeBurnedSnapshot(res.data, strip, fetchImpl ?? ((i, init) => window.fetch(i, init)))
    if ('error' in burned) {
      setPhase('failed')
      setError(`snapshot failed — ${burned.error}`)
      return
    }
    setCaptured({ capture: res.data, dataUrl: burned.dataUrl })
    setPhase('ready')
  }, [coords, session, fetchImpl])

  async function submit(withImage: boolean) {
    const body = text.trim()
    if (!body) return
    setStatus('sending')
    setError('')
    const payload: {
      town: string
      text: string
      snapshot?: string
      snapshotId?: string
      lat?: number
      lon?: number
      zoom?: number
    } = { town: session.townSlug, text: body }
    if (withImage && captured) {
      payload.snapshot = captured.dataUrl
      payload.snapshotId = captured.capture.id
      payload.lat = captured.capture.lat
      payload.lon = captured.capture.lon
      payload.zoom = captured.capture.zoom
    }
    const res = await createPost(payload, session, fetchImpl)
    if (res.ok) {
      setText('')
      setCaptured(null)
      setPhase('idle')
      setStatus('idle')
      onPosted()
    } else {
      setStatus('idle')
      setError(res.status === 401 ? 'Session missing — set your identity first.' : `Post not sent (${res.error}).`)
    }
  }

  const sending = status === 'sending'
  const canPost = text.trim().length > 0 && !sending

  return (
    <form
      className="feed-composer"
      data-testid="feed-composer"
      onSubmit={(e) => {
        e.preventDefault()
        void submit(phase === 'ready')
      }}
    >
      <textarea
        data-testid="composer-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`What's happening in ${session.townName}?`}
        maxLength={500}
        rows={3}
      />
      <div className="feed-composer-row">
        <span
          className="composer-town-chip"
          data-testid="composer-town-chip"
          title={coords ? `${session.townSlug}` : 'session town has no coordinates'}
        >
          📍 {session.townName}
        </span>
        <button
          type="button"
          className="composer-capture"
          data-testid="composer-capture"
          onClick={() => void capture()}
          disabled={!coords || phase === 'capturing' || sending}
        >
          {phase === 'capturing' ? 'Capturing…' : 'Capture snapshot'}
        </button>
        <button type="submit" data-testid="composer-send" disabled={!canPost}>
          {sending ? 'Posting…' : phase === 'ready' ? 'Post with map' : 'Post'}
        </button>
      </div>

      {!coords && (
        <p className="feed-error" role="alert" data-testid="composer-town-error">
          Session town has no coordinates — snapshot capture unavailable. Re-pick your town in Identity.
        </p>
      )}

      {phase === 'ready' && captured && (
        <div className="composer-preview" data-testid="composer-preview">
          <img className="composer-preview-img" data-testid="composer-preview-img" src={captured.dataUrl} alt="Snapshot preview with weather strip" />
          <span className="composer-hint">map snapshot ready · snap {captured.capture.id}</span>
        </div>
      )}

      {phase === 'failed' && (
        <div className="composer-snapshot-error" role="alert" data-testid="composer-snapshot-error">
          <p className="feed-error">{SNAPSHOT_FAILED_MESSAGE}</p>
          {error && <p className="composer-error-detail">{error}</p>}
          <div className="composer-error-actions">
            <button type="button" data-testid="composer-retry" onClick={() => void capture()} disabled={!coords}>
              Retry
            </button>
            <button
              type="button"
              data-testid="composer-post-without-image"
              onClick={() => {
                setPhase('idle')
                setCaptured(null)
                void submit(false)
              }}
            >
              Post without image
            </button>
          </div>
        </div>
      )}

      {status === 'sending' && <p className="feed-status" data-testid="composer-sending">Posting…</p>}

      {status === 'idle' && error && phase !== 'failed' && (
        <p className="feed-error" role="alert" data-testid="composer-error">
          {error}
        </p>
      )}
    </form>
  )
}
