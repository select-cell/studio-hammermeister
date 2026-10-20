import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Logo from '../components/Logo'
import { SALON_NAME } from '../config'
import { anmeldelinkSenden } from '../lib/api'

const WARTEZEIT_SEKUNDEN = 60

export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [sendet, setSendet] = useState(false)
  const [gesendet, setGesendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [warten, setWarten] = useState(0)

  // Sperre gegen mehrfaches Senden: erst nach einer Minute kann der Link erneut angefordert werden.
  useEffect(() => {
    if (warten <= 0) return
    const timer = setTimeout(() => setWarten((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [warten])

  if (session) return <Navigate to="/app" replace />

  async function senden(ereignis?: FormEvent) {
    ereignis?.preventDefault()
    if (sendet || warten > 0) return
    setFehler(null)
    setSendet(true)
    const ergebnis = await anmeldelinkSenden(email)
    setSendet(false)
    if (ergebnis === 'gesendet') {
      setGesendet(true)
      setWarten(WARTEZEIT_SEKUNDEN)
      return
    }
    setFehler(
      ergebnis === 'zuVieleAnfragen'
        ? 'Es wurden gerade zu viele Links angefordert. Bitte warte eine Minute und versuche es dann noch einmal.'
        : 'Das hat nicht geklappt. Bitte prüfe deine Verbindung und versuche es gleich noch einmal.',
    )
  }

  return (
    <div className="seite-zentriert">
      <div className="karte karte-schmal">
        <div className="seite-logo">
          <Logo />
          <span className="brand-name">{SALON_NAME}</span>
        </div>

        {gesendet ? (
          <>
            <h1 className="karte-titel">Dein Link ist unterwegs</h1>
            <div className="hinweis hinweis-ok" role="status">
              Wenn <strong>{email.trim().toLowerCase()}</strong> für {SALON_NAME} freigeschaltet ist, hast du gleich eine
              E-Mail mit deinem Anmelde-Link. Schau auch im Spam-Ordner nach. Der Link ist nur kurz gültig.
            </div>
            {fehler && (
              <div className="hinweis hinweis-fehler" role="alert">
                {fehler}
              </div>
            )}
            <div className="knopfreihe">
              <button className="btn btn-sekundaer" disabled={sendet || warten > 0} onClick={() => void senden()}>
                {warten > 0 ? `Erneut senden in ${warten} s` : 'Link erneut senden'}
              </button>
              <button
                className="btn btn-sekundaer"
                onClick={() => {
                  setGesendet(false)
                  setFehler(null)
                }}
              >
                Andere Adresse
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => void senden(e)}>
            <h1 className="karte-titel">Anmelden</h1>
            <p className="text-gedimmt">
              Gib deine E-Mail-Adresse ein. Du bekommst einen Link, mit dem du dich ohne Passwort anmeldest.
            </p>
            <div className="feld">
              <label htmlFor="email">E-Mail-Adresse</label>
              <input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beispiel.de"
              />
            </div>
            {fehler && (
              <div className="hinweis hinweis-fehler" role="alert">
                {fehler}
              </div>
            )}
            <button type="submit" className="btn btn-primaer btn-voll" disabled={sendet || !email.trim()}>
              {sendet ? (
                <>
                  <span className="spinner spinner-hell" aria-hidden="true" /> Wird gesendet …
                </>
              ) : (
                'Link zum Anmelden senden'
              )}
            </button>
          </form>
        )}

        <p className="text-klein text-gedimmt text-mitte">
          <Link to="/">Zur Startseite</Link>
        </p>
      </div>
    </div>
  )
}
