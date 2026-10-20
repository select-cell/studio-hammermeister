import { fristEnde, laufenderMonat, monatAusDatum, monatName } from '../lib/monat'
import type { Person } from '../lib/types'

/**
 * „Deine Umfrage für <Monat>“ (§3). Phase 1: nur Monat und Frist.
 * Mit Phase 2 kommen Status (offen/erledigt/überfällig) und der Link zur Umfrage dazu.
 */
export default function UmfrageKarte({ person }: { person: Person }) {
  const start = person.salon ? monatAusDatum(person.salon.start_monat) : null
  const jetzt = laufenderMonat()
  const monat = start && jetzt < start ? start : jetzt

  return (
    <section className="karte" aria-labelledby="umfrage-karte-titel">
      <div className="karte-kopf">
        <h2 className="karte-titel" id="umfrage-karte-titel">
          Deine Umfrage für {monatName(monat)}
        </h2>
        <span className="abzeichen">Kommt bald</span>
      </div>
      <p className="text-gedimmt">
        Bewertet wird {monatName(monat)}. Abgabe bis spätestens <strong>{fristEnde(monat)}</strong>.
      </p>
      <p className="text-klein text-gedimmt">Die Umfrage wird in Kürze hier freigeschaltet.</p>
    </section>
  )
}
