import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Laden from '../../components/Laden'
import UmfrageAblauf from '../../components/umfrage/UmfrageAblauf'
import { ladeOffeneMonate, ladeUmfrageInhalt } from '../../lib/api'
import { istMonat, laufenderMonat, monatAusDatum, monatName } from '../../lib/monat'
import type { OffenerMonat, UmfrageInhalt } from '../../lib/umfrage'

type Zustand =
  | { art: 'laedt' }
  | { art: 'fehler' }
  | { art: 'bereit'; offen: OffenerMonat[]; inhalt: UmfrageInhalt }

function Hinweis({ titel, text, retry }: { titel: string; text: string; retry?: () => void }) {
  return (
    <div className="seite-zentriert" style={{ minHeight: '50vh' }}>
      <div className="karte karte-schmal">
        <h1 className="karte-titel">{titel}</h1>
        <p className="text-gedimmt">{text}</p>
        <div className="knopfreihe">
          {retry && (
            <button type="button" className="btn btn-primaer" onClick={retry}>
              Erneut versuchen
            </button>
          )}
          <Link to="/app" className="btn btn-sekundaer">
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  )
}

/** /app/umfrage/:monat – die Monatsumfrage der eingeloggten Person. */
export default function UmfrageSeite() {
  const { monat } = useParams()
  const { person } = useAuth()
  const [zustand, setZustand] = useState<Zustand>({ art: 'laedt' })
  const [versuch, setVersuch] = useState(0)

  useEffect(() => {
    let aktiv = true
    setZustand({ art: 'laedt' })
    Promise.all([ladeOffeneMonate(), ladeUmfrageInhalt()])
      .then(([offen, inhalt]) => aktiv && setZustand({ art: 'bereit', offen, inhalt }))
      .catch(() => aktiv && setZustand({ art: 'fehler' }))
    return () => {
      aktiv = false
    }
  }, [monat, versuch])

  if (!monat || !istMonat(monat) || !person) return <Navigate to="/app" replace />
  if (zustand.art === 'laedt') return <Laden text="Umfrage wird geladen …" />
  if (zustand.art === 'fehler') {
    return <Hinweis titel="Das hat gerade nicht geklappt" text="Die Umfrage konnte nicht geladen werden. Bitte prüfe deine Verbindung und versuche es noch einmal." retry={() => setVersuch((v) => v + 1)} />
  }

  const { offen, inhalt } = zustand
  if (!offen.some((o) => o.monat === monat)) {
    // Nicht offen: entweder schon abgegeben oder gar nicht vorgesehen (Zukunft, vor dem Start)
    const start = person.salon ? monatAusDatum(person.salon.start_monat) : null
    if (start && monat >= start && monat <= laufenderMonat()) {
      return <Hinweis titel={`${monatName(monat)}: schon erledigt`} text={`Für ${monatName(monat)} hast du die Umfrage bereits abgegeben. Danke!`} />
    }
    return <Navigate to="/app" replace />
  }

  if (inhalt.verhalten.length === 0 || inhalt.kollegen.length === 0) {
    return (
      <Hinweis
        titel="Die Umfrage ist noch nicht eingerichtet"
        text="Es fehlen noch Verhalten oder Teammitglieder. Bitte melde dich bei der Salonleitung."
      />
    )
  }

  return <UmfrageAblauf key={monat} monat={monat} inhalt={inhalt} person={person} />
}
