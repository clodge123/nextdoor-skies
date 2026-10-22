import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { requestPanelOpen } from './SidePanel'

/**
 * W6 POLISH — app header. Fully styled via src/index.css (.app-header /
 * .app-brand / .app-nav-link); this file only carries classNames.
 *
 * - Brand + Map/Feed nav + ThemeToggle, inline on tablet/desktop.
 * - Nav links: >=44px hit boxes, active-route highlight via NavLink's
 *   isActive -> .is-active (data-route attrs kept for e2e).
 * - Phone (<=480px): brand row stacks above nav + toggle (CSS media query).
 *
 * W3-C1 LAYOUT-SHELL — phone (<=480px) additionally gets a hamburger opening
 * a nav drawer (Map, Feed, Alerts, Theme), all >=44px targets. The inline
 * nav stays (the W6 polish gate asserts it); the drawer adds Alerts
 * (opens the side panel, where the alert center lands in C2) and Theme.
 * The drawer closes on navigation and on Escape.
 */
export default function Header() {
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
        <NavLink
          to="/"
          end
          data-route="/"
          className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}`}
        >
          Map
        </NavLink>
        <NavLink
          to="/feed"
          data-route="/feed"
          className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}`}
        >
          Feed
        </NavLink>
      </nav>
      <div className="app-header-actions">
        <ThemeToggle />
      </div>

      {/* Phone drawer: 44px targets; closes on nav / Escape. */}
      <div
        id="nav-drawer"
        className={`nav-drawer${open ? ' is-open' : ''}`}
        data-testid="nav-drawer"
        data-open={open ? 'true' : 'false'}
        aria-hidden={!open}
      >
        <NavLink
          to="/"
          end
          data-route="/"
          data-drawer-item="map"
          className={({ isActive }) => `nav-drawer-link${isActive ? ' is-active' : ''}`}
          onClick={close}
        >
          Map
        </NavLink>
        <NavLink
          to="/feed"
          data-route="/feed"
          data-drawer-item="feed"
          className={({ isActive }) => `nav-drawer-link${isActive ? ' is-active' : ''}`}
          onClick={close}
        >
          Feed
        </NavLink>
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
        <div className="nav-drawer-theme" data-drawer-item="theme">
          <span className="nav-drawer-theme-label">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
