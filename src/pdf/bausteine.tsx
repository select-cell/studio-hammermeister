// Gemeinsame Bausteine der PDF-Berichte: Seite mit Kopf und Fuß, Überschriften, Kacheln, Tabellen und Vektor-Diagramme.
import type { ReactNode } from 'react'
import { Image, Page, Path, Polyline, Rect, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import { BRAND } from '../config/brand'
import { datumDe } from '../lib/pdf'
import type { PdfLogo } from './logo'
import { SANS, SERIF } from './schriften'

export const F = BRAND.pdfFarben

export const s = StyleSheet.create({
  seite: { paddingTop: 66, paddingBottom: 54, paddingHorizontal: 40, fontFamily: SANS, fontSize: 9, color: F.text },
  kopf: { position: 'absolute', top: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 0.75, borderBottomColor: F.rand },
  kopfRechts: { fontSize: 8, color: F.muted },
  fuss: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 0.75, borderTopColor: F.rand, fontSize: 7.5, color: F.muted },
  kicker: { fontSize: 8, letterSpacing: 1.2, color: F.akzentDunkel, textTransform: 'uppercase', marginBottom: 4 },
  h1: { fontFamily: SERIF, fontSize: 26, lineHeight: 1.15, marginBottom: 3 },
  untertitel: { fontSize: 10.5, color: F.text2, marginBottom: 14 },
  h2: { fontFamily: SERIF, fontSize: 14.5, marginTop: 16, marginBottom: 6 },
  h3: { fontSize: 9.5, fontWeight: 500, marginTop: 8, marginBottom: 3 },
  klein: { fontSize: 8, color: F.text2 },
  gedimmt: { color: F.text2 },
  kacheln: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  kachel: { flexGrow: 1, flexBasis: 0, borderWidth: 0.75, borderColor: F.rand, borderRadius: 6, backgroundColor: F.flaeche, paddingVertical: 8, paddingHorizontal: 10 },
  kachelLabel: { fontSize: 7.5, color: F.text2, marginBottom: 3 },
  kachelWert: { fontFamily: SERIF, fontSize: 20, lineHeight: 1.1 },
  kachelSub: { fontSize: 7.5, color: F.text2, marginTop: 2 },
  tabelle: { borderWidth: 0.75, borderColor: F.rand, borderRadius: 4 },
  zeile: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: F.rand },
  zeileKopf: { backgroundColor: F.flaeche2, fontSize: 7.5, color: F.text2, fontWeight: 500 },
  zeileGruppe: { backgroundColor: F.flaeche, paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: F.rand, fontSize: 8, fontWeight: 500, color: F.akzentDunkel },
  zeileLetzte: { borderBottomWidth: 0 },
  zahl: { textAlign: 'right' },
  zitat: { marginBottom: 3, paddingLeft: 7, borderLeftWidth: 1.5, borderLeftColor: F.rand, color: F.text },
  leerLinie: { height: 18, borderBottomWidth: 0.5, borderBottomColor: F.muted },
})

/** Seite mit Logo im Kopf, Hinweis und Seitenzahl im Fuß. */
export function Blatt({ logo, salon, kopfText, erstellt, children }: { logo: PdfLogo | null; salon: string; kopfText: string; erstellt: string; children: ReactNode }) {
  return (
    <Page size="A4" style={s.seite}>
      <View style={s.kopf} fixed>
        {logo ? <Image src={logo.src} style={{ height: 22, width: 22 * logo.verhaeltnis }} /> : <Text style={{ fontFamily: SERIF, fontSize: 14 }}>{salon}</Text>}
        <Text style={s.kopfRechts}>{kopfText}</Text>
      </View>
      {/* Kein lineHeight an Seite oder Inhalt: Es wird in react-pdf vererbt, sprengt die Abstände und lässt die Fußzeile mit Seitenzahl verschwinden */}
      {children}
      <View style={s.fuss} fixed>
        <Text>Vertraulich – nur für Verantwortliche</Text>
        <Text>Erstellt am {datumDe(erstellt)}</Text>
        <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </View>
    </Page>
  )
}

export function Kachel({ label, wert, sub, farbe }: { label: string; wert: string; sub?: string; farbe?: string }) {
  return (
    <View style={s.kachel} wrap={false}>
      <Text style={s.kachelLabel}>{label}</Text>
      <Text style={[s.kachelWert, farbe ? { color: farbe } : {}]}>{wert}</Text>
      {sub ? <Text style={s.kachelSub}>{sub}</Text> : null}
    </View>
  )
}

export interface Spalte {
  /** Anteil an der Breite (flex) oder feste Breite in pt */
  flex?: number
  breite?: number
  rechts?: boolean
}

const zellStil = (sp: Spalte) => ({ ...(sp.breite ? { width: sp.breite } : { flexGrow: sp.flex ?? 1, flexBasis: 0 }), ...(sp.rechts ? s.zahl : {}) })

export function TabellenKopf({ spalten, titel }: { spalten: Spalte[]; titel: (string | null)[] }) {
  return (
    <View style={[s.zeile, s.zeileKopf]} wrap={false}>
      {spalten.map((sp, i) => (
        <Text key={i} style={zellStil(sp)}>
          {titel[i] ?? ''}
        </Text>
      ))}
    </View>
  )
}

export function TabellenZeile({ spalten, zellen, letzte, farben }: { spalten: Spalte[]; zellen: ReactNode[]; letzte?: boolean; farben?: (string | undefined)[] }) {
  return (
    <View style={letzte ? [s.zeile, s.zeileLetzte] : s.zeile} wrap={false}>
      {spalten.map((sp, i) => {
        const z = zellen[i]
        return typeof z === 'string' || typeof z === 'number' ? (
          <Text key={i} style={[zellStil(sp), farben?.[i] ? { color: farben[i] } : {}]}>
            {z}
          </Text>
        ) : (
          <View key={i} style={zellStil(sp)}>
            {z}
          </View>
        )
      })}
    </View>
  )
}

export function Gruppenkopf({ text }: { text: string }) {
  return (
    <View style={s.zeileGruppe} wrap={false} minPresenceAhead={30}>
      <Text>{text}</Text>
    </View>
  )
}

/** Zwei dünne Balken (Selbstbild, Fremdbild) auf der Skala 1 bis 5; Strichlinien bei den Schwellen. */
export function BalkenPaar({ sb, fb, breite = 90, hoch, niedrig }: { sb: number | null; fb: number | null; breite?: number; hoch: number; niedrig: number }) {
  const x = (w: number) => ((Math.min(Math.max(w, 1), 5) - 1) / 4) * breite
  return (
    <Svg width={breite} height={13} viewBox={`0 0 ${breite} 13`}>
      <Rect x={0} y={0} width={breite} height={13} fill={F.flaeche2} />
      {sb !== null && <Rect x={0} y={1.5} width={x(sb)} height={4.5} fill={F.selbstbild} />}
      {fb !== null && <Rect x={0} y={7} width={x(fb)} height={4.5} fill={F.fremdbild} />}
      <Rect x={x(niedrig) - 0.3} y={0} width={0.6} height={13} fill={F.muted} />
      <Rect x={x(hoch) - 0.3} y={0} width={0.6} height={13} fill={F.muted} />
    </Svg>
  )
}

export function Legende() {
  return (
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 5, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ width: 8, height: 8, backgroundColor: F.selbstbild }} />
        <Text style={s.klein}>Selbstbild</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ width: 8, height: 8, backgroundColor: F.fremdbild }} />
        <Text style={s.klein}>Fremdbild</Text>
      </View>
      <Text style={s.klein}>Skala 1 bis 5, graue Striche: Schwellen</Text>
    </View>
  )
}

/** Verlauf über die Monate als Linien (Selbstbild und Fremdbild), reine Vektorgrafik. */
export function Verlauf({ punkte, breite = 515, hoehe = 110 }: { punkte: { monat: string; sb: number | null; fb: number | null }[]; breite?: number; hoehe?: number }) {
  if (punkte.length < 2) return <Text style={s.klein}>Für einen Verlauf braucht es mindestens zwei Monate.</Text>
  const links = 26
  const rechts = 10
  const oben = 8
  const unten = 18
  const b = breite - links - rechts
  const h = hoehe - oben - unten
  const px = (i: number) => links + (punkte.length === 1 ? 0 : (i / (punkte.length - 1)) * b)
  const py = (w: number) => oben + h - ((Math.min(Math.max(w, 1), 5) - 1) / 4) * h
  const linie = (art: 'sb' | 'fb') =>
    punkte
      .map((p, i) => (p[art] === null ? null : `${px(i).toFixed(1)},${py(p[art] as number).toFixed(1)}`))
      .filter((x): x is string => x !== null)
      .join(' ')
  const kuerzel = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  return (
    <Svg width={breite} height={hoehe} viewBox={`0 0 ${breite} ${hoehe}`}>
      {[1, 2, 3, 4, 5].map((w) => (
        <Path key={w} d={`M ${links} ${py(w)} L ${links + b} ${py(w)}`} stroke={F.rand} strokeWidth={0.5} />
      ))}
      {[1, 2, 3, 4, 5].map((w) => (
        <Text key={`t${w}`} x={links - 6} y={py(w) + 2.5} style={{ fontSize: 7, fill: F.muted, fontFamily: SANS }} textAnchor="end">
          {String(w)}
        </Text>
      ))}
      <Polyline points={linie('sb')} stroke={F.selbstbild} strokeWidth={1.6} fill="none" />
      <Polyline points={linie('fb')} stroke={F.fremdbild} strokeWidth={1.6} fill="none" />
      {punkte.map((p, i) => (
        <Text key={p.monat} x={px(i)} y={hoehe - 5} style={{ fontSize: 7, fill: F.text2, fontFamily: SANS }} textAnchor="middle">
          {`${kuerzel[Number(p.monat.slice(5)) - 1]} ${p.monat.slice(2, 4)}`}
        </Text>
      ))}
    </Svg>
  )
}
