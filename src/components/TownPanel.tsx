// W3-B2 TOWN PANEL — in-map slide-over (wave-3 session 2, decision 1:
// "Town detail: slide-over panel on map + full page at /t/<slug>", same
// components). Desktop docks right (~360px, slides in ~200ms per the wave-3
// animation law); phones (<=480px) get a bottom sheet with drag-to-dismiss.
//
// Panel STATE lives in the URL (`?panel=<townSlug>` — see src/lib/panel.ts):
// deep links open it, back button closes it. This component is the view;
// MapPage owns the URL, passing slug + onClose.
//
// Content (session 2): town name, current temp + condition icon (lucide via
// lib/weather/weathercode — theme-neutral, currentColor), alert-count badge
// (-> /alerts), 3-5 recent feed posts (lib/feed fetchPosts sort=new, "see
// all" -> /t/<slug>/feed), and "Open town page" -> /t/<slug>.
//
// Dismiss: close button + Esc key + click-outside scrim + mobile drag-down.
// Honest states (R19): "awaiting feed" temp until data, "No posts yet",
// "Feed unavailable" on error — never fabricated. Square geometry (R20):
// border-radius ONLY var(--radius). R17: no clock/RNG (timestamps render
// through formatStamp, pure string slicing).
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, MapPin, X } from 'lucide-react';
import { weathercodeToIcon } from '../lib/weather/weathercode';
import { fetchPosts, formatStamp, type FetchLike, type Post } from '../lib/feed';
import type { Alert } from '../lib/weather/alerts';

/** Session 2: "3-5 recent feed posts" — cap the list at 5. */
export const TOWN_PANEL_POST_COUNT = 5;
/** Mobile drag-to-dismiss threshold (px dragged downward). */
export const TOWN_PANEL_DISMISS_PX = 96;

/** Phone breakpoint (matches the index.css phone layout block). */
export function isSheetViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 480px)').matches;
}

export interface TownPanelProps {
  /** Canonical gazetteer slug (identical to the badge id). */
  slug: string;
  /** Display name (resolved by the caller from the gazetteer). */
  name: string;
  onClose: () => void;
  /** Last-known temperature °C (undefined => honest "awaiting feed"). */
  tempC?: number;
  /** WMO weathercode (undefined => NO icon, never a guessed condition). */
  weathercode?: number;
  /** Active alerts for THIS town (from the shared viewport poll). */
  alerts?: readonly Alert[];
  /** Injectable fetch seam (feed law). */
  fetchImpl?: FetchLike;
}

export function TownPanel({ slug, name, onClose, tempC, weathercode, alerts, fetchImpl }: TownPanelProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Entrance: closed -> open on the next frame so the CSS transition fires
  // (animation law: ~200ms slide, nothing snaps).
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Esc dismisses (brief law: close button + Esc + click-outside).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Recent posts (sort=new; server returns newest first).
  useEffect(() => {
    let ignore = false;
    setStatus('loading');
    void fetchPosts({ town: slug, sort: 'new', fetchImpl }).then((res) => {
      if (ignore) return;
      if (res.ok) {
        setPosts(res.data.slice(0, TOWN_PANEL_POST_COUNT));
        setStatus('ready');
      } else {
        setPosts([]);
        setStatus('error');
      }
    });
    return () => {
      ignore = true;
    };
  }, [slug, fetchImpl]);

  // Mobile bottom-sheet drag-to-dismiss: pointer tracking on the handle,
  // only in sheet viewports (<=480px). Desktop side panel ignores drags.
  const dragRef = useRef<{ startY: number; active: boolean }>({ startY: 0, active: false });
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (!isSheetViewport()) return;
    dragRef.current = { startY: e.clientY, active: true };
    dragYRef.current = 0;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!dragRef.current.active) return;
    dragYRef.current = Math.max(0, e.clientY - dragRef.current.startY);
    setDragY(dragYRef.current);
  }, []);
  const endDrag = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const dropped = dragYRef.current;
    dragYRef.current = 0;
    setDragY(0);
    if (dropped > TOWN_PANEL_DISMISS_PX) onClose();
  }, [onClose]);

  const mapped = weathercode === undefined ? null : weathercodeToIcon(weathercode);
  const Icon = mapped?.icon;
  const hasTemp = typeof tempC === 'number' && Number.isFinite(tempC);
  const alertCount = alerts?.length ?? 0;

  return (
    <>
      {/* Click-outside dismiss layer (sits between map and panel). */}
      <div className="town-panel-scrim" data-testid="town-panel-scrim" onClick={onClose} />
      <aside
        className={`town-panel${open ? ' is-open' : ''}`}
        data-testid="town-panel"
        data-slug={slug}
        role="dialog"
        aria-label={`${name} town panel`}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="town-panel-handle"
          data-testid="town-panel-handle"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <header className="town-panel-head">
          <h2>{name}</h2>
          <button
            type="button"
            className="town-panel-close"
            data-testid="town-panel-close"
            aria-label="close panel"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="town-panel-weather" data-testid="town-panel-weather">
          <span className="town-panel-temp" data-testid="town-panel-temp">{hasTemp ? `${Math.round(tempC as number)}°` : 'awaiting feed'}</span>
          {mapped && Icon ? (
            <span
              className="town-panel-icon"
              data-testid="town-panel-icon"
              data-weathercode={weathercode}
              data-weather-bucket={mapped.bucket}
              title={mapped.label}
            >
              <Icon size={22} aria-hidden="true" />
            </span>
          ) : null}
          {mapped ? <span className="town-panel-condition">{mapped.label}</span> : null}
        </div>

        <Link className="town-panel-alerts" to="/alerts" data-testid="town-panel-alerts" data-alert-count={alertCount}>
          <Bell size={16} aria-hidden="true" />
          {alertCount > 0 ? `${alertCount} active alert${alertCount === 1 ? '' : 's'}` : 'No active alerts'}
        </Link>

        <div className="town-panel-feed" data-testid="town-panel-feed">
          {status === 'loading' ? <p data-testid="town-panel-posts-loading">Loading posts…</p> : null}
          {status === 'error' ? <p data-testid="town-panel-posts-error">Feed unavailable.</p> : null}
          {status === 'ready' && posts.length === 0 ? <p data-testid="town-panel-posts-empty">No posts here yet.</p> : null}
          {posts.length > 0 ? (
            <ul className="town-panel-posts" data-testid="town-panel-posts">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link to={`/p/${p.id}`} data-testid={`panel-post-${p.id}`}>
                    <span className="town-panel-post-meta">
                      {p.author} · {formatStamp(p.createdAt)}
                    </span>
                    <p>{p.text}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <Link className="town-panel-see-all" to={`/t/${slug}/feed`} data-testid="town-panel-see-all">
            see all <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <Link className="town-panel-open" to={`/t/${slug}`} data-testid="town-panel-open">
          <MapPin size={16} aria-hidden="true" /> Open town page
        </Link>
      </aside>
    </>
  );
}
