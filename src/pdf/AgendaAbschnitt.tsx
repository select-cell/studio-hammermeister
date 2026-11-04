// Abschnitt „Agenda für das Teammeeting“ im Monatsbericht: nur eine freigegebene Agenda, ohne Kommentar-Beispiele.
import { Text, View } from '@react-pdf/renderer'
import { ohneBeispiele } from '../lib/agenda'
import { markdownBloecke, type Analyse } from '../lib/abschluss'
import { datumDe } from '../lib/pdf'
import { F, s } from './bausteine'

export default function AgendaAbschnitt({ agenda }: { agenda: Analyse }) {
  const bloecke = markdownBloecke(ohneBeispiele(agenda.text_md)).filter((b) => !(b.art === 'ueberschrift' && b.text.startsWith('Agenda für das Teammeeting')))
  if (bloecke.length === 0) return null
  return (
    <View>
      <Text style={s.h2} minPresenceAhead={80}>
        Agenda für das Teammeeting
      </Text>
      <Text style={[s.klein, { marginBottom: 6 }]}>
        Von {agenda.freigegeben_von ?? 'der Leitung'}
        {agenda.freigegeben_am ? ` am ${datumDe(agenda.freigegeben_am.slice(0, 10))}` : ''} freigegeben. Nur Zahlen und Themen des Teams, ohne Kommentare.
      </Text>
      {bloecke.map((b, i) =>
        b.art === 'ueberschrift' ? (
          <Text key={i} style={s.h3} minPresenceAhead={30}>
            {b.text}
          </Text>
        ) : b.art === 'liste' ? (
          <View key={i} style={{ marginBottom: 3 }}>
            {b.punkte.map((p, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: 5, marginBottom: 2 }} wrap={false}>
                <Text style={{ color: F.akzent }}>•</Text>
                <Text style={{ flex: 1 }}>{p}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text key={i} style={[{ marginBottom: 4 }, b.art === 'hinweis' ? { color: F.text2 } : {}]}>
            {b.text}
          </Text>
        ),
      )}
    </View>
  )
}
