import { Bar, BarChart, Cell, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { einordnung, fmtDiff } from '../../lib/auswertung'
import { Leer } from './Abschnitt'
import { FARBE } from './farben'

export interface DifferenzDatum {
  name: string
  titel: string
  diff: number | null
}

interface TooltipProps {
  active?: boolean
  payload?: { payload: DifferenzDatum }[]
  schwelle: number
}

function TooltipInhalt({ active, payload, schwelle }: Partial<TooltipProps>) {
  const d = active ? payload?.[0]?.payload : undefined
  if (!d) return null
  const ein = einordnung(d.diff, schwelle ?? 0.3)
  return (
    <div className="au-tooltip">
      <strong>{d.titel}</strong>
      <span>Differenz: {fmtDiff(d.diff)}</span>
      {ein && <span style={{ color: ein.ton === 'gut' ? 'var(--green)' : 'var(--red)' }}>{ein.text}</span>}
    </div>
  )
}

/** Balken Selbstbild − Fremdbild je Person; grün im Korridor „Ausgewogen“, sonst rot (§5.6). */
export default function DifferenzDiagramm({ daten, schwelle }: { daten: DifferenzDatum[]; schwelle: number }) {
  const mitWert = daten.filter((d) => d.diff !== null)
  if (mitWert.length === 0) return <Leer text="Für diesen Monat liegen noch keine Werte vor." />
  const groesste = Math.max(...mitWert.map((d) => Math.abs(d.diff as number)), schwelle * 2)
  const grenze = Math.ceil(groesste * 2) / 2
  const lang = mitWert.some((d) => d.name.length > 6)

  return (
    <div className="au-diagramm" role="img" aria-label="Differenz zwischen Selbstbild und Fremdbild je Person">
      <ResponsiveContainer width="100%" height={lang ? 290 : 240}>
        <BarChart data={mitWert} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={FARBE.gitter} />
          <ReferenceArea y1={-schwelle} y2={schwelle} fill={FARBE.korridor} ifOverflow="visible" />
          <ReferenceLine y={0} stroke={FARBE.achse} />
          <XAxis
            dataKey="name"
            interval={0}
            tick={{ fontSize: 12, fill: FARBE.achse }}
            angle={lang ? -35 : 0}
            textAnchor={lang ? 'end' : 'middle'}
            height={lang ? 64 : 30}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[-grenze, grenze]}
            ticks={[-grenze, -grenze / 2, 0, grenze / 2, grenze]}
            tickFormatter={(v: number) => (v === 0 ? '0' : fmtDiff(v))}
            tick={{ fontSize: 12, fill: FARBE.achse }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<TooltipInhalt schwelle={schwelle} />} cursor={{ fill: FARBE.cursor }} />
          <Bar dataKey="diff" name="Differenz" radius={[4, 4, 4, 4]} minPointSize={3} isAnimationActive={false}>
            {mitWert.map((d) => (
              <Cell key={d.name} fill={einordnung(d.diff, schwelle)?.ton === 'gut' ? FARBE.gut : FARBE.schlecht} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="au-legende">
        <span className="au-legende-eintrag">
          <span className="au-punkt au-punkt-gut" /> Ausgewogen (bis ±{String(schwelle).replace('.', ',')})
        </span>
        <span className="au-legende-eintrag">
          <span className="au-punkt au-punkt-schlecht" /> Selbstüber- oder -unterschätzung
        </span>
      </p>
    </div>
  )
}
