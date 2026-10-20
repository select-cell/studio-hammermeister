import { useAuth } from '../auth/AuthContext'
import Logo from './Logo'

/** Eingeloggt, aber ohne nutzbaren Zugang (§4.2): Hinweis plus Abmelden. */
export default function KeinZugang() {
  const { personStatus, session, abmelden, neuLaden } = useAuth()
  const email = session?.user.email ?? 'deine E-Mail-Adresse'

  let titel = 'Dein Zugang ist noch nicht freigeschaltet'
  let text = `Mit ${email} bist du angemeldet, aber noch keiner Person im Salon zugeordnet. Bitte melde dich bei der Salonleitung.`
  if (personStatus === 'inaktiv') {
    titel = 'Dein Zugang ist deaktiviert'
    text = 'Dein Zugang wurde deaktiviert. Bitte melde dich bei der Salonleitung, wenn das nicht stimmt.'
  } else if (personStatus === 'fehler') {
    titel = 'Das hat gerade nicht geklappt'
    text = 'Dein Profil konnte nicht geladen werden. Bitte prüfe deine Verbindung und versuche es noch einmal.'
  }

  return (
    <div className="seite-zentriert">
      <div className="karte karte-schmal">
        <div className="seite-logo">
          <Logo />
        </div>
        <h1 className="karte-titel">{titel}</h1>
        <p className="text-gedimmt">{text}</p>
        <div className="knopfreihe">
          {personStatus === 'fehler' && (
            <button className="btn btn-primaer" onClick={neuLaden}>
              Erneut versuchen
            </button>
          )}
          <button className="btn btn-sekundaer" onClick={() => void abmelden()}>
            Abmelden
          </button>
        </div>
      </div>
    </div>
  )
}
