// W3-C3 COMMAND PALETTE component tests — open/close (Esc, scrim), command
// filtering, keyboard nav (arrows + Enter), theme toggle command, recents
// round-trip. Portal dialog; MemoryRouter hosts the useNavigate hook.
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { CommandPalette } from './CommandPalette'

function renderPalette(props: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const onClose = props.onClose ?? vi.fn()
  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <CommandPalette open={props.open ?? true} onClose={onClose} />
    </MemoryRouter>,
  )
  return { ...view, onClose }
}

describe('CommandPalette', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    document.documentElement.setAttribute('data-theme', 'dark')
  })

  it('renders the dialog + input when open, nothing when closed', () => {
    renderPalette({ open: true })
    const dialog = screen.getByTestId('palette')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByTestId('palette-input')).toHaveFocus()
  })

  it('closed palette renders no dialog (portal unmounted)', () => {
    renderPalette({ open: false })
    expect(screen.queryByTestId('palette')).not.toBeInTheDocument()
  })

  it('closes via Escape', () => {
    const { onClose } = renderPalette()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes via scrim click, not dialog click', () => {
    const { onClose } = renderPalette()
    fireEvent.click(screen.getByTestId('palette-dialog'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('palette'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows all commands with shortcut hints when query is empty', () => {
    renderPalette()
    expect(screen.getByTestId('palette-row-toggle-theme')).toBeInTheDocument()
    expect(screen.getByTestId('palette-row-toggle-panel')).toBeInTheDocument()
    expect(screen.getByTestId('palette-row-nav-map')).toBeInTheDocument()
    // Shortcut hints teach existing laws (P law visible).
    expect(screen.getByTestId('palette-row-toggle-panel')).toHaveTextContent('P')
  })

  it('shows an honest empty recents state', () => {
    renderPalette()
    expect(screen.getByTestId('palette-recents-empty')).toBeInTheDocument()
  })

  it('filters rows as the user types', () => {
    renderPalette()
    fireEvent.change(screen.getByTestId('palette-input'), { target: { value: 'theme' } })
    expect(screen.getByTestId('palette-row-toggle-theme')).toBeInTheDocument()
    expect(screen.queryByTestId('palette-row-nav-map')).not.toBeInTheDocument()
  })

  it('no-match shows an honest empty message', () => {
    renderPalette()
    fireEvent.change(screen.getByTestId('palette-input'), { target: { value: 'zzzz' } })
    expect(screen.getByTestId('palette-no-match')).toBeInTheDocument()
  })

  it('keyboard nav: ArrowDown moves highlight, Enter runs the command', () => {
    const { onClose } = renderPalette()
    const input = screen.getByTestId('palette-input')
    // First row highlighted by default.
    expect(screen.getByTestId('palette-row-nav-map')).toHaveClass('is-highlighted')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByTestId('palette-row-nav-feed')).toHaveClass('is-highlighted')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('theme toggle command flips html[data-theme] and closes', () => {
    // Controlled host: onClose flips `open` false (real App wiring).
    function Host() {
      const [open, o] = useState(true)
      return <CommandPalette open={open} onClose={() => o(false)} />
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <Host />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByTestId('palette-input'), { target: { value: 'theme' } })
    fireEvent.click(screen.getByTestId('palette-row-toggle-theme'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(screen.queryByTestId('palette')).not.toBeInTheDocument()
  })

  it('run lands in recents (sessionStorage round-trip)', () => {
    renderPalette()
    fireEvent.click(screen.getByTestId('palette-row-nav-map'))
    expect(JSON.parse(window.sessionStorage.getItem('nds-palette-recents') ?? '[]')).toContain('nav-map')
  })

  it('town command switches to typeahead mode with gazetteer results', () => {
    renderPalette()
    fireEvent.click(screen.getByTestId('palette-row-go-town'))
    expect(screen.getByTestId('palette-mode-note')).toBeInTheDocument()
    // Deterministic default list: highest-pop towns render as options.
    const rows = document.querySelectorAll('[data-testid^="palette-town-"]')
    expect(rows.length).toBeGreaterThan(0)
    // Type-ahead filters them.
    fireEvent.change(screen.getByTestId('palette-input'), { target: { value: 'springfield' } })
    const filtered = document.querySelectorAll('[data-testid^="palette-town-"]')
    expect(filtered.length).toBeGreaterThan(0)
    for (const el of Array.from(filtered)) {
      expect(el.textContent?.toLowerCase()).toContain('springfield')
    }
  })
})
