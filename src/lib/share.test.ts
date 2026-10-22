// W3-D3 SHARE lib unit tests — feature detection is honest: copyText reports
// failure, nativeShare never fabricates a sheet when navigator.share is absent.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canNativeShare, copyText, nativeShare } from './share'

const nav = globalThis.navigator as unknown as {
  clipboard?: { writeText: (text: string) => Promise<void> }
  share?: (data: ShareData) => Promise<void>
}

afterEach(() => {
  delete nav.share
})

describe('canNativeShare', () => {
  it('false without navigator.share (never faked)', () => {
    delete nav.share
    expect(canNativeShare()).toBe(false)
  })
  it('true only when navigator.share is a function', () => {
    nav.share = vi.fn(async () => undefined)
    expect(canNativeShare()).toBe(true)
  })
})

describe('copyText', () => {
  it('true + forwards text when clipboard writes', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(nav, 'clipboard', { value: { writeText }, configurable: true })
    await expect(copyText('http://x/p/1')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('http://x/p/1')
  })
  it('false when clipboard rejects (permission denied)', async () => {
    Object.defineProperty(nav, 'clipboard', {
      value: { writeText: vi.fn(async () => { throw new Error('denied') }) },
      configurable: true,
    })
    await expect(copyText('x')).resolves.toBe(false)
  })
})

describe('nativeShare', () => {
  it('unavailable when navigator.share is absent', async () => {
    delete nav.share
    await expect(nativeShare({ url: 'http://x' })).resolves.toBe('unavailable')
  })
  it('shared on success', async () => {
    nav.share = vi.fn(async () => undefined)
    await expect(nativeShare({ url: 'http://x' })).resolves.toBe('shared')
  })
  it('cancelled on AbortError (honest, not an error)', async () => {
    nav.share = vi.fn(async () => {
      throw new DOMException('cancel', 'AbortError')
    })
    await expect(nativeShare({ url: 'http://x' })).resolves.toBe('cancelled')
  })
  it('failed on any other throw', async () => {
    nav.share = vi.fn(async () => { throw new Error('boom') })
    await expect(nativeShare({ url: 'http://x' })).resolves.toBe('failed')
  })
})
