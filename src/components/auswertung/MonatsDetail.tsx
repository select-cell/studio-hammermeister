import { useState } from 'react'
import { einordnung, fmt, fmtDiff, gruppenTitel, type Kommentar, type PersonMonat, type Schwellen } from '../../lib/auswertung'
import { monatName } from '../../lib/monat'
import { Leer } from './Abschnitt'
import Tabs from './Tabs'

function KommentarZeile({ k }: { k: Kommentar }) {
  return (
    <blockquote className="au-kommentar">
      <span className="au-kommentar-kopf">
        {k.von ? `${k.von} · ` : 'Kolleg:in · '}Note {k.note}
      </span>
      {k.text}
    </blockquote>
  )
}

/**
 * Monats-Tabs; je Verhalten Score und Kommentare (§5.6). Absender stehen nur da, wo die Datenbank sie liefert.
 * Der Monat startet beim gewählten Monat der Seite; den Wechsel hier merkt sich nur diese Karte.
 */
export default function MonatsDetail({
  monate,
  detail,
  start,
  schwellen,
  absenderSichtbar,
  ohneFremdkommentare = false,
}: {
  monate: string[]
  detail: Record<string, PersonMonat>
  start: string | null
  schwellen: Schwellen
  absenderSichtbar: boolean
  /** Die Datenbank liefert keine Kommentare der Kolleg:innen; es bleibt nur der eigene Kommentar */
  ohneFremdkommentare?: boolean
}) {
  const [gewaehlt, setGewaehlt] = useState<string | null>(start && monate.includes(start) ? start : (monate[monate.length - 1] ?? null))
  const monat = gewaehlt && detail[gewaehlt] ? gewaehlt : null
  if (monate.length === 0) return <Leer text="Noch keine Monate mit Ergebnissen." />

  const verhalten = monat ? detail[monat].verhalten : []
  const mitKommentar = verhalten.filter((v) => v.sb_kommentar || v.kommentare.length > 0).length

  return (
    <>
      <Tabs klein label="Monat wählen" aktiv={gewaehlt ?? ''} onWahl={setGewaehlt} tabs={monate.map((m) => ({ id: m, label: monatName(m) }))} />
      {!monat ? (
        <Leer text="Für diesen Monat liegen keine Werte vor." />
      ) : (
        <>
          <p className="text-gedimmt text-klein">
            {ohneFremdkommentare
              ? mitKommentar === 0
                ? 'In diesem Monat hast du keine Kommentare geschrieben.'
                : `${mitKommentar} von ${verhalten.length} Verhalten mit deinem Kommentar.`
              : mitKommentar === 0
                ? 'In diesem Monat gibt es keine Kommentare.'
                : `${mitKommentar} von ${verhalten.length} Verhalten mit Kommentar.`}{' '}
            {ohneFremdkommentare
              ? 'Die Kommentare deiner Kolleg:innen sehen nur die Salonleitung und der Plattformbetreiber.'
              : absenderSichtbar
                ? 'Die Absender sind sichtbar.'
                : 'Kommentare erscheinen ohne Absender.'}
          </p>
          <ul className="au-verhalten-liste">
            {verhalten.map((v) => {
              const ein = einordnung(v.diff, schwellen.ausgewogen)
              return (
                <li key={v.nr} className="au-verhalten">
                  <div className="au-verhalten-kopf">
                    <div>
                      <strong>
                        {v.nr}. {v.titel}
                      </strong>
                      {gruppenTitel(v) && <span className="au-verhalten-saeule">{gruppenTitel(v)}</span>}
                    </div>
                    <div className="au-scores">
                      <span className="au-score au-score-sb" title="Selbstbild">
                        SB {fmt(v.sb, v.sb !== null && Number.isInteger(v.sb) ? 0 : 2)}
                      </span>
                      <span className="au-score au-score-fb" title="Ø Fremdbild">
                        FB {fmt(v.fb)}
                      </span>
                      <span className={`au-score${ein ? ` au-ton-${ein.ton}` : ''}`} title={ein?.text}>
                        {fmtDiff(v.diff)}
                      </span>
                    </div>
                  </div>
                  {v.sb_kommentar && (
                    <blockquote className="au-kommentar au-kommentar-sb">
                      <span className="au-kommentar-kopf">Kommentar zum Selbstbild</span>
                      {v.sb_kommentar}
                    </blockquote>
                  )}
                  {v.kommentare.map((k, i) => (
                    <KommentarZeile key={i} k={k} />
                  ))}
                  {v.fremdbilder && v.fremdbilder.length > 0 && (
                    <p className="au-einzelnoten">
                      Einzelnoten:{' '}
                      {v.fremdbilder.map((f, i) => (
                        <span key={f.von}>
                          {i > 0 && ' · '}
                          {f.von} <strong>{f.note}</strong>
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
