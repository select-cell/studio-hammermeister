// Monatsbericht (Team, ein Monat): Beteiligung, Kennzahlen, Ergebnis je Verhalten, Stärken und Entwicklungsfelder.
import type { ReactNode } from 'react'
import { Document, Text, View } from '@react-pdf/renderer'
import { tageText, type StatusPerson } from '../lib/abgabe'
import { einordnung, fmt, fmtDiff, gruppenTitel, hatSaeulen, niveau, sortiereVerhalten, topFlop, type DashboardVerhalten, type Niveau } from '../lib/auswertung'
import { monatName, fristEnde } from '../lib/monat'
import type { PdfMonatsdaten } from '../lib/pdf'
import { BalkenPaar, Blatt, F, Gruppenkopf, Kachel, Legende, TabellenKopf, TabellenZeile, s, type Spalte } from './bausteine'
import type { PdfLogo } from './logo'

const NIVEAU_TEXT: Record<Niveau, string> = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' }
const NIVEAU_FARBE: Record<Niveau, string> = { hoch: F.gruen, mittel: F.gelb, niedrig: F.rot }

function statusText(p: StatusPerson): string {
  if (p.abgegeben) return p.verspaetet ? 'Abgegeben (verspätet)' : 'Abgegeben, pünktlich'
  if (!p.erwartet) return 'Noch nicht gefordert'
  return p.ueberfaellig ? `Offen, ${tageText(p.tage_ueberfaellig)} überfällig` : 'Offen, Frist läuft'
}

const SPALTEN_BETEILIGUNG: Spalte[] = [{ flex: 3 }, { flex: 3 }]
const SPALTEN_VERHALTEN: Spalte[] = [{ breite: 20 }, { flex: 1 }, { breite: 32, rechts: true }, { breite: 32, rechts: true }, { breite: 36, rechts: true }, { breite: 98 }]

export interface MonatsberichtProps {
  daten: PdfMonatsdaten
  logo: PdfLogo | null
  /** Weitere Abschnitte hinter dem Ergebnis je Verhalten (Kommentar-Auswertung, Agenda) */
  zusatz?: ReactNode
}

export default function Monatsbericht({ daten: d, logo, zusatz }: MonatsberichtProps) {
  const sw = d.schwellen
  const dash = d.dashboard
  const t = dash.team
  const monat = monatName(d.monat)
  const ein = einordnung(t?.diff, sw.ausgewogen)
  const nv = niveau(t?.fb, sw)
  const b = d.beteiligung
  const verhalten: DashboardVerhalten[] = dash.verhalten
  const gruppen = sortiereVerhalten(verhalten, 'standard', (v) => v.team_fb)
  const mitSaeulen = hatSaeulen(verhalten)
  const { top, flop } = topFlop(verhalten.map((v) => ({ nr: v.nr, titel: v.titel, grundpfeiler: v.grundpfeiler, saeule: v.saeule, fb: v.team_fb })), 3)

  return (
    <Document title={`Monatsbericht ${monat} – ${d.salon.name}`} author={d.salon.name} subject="Monatsbericht der Teamumfrage" language="de-DE">
      <Blatt logo={logo} salon={d.salon.name} kopfText={`Monatsbericht · ${monat}`} erstellt={d.erstellt_am}>
        <Text style={s.kicker}>Monatsbericht</Text>
        <Text style={s.h1}>{monat}</Text>
        <Text style={s.untertitel}>{d.salon.name} · Teamumfrage</Text>

        <View style={s.kacheln}>
          <Kachel label="Ø Selbstbild" wert={fmt(t?.sb)} farbe={F.selbstbild} />
          <Kachel label="Ø Fremdbild" wert={fmt(t?.fb)} farbe={F.fremdbild} sub={nv ? `Stufe ${NIVEAU_TEXT[nv]}` : undefined} />
          <Kachel label="Differenz (SB − FB)" wert={fmtDiff(t?.diff)} farbe={ein ? (ein.ton === 'gut' ? F.gruen : F.rot) : undefined} sub={ein?.text} />
        </View>
        <Text style={[s.klein, { marginBottom: 2 }]}>
          Stufen nach Fremdbild: hoch ab {fmt(sw.hoch, 1)}, mittel von {fmt(sw.niedrig, 1)} bis unter {fmt(sw.hoch, 1)}, niedrig unter {fmt(sw.niedrig, 1)}. Ausgewogen heißt: Selbst- und Fremdbild liegen höchstens {fmt(sw.ausgewogen, 1)} auseinander.
        </Text>

        <Text style={s.h2}>Beteiligung</Text>
        <Text style={{ marginBottom: 5 }}>
          {b.abgegeben} von {b.erwartet} haben abgegeben{b.frist ? ` (Frist ${fristEnde(d.monat)})` : ''}
          {b.offen > 0 ? `, ${b.offen} offen` : ''}
          {b.ueberfaellig > 0 ? `, davon ${b.ueberfaellig} überfällig` : ''}.
        </Text>
        <View style={s.tabelle}>
          <TabellenKopf spalten={SPALTEN_BETEILIGUNG} titel={['Name', 'Stand']} />
          {b.personen
            .filter((p) => p.erwartet || p.abgegeben)
            .map((p, i, alle) => (
              <TabellenZeile
                key={p.id}
                spalten={SPALTEN_BETEILIGUNG}
                zellen={[p.name, statusText(p)]}
                farben={[undefined, p.abgegeben ? (p.verspaetet ? F.gelb : F.gruen) : p.ueberfaellig ? F.rot : F.text2]}
                letzte={i === alle.length - 1}
              />
            ))}
        </View>

        <Text style={s.h2}>Kommentare und Ausfüllzeit</Text>
        <View style={s.kacheln}>
          <Kachel
            label="Kommentar-Quote im Team"
            wert={d.kommentare.quote === null ? '–' : `${fmt(d.kommentare.quote, 1)} %`}
            sub={`${d.kommentare.kommentare} Kommentare zu ${d.kommentare.bewertungen} Bewertungen`}
          />
          <Kachel label="Pflichtkommentare (ab Bewertung 4)" wert={`${d.kommentare.pflicht_mit_kommentar} von ${d.kommentare.pflicht}`} sub={`freiwillig: ${d.kommentare.freiwillig}`} />
          <Kachel label="Aktive Ausfüllzeit (Median)" wert={d.zeit.median_aktiv_min === null ? '–' : `${fmt(d.zeit.median_aktiv_min, 1)} Min`} sub={d.zeit.abgaben ? `aus ${d.zeit.abgaben} gültigen Abgaben` : 'keine Zeitmessung'} />
        </View>
      </Blatt>

      <Blatt logo={logo} salon={d.salon.name} kopfText={`Monatsbericht · ${monat}`} erstellt={d.erstellt_am}>
        <Text style={[s.h2, { marginTop: 0 }]}>Ergebnis je Verhalten</Text>
        <Legende />
        <View style={s.tabelle}>
          <TabellenKopf spalten={SPALTEN_VERHALTEN} titel={['Nr', 'Verhalten', 'SB', 'FB', 'Diff.', 'Skala 1 bis 5']} />
          {gruppen.map((g) => (
            <View key={g.schluessel}>
              {mitSaeulen && <Gruppenkopf text={gruppenTitel(g) ?? 'Ohne Säule'} />}
              {g.zeilen.map((v) => {
                const n = niveau(v.team_fb, sw)
                return (
                  <TabellenZeile
                    key={v.nr}
                    spalten={SPALTEN_VERHALTEN}
                    zellen={[String(v.nr), v.titel, fmt(v.team_sb), fmt(v.team_fb), fmtDiff(v.team_diff), <BalkenPaar key="b" sb={v.team_sb} fb={v.team_fb} hoch={sw.hoch} niedrig={sw.niedrig} />]}
                    farben={[F.muted, undefined, undefined, n ? NIVEAU_FARBE[n] : undefined, undefined, undefined]}
                  />
                )
              })}
            </View>
          ))}
        </View>

        {top.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>Stärken und Entwicklungsfelder</Text>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ flexGrow: 1, flexBasis: 0 }}>
                <Text style={s.h3}>Stärken (höchstes Fremdbild)</Text>
                {top.map((z) => (
                  <Text key={z.nr} style={{ marginBottom: 2 }}>
                    {z.nr}. {z.titel} <Text style={{ color: F.gruen, fontWeight: 500 }}>{fmt(z.fb)}</Text>
                  </Text>
                ))}
              </View>
              <View style={{ flexGrow: 1, flexBasis: 0 }}>
                <Text style={s.h3}>Entwicklungsfelder (niedrigstes Fremdbild)</Text>
                {flop.map((z) => (
                  <Text key={z.nr} style={{ marginBottom: 2 }}>
                    {z.nr}. {z.titel} <Text style={{ color: F.rot, fontWeight: 500 }}>{fmt(z.fb)}</Text>
                  </Text>
                ))}
              </View>
            </View>
          </View>
        )}
        {zusatz}
      </Blatt>
    </Document>
  )
}
