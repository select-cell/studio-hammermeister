import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt, type BalkenDatum } from '../../lib/auswertung'
import { Leer } from './Abschnitt'
import { FARBE } from './farben'

interface TooltipProps {
  active?: boolean
  payload?: { payload: BalkenDatum }[]
}

function TooltipInhalt({ active, payload }: TooltipProps) {
  const d = active ? payload?.[0]?.payload : undefined
  if (!d) return null
  return (
    <div className="au-tooltip">
      <strong>{d.titel}</strong>
      <span style={{ color: FARBE.sb }}>Selbstbild: {fmt(d.sb)}</span>
      <span style={{ color: FARBE.fb }}>Fremdbild: {fmt(d.fb)}</span>
    </div>
  )
}

const kurz = (text: string) => (text.length > 14 ? `${text.slice(0, 13)}…` : text)

/** Gruppiertes Balkendiagramm: Kupfer = Selbstbild, Blau = Fremdbild (§5.6). */
export default function SbFbDiagramm({ daten, beschreibung }: { daten: BalkenDatum[]; beschreibung: string }) {
  if (!daten.some((d) => d.sb !== null || d.fb !== null)) return <Leer text="Für diesen Monat liegen noch keine Werte vor." />
  const lang = daten.some((d) => d.name.length > 6)
  return (
    <div className="au-diagramm" role="img" aria-label={beschreibung}>
      <ResponsiveContainer width="100%" height={lang ? 320 : 280}>
        <BarChart data={daten} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={FARBE.gitter} />
          <XAxis
            dataKey="name"
            interval={0}
            tickFormatter={kurz}
            tick={{ fontSize: 12, fill: FARBE.achse }}
            angle={lang ? -35 : 0}
            textAnchor={lang ? 'end' : 'middle'}
            height={lang ? 64 : 30}
            tickLine={false}
            axisLine={{ stroke: FARBE.gitter }}
          />
          <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: FARBE.achse }} tickLine={false} axisLine={false} />
          <Tooltip content={<TooltipInhalt />} cursor={{ fill: FARBE.cursor }} />
          <Legend iconType="circle" itemSorter={null} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="sb" name="Selbstbild" fill={FARBE.sb} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="fb" name="Fremdbild" fill={FARBE.fb} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
