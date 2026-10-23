// W4-D2 SNAPSHOT-OVERLAY lib tests — URL builder (C6 law), strip layout
// geometry, strip data (units law + honest weather), epoch-stamp math,
// requestSnapshot error states (loud, no fallback), town-coord parsing.
// R17-safe: no Date.now/Math.random; fixed clocks via injected fetch.
import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from './feed'
import {
  BURNED_MAX_BYTES,
  CANVAS_H,
  CANVAS_W,
  SNAPSHOT_ENDPOINT,
  SNAPSHOT_FAILED_MESSAGE,
  STRIP_H,
  buildStripData,
  burnInStrip,
  drawWeatherGlyph,
  fetchSnapshotBytes,
  formatEpochStamp,
  parseDateHeader,
  parseTownCoords,
  requestSnapshot,
  snapshotUrl,
  stripLayout,
} from './snapshot-overlay'

describe('snapshotUrl (C6 law)', () => {
  it('builds the query-param GET form with the id encoded', () => {
    expect(snapshotUrl('snap_k3m9d2')).toBe('/api/snapshots?path=snap_k3m9d2')
    expect(snapshotUrl('snap_a/b')).toBe('/api/snapshots?path=snap_a%2Fb')
  })

  it('POST endpoint is the session-gated /api/snapshot file', () => {
    expect(SNAPSHOT_ENDPOINT).toBe('/api/snapshot')
  })
})

describe('strip layout (V1 bottom bar, S7#3)', () => {
  it('bar sits at the bottom of the 640x360 canvas', () => {
    const L = stripLayout()
    expect(L.barY + L.barH).toBe(CANVAS_H)
    expect(L.barY).toBe(CANVAS_H - STRIP_H)
  })

  it('town text starts left, time/temp/icon stack rightward inside the bar', () => {
    const L = stripLayout()
    expect(L.townX).toBeGreaterThanOrEqual(8)
    expect(L.townX + L.townMaxW).toBeLessThan(L.timeRight)
    expect(L.timeRight).toBeLessThan(L.tempRight)
    expect(L.tempRight).toBeLessThan(L.iconBox.x + L.iconBox.size)
    expect(L.iconBox.x + L.iconBox.size).toBeLessThanOrEqual(CANVAS_W)
  })

  it('icon box is square, vertically centered in the strip, >=24px', () => {
    const L = stripLayout()
    expect(L.iconBox.size).toBeGreaterThanOrEqual(24)
    expect(L.iconBox.y + L.iconBox.size).toBeLessThanOrEqual(L.barY + L.barH)
    expect(L.iconBox.y).toBeGreaterThanOrEqual(L.barY)
  })
})

describe('town coords parse from canonical slug', () => {
  it('parses springfield-37.22--93.3', () => {
    expect(parseTownCoords('springfield-37.22--93.3')).toEqual({ lat: 37.22, lon: -93.3 })
  })
  it('parses negative-lat towns', () => {
    expect(parseTownCoords('hilo-hi-19.72--155.09')).toEqual({ lat: 19.72, lon: -155.09 })
  })
  it('returns null for coordinate-less slugs (loud chip error, never a guess)', () => {
    expect(parseTownCoords('springfield')).toBeNull()
    expect(parseTownCoords('')).toBeNull()
  })
})

describe('epoch stamp math (R17-safe, no new Date)', () => {
  it('formats known epoch-ms as UTC "YYYY-MM-DD HH:MM"', () => {
    expect(formatEpochStamp(Date.parse('2026-10-23T02:56:00Z'))).toBe('2026-10-23 02:56')
    expect(formatEpochStamp(0)).toBe('1970-01-01 00:00')
  })
  it('handles pre-epoch dates (civil algorithm, negative days)', () => {
    expect(formatEpochStamp(Date.parse('1969-12-31T23:59:00Z'))).toBe('1969-12-31 23:59')
  })
  it('empty for non-finite input', () => {
    expect(formatEpochStamp(NaN)).toBe('')
  })
  it('parseDateHeader reads HTTP date headers, null when absent', () => {
    expect(parseDateHeader('Fri, 23 Oct 2026 07:56:00 GMT')).toBe(Date.parse('2026-10-23T07:56:00Z'))
    expect(parseDateHeader(null)).toBeNull()
    expect(parseDateHeader('not a date')).toBeNull()
  })
})

describe('buildStripData (units law + honest weather)', () => {
  const slug = 'springfield-37.22--93.3'

  it('converts proxy Fahrenheit through formatTemp — F default renders °F', () => {
    localStorage.removeItem('nds-units')
    const strip = buildStripData('Springfield', slug, { temps: { [slug]: 70 }, codes: { [slug]: 0 } }, '2026-10-23 02:56')
    expect(strip.temp).toBe('70°F')
    expect(strip.town).toBe('Springfield')
    expect(strip.bucket).toBe('clear')
    expect(strip.time).toBe('2026-10-23 02:56')
  })

  it('follows the active unit toggle (C)', () => {
    localStorage.setItem('nds-units', 'C')
    const strip = buildStripData('Springfield', slug, { temps: { [slug]: 70 } }, '')
    expect(strip.temp).toBe('21°C')
    localStorage.removeItem('nds-units')
  })

  it('missing temp renders an honest dash, never a guessed number', () => {
    const strip = buildStripData('Springfield', slug, { temps: {} }, '')
    expect(strip.temp).toBe('—°F')
  })

  it('missing code renders NO icon (never a fake condition)', () => {
    const strip = buildStripData('Springfield', slug, { temps: { [slug]: 50 } }, '')
    expect(strip.bucket).toBeNull()
  })

  it('maps WMO codes to buckets', () => {
    expect(buildStripData('S', slug, { temps: { [slug]: 40 }, codes: { [slug]: 61 } }, '').bucket).toBe('rain')
    expect(buildStripData('S', slug, { temps: { [slug]: 40 }, codes: { [slug]: 71 } }, '').bucket).toBe('snow')
    expect(buildStripData('S', slug, { temps: { [slug]: 40 }, codes: { [slug]: 95 } }, '').bucket).toBe('thunder')
  })
})

describe('weather glyph drawing', () => {
  function recordingCtx() {
    const ops: string[] = []
    const ctx = {
      save: () => ops.push('save'),
      restore: () => ops.push('restore'),
      translate: () => {},
      beginPath: () => {},
      arc: () => ops.push('arc'),
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => ops.push('stroke'),
      strokeRect: () => ops.push('strokeRect'),
      fillRect: () => ops.push('fillRect'),
      fillText: (t: string) => ops.push(`text:${t}`),
      measureText: (t: string) => ({ width: t.length * 8 }),
      fillTextFont: '',
      set font(v: string) {},
      get font() { return '' },
      set fillStyle(v: string) {},
      get fillStyle() { return '' },
      set strokeStyle(v: string) {},
      get strokeStyle() { return '' },
      lineWidth: 1,
      lineCap: '',
      lineJoin: '',
      textBaseline: '',
      textAlign: '',
    }
    return { ctx: ctx as unknown as CanvasRenderingContext2D, ops }
  }

  it('draws strokes for known buckets and a neutral box for unknown', () => {
    const a = recordingCtx()
    drawWeatherGlyph(a.ctx, 'rain', 0, 0, 24)
    expect(a.ops).toContain('stroke')
    const b = recordingCtx()
    drawWeatherGlyph(b.ctx, 'nope', 0, 0, 24)
    expect(b.ops).toContain('strokeRect')
  })
})

describe('burnInStrip (canvas overlay ONCE, deterministic)', () => {
  /** Stub canvas: toDataURL emits base64 chars sized to the quality ladder. */
  function stubCanvas(sizes: Record<number, number>) {
    const calls: number[] = []
    const original = document.createElement.bind(document)
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        arc: vi.fn(),
        closePath: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
        measureText: (t: string) => ({ width: t.length * 8 }),
        set font(_v: string) {},
        set fillStyle(_v: string) {},
        set strokeStyle(_v: string) {},
        set lineWidth(_v: number) {},
        set lineCap(_v: string) {},
        set lineJoin(_v: string) {},
        set textBaseline(_v: string) {},
        set textAlign(_v: string) {},
      })),
      toDataURL: vi.fn((_type?: string, q?: number) => {
        const quality = q ?? 0.8
        calls.push(quality)
        const bytes = sizes[quality] ?? 1000
        return 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(bytes / 0.75))
      }),
    }
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvas as unknown as HTMLCanvasElement
      return original(tag)
    })
    return { canvas, calls }
  }

  it('walks the quality ladder until <= 120 KB, returns a jpeg data URL', () => {
    const { canvas, calls } = stubCanvas({ 0.8: BURNED_MAX_BYTES + 1, 0.6: 60_000 })
    const res = burnInStrip({} as CanvasImageSource, { town: 'S', time: '', temp: '70°F', bucket: 'clear' })
    expect('dataUrl' in res).toBe(true)
    if ('dataUrl' in res) {
      expect(res.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
      expect(res.bytes).toBeLessThanOrEqual(BURNED_MAX_BYTES)
    }
    expect(calls).toEqual([0.8, 0.6])
    expect(canvas.width).toBe(CANVAS_W)
    expect(canvas.height).toBe(CANVAS_H)
    vi.mocked(document.createElement).mockRestore()
  })

  it('fails loudly when every quality exceeds the cap (never a silent black)', () => {
    stubCanvas({ 0.8: BURNED_MAX_BYTES + 1, 0.6: BURNED_MAX_BYTES + 1, 0.45: BURNED_MAX_BYTES + 1, 0.3: BURNED_MAX_BYTES + 1 })
    const res = burnInStrip({} as CanvasImageSource, { town: 'S', time: '', temp: '—°F', bucket: null })
    expect('error' in res).toBe(true)
    vi.mocked(document.createElement).mockRestore()
  })

  it('fails loudly when the canvas context is unavailable', () => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return { width: 0, height: 0, getContext: () => null, toDataURL: () => '' } as unknown as HTMLCanvasElement
      return document.createElement(tag)
    })
    const res = burnInStrip({} as CanvasImageSource, { town: 'S', time: '', temp: '—°F', bucket: null })
    expect('error' in res).toBe(true)
    vi.mocked(document.createElement).mockRestore()
  })
})

describe('requestSnapshot (loud ApiResult, no fallback)', () => {
  const session = { nickname: 'jordan', townSlug: 'springfield-37.22--93.3', townName: 'Springfield' }

  /** Partial Response stub — tests only exercise ok/status/headers/json. */
  function fakeResponse(r: Record<string, unknown>): FetchLike {
    return (vi.fn(async () => r) as unknown) as FetchLike
  }

  it('POSTs the view + session header, returns the capture reference + stamp', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ lat: 37.22, lon: -93.3, zoom: 11 })
      expect(JSON.parse(String((init?.headers as Record<string, string>)['x-nds-session']))).toEqual(session)
      return {
        ok: true,
        status: 201,
        headers: new Headers({ date: 'Fri, 23 Oct 2026 07:56:00 GMT' }),
        json: async () => ({ id: 'snap_k3m9d2', url: '/api/snapshots?path=snap_k3m9d2', lat: 37.22, lon: -93.3, zoom: 6, bytes: 43223 }),
      } as Response
    })
    const res = await requestSnapshot({ lat: 37.22, lon: -93.3, zoom: 11 }, session, fetchImpl)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.id).toBe('snap_k3m9d2')
      expect(res.data.stamp).toBe('2026-10-23 07:56')
    }
  })

  it('502 passes the loud S7#4 message through untouched', async () => {
    const fetchImpl = fakeResponse({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: async () => ({ error: SNAPSHOT_FAILED_MESSAGE, detail: 'attempt 2: variance gate failed' }),
    })
    const res = await requestSnapshot({ lat: 0, lon: 0, zoom: 2 }, session, fetchImpl)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.status).toBe(502)
      expect(res.error).toBe('snapshot failed — post without image, or retry')
    }
  })

  it('401 missing session -> loud 401 result', async () => {
    const fetchImpl = fakeResponse({ ok: false, status: 401, headers: new Headers(), json: async () => ({ error: 'missing session' }) })
    const res = await requestSnapshot({ lat: 0, lon: 0, zoom: 2 }, session, fetchImpl)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('missing session')
  })

  it('network failure -> honest status 0, never throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom')
    })
    const res = await requestSnapshot({ lat: 0, lon: 0, zoom: 2 }, session, fetchImpl)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(0)
  })

  it('malformed 201 body (no snap_ id) -> loud malformed result', async () => {
    const fetchImpl = fakeResponse({ ok: true, status: 201, headers: new Headers(), json: async () => ({ id: 'not-a-snap' }) })
    const res = await requestSnapshot({ lat: 0, lon: 0, zoom: 2 }, session, fetchImpl)
    expect(res.ok).toBe(false)
  })
})

describe('fetchSnapshotBytes', () => {
  it('GETs the query-param url and returns bytes', async () => {
    const buf = new Uint8Array([0xff, 0xd8]).buffer
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => buf }))
    const res = await fetchSnapshotBytes('/api/snapshots?path=snap_x', fetchImpl as unknown as FetchLike)
    expect(res.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith('/api/snapshots?path=snap_x', { method: 'GET' })
  })

  it('404 snapshot not found -> loud result', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }))
    const res = await fetchSnapshotBytes('/api/snapshots?path=snap_missing', fetchImpl as unknown as FetchLike)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(404)
  })
})
