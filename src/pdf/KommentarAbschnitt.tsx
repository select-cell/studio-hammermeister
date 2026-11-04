// Abschnitt „Kommentare je Person“ im Monatsbericht (Kommentar-Auswertung, Erweiterung D). Nur Kennzahlen, nie Kommentartexte.
import { Text, View } from '@react-pdf/renderer'
import { prozent, woerterText, type KommentarAuswertung } from '../lib/kommentare'
import { s, TabellenKopf, TabellenZeile, type Spalte } from './bausteine'

const SPALTEN: Spalte[] = [{ flex: 3 }, { flex: 2, rechts: true }, { breite: 40, rechts: true }, { flex: 2, rechts: true }, { breite: 44, rechts: true }, { breite: 36, rechts: true }, { breite: 34, rechts: true }, { breite: 38, rechts: true }]

export default function KommentarAbschnitt({ daten }: { daten: KommentarAuswertung }) {
  const abgegeben = daten.personen.filter((p) => p.abgegeben)
  if (abgegeben.length === 0) return null
  return (
    <View>
      <Text style={s.h2} minPresenceAhead={80}>
        Kommentare je Person
      </Text>
      <Text style={[s.klein, { marginBottom: 5 }]}>
        Pflicht: Bewertung 4 oder 5, Kommentar vorgeschrieben. Freiwillig: Bewertung 1 bis 3. Die freiwillige Quote zeigt, wie gern jemand schreibt. Ohne Kommentartexte.
      </Text>
      <View style={s.tabelle}>
        <TabellenKopf spalten={SPALTEN} titel={['Person', 'Kommentare', 'Quote', 'Pflicht erfüllt', 'Freiw.-Quote', 'Ø Wörter', 'Kurz', 'Doppelt']} />
        {abgegeben.map((p, i) => (
          <TabellenZeile
            key={p.person_id}
            spalten={SPALTEN}
            zellen={[p.name, `${p.kommentare} von ${p.bewertungen}`, prozent(p.quote), `${p.pflicht_mit_kommentar} von ${p.pflicht}`, prozent(p.freiwillig_quote), woerterText(p.woerter_schnitt), prozent(p.kurz_anteil), String(p.duplikate)]}
            letzte={i === abgegeben.length - 1}
          />
        ))}
      </View>
      {daten.ohne_kommentare.length > 0 && <Text style={{ marginTop: 5 }}>Ohne einen Kommentar im Monat: {daten.ohne_kommentare.join(', ')}.</Text>}
      {daten.nicht_abgegeben.length > 0 && <Text style={{ marginTop: 3 }}>Nicht abgegeben: {daten.nicht_abgegeben.join(', ')}.</Text>}
    </View>
  )
}
