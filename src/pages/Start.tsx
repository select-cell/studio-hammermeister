import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { SALON_NAME } from '../config'

export default function Start() {
  const { session } = useAuth()

  return (
    <div className="seite-zentriert">
      <div className="start">
        <div className="hero hero-gross">
          <div className="hero-innen">
            <div className="hero-tag">Team-Plattform · {SALON_NAME}</div>
            <p className="hero-frage">Eine Frage zum Einstieg</p>
            <h1 className="hero-titel kursiv">Woran merken Gäste eigentlich, ob sie vor einem echten Profi sitzen?</h1>
            <div className="hero-trenner" />
          </div>
        </div>

        <div className="karte">
          <p className="text-gedimmt">
            Ein Friseursalon verkauft heute nicht nur Haare. Der Wert eines Salons entsteht nicht nur durch das Resultat –
            sondern vor allem durch das Erlebnis.
          </p>
          <div className="hervorhebung">
            <strong>Das Resultat</strong> entsteht durch unser Handwerk.
            <br />
            <strong>Das Erlebnis</strong> entsteht durch unser Verhalten, unsere Haltung und unseren Umgang mit Gästen und
            miteinander.
          </div>
          <p className="text-gedimmt">
            Hier füllt ihr monatlich die Verhaltens-Umfrage aus und seht, wie sich Verhalten, Professionalität und
            Zusammenarbeit entwickeln.
          </p>
          <Link to={session ? '/app' : '/login'} className="btn btn-primaer btn-voll">
            {session ? 'Zu meinem Bereich' : 'Anmelden'}
          </Link>
        </div>
      </div>
    </div>
  )
}
