import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Kachel from '../../components/Kachel'
import ReminderPopup from '../../components/ReminderPopup'
import StatusKarte from '../../components/StatusKarte'
import UmfrageKarte from '../../components/UmfrageKarte'
import { erinnerungsSchluessel, heuteAusAdresse, reminderGesehen, reminderMerken } from '../../lib/abgabe'
import { ladeUeberfaellige } from '../../lib/api'
import { sichtbareBereiche } from '../../lib/bereiche'
import { istLeitung, istTeilnehmer, rolleLabel, vorname } from '../../lib/rechte'
import type { Person } from '../../lib/types'
import { useLaden } from '../../lib/useLaden'

function begruessung(person: Person): string {
  if (istLeitung(person) && istTeilnehmer(person)) {
    return 'Du bist Teil des Teams und behältst gleichzeitig den Überblick über den ganzen Salon.'
  }
  if (istLeitung(person)) return 'Du hast Zugriff auf alle Auswertungen des Salons.'
  return 'Hier findest du deine Umfrage und deine Ergebnisse.'
}

/**
 * Abgabe-Status und Reminder-Popup für Verantwortliche und Admin (§6).
 * Mit `?heute=2026-11-04` in der Adresse rechnen beide mit einem simulierten Datum (Test, Phase 4).
 */
function Abgaben() {
  const [suche] = useSearchParams()
  const heute = heuteAusAdresse(suche.toString())
  const ueber = useLaden(() => ladeUeberfaellige(heute ?? undefined), `ueber:${heute ?? ''}`)
  const [weggeklickt, setWeggeklickt] = useState<string | null>(null)

  const eintraege = ueber.daten?.eintraege ?? []
  const schluessel = erinnerungsSchluessel(eintraege)
  const zeigen = eintraege.length > 0 && weggeklickt !== schluessel && !reminderGesehen(schluessel)

  return (
    <>
      {zeigen && (
        <ReminderPopup
          eintraege={eintraege}
          onSchliessen={() => {
            reminderMerken(schluessel)
            setWeggeklickt(schluessel)
          }}
        />
      )}
      <StatusKarte heute={heute} ueberfaellige={ueber.daten} />
    </>
  )
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
      {istLeitung(person) && <Abgaben />}

      <h2 className="abschnitt">Deine Bereiche</h2>
      <div className="kacheln">
        {sichtbareBereiche(person).map((bereich) => (
          <Kachel key={bereich.id} bereich={bereich} person={person} />
        ))}
      </div>
    </>
  )
}
