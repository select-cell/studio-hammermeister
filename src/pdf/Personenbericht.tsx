// Personenbericht (eine Person, ein Monat): Kennzahlen, Selbst- und Fremdbild je Verhalten, Vormonat, Verlauf,
// Kommentare der Kollegen OHNE Absender, Entwicklung des Monats und Platz für Vereinbarungen.
import type { ReactNode } from 'react'
import { Document, Text, View } from '@react-pdf/renderer'
import { einordnung, fmt, fmtDiff, gruppenTitel, hatSaeulen, niveau, sortiereVerhalten, type VerhaltenWert } from '../lib/auswertung'
import { monatName } from '../lib/monat'
import type { PdfPersonendaten } from '../lib/pdf'
import { BalkenPaar, Blatt, F, Gruppenkopf, Kachel, Legende, TabellenKopf, TabellenZeile, Verlauf, s, type Spalte } from './bausteine'
import type { PdfLogo } from './logo'

const SPALTEN_KENNZAHL: Spalte[] = [{ flex: 3 }, { flex: 1, rechts: true }, { flex: 1, rechts: true }, { flex: 1, rechts: true }]
const SPALTEN_VERHALTEN: Spalte[] = [{ breite: 20 }, { flex: 1 }, { breite: 30, rechts: true }, { breite: 30, rechts: true }, { breite: 34, rechts: true }, { breite: 38, rechts: true }, { breite: 80 }]

/** Veränderung zum Vormonat: „+0,12“, „−0,05“ oder „–“, wenn es keinen Vergleich gibt. */
const veraenderung = (jetzt: number | null | undefined, vorher: number | null | undefined) => (jetzt == null || vorher == null ? '–' : fmtDiff(Math.round((jetzt - vorher) * 100) / 100))

export interface PersonenberichtProps {
  daten: PdfPersonendaten
  logo: PdfLogo | null
  /** Einzelanalyse (freigegeben), sobald es sie gibt */
  analyse?: ReactNode
}

export default function Personenbericht({ daten: d, logo, analyse }: PersonenberichtProps) {
  const sw = d.schwellen
  const a = d.aktuell
  const v = d.vorher
  const monat = monatName(d.monat)
  const ein = einordnung(a.gesamt?.diff, sw.ausgewogen)
  const gruppen = sortiereVerhalten(a.verhalten, 'standard', (x) => x.fb)
  const mitSaeulen = hatSaeulen(a.verhalten)
  const vorherFb = new Map((v?.verhalten ?? []).map((x) => [x.nr, x.fb]))
  const mitKommentar = a.verhalten.filter((x) => x.kommentare.length > 0)
  const eigene = a.verhalten.filter((x) => x.sb_kommentar)
  const verlauf = d.verlauf.filter((p) => p.sb !== null || p.fb !== null)
  const kopf = `Personenbericht · ${d.person.name} · ${monat}`

  return (
    <Document title={`Personenbericht ${d.person.name} – ${monat}`} author={d.salon.name} subject="Personenbericht der Teamumfrage" language="de-DE">
      <Blatt logo={logo} salon={d.salon.name} kopfText={kopf} erstellt={d.erstellt_am}>
        <Text style={s.kicker}>Personenbericht</Text>
        <Text style={s.h1}>{d.person.name}</Text>
        <Text style={s.untertitel}>
          {monat} · {d.salon.name}
        </Text>

        <View style={s.kacheln}>
          <Kachel label="Selbstbild" wert={fmt(a.gesamt?.sb)} farbe={F.selbstbild} />
          <Kachel label="Ø Fremdbild" wert={fmt(a.gesamt?.fb)} farbe={F.fremdbild} sub={a.gesamt?.anzahl_fremdbilder ? `von ${a.gesamt.anzahl_fremdbilder} Kollegen` : undefined} />
          <Kachel label="Differenz (SB − FB)" wert={fmtDiff(a.gesamt?.diff)} farbe={ein ? (ein.ton === 'gut' ? F.gruen : F.rot) : undefined} sub={ein?.text} />
        </View>
        <Text style={[s.klein, { marginBottom: 2 }]}>
          Ausgewogen heißt: Selbst- und Fremdbild liegen höchstens {fmt(sw.ausgewogen, 1)} auseinander. Stufen nach Fremdbild: hoch ab {fmt(sw.hoch, 1)}, niedrig unter {fmt(sw.niedrig, 1)}.
        </Text>

        <Text style={s.h2}>Entwicklung zum Vormonat</Text>
        {d.vormonat && v ? (
          <View style={s.tabelle}>
            <TabellenKopf spalten={SPALTEN_KENNZAHL} titel={['Kennzahl', monatName(d.vormonat), monat, 'Veränderung']} />
            {(
              [
                ['Selbstbild', v.gesamt?.sb, a.gesamt?.sb],
                ['Ø Fremdbild', v.gesamt?.fb, a.gesamt?.fb],
                ['Differenz (SB − FB)', v.gesamt?.diff, a.gesamt?.diff],
              ] as [string, number | null | undefined, number | null | undefined][]
            ).map(([name, vor, jetzt], i, alle) => (
              <TabellenZeile key={name} spalten={SPALTEN_KENNZAHL} zellen={[name, name.startsWith('Diff') ? fmtDiff(vor) : fmt(vor), name.startsWith('Diff') ? fmtDiff(jetzt) : fmt(jetzt), veraenderung(jetzt, vor)]} letzte={i === alle.length - 1} />
            ))}
          </View>
        ) : (
          <Text style={s.gedimmt}>Für den Vormonat liegt keine Auswertung vor.</Text>
        )}

        <Text style={s.h2}>Verlauf</Text>
        <Legende />
        <Verlauf punkte={verlauf} />

        {d.entwicklung.nennungen > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>Entwicklung des Monats</Text>
            <Text style={{ marginBottom: 4 }}>
              {d.person.name} wurde von {d.entwicklung.nennungen} {d.entwicklung.nennungen === 1 ? 'Kollegen' : 'Kollegen'} für die Entwicklung des Monats genannt.
            </Text>
            {d.entwicklung.begruendungen.map((b, i) => (
              <Text key={i} style={s.zitat}>
                „{b}“
              </Text>
            ))}
          </View>
        )}
      </Blatt>

      <Blatt logo={logo} salon={d.salon.name} kopfText={kopf} erstellt={d.erstellt_am}>
        <Text style={[s.h2, { marginTop: 0 }]}>Selbstbild und Fremdbild je Verhalten</Text>
        <Legende />
        <View style={s.tabelle}>
          <TabellenKopf spalten={SPALTEN_VERHALTEN} titel={['Nr', 'Verhalten', 'SB', 'FB', 'Diff.', 'FB Vormonat', 'Skala 1 bis 5']} />
          {gruppen.map((g) => (
            <View key={g.schluessel}>
              {mitSaeulen && <Gruppenkopf text={gruppenTitel(g) ?? 'Ohne Säule'} />}
              {g.zeilen.map((x: VerhaltenWert) => {
                const n = niveau(x.fb, sw)
                const farbe = n === 'hoch' ? F.gruen : n === 'niedrig' ? F.rot : n === 'mittel' ? F.gelb : undefined
                return (
                  <TabellenZeile
                    key={x.nr}
                    spalten={SPALTEN_VERHALTEN}
                    zellen={[String(x.nr), x.titel, fmt(x.sb, 0), fmt(x.fb), fmtDiff(x.diff), v ? fmt(vorherFb.get(x.nr)) : '–', <BalkenPaar key="b" sb={x.sb} fb={x.fb} hoch={sw.hoch} niedrig={sw.niedrig} breite={80} />]}
                    farben={[F.muted, undefined, undefined, farbe, undefined, F.text2, undefined]}
                  />
                )
              })}
            </View>
          ))}
        </View>
      </Blatt>

      <Blatt logo={logo} salon={d.salon.name} kopfText={kopf} erstellt={d.erstellt_am}>
        <Text style={[s.h2, { marginTop: 0 }]}>Kommentare der Kollegen</Text>
        <Text style={[s.klein, { marginBottom: 6 }]}>Ohne Angabe, wer sie geschrieben hat. Sortiert nach Verhalten, innerhalb eines Verhaltens von der höchsten Bewertung abwärts.</Text>
        {mitKommentar.length === 0 && <Text style={s.gedimmt}>In diesem Monat gibt es keine Kommentare.</Text>}
        {mitKommentar.map((x) => {
          const [erste, ...weitere] = [...x.kommentare].sort((p, q) => q.note - p.note)
          const zitat = (k: { note: number; text: string }, i: number) => (
            <Text key={i} style={s.zitat}>
              „{k.text}“ <Text style={{ color: F.muted }}>(Bewertung {k.note})</Text>
            </Text>
          )
          return (
            <View key={x.nr} style={{ marginBottom: 7 }}>
              {/* Überschrift und erster Kommentar bleiben zusammen, damit die Überschrift nie allein am Seitenende steht */}
              <View wrap={false}>
                <Text style={s.h3}>
                  {x.nr}. {x.titel}
                </Text>
                {zitat(erste, 0)}
              </View>
              {weitere.map((k, i) => zitat(k, i + 1))}
            </View>
          )
        })}

        {eigene.length > 0 && (
          <View>
            <Text style={s.h2}>Eigene Kommentare zum Selbstbild</Text>
            {eigene.map((x) => (
              <View key={x.nr} style={{ marginBottom: 5 }} wrap={false}>
                <Text style={s.h3}>
                  {x.nr}. {x.titel}
                </Text>
                <Text style={s.zitat}>„{x.sb_kommentar}“</Text>
              </View>
            ))}
          </View>
        )}
      </Blatt>

      <Blatt logo={logo} salon={d.salon.name} kopfText={kopf} erstellt={d.erstellt_am}>
        {analyse}
        <View wrap={false}>
          <Text style={[s.h2, analyse ? {} : { marginTop: 0 }]}>Entwicklungsfrage und Vereinbarungen</Text>
          <Text style={[s.gedimmt, { marginBottom: 4 }]}>Woran arbeitet {d.person.name} im nächsten Monat? Was wird konkret vereinbart?</Text>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <View key={i} style={s.leerLinie} />
          ))}
          <Text style={[s.gedimmt, { marginTop: 12 }]}>Datum und Unterschriften</Text>
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 24 }}>
            <View style={[s.leerLinie, { flexGrow: 1, flexBasis: 0 }]} />
            <View style={[s.leerLinie, { flexGrow: 1, flexBasis: 0 }]} />
          </View>
        </View>
      </Blatt>
    </Document>
  )
}
