import { useId, useState, type ReactNode } from 'react'
import { einordnung, fmt, fmtDiff, gruppenTitel, hatSaeulen, niveau, sortiereVerhalten, type Schwellen, type Sortierung } from '../../lib/auswertung'
import { Leer } from './Abschnitt'
import { NiveauLegende } from './Heatmap'
import SortierungAuswahl from './Sortierung'
import Tabs from './Tabs'

export interface SbFbZeile {
  nr: number
  titel: string
  grundpfeiler: string | null
  saeule: string | null
  sb: number | null
  fb: number | null
  diff: number | null
}

type Tab = 'verhalten' | 'rituale'

/**
 * Personen-Sicht der Detailtabelle: Selbstbild · Fremdbild · Differenz je Verhalten (§5.6).
 * Auch für die Team-Schnitte der Teammitglieder; dort gibt es keine einzelnen Personen.
 * Sortiert wird nach dem Fremdbild. Der Rituale-Tab erscheint nur, wenn es Rituale gibt.
 */
export default function DetailtabelleSbFb({ zeilen, schwellen, rituale }: { zeilen: SbFbZeile[]; schwellen: Schwellen; rituale?: ReactNode }) {
  const [tab, setTab] = useState<Tab>('verhalten')
  const [sortierung, setSortierung] = useState<Sortierung>('standard')
  const sortId = useId()
  const gruppen = sortiereVerhalten(zeilen, sortierung, (z) => z.fb)
  const mitKoepfen = sortierung === 'standard' && hatSaeulen(zeilen)

  return (
    <>
      {rituale && (
        <Tabs
          label="Ansicht der Detailtabelle"
          aktiv={tab}
          onWahl={setTab}
          tabs={[
            { id: 'verhalten', label: 'Selbst- und Fremdbild' },
            { id: 'rituale', label: 'Rituale' },
          ]}
        />
      )}
      {tab === 'rituale' && rituale ? (
        rituale
      ) : zeilen.length === 0 ? (
        <Leer text="Für diesen Monat liegen noch keine Werte vor." />
      ) : (
        <>
          <SortierungAuswahl id={sortId} wert={sortierung} onWahl={setSortierung} />
          <div className="au-tabelle-wrap">
            <table className="au-tabelle">
              <thead>
                <tr>
                  <th scope="col" className="au-erste">
                    Verhalten
                  </th>
                  <th scope="col" className="au-zahl">
                    SB
                  </th>
                  <th scope="col" className="au-zahl">
                    FB
                  </th>
                  <th scope="col" className="au-zahl">
                    Differenz
                  </th>
                </tr>
              </thead>
              {gruppen.map((g) => (
                <tbody key={g.schluessel}>
                  {mitKoepfen && (
                    <tr className="au-gruppe">
                      <th colSpan={4} scope="colgroup">
                        {gruppenTitel(g) ?? 'Ohne Säule'}
                      </th>
                    </tr>
                  )}
                  {g.zeilen.map((z) => {
                    const ein = einordnung(z.diff, schwellen.ausgewogen)
                    return (
                      <tr key={z.nr}>
                        <th scope="row" className="au-erste" title={z.titel}>
                          <span className="au-nr">{z.nr}</span> {z.titel}
                        </th>
                        <td className={`au-zahl au-niv-${niveau(z.sb, schwellen) ?? 'leer'}`}>{fmt(z.sb)}</td>
                        <td className={`au-zahl au-niv-${niveau(z.fb, schwellen) ?? 'leer'}`}>{fmt(z.fb)}</td>
                        <td className={`au-zahl${ein ? ` au-ton-${ein.ton}` : ''}`} title={ein?.text}>
                          {fmtDiff(z.diff)}
                          {ein && <span className="sr-only"> ({ein.text})</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              ))}
            </table>
          </div>
          <NiveauLegende schwellen={schwellen} />
        </>
      )}
    </>
  )
}
