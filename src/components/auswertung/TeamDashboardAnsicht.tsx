import { useState, type ReactNode } from 'react'
import { ladePersonErgebnisse, ladeTeamDashboard, ladeTeamErgebnisse } from '../../lib/api'
import { vornameVon, type DashboardPerson, type Schwellen, type TeamDashboard } from '../../lib/auswertung'
import { monatName } from '../../lib/monat'
import { useLaden } from '../../lib/useLaden'
import Abschnitt, { Leer } from './Abschnitt'
import DetailtabelleMatrix from './DetailtabelleMatrix'
import DifferenzDiagramm from './DifferenzDiagramm'
import Entwicklung from './Entwicklung'
import Heatmap from './Heatmap'
import KennzahlKacheln from './KennzahlKacheln'
import LadeFehler from './LadeFehler'
import MonatsAuswahl from './MonatsAuswahl'
import PersonAnsicht from './PersonAnsicht'
import Rangliste from './Rangliste'
import { hatTeamRituale, RitualeTeam } from './Rituale'
import SbFbDiagramm from './SbFbDiagramm'
import Seitenkopf from './Seitenkopf'
import Tabs from './Tabs'
import TopFlop from './TopFlop'
import VerlaufDiagramm from './VerlaufDiagramm'

const TEAM = 'team'

function PersonTab({ id, monat, schwellen, rangliste }: { id: string; monat: string | null; schwellen: Schwellen; rangliste: ReactNode }) {
  const l = useLaden(() => ladePersonErgebnisse(id), id)
  if (!l.daten) return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Auswertung wird geladen …" />
  return <PersonAnsicht daten={l.daten} monat={monat} schwellen={schwellen} nachKacheln={rangliste} />
}

function TeamSicht({ d, schwellen, teamVerlauf, rangliste, rituale }: { d: TeamDashboard; schwellen: Schwellen; teamVerlauf: ReactNode; rangliste: ReactNode; rituale: ReactNode }) {
  const abgegeben = d.team?.abgaben ?? 0
  const personen = d.personen
  return (
    <>
      <KennzahlKacheln
        teamSicht
        sb={d.team?.sb ?? null}
        fb={d.team?.fb ?? null}
        diff={d.team?.diff ?? null}
        dauerMin={d.team?.dauer_min ?? null}
        schwelle={schwellen.ausgewogen}
        fremdbilder={d.team ? `über ${personen.length} Personen` : undefined}
      />
      <Abschnitt titel="Rangliste" hinweis="Nach Ø Fremdbild. Ein Klick öffnet die Auswertung der Person.">
        {rangliste}
      </Abschnitt>
      <Abschnitt titel="Selbstbild und Fremdbild je Person" hinweis={`Abgegeben haben ${abgegeben} von ${personen.length}.`}>
        <SbFbDiagramm
          daten={personen.map((p: DashboardPerson) => ({ name: vornameVon(p.name), titel: p.name, sb: p.sb, fb: p.fb }))}
          beschreibung="Selbstbild und Fremdbild je Person"
        />
      </Abschnitt>
      <Abschnitt titel="Differenz pro Person" hinweis="Selbstbild minus Fremdbild. Positiv: man sieht sich besser, als andere einen sehen.">
        <DifferenzDiagramm daten={personen.map((p) => ({ name: vornameVon(p.name), titel: p.name, diff: p.diff }))} schwelle={schwellen.ausgewogen} />
      </Abschnitt>
      <Abschnitt titel="Top und Flop Verhalten im Team" hinweis="Nach dem Ø Fremdbild des Teams.">
        <TopFlop zeilen={d.verhalten.map((v) => ({ nr: v.nr, titel: v.titel, grundpfeiler: v.grundpfeiler, saeule: v.saeule, fb: v.team_fb }))} />
      </Abschnitt>
      <Abschnitt titel="Heatmap" hinweis="Fremdbild je Verhalten und Person.">
        <Heatmap verhalten={d.verhalten} personen={personen} schwellen={schwellen} />
      </Abschnitt>
      <Abschnitt titel="Detailtabelle">
        <DetailtabelleMatrix verhalten={d.verhalten} personen={personen} schwellen={schwellen} rituale={rituale} />
      </Abschnitt>
      <Entwicklung eintraege={d.entwicklung} />
      {teamVerlauf}
    </>
  )
}

/** /app/team für Verantwortliche und Admin: Ansicht-Umschalter „Team“ + je Person, alle Bausteine passen sich an (§5.6). */
export default function TeamDashboardAnsicht({ schwellen }: { schwellen: Schwellen }) {
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const [ansicht, setAnsicht] = useState<string>(TEAM)
  const dash = useLaden(() => ladeTeamDashboard(auswahl ?? undefined), auswahl ?? 'neuester')
  const team = useLaden(ladeTeamErgebnisse, 'team')

  const d = dash.daten
  if (!d) return <LadeFehler laedt={dash.laedt} fehler={dash.fehler} neuLaden={dash.neuLaden} text="Dashboard wird geladen …" />

  const monat = d.monat
  const gewaehlt = ansicht === TEAM ? null : (d.personen.find((p) => p.id === ansicht)?.id ?? null)
  const rangliste = <Rangliste personen={d.personen} schwelle={schwellen.ausgewogen} gewaehlt={gewaehlt} onWahl={setAnsicht} />
  const teamMonat = monat ? team.daten?.detail[monat] : undefined

  const verlauf = (
    <Abschnitt titel="Verlauf des Teams" hinweis="Durchschnitt über alle Personen, je Monat.">
      {team.daten ? <VerlaufDiagramm verlauf={team.daten.verlauf} /> : team.fehler ? <Leer text="Der Verlauf konnte nicht geladen werden." /> : <Leer text="Verlauf wird geladen …" />}
    </Abschnitt>
  )

  return (
    <>
      <Seitenkopf titel="Team-Dashboard" text={monat ? `Auswertung für ${monatName(monat)}` : 'Hier erscheint die Auswertung, sobald die erste Umfrage abgegeben ist.'}>
        <MonatsAuswahl monate={d.monate} monat={monat} onWahl={setAuswahl} />
      </Seitenkopf>

      {dash.fehler && (
        <p className="hinweis hinweis-fehler">
          Der Monat konnte nicht geladen werden.{' '}
          <button type="button" className="btn btn-sekundaer btn-klein" onClick={dash.neuLaden}>
            Erneut versuchen
          </button>
        </p>
      )}

      {d.monate.length === 0 ? (
        <Abschnitt titel="Noch keine Ergebnisse">
          <p className="text-gedimmt">Sobald die ersten Umfragen abgegeben sind, erscheinen hier Rangliste, Heatmap und alle Auswertungen.</p>
        </Abschnitt>
      ) : (
        <div className={dash.laedt ? 'au-laedt' : undefined} aria-busy={dash.laedt}>
          <Tabs
            label="Ansicht wählen"
            aktiv={gewaehlt ?? TEAM}
            onWahl={setAnsicht}
            tabs={[{ id: TEAM, label: 'Team' }, ...d.personen.map((p) => ({ id: p.id, label: vornameVon(p.name) }))]}
          />
          {gewaehlt ? (
            <PersonTab key={gewaehlt} id={gewaehlt} monat={monat} schwellen={schwellen} rangliste={<Abschnitt titel="Rangliste">{rangliste}</Abschnitt>} />
          ) : (
            <TeamSicht
              d={d}
              schwellen={schwellen}
              rangliste={rangliste}
              rituale={teamMonat && hatTeamRituale(teamMonat.rituale) ? <RitualeTeam rituale={teamMonat.rituale} /> : undefined}
              teamVerlauf={verlauf}
            />
          )}
        </div>
      )}
    </>
  )
}
