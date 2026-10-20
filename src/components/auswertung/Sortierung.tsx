import type { Sortierung } from '../../lib/auswertung'

const OPTIONEN: { id: Sortierung; label: string }[] = [
  { id: 'standard', label: 'Standard (nach Säulen)' },
  { id: 'hoechste', label: 'Höchste zuerst' },
  { id: 'niedrigste', label: 'Niedrigste zuerst' },
]

export default function SortierungAuswahl({ wert, onWahl, id }: { wert: Sortierung; onWahl: (s: Sortierung) => void; id: string }) {
  return (
    <div className="au-sortierung">
      <label htmlFor={id}>Sortierung</label>
      <select id={id} value={wert} onChange={(e) => onWahl(e.target.value as Sortierung)}>
        {OPTIONEN.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
