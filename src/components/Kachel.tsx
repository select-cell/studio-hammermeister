import { Link } from 'react-router-dom'
import type { Bereich } from '../lib/bereiche'
import type { Person } from '../lib/types'

/** Kachel zu einem Bereich auf /app. Bereiche ohne fertige Seite tragen ein „Kommt bald“-Abzeichen. */
export default function Kachel({ bereich, person, bereit = false }: { bereich: Bereich; person: Person; bereit?: boolean }) {
  return (
    <Link to={bereich.pfad} className="kachel">
      <div className="kachel-kopf">
        <h3 className="kachel-titel">{bereich.titel(person)}</h3>
        {!bereit && <span className="abzeichen">Kommt bald</span>}
      </div>
      <p className="kachel-text">{bereich.beschreibung(person)}</p>
    </Link>
  )
}
