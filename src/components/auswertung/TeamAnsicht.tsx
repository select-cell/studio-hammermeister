import { balkenDaten, type Schwellen, type TeamErgebnisse } from '../../lib/auswertung'
import { monatName } from '../../lib/monat'
import Abschnitt, { Leer } from './Abschnitt'
import DetailtabelleSbFb from './DetailtabelleSbFb'
import Entwicklung from './Entwicklung'
import KennzahlKacheln from './KennzahlKacheln'
import { hatTeamRituale, RitualeTeam } from './Rituale'
import SbFbDiagramm from './SbFbDiagramm'
import TopFlop from './TopFlop'
import VerlaufDiagramm from './VerlaufDiagramm'

/** Team-Ergebnisse für Teammitglieder: nur Schnitte, keine einzelnen Personen (§5.6). */
export default function TeamAnsicht({ daten, monat, schwellen }: { daten: TeamErgebnisse; monat: string | null; schwellen: Schwellen }) {
  if (daten.monate.length === 0) {
    return (
      <Abschnitt titel="Noch keine Ergebnisse">
        <p className="text-gedimmt">Sobald die ersten Umfragen abgegeben sind, siehst du hier, wie das Team insgesamt dasteht.</p>
      </Abschnitt>
    )
  }
  const mo = monat ? daten.detail[monat] : undefined
  const bal = mo ? balkenDaten(mo.saeulen, mo.verhalten) : null

  return (
    <>
      {!mo ? (
        <Abschnitt titel={monat ? monatName(monat) : 'Monat'}>
          <Leer text={`Für ${monat ? monatName(monat) : 'diesen Monat'} liegen noch keine Werte vor.`} />
        </Abschnitt>
      ) : (
        <>
          <KennzahlKacheln
            teamSicht
            sb={mo.gesamt?.sb ?? null}
            fb={mo.gesamt?.fb ?? null}
            diff={mo.gesamt?.diff ?? null}
            dauerMin={mo.dauer_min}
            schwelle={schwellen.ausgewogen}
            fremdbilder={mo.gesamt?.personen ? `über ${mo.gesamt.personen} Personen` : undefined}
          />
          <Abschnitt
            titel={bal?.art === 'saeulen' ? 'Selbstbild und Fremdbild je Säule' : 'Selbstbild und Fremdbild je Verhalten'}
            hinweis={`Durchschnitt des Teams – jede Person zählt gleich viel. Abgegeben haben ${mo.abgaben ?? 0} von ${daten.teilnehmer}.`}
          >
            <SbFbDiagramm daten={bal?.daten ?? []} beschreibung="Selbstbild und Fremdbild des Teams" />
          </Abschnitt>
          <Abschnitt titel="Top und Flop Verhalten im Team" hinweis="Nach dem Fremdbild.">
            <TopFlop zeilen={mo.verhalten} />
          </Abschnitt>
          <Abschnitt titel="Detailtabelle" hinweis="Team-Durchschnitt je Verhalten.">
            <DetailtabelleSbFb zeilen={mo.verhalten} schwellen={schwellen} rituale={hatTeamRituale(mo.rituale) ? <RitualeTeam rituale={mo.rituale} /> : undefined} />
          </Abschnitt>
          <Entwicklung eintraege={mo.entwicklung} />
        </>
      )}
      <Abschnitt titel="Verlauf des Teams" hinweis="Durchschnitt über alle Personen, je Monat.">
        <VerlaufDiagramm verlauf={daten.verlauf} />
      </Abschnitt>
    </>
  )
}

