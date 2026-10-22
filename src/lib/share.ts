// W3-D3 SHARE (brainstorm session 4 decision 3): BOTH paths, feature-detected.
// Copy-link uses the async clipboard API; native sharing uses
// navigator.share ONLY when it actually exists (never faked). R17: clock/RNG-free.

/** True when the native Web Share API is genuinely available. */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/** Copy text via the clipboard API. False on absence/failure (never silent). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* permission denied / insecure context — the caller shows an honest failure */
  }
  return false
}

export type ShareOutcome = 'shared' | 'cancelled' | 'failed' | 'unavailable'

/**
 * Native share sheet when available. User-cancel is honest (not an error);
 * anything else reports 'failed'. Never fabricates a share.
 */
export async function nativeShare(data: ShareData): Promise<ShareOutcome> {
  if (!canNativeShare()) return 'unavailable'
  try {
    await navigator.share(data)
    return 'shared'
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    return 'failed'
  }
}
