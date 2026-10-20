import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ladeAbgabeStatus } from '../lib/api'
import { formatDatum, formatZeitpunkt, reminderSatz, sortiereStatus, tageText, type StatusPerson, type Ueberfaellige } from '../lib/abgabe'
import { monatName } from '../lib/monat'
import { useLaden } from '../lib/useLaden'

function PersonZeile({ p }: { p: StatusPerson }) {
  let info
  if (!p.erwartet) {
    info = <span className="text-gedimmt">noch nicht dabei</span>
  } else if (p.abgegeben) {
    info = (
      <>
        <span className="text-gedimmt">abgegeben am {formatZeitpunkt(p.zeitpunkt ?? '')}</span>
        {p.verspaetet && <span className="abzeichen abzeichen-gelb">verspätet</span>}
      </>
    )
  } else if (p.ueberfaellig) {
    info = <span className="abzeichen abzeichen-rot">{tageText(p.tage_ueberfaellig)} überfällig</span>
  } else if (p.tage_ueberfaellig > 0) {
    info = <span className="abzeichen abzeichen-gelb">Frist vorbei · {tageText(p.tage_ueberfaellig)}</span>
  } else {
    info = <span className="text-gedimmt">noch offen</span>
  }
  const zustand = !p.erwartet ? 'frei' : p.abgegeben ? 'ok' : p.ueberfaellig ? 'rot' : 'offen'
  return (
    <li className={`ab-person ab-person-${zustand}`}>
      <span className="ab-person-name">
        <span className="ab-markierung" aria-hidden="true" />
        <Link to={`/app/mitglieder/${p.id}`}>{p.name}</Link>
      </span>
      <span className="ab-person-info">{info}</span>
    </li>
  )
}

/**
 * Abgabe-Status für Verantwortliche und Admin (§6): wer hat für den Monat schon abgegeben, wer ist überfällig.
 * Dauerhaft auf /app; das Popup (ReminderPopup) weist zusätzlich beim Öffnen darauf hin.
 */
export default function StatusKarte({ heute, ueberfaellige }: { heute: string | null; ueberfaellige: Ueberfaellige | null }) {
  const [monat, setMonat] = useState<string | null>(null)
  const l = useLaden(() => ladeAbgabeStatus(monat ?? undefined, heute ?? undefined), `${monat ?? ''}|${heute ?? ''}`)
  const s = l.daten
  const eintraege = ueberfaellige?.eintraege ?? []

  return (
    <section className="karte" id="abgabe-status" aria-labelledby="abgabe-status-titel" aria-busy={l.laedt}>
      <div className="karte-kopf">
        <h2 className="karte-titel" id="abgabe-status-titel">
          Abgabe-Status{s?.monat ? ` ${monatName(s.monat)}` : ''}
        </h2>
        {s && s.monate.length > 1 && (
          <select className="ab-monat" aria-label="Monat" value={s.monat ?? ''} onChange={(e) => setMonat(e.target.value)}>
            {[...s.monate].reverse().map((m) => (
              <option key={m} value={m}>
                {monatName(m)}
              </option>
            ))}
          </select>
        )}
      </div>

      {heute && (
        <p className="hinweis hinweis-warnung" role="status">
          Testansicht: Die Ansicht rechnet mit dem {formatDatum(heute)}. Es wird nichts verändert. <Link to="/app">Zum heutigen Stand</Link>
        </p>
      )}

      {!s && l.fehler && (
        <>
          <p className="text-gedimmt">Der Abgabe-Status konnte nicht geladen werden.</p>
          <button type="button" className="btn btn-sekundaer btn-klein" onClick={l.neuLaden}>
            Erneut versuchen
          </button>
        </>
      )}
      {!s && !l.fehler && <p className="text-gedimmt text-klein">Wird geladen …</p>}

      {s && (
        <div className={l.laedt ? 'au-laedt' : undefined}>
          {l.fehler && <p className="hinweis hinweis-fehler">Der Monat konnte nicht geladen werden.</p>}

          {eintraege.length > 0 && (
            <div className="ab-ueberfaellig" role="status">
              <strong>
                {eintraege.length} {eintraege.length === 1 ? 'Abgabe ist' : 'Abgaben sind'} überfällig
              </strong>
              <ul>
                {eintraege.map((e) => (
                  <li key={`${e.person_id}:${e.monat}`}>{reminderSatz(e)}</li>
                ))}
              </ul>
            </div>
          )}

          {!s.monat ? (
            <p className="text-gedimmt">Die erste Umfrage startet im {monatName(s.start_monat)}. Dann siehst du hier, wer schon abgegeben hat.</p>
          ) : (
            <>
              <p className="ab-zusammenfassung">
                <strong>
                  {s.abgegeben} von {s.erwartet}
                </strong>{' '}
                abgegeben · Frist {formatDatum(s.frist ?? '')}
              </p>
              <div className="ab-balken" role="progressbar" aria-label="Abgaben" aria-valuemin={0} aria-valuemax={s.erwartet} aria-valuenow={s.abgegeben}>
                <div className="ab-balken-fuellung" style={{ width: s.erwartet ? `${Math.round((s.abgegeben / s.erwartet) * 100)}%` : '0%' }} />
              </div>
              <ul className="ab-personen">
                {sortiereStatus(s.personen).map((p) => (
                  <PersonZeile key={p.id} p={p} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
