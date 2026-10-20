import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { passwortAendern } from '../../lib/api'
import { MIN_LAENGE, passwortFehlerText, pruefePasswort } from '../../lib/passwort'

/** /app/passwort – jede angemeldete Person ändert hier ihr eigenes Passwort. */
export default function Passwort() {
  const { session } = useAuth()
  const [aktuell, setAktuell] = useState('')
  const [neu, setNeu] = useState('')
  const [wiederholung, setWiederholung] = useState('')
  const [sendet, setSendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [fertig, setFertig] = useState(false)
  const email = session?.user.email ?? ''

  async function senden(ereignis: FormEvent) {
    ereignis.preventDefault()
    if (sendet) return
    setFertig(false)
    const problem = pruefePasswort(aktuell, neu, wiederholung)
    if (problem) {
      setFehler(passwortFehlerText[problem])
      return
    }
    setFehler(null)
    setSendet(true)
    const ergebnis = await passwortAendern(email, aktuell, neu)
    setSendet(false)
    if (ergebnis === 'ok') {
      setAktuell('')
      setNeu('')
      setWiederholung('')
      setFertig(true)
      return
    }
    setFehler(passwortFehlerText[ergebnis])
  }

  return (
    <>
      <p className="zurueck">
        <Link to="/app">← Zur Startseite</Link>
      </p>
      <section className="karte karte-schmal">
        <h1 className="karte-titel">Passwort ändern</h1>
        <form onSubmit={(e) => void senden(e)}>
          <p className="text-gedimmt">
            Du bist als <strong>{email}</strong> angemeldet. Das neue Passwort braucht mindestens {MIN_LAENGE} Zeichen.
          </p>
          {/* Verstecktes Benutzerfeld, damit Passwort-Manager das neue Passwort der richtigen Adresse zuordnen */}
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <div className="feld">
            <label htmlFor="pw-aktuell">Aktuelles Passwort</label>
            <input id="pw-aktuell" type="password" autoComplete="current-password" value={aktuell} onChange={(e) => setAktuell(e.target.value)} />
          </div>
          <div className="feld">
            <label htmlFor="pw-neu">Neues Passwort</label>
            <input id="pw-neu" type="password" autoComplete="new-password" value={neu} onChange={(e) => setNeu(e.target.value)} />
          </div>
          <div className="feld">
            <label htmlFor="pw-wiederholung">Neues Passwort wiederholen</label>
            <input id="pw-wiederholung" type="password" autoComplete="new-password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} />
          </div>
          {fehler && (
            <div className="hinweis hinweis-fehler" role="alert">
              {fehler}
            </div>
          )}
          {fertig && (
            <div className="hinweis hinweis-ok" role="status">
              Dein Passwort wurde geändert. Ab jetzt meldest du dich damit an.
            </div>
          )}
          <button type="submit" className="btn btn-primaer btn-voll" disabled={sendet || !aktuell || !neu || !wiederholung}>
            {sendet ? (
              <>
                <span className="spinner spinner-hell" aria-hidden="true" /> Wird gespeichert …
              </>
            ) : (
              'Passwort speichern'
            )}
          </button>
        </form>
      </section>
    </>
  )
}
