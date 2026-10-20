import { Link } from 'react-router-dom'
import { istFertig, type Bereich } from '../lib/bereiche'
import type { Person } from '../lib/types'

/** Kachel zu einem Bereich auf /app. Bereiche, deren Bauphase noch aussteht, tragen ein „Kommt bald“-Abzeichen. */
export default function Kachel({ bereich, person }: { bereich: Bereich; person: Person }) {
  return (
    <Link to={bereich.pfad} className="kachel">
      <div className="kachel-kopf">
        <h3 className="kachel-titel">{bereich.titel(person)}</h3>
        {!istFertig(bereich) && <span className="abzeichen">Kommt bald</span>}
      </div>
      <p className="kachel-text">{bereich.beschreibung(person)}</p>
    </Link>
  )
}
