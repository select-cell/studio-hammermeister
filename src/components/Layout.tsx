import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { SALON_NAME } from '../config'
import { sichtbareBereiche } from '../lib/bereiche'
import { initiale, rolleLabel } from '../lib/rechte'
import Logo from './Logo'

/** Rahmen für alles unter /app: eine Navigation für beide Merkmale (Teilnehmer + Leitung). */
export default function Layout() {
  const { person, abmelden } = useAuth()
  const [offen, setOffen] = useState(false)
  if (!person) return null

  const schliessen = () => setOffen(false)

  return (
    <div className="app">
      <header className="app-kopf">
        <div className="app-kopf-innen">
          <Link to="/app" className="brand" onClick={schliessen}>
            <Logo klein />
            <span className="brand-name">{person.salon?.name ?? SALON_NAME}</span>
          </Link>

          <button
            type="button"
            className="nav-schalter"
            aria-expanded={offen}
            aria-controls="hauptnavigation"
            onClick={() => setOffen((o) => !o)}
          >
            {offen ? 'Schließen' : 'Menü'}
          </button>

          <nav id="hauptnavigation" className={`nav${offen ? ' offen' : ''}`} aria-label="Hauptnavigation">
            <NavLink to="/app" end className="nav-start" onClick={schliessen}>
              Start
            </NavLink>
            {sichtbareBereiche(person).map((b) => (
              <NavLink key={b.id} to={b.pfad} onClick={schliessen}>
                {b.nav}
              </NavLink>
            ))}
            <div className="nav-nutzer">
              <span className="avatar" aria-hidden="true">
                {initiale(person.name)}
              </span>
              <span className="nav-nutzer-text">
                <strong>{person.name}</strong>
                <small>
                  {rolleLabel[person.rolle]} ·{' '}
                  <NavLink to="/app/passwort" className="nav-nutzer-link" onClick={schliessen}>
                    Passwort ändern
                  </NavLink>
                </small>
              </span>
              <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => void abmelden()}>
                Abmelden
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="seite">
        <Outlet />
      </main>
    </div>
  )
}
