import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ladeOffeneMonate } from '../lib/api'
import { fristEnde, laufenderMonat, monatAusDatum, monatName, monatVerschieben } from '../lib/monat'
import type { Person } from '../lib/types'
import type { OffenerMonat } from '../lib/umfrage'

type Zustand = { art: 'laedt' } | { art: 'fehler' } | { art: 'bereit'; offen: OffenerMonat[] }

const tage = (n: number) => `${n} Tag${n === 1 ? '' : 'en'}`

/**
 * „Deine Umfrage für <Monat>“ (§3): offen, überfällig oder erledigt, mit Frist und Link zur Umfrage.
 * Die Frist ist das Monatsende; danach kann nachträglich abgegeben werden, die Karte wird dann hervorgehoben.
 */
export default function UmfrageKarte({ person }: { person: Person }) {
  const [zustand, setZustand] = useState<Zustand>({ art: 'laedt' })
  const [versuch, setVersuch] = useState(0)

  useEffect(() => {
    let aktiv = true
    setZustand({ art: 'laedt' })
    ladeOffeneMonate()
      .then((offen) => aktiv && setZustand({ art: 'bereit', offen }))
      .catch(() => aktiv && setZustand({ art: 'fehler' }))
    return () => {
      aktiv = false
    }
  }, [versuch])

  const start = person.salon ? monatAusDatum(person.salon.start_monat) : null
  const jetzt = laufenderMonat()

  if (zustand.art === 'laedt') {
    return (
      <section className="karte" aria-busy="true">
        <h2 className="karte-titel">Deine Umfrage</h2>
        <p className="text-gedimmt text-klein">Wird geladen …</p>
      </section>
    )
  }

  if (zustand.art === 'fehler') {
    return (
      <section className="karte">
        <h2 className="karte-titel">Deine Umfrage</h2>
        <p className="text-gedimmt">Der Stand deiner Umfrage konnte nicht geladen werden.</p>
        <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => setVersuch((v) => v + 1)}>
          Erneut versuchen
        </button>
      </section>
    )
  }

  const [erste, ...weitere] = zustand.offen

  if (!erste) {
    if (start && jetzt < start) {
      return (
        <section className="karte">
          <div className="karte-kopf">
            <h2 className="karte-titel">Deine Umfrage</h2>
            <span className="abzeichen">Bald</span>
          </div>
          <p className="text-gedimmt">Die erste Umfrage startet im {monatName(start)}.</p>
        </section>
      )
    }
    return (
      <section className="karte" aria-labelledby="umfrage-karte-titel">
        <div className="karte-kopf">
          <h2 className="karte-titel" id="umfrage-karte-titel">
            Deine Umfrage für {monatName(jetzt)}
          </h2>
          <span className="abzeichen abzeichen-gruen">Erledigt</span>
        </div>
        <p className="text-gedimmt">Danke, du hast alles abgegeben. Die nächste Umfrage startet im {monatName(monatVerschieben(jetzt, 1))}.</p>
      </section>
    )
  }

  return (
    <section className={`karte${erste.ueberfaellig ? ' karte-ueberfaellig' : ''}`} aria-labelledby="umfrage-karte-titel">
      <div className="karte-kopf">
        <h2 className="karte-titel" id="umfrage-karte-titel">
          Deine Umfrage für {monatName(erste.monat)}
        </h2>
        {erste.ueberfaellig ? (
          <span className="abzeichen abzeichen-rot">Seit {tage(erste.tage_ueberfaellig)} überfällig</span>
        ) : (
          <span className="abzeichen">Offen</span>
        )}
      </div>
      <p className="text-gedimmt">
        Bewertet wird {monatName(erste.monat)}. Abgabe bis spätestens <strong>{fristEnde(erste.monat)}</strong>
        {erste.ueberfaellig ? ' – du kannst sie jetzt nachholen.' : '.'}
      </p>
      <Link to={`/app/umfrage/${erste.monat}`} className="btn btn-primaer btn-voll">
        {erste.ueberfaellig ? 'Jetzt nachholen' : 'Umfrage starten'}
      </Link>
      {weitere.length > 0 && (
        <p className="text-klein text-gedimmt">
          Außerdem offen:{' '}
          {weitere.map((o, i) => (
            <span key={o.monat}>
              {i > 0 && ', '}
              <Link to={`/app/umfrage/${o.monat}`}>{monatName(o.monat)}</Link>
            </span>
          ))}
        </p>
      )}
    </section>
  )
}
