import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'

/** Die Werkzeuge der Leitung unter einem Menüpunkt: eigene Unter-Navigation, die Seiten stehen darunter. */
export default function Leitung() {
  const { person } = useAuth()
  if (!person) return null
  const punkte: { pfad: string; label: string }[] = [
    { pfad: 'kommentare', label: 'Kommentare' },
    { pfad: 'abschluss', label: 'Monatsabschluss' },
  ]
  return (
    <>
      <nav className="lt-nav" aria-label="Leitung">
        {punkte.map((p) => (
          <NavLink key={p.pfad} to={p.pfad} className={({ isActive }) => `lt-nav-punkt${isActive ? ' aktiv' : ''}`}>
            {p.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
