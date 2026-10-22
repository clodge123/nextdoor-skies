// W3-C1 LAYOUT-SHELL — SidePanel unit tests (Gate 0).
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SidePanel, {
  requestPanelOpen,
  usePanelState,
  MOBILE_QUERY,
} from './SidePanel';

afterEach(() => cleanup());

/** Stub window.matchMedia so isMobileViewport() is deterministic. */
function stubViewport(isMobile: boolean): void {
  const match = { matches: isMobile, media: MOBILE_QUERY };
  vi.stubGlobal('matchMedia', () => match);
}

function PanelHarness() {
  const panel = usePanelState();
  return (
    <div>
      <button type="button" data-testid="toggle" onClick={panel.toggle}>
        t
      </button>
      <SidePanel open={panel.open} onToggle={panel.toggle} />
    </div>
  );
}

describe('SidePanel (desktop geometry)', () => {
  beforeEach(() => stubViewport(false));
  afterEach(() => vi.unstubAllGlobals());

  it('is open by default on desktop and renders the honest empty state', () => {
    render(<PanelHarness />);
    const panel = screen.getByTestId('side-panel');
    expect(panel).toHaveAttribute('data-open', 'true');
    expect(panel.className).toContain('is-open');
    expect(screen.getByTestId('panel-empty')).toBeInTheDocument();
    expect(screen.getByTestId('panel-empty').textContent).toContain('Nothing to show yet');
  });

  it('collapses via the toggle button (data-open flips, aria-hidden set)', () => {
    render(<PanelHarness />);
    fireEvent.click(screen.getByTestId('panel-close'));
    const panel = screen.getByTestId('side-panel');
    expect(panel).toHaveAttribute('data-open', 'false');
    expect(panel.className).toContain('is-collapsed');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });

  it('keyboard P toggles the panel', () => {
    render(<PanelHarness />);
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-open', 'true');
    fireEvent.keyDown(window, { key: 'p' });
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-open', 'false');
    fireEvent.keyDown(window, { key: 'P' });
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-open', 'true');
  });

  it('P inside a text input does NOT toggle (no shortcut theft)', () => {
    function WithInput() {
      const panel = usePanelState();
      return (
        <div>
          <input data-testid="inp" defaultValue="" />
          <SidePanel open={panel.open} onToggle={panel.toggle} />
        </div>
      );
    }
    render(<WithInput />);
    const input = screen.getByTestId('inp');
    input.focus();
    fireEvent.keyDown(input, { key: 'p' });
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-open', 'true');
  });

  it('requestPanelOpen() opens a collapsed panel (drawer Alerts seam)', () => {
    render(<PanelHarness />);
    fireEvent.click(screen.getByTestId('panel-close'));
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-open', 'false');
    act(() => {
      requestPanelOpen();
    });
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-open', 'true');
  });

  it('square geometry: panel carries no inline border-radius (var(--radius) law)', () => {
    render(<PanelHarness />);
    const panel = screen.getByTestId('side-panel');
    expect(panel.style.borderRadius ?? '').toBe('');
  });
});

describe('SidePanel (mobile geometry)', () => {
  beforeEach(() => stubViewport(true));
  afterEach(() => vi.unstubAllGlobals());

  it('is COLLAPSED by default on mobile (bottom sheet)', () => {
    render(<PanelHarness />);
    const panel = screen.getByTestId('side-panel');
    expect(panel).toHaveAttribute('data-open', 'false');
    expect(panel.className).toContain('is-collapsed');
  });

  it('handle tap expands, tap again collapses', () => {
    render(<PanelHarness />);
    fireEvent.click(screen.getByTestId('panel-handle'));
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-open', 'true');
    fireEvent.click(screen.getByTestId('panel-handle'));
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-open', 'false');
  });
});
