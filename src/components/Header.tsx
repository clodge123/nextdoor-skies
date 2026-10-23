import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { TownSearch } from './TownSearch'
import { requestPanelOpen } from './SidePanel'
import { requestPaletteOpen } from './CommandPalette'
import { requestTour } from './Tour'

/**
 * W6 POLISH — app header. Fully styled via src/index.css (.app-header /
 * .app-brand / .app-nav-link); this file only carries classNames.
 *
 * - Brand + Map/Feed/Alerts nav + ThemeToggle, inline on tablet/desktop.
 * - Nav links: >=44px hit boxes, active-route highlight -> .is-active
 *   (data-route attrs kept for e2e).
 * - W3-B1 ROUTING: deep routes light their family nav — any /t/... page
 *   highlights Map, a town feed (/t/<slug>/feed) highlights both Map and
 *   Feed, /alerts highlights Alerts. (Computed active-family: NavLink's own
 *   isActive strips user-set aria-current on deep routes, so Map/Feed use
 *   Link + computed aria-current; /alerts keeps NavLink's isActive.)
 * - Phone (<=480px): brand row stacks above nav + toggle (CSS media query).
 *
 * W3-C1 LAYOUT-SHELL — phone (<=480px) additionally gets a hamburger opening
 * a nav drawer (Map, Feed, Alerts, Theme), all >=44px targets. The inline
 * nav stays (the W6 polish gate asserts it); the drawer adds Alerts
 * (opens the side panel, where the alert center lands in C2) and Theme.
 * The drawer closes on navigation and on Escape.
 */
export default function Header() {
  const { pathname } = useLocation()
  const onTown = pathname.startsWith('/t/')
  const onTownFeed = /^\/t\/[^/]+\/feed\/?$/.test(pathname)
  const mapActive = pathname === '/' || onTown
  const feedActive = pathname === '/feed' || onTownFeed

  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const close = () => setOpen(false)

  return (
    <header className="app-header">
      <button
        type="button"
        className="nav-menu-button"
        data-testid="nav-menu-button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="nav-drawer"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="nav-menu-bar" aria-hidden="true" />
        <span className="nav-menu-bar" aria-hidden="true" />
        <span className="nav-menu-bar" aria-hidden="true" />
      </button>
      <span className="app-brand">NextDoor Skies</span>
      <nav className="app-nav" aria-label="Primary">
        <Link
          to="/"
          data-route="/"
          aria-current={mapActive ? 'page' : undefined}
          className={`app-nav-link${mapActive ? ' is-active' : ''}`}
        >
          Map
        </Link>
        <Link
          to="/feed"
          data-route="/feed"
          aria-current={feedActive ? 'page' : undefined}
          className={`app-nav-link${feedActive ? ' is-active' : ''}`}
        >
          Feed
        </Link>
        <NavLink
          to="/alerts"
          data-route="/alerts"
          className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}`}
        >
          Alerts
        </NavLink>
      </nav>
      {/* W3-B4 SEARCH (session 2 decision 3): inline town combobox on
          tablet/desktop; CSS hides it <=480px where the drawer instance
          below is the phone surface. Navigates to /?panel=<slug> — flying
          is MapPage's panel effect (fly seam), not this component's. */}
      <div className="app-header-search">
        <TownSearch />
      </div>
      <div className="app-header-actions">
        {/* W3-C3 discoverability (owner law: controls clickable on first
            try): the ⌘K chip is the visible face of the keyboard gesture.
            Hidden on phone by CSS (<=480px), where the drawer item covers it. */}
        <button
          type="button"
          className="palette-chip"
          data-testid="palette-chip"
          aria-label="Open command palette (Ctrl+K)"
          onClick={requestPaletteOpen}
        >
          <span aria-hidden="true">⌘K</span>
        </button>
        <ThemeToggle />
      </div>

      {/* Phone drawer: 44px targets; closes on nav / Escape. aria-hidden when
          closed keeps drawer links out of the accessibility tree (no
          getByRole collisions with the inline nav in tests). */}
      <div
        id="nav-drawer"
        className={`nav-drawer${open ? ' is-open' : ''}`}
        data-testid="nav-drawer"
        data-open={open ? 'true' : 'false'}
        aria-hidden={!open}
      >
        <Link
          to="/"
          data-route="/"
          data-drawer-item="map"
          className="nav-drawer-link"
          onClick={close}
        >
          Map
        </Link>
        <Link
          to="/feed"
          data-route="/feed"
          data-drawer-item="feed"
          className="nav-drawer-link"
          onClick={close}
        >
          Feed
        </Link>
        <button
          type="button"
          className="nav-drawer-link"
          data-drawer-item="alerts"
          onClick={() => {
            requestPanelOpen()
            close()
          }}
        >
          Alerts
        </button>
        {/* W3-C3: palette entry point on phone (chip is desktop-only). */}
        <button
          type="button"
          className="nav-drawer-link"
          data-drawer-item="palette"
          onClick={() => {
            requestPaletteOpen()
            close()
          }}
        >
          Command palette <kbd className="palette-chip-kbd">⌘K</kbd>
        </button>
        {/* W3-B4: town search in the drawer (phone surface). */}
        <div className="nav-drawer-search" data-drawer-item="search">
          <TownSearch variant="drawer" onNavigated={close} />
        </div>
        {/* W3-E2 TOUR replay seam (phone surface of the palette command). */}
        <button
          type="button"
          className="nav-drawer-link"
          data-drawer-item="tour"
          onClick={() => {
            requestTour()
            close()
          }}
        >
          Take the tour
        </button>
        <div className="nav-drawer-theme" data-drawer-item="theme">
          <span className="nav-drawer-theme-label">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
