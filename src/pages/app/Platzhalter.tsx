import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { bereichById, PHASEN } from '../../lib/bereiche'

function Platzhalter({ titel, text, phase }: { titel: string; text: string; phase: number }) {
  return (
    <>
      <p className="zurueck">
        <Link to="/app">← Zur Startseite</Link>
      </p>
      <section className="karte">
        <div className="karte-kopf">
          <h1 className="karte-titel">{titel}</h1>
          <span className="abzeichen">Kommt bald</span>
        </div>
        <p className="text-gedimmt">{text}</p>
        <div className="bald-hinweis">
          Dieser Bereich ist noch in Arbeit und wird bald freigeschaltet.
          <small>Geplant: {PHASEN[phase]}</small>
        </div>
      </section>
    </>
  )
}

/** Platzhalter für einen Bereich aus src/lib/bereiche.ts. */
export function BereichPlatzhalter({ id }: { id: string }) {
  const { person } = useAuth()
  const bereich = bereichById(id)
  if (!person || !bereich) return <Navigate to="/app" replace />
  return <Platzhalter titel={bereich.titel(person)} text={bereich.beschreibung(person)} phase={bereich.phase} />
}
