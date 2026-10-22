import { Link, NavLink, useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'

/**
 * W6 POLISH — app header. Fully styled via src/index.css (.app-header /
 * .app-brand / .app-nav-link); this file only carries classNames.
 *
 * - Brand + Map/Feed/Alerts nav + ThemeToggle, inline on tablet/desktop.
 * - Nav links: >=44px hit boxes, active-route highlight via NavLink's
 *   isActive -> .is-active (data-route attrs kept for e2e).
 * - W3-B1 ROUTING: deep routes light their family nav — any /t/... page
 *   highlights Map, a town feed (/t/<slug>/feed) highlights both Map and
 *   Feed, /alerts highlights Alerts.
 * - Phone (<=480px): brand row stacks above nav + toggle (CSS media query).
 */
export default function Header() {
  const { pathname } = useLocation()
  const onTown = pathname.startsWith('/t/')
  const onTownFeed = /^\/t\/[^/]+\/feed\/?$/.test(pathname)
  const mapActive = pathname === '/' || onTown
  const feedActive = pathname === '/feed' || onTownFeed

  return (
    <header className="app-header">
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
      <div className="app-header-actions">
        <ThemeToggle />
      </div>
    </header>
  )
}
