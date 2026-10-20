import { useAuth } from '../../auth/AuthContext'
import Kachel from '../../components/Kachel'
import StatusKarte from '../../components/StatusKarte'
import UmfrageKarte from '../../components/UmfrageKarte'
import { sichtbareBereiche } from '../../lib/bereiche'
import { istLeitung, istTeilnehmer, rolleLabel, vorname } from '../../lib/rechte'
import type { Person } from '../../lib/types'

function begruessung(person: Person): string {
  if (istLeitung(person) && istTeilnehmer(person)) {
    return 'Du bist Teil des Teams und behältst gleichzeitig den Überblick über den ganzen Salon.'
  }
  if (istLeitung(person)) return 'Du hast Zugriff auf alle Auswertungen des Salons.'
  return 'Hier findest du deine Umfrage und deine Ergebnisse.'
}

/** Begrüßungsbereich: Inhalt richtet sich nach den zwei Merkmalen (Teilnehmer / Leitung). */
export default function Home() {
  const { person } = useAuth()
  if (!person) return null

  return (
    <>
      <section className="hero">
        <div className="hero-innen">
          <div className="hero-tag">{rolleLabel[person.rolle]}</div>
          <h1 className="hero-titel">Willkommen, {vorname(person)}</h1>
          <p className="hero-sub">{begruessung(person)}</p>
        </div>
      </section>

      {istTeilnehmer(person) && <UmfrageKarte person={person} />}
      {istLeitung(person) && <StatusKarte />}

      <h2 className="abschnitt">Deine Bereiche</h2>
      <div className="kacheln">
        {sichtbareBereiche(person).map((bereich) => (
          <Kachel key={bereich.id} bereich={bereich} person={person} />
        ))}
      </div>
    </>
  )
}
