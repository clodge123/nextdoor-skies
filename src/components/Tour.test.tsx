// W3-E2 TOUR component tests — the state machine the lane is judged on:
// seen-once (localStorage), skip marks seen, replay seam, step order,
// non-blocking controls (scrim click advances, Esc skips).
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TourHost, { requestTour } from './Tour'
import { TOUR_SEEN_KEY, TOUR_STEPS } from '../lib/tour'

// useTourOpen reads the route (map-home gate), so the host mounts under a
// router at '/' — same position as App.tsx.
function mountTourHost() {
  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <TourHost />
    </MemoryRouter>,
  )
  return view
}

// Fake timers go active BEFORE render so the scheduled open (OPEN_DELAY_MS
// 600ms) lands in the fake clock — keeps the suite instant and deterministic.
const OPEN_DELAY = 600

function settleOpen() {
  act(() => {
    vi.advanceTimersByTime(OPEN_DELAY + 10)
  })
}

describe('Tour (W3-E2 first-visit spotlight)', () => {
  beforeEach(() => {
    localStorage.clear()
    window.sessionStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('first visit: tour opens after the paint delay, step 1 of 3', () => {
    mountTourHost()
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument() // not before paint
    settleOpen()
    const tour = screen.getByTestId('tour')
    expect(tour).toBeInTheDocument()
    expect(tour).toHaveAttribute('data-step', '0')
    expect(tour).toHaveAttribute('data-step-id', TOUR_STEPS[0].id)
    expect(screen.getByTestId('tour-next')).toBeInTheDocument()
    expect(screen.getByTestId('tour-skip')).toBeInTheDocument()
  })

  it('step order: Next x3 walks welcome-map -> search -> panel-palette -> Done', () => {
    mountTourHost()
    settleOpen()
    expect(screen.getByTestId('tour')).toHaveAttribute('data-step-id', 'welcome-map')
    fireEvent.click(screen.getByTestId('tour-next'))
    expect(screen.getByTestId('tour')).toHaveAttribute('data-step-id', 'search')
    fireEvent.click(screen.getByTestId('tour-next'))
    expect(screen.getByTestId('tour')).toHaveAttribute('data-step-id', 'panel-palette')
    // Last step swaps Next for Done.
    const done = screen.getByTestId('tour-done')
    fireEvent.click(done)
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument()
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1')
  })

  it('skip marks the tour seen immediately', () => {
    mountTourHost()
    settleOpen()
    fireEvent.click(screen.getByTestId('tour-skip'))
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument()
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1')
  })

  it('Esc skips (marks seen)', () => {
    mountTourHost()
    settleOpen()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument()
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1')
  })

  it('scrim click advances (non-blocking law)', () => {
    mountTourHost()
    settleOpen()
    fireEvent.click(screen.getByTestId('tour-scrim'))
    expect(screen.getByTestId('tour')).toHaveAttribute('data-step', '1')
    // Advancing past the last step via scrim finishes like Done.
    fireEvent.click(screen.getByTestId('tour-scrim'))
    fireEvent.click(screen.getByTestId('tour-scrim'))
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument()
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1')
  })

  it('seen-once law: returning visitor never sees the tour unprompted', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1')
    mountTourHost()
    settleOpen()
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument()
  })

  it('replay seam: requestTour() reopens for a seen visitor', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1')
    mountTourHost()
    settleOpen()
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument()
    act(() => {
      requestTour()
    })
    expect(screen.getByTestId('tour')).toBeInTheDocument()
    expect(screen.getByTestId('tour')).toHaveAttribute('data-step', '0')
  })

  it('route gate: tour auto-opens on map home only (/feed stays quiet)', () => {
    vi.useFakeTimers()
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <TourHost />
      </MemoryRouter>,
    )
    settleOpen()
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument()
    // The replay seam still works anywhere (palette/drawer call requestTour).
    act(() => {
      requestTour()
    })
    expect(screen.getByTestId('tour')).toBeInTheDocument()
  })

  it('the tour is a non-modal dialog: aria-modal false (never traps focus)', () => {
    mountTourHost()
    settleOpen()
    expect(screen.getByTestId('tour')).toHaveAttribute('aria-modal', 'false')
  })
})
