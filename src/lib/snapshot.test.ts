// W5 snapshot tests (S7): size cap walks the quality ladder, honest failure
// states, composePost attaches a snapshot only when the map canvas exists.
// Stubbed canvas — jsdom has no real 2d raster.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SNAPSHOT_MAX_BYTES, captureMapSnapshot, composePost, encodeSnapshot } from './snapshot'

/** Fake canvas: toDataURL returns a string sized by `bytesForQuality`. */
function stubCanvas(bytesForQuality: (q: number) => number) {
  const calls: number[] = []
  const canvas = {
    width: 1200,
    height: 900,
    getContext: vi.fn(() => ({ drawImage: vi.fn() })),
    toDataURL: vi.fn((_type?: string, quality?: number) => {
      const q = quality ?? 0.8
      calls.push(q)
      const bytes = bytesForQuality(q)
      // base64 chars decode at 0.75 bytes/char — emit enough chars for `bytes`
      return 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(bytes / 0.75))
    }),
  }
  return { canvas, calls }
}

function withStubbedCanvas(canvas: {
  width: number
  height: number
  getContext: (t: string) => { drawImage: (img: unknown, x: number, y: number, w: number, h: number) => void } | null
  toDataURL: (type?: string, q?: number) => string
}) {
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') return canvas as unknown as HTMLCanvasElement
    return document.createElement(tag)
  })
  return spy
}

describe('encodeSnapshot size cap (S7)', () => {
  it('accepts the first quality that fits <= 120 KB', () => {
    const { canvas, calls } = stubCanvas((q) => (q === 0.8 ? SNAPSHOT_MAX_BYTES + 1 : 50_000))
    const spy = withStubbedCanvas(canvas)
    const res = encodeSnapshot({} as CanvasImageSource, 1200, 900)
    spy.mockRestore()
    expect(res.ok).toBe(true)
    expect(res.bytes).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES)
    expect(res.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
    // quality ladder walked: 0.8 rejected, 0.6 accepted
    expect(calls).toEqual([0.8, 0.6])
  })

  it('fails honestly when every quality exceeds the cap', () => {
    const { canvas } = stubCanvas(() => SNAPSHOT_MAX_BYTES + 1)
    const spy = withStubbedCanvas(canvas)
    const res = encodeSnapshot({} as CanvasImageSource, 1200, 900)
    spy.mockRestore()
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/cap/)
  })

  it('rejects empty sources', () => {
    const res = encodeSnapshot({} as CanvasImageSource, 0, 0)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/empty/)
  })
})

describe('captureMapSnapshot + composePost', () => {
  const savedNds = (window as { ndsMap?: unknown }).ndsMap

  afterEach(() => {
    if (savedNds) (window as { ndsMap?: unknown }).ndsMap = savedNds
    else delete (window as { ndsMap?: unknown }).ndsMap
  })

  it('captures from window.ndsMap canvas', () => {
    const { canvas } = stubCanvas(() => 1000)
    ;(window as { ndsMap?: { getCanvas(): unknown } }).ndsMap = { getCanvas: () => canvas }
    const spy = withStubbedCanvas(canvas)
    const res = captureMapSnapshot()
    spy.mockRestore()
    expect(res.ok).toBe(true)
  })

  it('honest failure without a map canvas', () => {
    delete (window as { ndsMap?: unknown }).ndsMap
    const res = captureMapSnapshot()
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/not available/)
  })

  it('composePost attaches a snapshot when the map is live', () => {
    const { canvas } = stubCanvas(() => 1000)
    ;(window as { ndsMap?: { getCanvas(): unknown } }).ndsMap = { getCanvas: () => canvas }
    const spy = withStubbedCanvas(canvas)
    const payload = composePost('springfield-37.22--93.3', 'storm rolling in')
    spy.mockRestore()
    expect(payload.town).toBe('springfield-37.22--93.3')
    expect(payload.text).toBe('storm rolling in')
    expect(payload.snapshot).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('composePost degrades to text-only without the map', () => {
    delete (window as { ndsMap?: unknown }).ndsMap
    const payload = composePost('springfield-37.22--93.3', 'storm rolling in')
    expect(payload.snapshot).toBeUndefined()
  })
})
