// W3-B2 TOWN PANEL — URL state for the in-map town panel (wave-3 session 2,
// decision 1: "slide-over panel on map + full page at /t/<slug>").
//
// SCHEME (documented per lane brief): the panel lives on the MAP route as a
// query parameter:  `/?panel=<townSlug>`. Rationale (simplest honest scheme):
//   - The panel is a transient overlay ON the map, not a page — a query param
//     keeps the B1 path space (`/t/<slug>` = the FULL town page) unambiguous:
//     panel=open, path=town-page. No two URLs mean the same page.
//   - Back button closes the panel (history push on open, replace on close),
//     deep links share it, and hard loads open it — the same guarantees the
//     B1 law demands, zero new route kinds.
//   - `/t/<slug>` stays reserved for the full town page (D3/B3 lanes), so
//     "panel overlay on /t/<slug>" never forks the town surface.
// Town slugs are the canonical gazetteer slugs (src/lib/session.townSlug),
// identical to the badge ids (slugify(name)-lat2-lon2) — one key everywhere.
//
// R17 determinism: pure string transforms, no clock/RNG.

export const PANEL_PARAM = 'panel';

/**
 * Query part of a string: accepts raw search ("a=b"), "?a=b", or a full
 * href "/?a=b" — everything from the first '?' onward. Pure.
 */
function queryPart(s: string): string {
  const i = s.indexOf('?');
  return i >= 0 ? s.slice(i + 1) : s;
}

/** Slug currently requesting the panel, or null. Pure; accepts search/href. */
export function panelSlugFromSearch(search: string): string | null {
  const raw = queryPart(search);
  if (!raw) return null;
  try {
    const slug = new URLSearchParams(raw).get(PANEL_PARAM);
    return slug && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Map href that OPENS the panel for `slug`, preserving every other query
 * param (e.g. the ndsCenter test hook). Pure; empty search tolerated.
 */
export function panelOpenHref(search: string, slug: string): string {
  const params = new URLSearchParams(queryPart(search));
  params.set(PANEL_PARAM, slug);
  return `/?${params.toString()}`;
}

/** Map href that CLOSES the panel, keeping the remaining query params. Pure. */
export function panelCloseHref(search: string): string {
  const params = new URLSearchParams(queryPart(search));
  params.delete(PANEL_PARAM);
  const q = params.toString();
  return q ? `/?${q}` : '/';
}
