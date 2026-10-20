import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt, monatKurz, type VerlaufPunkt } from '../../lib/auswertung'
import { monatName } from '../../lib/monat'
import { Leer } from './Abschnitt'
import { FARBE } from './farben'

interface TooltipProps {
  active?: boolean
  payload?: { payload: VerlaufPunkt }[]
}

function TooltipInhalt({ active, payload }: TooltipProps) {
  const d = active ? payload?.[0]?.payload : undefined
  if (!d) return null
  return (
    <div className="au-tooltip">
      <strong>{monatName(d.monat)}</strong>
      <span style={{ color: FARBE.sb }}>Ø Selbstbild: {fmt(d.sb)}</span>
      <span style={{ color: FARBE.fb }}>Ø Fremdbild: {fmt(d.fb)}</span>
      {d.rituale !== null && <span style={{ color: 'var(--green)' }}>Ø Rituale: {fmt(d.rituale)}</span>}
    </div>
  )
}

/** Liniendiagramm über alle Monate: Ø Selbstbild, Ø Fremdbild und – falls vorhanden – Ø Rituale (§5.6). */
export default function VerlaufDiagramm({ verlauf }: { verlauf: VerlaufPunkt[] }) {
  if (verlauf.length === 0) return <Leer text="Der Verlauf entsteht, sobald die erste Umfrage ausgewertet ist." />
  const mitRituale = verlauf.some((v) => v.rituale !== null)
  const punkt = { r: 4, strokeWidth: 2, fill: '#fff' }

  return (
    <>
      <div className="au-diagramm" role="img" aria-label="Verlauf von Selbstbild, Fremdbild und Rituale über alle Monate">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={verlauf} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={FARBE.gitter} />
            <XAxis dataKey="monat" tickFormatter={monatKurz} tick={{ fontSize: 12, fill: FARBE.achse }} tickLine={false} axisLine={{ stroke: FARBE.gitter }} padding={{ left: 16, right: 16 }} />
            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: FARBE.achse }} tickLine={false} axisLine={false} />
            <Tooltip content={<TooltipInhalt />} />
            <Legend iconType="circle" itemSorter={null} wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="sb" name="Ø Selbstbild" stroke={FARBE.sb} strokeWidth={2.5} dot={{ ...punkt, stroke: FARBE.sb }} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="fb" name="Ø Fremdbild" stroke={FARBE.fb} strokeWidth={2.5} dot={{ ...punkt, stroke: FARBE.fb }} connectNulls isAnimationActive={false} />
            {mitRituale && (
              <Line type="monotone" dataKey="rituale" name="Ø Rituale" stroke={FARBE.rituale} strokeWidth={2.5} dot={{ ...punkt, stroke: FARBE.rituale }} connectNulls isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {verlauf.length === 1 && <p className="text-gedimmt text-klein">Mit jedem weiteren Monat wird aus dem Punkt eine Linie.</p>}
    </>
  )
}
