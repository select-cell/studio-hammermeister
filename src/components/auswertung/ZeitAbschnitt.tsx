import { ladeZeitAuswertung } from '../../lib/api'
import { fmt, vornameVon } from '../../lib/auswertung'
import { flagInfo, type ZeitAuswertung, type ZeitPerson } from '../../lib/zeit'
import { useLaden } from '../../lib/useLaden'
import Abschnitt, { Leer } from './Abschnitt'

/** Kennzeichen einer Sitzung als kleine Marken; die Erklärung steht im Tooltip und für Screenreader im Text. */
function Flags({ p, schwellen }: { p: ZeitPerson; schwellen: ZeitAuswertung['schwellen'] }) {
  const flags = p.flags.filter((f) => f !== 'neu_begonnen')
  if (flags.length === 0 && p.abgebrochen === 0) return <span className="text-gedimmt">–</span>
  return (
    <span className="au-zeit-flags">
      {flags.map((f) => {
        const i = flagInfo(f, schwellen)
        return (
          <span key={f} className={`au-zeit-flag ${i.ton}`} title={i.hinweis}>
            {i.text}
          </span>
        )
      })}
      {p.abgebrochen > 0 && (
        <span className="au-zeit-flag" title={flagInfo('neu_begonnen').hinweis}>
          {p.abgebrochen === 1 ? '1 Neustart' : `${p.abgebrochen} Neustarts`}
        </span>
      )}
    </span>
  )
}

const min = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${fmt(n, 1)} Min`)

/**
 * Ausfüllzeit der Umfrage für die Leitung: aktive Zeit (Seite sichtbar und bedient), nicht die Uhr zwischen Start und Absenden.
 * Auffällige Sitzungen werden gekennzeichnet, nicht ausgeblendet; sie zählen nur nicht in Median und Spanne.
 */
export default function ZeitAbschnitt({ monat }: { monat: string }) {
  const l = useLaden(() => ladeZeitAuswertung(monat), monat)
  const d = l.daten

  return (
    <Abschnitt titel="Ausfüllzeit" hinweis="Gezählt wird die aktive Zeit: die Seite ist sichtbar und wird bedient. Pausen zählen nicht. Auffällige Zeiten sind markiert und bleiben sichtbar.">
      {!d ? (
        <Leer text={l.fehler ? 'Die Ausfüllzeit konnte nicht geladen werden.' : 'Ausfüllzeit wird geladen …'} />
      ) : !d.team || !d.personen || d.personen.length === 0 ? (
        <Leer text="Für diesen Monat liegt noch keine abgeschlossene Zeitmessung vor." />
      ) : (
        <>
          <p className="au-zeit-fazit">
            <strong>Median {min(d.team.median_aktiv_min)}</strong>
            {d.team.min_aktiv_min !== null && d.team.max_aktiv_min !== null && (
              <> (Spanne {fmt(d.team.min_aktiv_min, 1)} bis {fmt(d.team.max_aktiv_min, 1)} Min)</>
            )}
            {' · '}
            {d.team.gueltig} von {d.team.abgaben} Abgaben mit gültiger Zeit
          </p>

          <div className="au-tabelle-wrap">
            <table className="au-tabelle">
              <thead>
                <tr>
                  <th scope="col" className="au-erste">
                    Person
                  </th>
                  <th scope="col" className="au-zahl">
                    Aktiv
                  </th>
                  <th scope="col" className="au-zahl">
                    Gesamt
                  </th>
                  <th scope="col">Kennzeichen</th>
                </tr>
              </thead>
              <tbody>
                {d.personen.map((p) => (
                  <tr key={p.person_id} className={`au-zeit-zeile${p.dauer_gueltig === false ? ' ungueltig' : ''}`}>
                    <th scope="row" className="au-erste">
                      {p.name}
                    </th>
                    <td className="au-zahl">{min(p.aktiv_min)}</td>
                    <td className="au-zahl">{min(p.gesamt_min)}</td>
                    <td>
                      <Flags p={p} schwellen={d.schwellen} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ margin: '1.2rem 0 .4rem', fontSize: 14 }}>
            Zeit je Verhalten
          </h3>
          <p className="text-gedimmt text-klein">Mittlere aktive Zeit der gültigen Abgaben auf der Seite des Verhaltens.</p>
          <VerhaltenBalken d={d} />

          {d.personen.some((p) => Object.keys(p.verhalten).length > 0) && (
            <details className="au-zeit-details">
              <summary>Je Verhalten und Person (Sekunden)</summary>
              <VerhaltenMatrix d={d} />
            </details>
          )}
        </>
      )}
    </Abschnitt>
  )
}

function VerhaltenBalken({ d }: { d: ZeitAuswertung }) {
  const zeilen = d.verhalten ?? []
  const max = Math.max(0, ...zeilen.map((v) => v.median_sek ?? 0))
  if (max === 0) return <Leer text="Zeiten je Verhalten liegen noch nicht vor." />
  return (
    <div>
      {zeilen.map((v) => (
        <div className="au-zeit-balken" key={v.nr}>
          <span className="au-zeit-balken-name" title={v.titel}>
            <span className="au-nr">{v.nr}</span> {v.titel}
          </span>
          <span className="au-zeit-spur" aria-hidden="true">
            <span className="au-zeit-fuell" style={{ display: 'block', width: `${((v.median_sek ?? 0) / max) * 100}%` }} />
          </span>
          <span className="au-zeit-wert">{v.median_sek === null ? '–' : `${v.median_sek} s`}</span>
        </div>
      ))}
    </div>
  )
}

function VerhaltenMatrix({ d }: { d: ZeitAuswertung }) {
  const personen = d.personen ?? []
  const verhalten = d.verhalten ?? []
  const max = Math.max(1, ...personen.flatMap((p) => Object.values(p.verhalten)))
  return (
    <div className="au-tabelle-wrap">
      <table className="au-tabelle">
        <thead>
          <tr>
            <th scope="col" className="au-erste">
              Verhalten
            </th>
            {personen.map((p) => (
              <th key={p.person_id} scope="col" className="au-zahl" title={p.name}>
                {vornameVon(p.name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {verhalten.map((v) => (
            <tr key={v.nr}>
              <th scope="row" className="au-erste" title={v.titel}>
                <span className="au-nr">{v.nr}</span> {v.titel}
              </th>
              {personen.map((p) => {
                const s = p.verhalten[String(v.nr)]
                return (
                  <td key={p.person_id} className="au-zahl au-zeit-zelle" style={{ ['--anteil' as string]: s === undefined ? 0 : Math.round((s / max) * 70) }}>
                    {s === undefined ? '–' : s}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
