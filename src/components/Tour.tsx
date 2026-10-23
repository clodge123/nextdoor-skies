// W3-E2 FIRST-VISIT TOUR — 3-step spotlight tour (wave-3 brainstorm session 5).
//
// Visual law: dark scrim with a cutout on the current target (SVG mask, so
// the spotlight is honest geometry, not a faked box-shadow), tooltip bubble
// with >=44px buttons, ~200ms transitions (animation law), square geometry
// (R20: var(--radius) only), theme vars (L4). Mobile-first placement: the
// bubble docks bottom on <=480px, floats beside the target on tablet/desktop.
//
// Non-blocking law (session 5): scrim click ADVANCES, Esc SKIPS, and focus
// lands on the bubble (tabindex=-1) WITHOUT a trap — Tab still reaches the
// whole page, so the tour can never trap anyone.
//
// Seen-once law: see src/lib/tour.ts. Private mode -> shown every visit
// (honest fallback; we never fake persistence). Replay seams: palette command
// 'Show tour' + drawer item 'Take the tour' (both requestTour()).
//
// R17 clean: the only timers are (a) a short open delay so the map paints
// first, and (b) the 2s "no rush" hint. NO timer advances a step.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { TOUR_EVENT, TOUR_STEPS, markTourSeen, nextStepIndex, placeBubble, shouldShowTour } from '../lib/tour';

/** Open delay: let the map paint before the spotlight lands (not an
 *  auto-advance — the tour itself stays fully user-driven). */
const OPEN_DELAY_MS = 600;
/** "No rush" hint appears after this long on one step. Hint only. */
const HINT_AFTER_MS = 2000;
/** Scrim padding around the spotlighted element. */
const CUTOUT_PAD = 6;
/** Fallback bubble height before it is measured (used once, first paint). */
const BUBBLE_H_ESTIMATE = 190;
/** Viewport insets — the bubble clamps inside these at EVERY size. */
const VIEWPORT_INSET = 16;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** First selector whose element is laid out (visible) wins. */
function resolveTarget(selectors: readonly string[]): HTMLElement | null {
  for (const sel of selectors) {
    try {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    } catch {
      // Malformed selector for this document — try the next one.
    }
  }
  return null;
}

function rectOf(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * App-level tour state: opens on first visit (unseen flag) after a short
 * paint delay, and opens on demand via requestTour() (palette / drawer).
 */
export function useTourOpen(): {
  open: boolean;
  step: number;
  setStep: (step: number) => void;
  start: () => void;
  close: () => void;
} {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const start = useCallback(() => {
    setStep(0);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onEvent = () => start();
    window.addEventListener(TOUR_EVENT, onEvent);
    return () => window.removeEventListener(TOUR_EVENT, onEvent);
  }, [start]);

  // First-visit open (seen-once law: shouldShowTour reads localStorage).
  // Map home only — the tour teaches the map surfaces; deep pages get the
  // replay seam (palette / drawer), never an unrequested overlay.
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname !== '/') return;
    if (!shouldShowTour()) return;
    const t = window.setTimeout(start, OPEN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [start, pathname]);

  return { open, step, setStep, start, close };
}

/** Ask the app to (re)play the tour — the single replay seam. */
export function requestTour(): void {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

export interface TourProps {
  open: boolean;
  step: number;
  setStep: (step: number) => void;
  onClose: () => void;
}

export function Tour({ open, step, setStep, onClose }: TourProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [hint, setHint] = useState(false);
  const [bubbleBox, setBubbleBox] = useState<{ w: number; h: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const finish = useCallback(() => {
    markTourSeen();
    onClose();
  }, [onClose]);

  const advance = useCallback(() => {
    const next = nextStepIndex(step);
    if (next === null) {
      // Last step: finishing IS Done (seen-once law: mark it).
      markTourSeen();
      onClose();
      return;
    }
    setStep(next);
  }, [step, setStep, onClose]);

  // Measure the current target; keep it fresh across resize/scroll.
  useEffect(() => {
    if (!open) return;
    const target = resolveTarget(TOUR_STEPS[step]?.targets ?? []);
    const measure = () => setRect(rectOf(target));
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step]);

  // Focus the bubble (tabindex=-1) — NOT a trap; Tab leaves freely.
  useEffect(() => {
    if (open) bubbleRef.current?.focus();
  }, [open, step]);

  // Measure the REAL bubble box every render (content wraps change its
  // height). W4-F1 law: placement must be viewport-responsive — the fixed
  // 150px estimate clipped the bubble off-screen on desktop (owner: tour
  // hides / sits too high / too low). Equality-guarded so this never loops.
  useLayoutEffect(() => {
    if (!open) return;
    const el = bubbleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    setBubbleBox((prev) =>
      prev && Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
        ? prev
        : { w: r.width, h: r.height },
    );
  });

  // The 2s "no rush" hint (hint only — never advances the tour).
  useEffect(() => {
    if (!open) return;
    setHint(false);
    const t = window.setTimeout(() => setHint(true), HINT_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [open, step]);

  // Esc skips (marks seen; the tour is over — honest, it was shown).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, finish]);

  if (!open) return null;

  const current = TOUR_STEPS[step];
  if (!current) return null;
  const last = step === TOUR_STEPS.length - 1;

  // Bubble placement (W4-F1): viewport-responsive flip + clamp. Dock bottom
  // <=480px (mobile-first law); above that, measure the target, prefer the
  // bubble BELOW it, flip ABOVE when below would clip, and CLAMP both axes
  // inside the viewport with 16px insets at every size — the bubble can
  // never sit off-screen (owner-reported desktop bug) and never covers a
  // target that has room beside it.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mobile = vw <= 480;
  const BUBBLE_W = Math.min(320, vw - VIEWPORT_INSET * 2);
  let bubbleStyle: CSSProperties;
  if (mobile) {
    // Mobile-first law: bottom-docked bubble (thumb reach) <=480px.
    // W4-F1: flip to TOP docking when the target sits in the bottom band
    // (e.g. the collapsed side panel) — the bubble must never cover it.
    const bh = bubbleBox?.h ?? BUBBLE_H_ESTIMATE;
    const targetInBottomBand =
      !!rect &&
      rect.y < vh - VIEWPORT_INSET &&
      rect.y + rect.h > vh - VIEWPORT_INSET - bh;
    bubbleStyle = targetInBottomBand
      ? { left: VIEWPORT_INSET, right: VIEWPORT_INSET, top: VIEWPORT_INSET }
      : { left: VIEWPORT_INSET, right: VIEWPORT_INSET, bottom: VIEWPORT_INSET };
  } else if (rect) {
    const bw = bubbleBox?.w ?? BUBBLE_W;
    const bh = bubbleBox?.h ?? BUBBLE_H_ESTIMATE;
    const { left, top } = placeBubble(rect, vw, vh, bw, bh);
    bubbleStyle = { left, top };
  } else {
    bubbleStyle = { left: vw / 2, top: vh / 2, transform: 'translate(-50%, -50%)' };
  }

  const cut = rect
    ? {
        x: Math.max(0, rect.x - CUTOUT_PAD),
        y: Math.max(0, rect.y - CUTOUT_PAD),
        w: Math.min(vw, rect.w + CUTOUT_PAD * 2),
        h: Math.min(vh, rect.h + CUTOUT_PAD * 2),
      }
    : null;

  return createPortal(
    <div
      className="tour-root"
      data-testid="tour"
      data-step={step}
      data-step-id={current.id}
      role="dialog"
      aria-label={`Tour step ${step + 1} of ${TOUR_STEPS.length}`}
      aria-modal="false"
    >
      {/* Dark scrim + honest cutout (SVG mask); clicking it advances. */}
      <svg
        className="tour-scrim"
        data-testid="tour-scrim"
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="none"
        onClick={advance}
        aria-hidden="true"
      >
        <defs>
          <mask id="tour-cutout">
            <rect x="0" y="0" width={vw} height={vh} fill="white" />
            {cut && <rect className="tour-cut" x={cut.x} y={cut.y} width={cut.w} height={cut.h} fill="black" rx="0" />}
          </mask>
        </defs>
        <rect x="0" y="0" width={vw} height={vh} fill="rgba(4, 4, 8, 0.62)" mask="url(#tour-cutout)" />
        {cut && (
          <rect
            className="tour-cut-ring"
            x={cut.x}
            y={cut.y}
            width={cut.w}
            height={cut.h}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
          />
        )}
      </svg>

      <div
        className="tour-bubble"
        data-testid="tour-bubble"
        ref={bubbleRef}
        style={bubbleStyle}
        tabIndex={-1}
        role="group"
        aria-label={current.title}
      >
        <p className="tour-step-label" aria-hidden="true">
          {step + 1} / {TOUR_STEPS.length}
        </p>
        <h2 className="tour-title">{current.title}</h2>
        <p className="tour-body" data-testid="tour-body">{current.body}</p>
        <p className={`tour-hint${hint ? ' is-shown' : ''}`} data-testid="tour-hint">
          No rush — press Next when you're ready.
        </p>
        <div className="tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((s, i) => (
            <span key={s.id} className={`tour-dot${i === step ? ' is-active' : ''}`} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="tour-skip" data-testid="tour-skip" onClick={finish}>
            Skip
          </button>
          {last ? (
            <button type="button" className="tour-next" data-testid="tour-done" onClick={finish}>
              Done
            </button>
          ) : (
            <button type="button" className="tour-next" data-testid="tour-next" onClick={advance}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Mounted once in App: owns first-visit open + replay seam. */
export default function TourHost() {
  const { open, step, setStep, close } = useTourOpen();
  return <Tour open={open} step={step} setStep={setStep} onClose={close} />;
}
