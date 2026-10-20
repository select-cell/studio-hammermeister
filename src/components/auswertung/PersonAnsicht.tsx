import type { ReactNode } from 'react'
import { balkenDaten, vornameVon, type PersonErgebnisse, type Schwellen } from '../../lib/auswertung'
import { monatName } from '../../lib/monat'
import Abschnitt, { Leer } from './Abschnitt'
import DetailtabelleSbFb from './DetailtabelleSbFb'
import KennzahlKacheln from './KennzahlKacheln'
import MonatsDetail from './MonatsDetail'
import { RitualeEinzel } from './Rituale'
import SbFbDiagramm from './SbFbDiagramm'
import TopFlop from './TopFlop'
import VerlaufDiagramm from './VerlaufDiagramm'

/**
 * Alle Bausteine für eine einzelne Person und den gewählten Monat (§5.6, Personen-Sicht).
 * Genutzt für „Meine Ergebnisse“, die Mitglieder-Seiten und die Personen-Tabs im Team-Dashboard.
 */
export default function PersonAnsicht({
  daten,
  monat,
  schwellen,
  eigene = false,
  nachKacheln,
}: {
  daten: PersonErgebnisse
  monat: string | null
  schwellen: Schwellen
  eigene?: boolean
  /** z. B. die Rangliste im Team-Dashboard */
  nachKacheln?: ReactNode
}) {
  if (daten.monate.length === 0) {
    return (
      <Abschnitt titel="Noch keine Ergebnisse">
        <p className="text-gedimmt">
          {eigene ? 'Sobald die ersten Umfragen abgegeben sind, siehst du hier dein Selbstbild und dein Fremdbild.' : `Für ${daten.person.name} liegen noch keine Umfrage-Ergebnisse vor.`}
        </p>
      </Abschnitt>
    )
  }

  const mo = monat ? daten.detail[monat] : undefined
  const wer = eigene ? 'dich' : daten.person.name
  const bal = mo ? balkenDaten(mo.saeulen, mo.verhalten) : null

  return (
    <>
      {!daten.absender_sichtbar && !eigene && (
        <p className="hinweis hinweis-warnung">Die Absender der Kommentare sind für diese Ansicht ausgeblendet.</p>
      )}

      {!mo ? (
        <Abschnitt titel={monat ? monatName(monat) : 'Monat'}>
          <Leer text={`Für ${monat ? monatName(monat) : 'diesen Monat'} liegen noch keine Werte vor.`} />
        </Abschnitt>
      ) : (
        <>
          <KennzahlKacheln
            sb={mo.gesamt?.sb ?? null}
            fb={mo.gesamt?.fb ?? null}
            diff={mo.gesamt?.diff ?? null}
            dauerMin={mo.dauer_min}
            schwelle={schwellen.ausgewogen}
            fremdbilder={mo.gesamt?.anzahl_fremdbilder ? `von ${mo.gesamt.anzahl_fremdbilder} Kolleg:innen` : undefined}
          />
          {nachKacheln}
          <Abschnitt
            titel={bal?.art === 'saeulen' ? 'Selbstbild und Fremdbild je Säule' : 'Selbstbild und Fremdbild je Verhalten'}
            hinweis={`Kupfer zeigt, wie ${eigene ? 'du dich' : `${vornameVon(daten.person.name)} sich`} sieht, Blau, wie die Kolleg:innen ${wer} sehen.`}
          >
            <SbFbDiagramm daten={bal?.daten ?? []} beschreibung={`Selbstbild und Fremdbild von ${daten.person.name}`} />
          </Abschnitt>
          <Abschnitt titel="Top und Flop Verhalten" hinweis="Nach dem Fremdbild – so nehmen die anderen es wahr.">
            <TopFlop zeilen={mo.verhalten} />
          </Abschnitt>
          <Abschnitt titel="Detailtabelle">
            <DetailtabelleSbFb zeilen={mo.verhalten} schwellen={schwellen} rituale={mo.rituale.length > 0 ? <RitualeEinzel rituale={mo.rituale} /> : undefined} />
          </Abschnitt>
        </>
      )}

      <Abschnitt titel="Verlauf" hinweis="Durchschnitt über alle Verhalten, je Monat.">
        <VerlaufDiagramm verlauf={daten.verlauf} />
      </Abschnitt>
      <Abschnitt titel="Monats-Detail" hinweis={daten.ohne_fremdkommentare ? 'Jedes Verhalten mit Score und deinem Kommentar.' : 'Jedes Verhalten mit Score und Kommentaren.'}>
        <MonatsDetail
          key={monat ?? 'keiner'}
          monate={daten.monate}
          detail={daten.detail}
          start={monat}
          schwellen={schwellen}
          absenderSichtbar={daten.absender_sichtbar}
          ohneFremdkommentare={daten.ohne_fremdkommentare === true}
        />
      </Abschnitt>
    </>
  )
}
