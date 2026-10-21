import { NavLink } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'

/**
 * W6 POLISH — app header. Fully styled via src/index.css (.app-header /
 * .app-brand / .app-nav-link); this file only carries classNames.
 *
 * - Brand + Map/Feed nav + ThemeToggle, inline on tablet/desktop.
 * - Nav links: >=44px hit boxes, active-route highlight via NavLink's
 *   isActive -> .is-active (data-route attrs kept for e2e).
 * - Phone (<=480px): brand row stacks above nav + toggle (CSS media query).
 */
export default function Header() {
  return (
    <header className="app-header">
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
    </header>
  )
}
