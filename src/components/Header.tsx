import { NavLink } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'

export default function Header() {
  return (
    <header className="app-header">
      <span className="app-brand">NextDoor Skies</span>
      <nav className="app-nav" aria-label="Primary">
        <NavLink to="/" end data-route="/">
          Map
        </NavLink>
        <NavLink to="/feed" data-route="/feed">Feed</NavLink>
      </nav>
      <ThemeToggle />
    </header>
  )
}
