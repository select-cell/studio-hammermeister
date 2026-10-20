import { Fragment } from 'react'
import { fmt, gruppenTitel, hatSaeulen, niveau, sortiereVerhalten, vornameVon, wertDerPerson, type DashboardPerson, type DashboardVerhalten, type Schwellen } from '../../lib/auswertung'
import { Leer } from './Abschnitt'

/** Matrix Verhalten × Person im Fremdbild, Farbe nach Score-Niveau, Zeilen nach Säule gruppiert (§5.6). */
export default function Heatmap({ verhalten, personen, schwellen }: { verhalten: DashboardVerhalten[]; personen: DashboardPerson[]; schwellen: Schwellen }) {
  if (!verhalten.some((v) => v.werte.some((w) => w.fb !== null))) return <Leer text="Für diesen Monat liegen noch keine Fremdbilder vor." />
  const gruppen = sortiereVerhalten(verhalten, 'standard', (v) => v.team_fb)
  const mitKoepfen = hatSaeulen(verhalten)

  return (
    <>
      <div className="au-tabelle-wrap">
        <table className="au-tabelle au-heatmap">
          <thead>
            <tr>
              <th scope="col" className="au-erste">
                Verhalten
              </th>
              {personen.map((p) => (
                <th key={p.id} scope="col" className="au-zahl" title={p.name}>
                  {vornameVon(p.name)}
                </th>
              ))}
              <th scope="col" className="au-zahl au-team">
                Ø Team
              </th>
            </tr>
          </thead>
          {gruppen.map((g) => (
            <tbody key={g.schluessel}>
              {mitKoepfen && (
                <tr className="au-gruppe">
                  <th colSpan={personen.length + 2} scope="colgroup">
                    {gruppenTitel(g) ?? 'Ohne Säule'}
                  </th>
                </tr>
              )}
              {g.zeilen.map((v) => (
                <Fragment key={v.nr}>
                  <tr>
                    <th scope="row" className="au-erste" title={v.titel}>
                      <span className="au-nr">{v.nr}</span> {v.titel}
                    </th>
                    {personen.map((p) => {
                      const w = wertDerPerson(v, p.id, 'fb')
                      return (
                        <td key={p.id} className={`au-zahl au-hm au-niv-${niveau(w, schwellen) ?? 'leer'}`}>
                          {fmt(w)}
                        </td>
                      )
                    })}
                    <td className={`au-zahl au-hm au-team au-niv-${niveau(v.team_fb, schwellen) ?? 'leer'}`}>{fmt(v.team_fb)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <NiveauLegende schwellen={schwellen} />
    </>
  )
}

export function NiveauLegende({ schwellen }: { schwellen: Schwellen }) {
  const z = (n: number) => String(n).replace('.', ',')
  return (
    <p className="au-legende">
      <span className="au-legende-eintrag">
        <span className="au-punkt au-punkt-hoch" /> hoch (ab {z(schwellen.hoch)})
      </span>
      <span className="au-legende-eintrag">
        <span className="au-punkt au-punkt-mittel" /> mittel ({z(schwellen.niedrig)}–{z(schwellen.hoch)})
      </span>
      <span className="au-legende-eintrag">
        <span className="au-punkt au-punkt-niedrig" /> niedrig (unter {z(schwellen.niedrig)})
      </span>
    </p>
  )
}
