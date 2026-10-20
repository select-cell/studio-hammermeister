import { useId, useState, type ReactNode } from 'react'
import { fmt, gruppenTitel, hatSaeulen, niveau, sortiereVerhalten, vornameVon, wertDerPerson, type DashboardPerson, type DashboardVerhalten, type Schwellen, type Sortierung } from '../../lib/auswertung'
import { Leer } from './Abschnitt'
import { NiveauLegende } from './Heatmap'
import SortierungAuswahl from './Sortierung'
import Tabs from './Tabs'

type Tab = 'sb' | 'fb' | 'rituale'

/**
 * Team-Sicht der Detailtabelle: eine Spalte je Person plus Ø Team, in den Tabs Selbstbild / Fremdbild / Rituale (§5.6).
 * Sortiert wird nach dem Team-Schnitt des gewählten Tabs.
 */
export default function DetailtabelleMatrix({
  verhalten,
  personen,
  schwellen,
  rituale,
}: {
  verhalten: DashboardVerhalten[]
  personen: DashboardPerson[]
  schwellen: Schwellen
  rituale?: ReactNode
}) {
  const [tab, setTab] = useState<Tab>('fb')
  const [sortierung, setSortierung] = useState<Sortierung>('standard')
  const sortId = useId()
  const art = tab === 'sb' ? 'sb' : 'fb'
  const teamWert = (v: DashboardVerhalten) => (art === 'sb' ? v.team_sb : v.team_fb)
  const gruppen = sortiereVerhalten(verhalten, sortierung, teamWert)
  const mitKoepfen = sortierung === 'standard' && hatSaeulen(verhalten)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sb', label: 'Selbstbild' },
    { id: 'fb', label: 'Fremdbild' },
    ...(rituale ? [{ id: 'rituale' as const, label: 'Rituale' }] : []),
  ]

  return (
    <>
      <Tabs label="Ansicht der Detailtabelle" aktiv={tab} onWahl={setTab} tabs={tabs} />
      {tab === 'rituale' && rituale ? (
        rituale
      ) : verhalten.length === 0 ? (
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
                    <tr key={v.nr}>
                      <th scope="row" className="au-erste" title={v.titel}>
                        <span className="au-nr">{v.nr}</span> {v.titel}
                      </th>
                      {personen.map((p) => {
                        const w = wertDerPerson(v, p.id, art)
                        return (
                          <td key={p.id} className={`au-zahl au-niv-${niveau(w, schwellen) ?? 'leer'}`}>
                            {fmt(w)}
                          </td>
                        )
                      })}
                      <td className={`au-zahl au-team au-niv-${niveau(teamWert(v), schwellen) ?? 'leer'}`}>{fmt(teamWert(v))}</td>
                    </tr>
                  ))}
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
