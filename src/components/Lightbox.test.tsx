// W3-D3 LIGHTBOX unit tests — open/close (X, Esc, scrim click), focus
// management (portal dialog, focus restored to trigger). jsdom env.
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Lightbox } from './Lightbox'

describe('Lightbox', () => {
  it('renders the image centered in a modal dialog', () => {
    render(<Lightbox src="data:image/png;base64,AAA" alt="Map snapshot from maria" onClose={vi.fn()} />)
    const dialog = screen.getByTestId('lightbox')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByTestId('lightbox-image')).toHaveAttribute('src', 'data:image/png;base64,AAA')
  })

  it('closes via the X button', () => {
    const onClose = vi.fn()
    render(<Lightbox src="x" alt="a" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('lightbox-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes via Escape', () => {
    const onClose = vi.fn()
    render(<Lightbox src="x" alt="a" onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes via scrim click, not image click', () => {
    const onClose = vi.fn()
    render(<Lightbox src="x" alt="a" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('lightbox-image'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('lightbox'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the dialog and traps Tab inside it', () => {
    render(<Lightbox src="x" alt="a" onClose={vi.fn()} />)
    const close = screen.getByTestId('lightbox-close')
    expect(close).toHaveFocus()
    // Tab from the only focusable element wraps back to itself (trap).
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(close).toHaveFocus()
  })
})
