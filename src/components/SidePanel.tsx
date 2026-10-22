// W3-C1 LAYOUT-SHELL — right side panel (session 3, option C hybrid).
// Desktop: 360px column docked beside the map, OPEN by default, collapsible.
// Mobile (<=480px): bottom sheet with drag handle, COLLAPSED by default.
// Keyboard law: `P` toggles the panel app-wide (ignored while typing).
// Animation law: slide/fade ~200ms, nothing snaps. Square geometry (R20:
// border-radius ONLY var(--radius)); theme vars work in both themes.
//
// Content slot is intentionally EMPTY for this lane: panels fill in B2/C2.
// Honest state law (R19): render "Nothing to show yet", never a fake list.
// Determinism (R17): no randomness, no clock reads.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/** Same phone breakpoint as the app header (index.css @media max-width 480px). */
export const MOBILE_QUERY = '(max-width: 480px)';

/** Drag distance (px) past which a sheet drag flips its state. */
export const DRAG_SLOP = 64;

function isMobileViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(MOBILE_QUERY).matches
  );
}

// Module-level open-request channel: the phone drawer's "Alerts" item asks
// the mounted panel to open (the panel lives in MapPage, not the header).
const openListeners = new Set<() => void>()

/** Ask every mounted panel to open (used by the mobile drawer Alerts item). */
export function requestPanelOpen(): void {
  for (const fn of openListeners) fn()
}

// W3-C3: toggle-request channel (command palette "Toggle side panel" — the
// P-law action from surfaces outside MapPage, same pattern as requestPanelOpen).
const toggleListeners = new Set<() => void>()

/** Ask every mounted panel to toggle open/closed. */
export function requestPanelToggle(): void {
  for (const fn of toggleListeners) fn()
}

export interface PanelState {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

/**
 * Panel open/closed state shared by the sheet and the map's toggle button.
 * Default: OPEN on desktop, COLLAPSED on mobile (session 3 ruling). `P`
 * toggles app-wide; keystrokes inside form fields never steal the shortcut.
 */
export function usePanelState(): PanelState {
  const [open, setOpen] = useState<boolean>(() => !isMobileViewport());
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'p' && e.key !== 'P') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const open = () => setOpen(true);
    openListeners.add(open);
    return () => {
      openListeners.delete(open);
    };
  }, [])

  // W3-C3: palette seam — register the stable toggle (P-law action).
  useEffect(() => {
    toggleListeners.add(toggle);
    return () => {
      toggleListeners.delete(toggle);
    };
  }, [toggle]);

  return { open, toggle, setOpen };
}

export interface SidePanelProps {
  open: boolean;
  onToggle: () => void;
  /** Head title (W3-C2: the panel is the Alert Center). Default 'Panel'. */
  title?: string;
  /** Content slot — filled by lanes B2/C2; empty renders the honest state. */
  children?: ReactNode;
}

export default function SidePanel({ open, onToggle, title = 'Panel', children }: SidePanelProps) {
  // Mobile drag-to-dismiss: pointer drag on the handle translates the sheet;
  // releasing past DRAG_SLOP collapses it (and dragging up re-opens).
  const [dragY, setDragY] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const draggedRef = useRef(false);

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    dragStartRef.current = e.clientY;
    draggedRef.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onHandlePointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragStartRef.current === null) return;
    const dy = Math.max(0, e.clientY - dragStartRef.current);
    if (dy > 4) draggedRef.current = true;
    setDragY(dy);
  };
  const onHandlePointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragStartRef.current === null) return;
    dragStartRef.current = null;
    if (dragY > DRAG_SLOP) setOpenFalse();
    setDragY(0);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const setOpenFalse = () => {
    if (open) onToggle();
  };

  const handleTap = () => {
    // A drag that moved is not a tap: suppress the click after real drags.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onToggle();
  };

  return (
    <aside
      className={`side-panel${open ? ' is-open' : ' is-collapsed'}`}
      data-testid="side-panel"
      data-open={open ? 'true' : 'false'}
      aria-label="Side panel"
      aria-hidden={!open}
      style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
    >
      <div
        className="panel-handle"
        data-testid="panel-handle"
        role="button"
        tabIndex={0}
        aria-label={open ? 'Collapse panel' : 'Expand panel'}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        onClick={handleTap}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="panel-grip" aria-hidden="true" />
      </div>

      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        <button
          type="button"
          className="panel-close"
          data-testid="panel-close"
          aria-label="Collapse panel"
          onClick={onToggle}
        >
          ×
        </button>
      </div>

      <div className="panel-body">{children ?? <PanelEmpty />}</div>
    </aside>
  );
}

/** Honest empty state — the content slot is unfilled until lanes B2/C2. */
export function PanelEmpty() {
  return (
    <div className="panel-empty" data-testid="panel-empty">
      <p className="panel-empty-title">Nothing to show yet</p>
      <p className="panel-empty-note">
        Panel content (alert center, town details) lands in the next update.
      </p>
    </div>
  );
}
