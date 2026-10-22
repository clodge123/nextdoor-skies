// W3-D3 LIGHTBOX (brainstorm session 4 decision 4): tap a post snapshot ->
// full-screen image over a dark scrim. Close via the X button, Esc, or a
// scrim click. While open, focus is trapped inside the dialog and restored
// to the trigger on close; the dialog renders through a portal on
// document.body, so opening never shifts page layout (square geometry R20 —
// corners stay var(--radius), no raw radii).
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface LightboxProps {
  src: string
  alt: string
  onClose: () => void
}

export function Lightbox({ src, alt, onClose }: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Keep the latest onClose in a ref so the mount effect runs exactly once
  // (inline parent handlers must not re-run the focus-save/restore cycle).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap: Tab (and Shift+Tab) cycles inside the dialog only.
      const node = dialogRef.current
      if (!node) return
      const focusables = node.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.() // honest restore: focus returns to the snapshot trigger
    }
  }, [])

  return createPortal(
    <div
      className="lightbox-scrim"
      data-testid="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      ref={dialogRef}
      onClick={(e) => {
        // Scrim click (anything outside the image/close button) closes.
        if (e.target === e.currentTarget) onCloseRef.current()
      }}
    >
      <button
        type="button"
        className="lightbox-close"
        data-testid="lightbox-close"
        aria-label="Close image"
        ref={closeRef}
        onClick={() => onCloseRef.current()}
      >
        ✕
      </button>
      <img className="lightbox-image" data-testid="lightbox-image" src={src} alt={alt} />
    </div>,
    document.body,
  )
}

export default Lightbox
