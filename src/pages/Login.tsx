import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Logo from '../components/Logo'
import { SALON_NAME } from '../config'
import { anmelden, type AnmeldeErgebnis } from '../lib/api'

const FEHLERTEXT: Record<Exclude<AnmeldeErgebnis, 'ok'>, string> = {
  falsch: 'E-Mail-Adresse oder Passwort stimmt nicht. Bitte prüfe deine Eingabe.',
  nichtBestaetigt: 'Dein Zugang ist noch nicht freigeschaltet. Bitte melde dich bei der Salonleitung.',
  zuVieleAnfragen: 'Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann noch einmal.',
  fehler: 'Das hat nicht geklappt. Bitte prüfe deine Verbindung und versuche es gleich noch einmal.',
}

export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [zeigen, setZeigen] = useState(false)
  const [sendet, setSendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  if (session) return <Navigate to="/app" replace />

  async function senden(ereignis: FormEvent) {
    ereignis.preventDefault()
    if (sendet) return
    setFehler(null)
    setSendet(true)
    const ergebnis = await anmelden(email, passwort)
    setSendet(false)
    if (ergebnis === 'ok') return // die Sitzung ist da, die Seite wechselt von selbst nach /app
    setPasswort('')
    setFehler(FEHLERTEXT[ergebnis])
  }

  return (
    <div className="seite-zentriert">
      <div className="karte karte-schmal">
        <div className="seite-logo">
          <Logo />
          <span className="brand-name">{SALON_NAME}</span>
        </div>

        <form onSubmit={(e) => void senden(e)}>
          <h1 className="karte-titel">Anmelden</h1>
          <p className="text-gedimmt">Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.</p>
          <div className="feld">
            <label htmlFor="email">E-Mail-Adresse</label>
            <input
              id="email"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@beispiel.de"
            />
          </div>
          <div className="feld">
            <label htmlFor="passwort">Passwort</label>
            <div className="feld-passwort">
              <input
                id="passwort"
                type={zeigen ? 'text' : 'password'}
                name="passwort"
                autoComplete="current-password"
                required
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
              />
              <button type="button" className="feld-passwort-knopf" aria-pressed={zeigen} onClick={() => setZeigen((z) => !z)}>
                {zeigen ? 'Verbergen' : 'Anzeigen'}
              </button>
            </div>
          </div>
          {fehler && (
            <div className="hinweis hinweis-fehler" role="alert">
              {fehler}
            </div>
          )}
          <button type="submit" className="btn btn-primaer btn-voll" disabled={sendet || !email.trim() || !passwort}>
            {sendet ? (
              <>
                <span className="spinner spinner-hell" aria-hidden="true" /> Du wirst angemeldet …
              </>
            ) : (
              'Anmelden'
            )}
          </button>
        </form>

        <p className="text-klein text-gedimmt text-mitte">Noch keinen Zugang oder Passwort vergessen? Melde dich bei der Salonleitung.</p>
        <p className="text-klein text-gedimmt text-mitte">
          <Link to="/">Zur Startseite</Link>
        </p>
      </div>
    </div>
  )
}
