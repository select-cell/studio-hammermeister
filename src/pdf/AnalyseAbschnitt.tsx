// Abschnitt „Einzelanalyse“ im Personenbericht: nur eine freigegebene Analyse, mit dem Hinweis, wer sie freigegeben hat.
import { Text, View } from '@react-pdf/renderer'
import { markdownBloecke, type Analyse } from '../lib/abschluss'
import { datumDe } from '../lib/pdf'
import { F, s } from './bausteine'

export default function AnalyseAbschnitt({ analyse }: { analyse: Analyse }) {
  const bloecke = markdownBloecke(analyse.text_md)
  return (
    <View>
      <Text style={[s.h2, { marginTop: 0 }]}>Einzelanalyse</Text>
      <Text style={[s.klein, { marginBottom: 6 }]}>
        Von der KI formuliert, von {analyse.freigegeben_von ?? 'der Leitung'}
        {analyse.freigegeben_am ? ` am ${datumDe(analyse.freigegeben_am.slice(0, 10))}` : ''} freigegeben. Alle Zahlen stammen aus der Datenbank.
        {analyse.geprueft ? '' : ' Der automatische Faktencheck hat eine Abweichung gemeldet.'}
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
          <Text key={i} style={{ marginBottom: 4 }}>
            {b.text}
          </Text>
        ),
      )}
    </View>
  )
}
