import { fmt, gruppenTitel, topFlop } from '../../lib/auswertung'
import { Leer } from './Abschnitt'

interface Zeile {
  nr: number
  titel: string
  grundpfeiler: string | null
  saeule: string | null
  fb: number | null
  sb?: number | null
}

function Liste({ titel, zeilen, ton, nach }: { titel: string; zeilen: Zeile[]; ton: 'top' | 'flop'; nach: 'fb' | 'sb' }) {
  return (
    <div className={`au-topflop-spalte au-topflop-${ton}`}>
      <h3 className="au-topflop-titel">{titel}</h3>
      <ol className="au-topflop-liste">
        {zeilen.map((z) => (
          <li key={z.nr}>
            <span className="au-topflop-text">
              <span className="au-topflop-name">
                {z.nr}. {z.titel}
              </span>
              {gruppenTitel(z) && <span className="au-topflop-saeule">{gruppenTitel(z)}</span>}
            </span>
            <strong className="au-topflop-wert">{fmt(z[nach] ?? null)}</strong>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Die höchsten und niedrigsten Verhalten nach Ø Fremdbild (oder nach dem Selbstbild), mit Säule (§5.6). */
export default function TopFlop({ zeilen, n = 4, nach = 'fb' }: { zeilen: Zeile[]; n?: number; nach?: 'fb' | 'sb' }) {
  const { top, flop } = topFlop(zeilen, n, (z) => z[nach] ?? null)
  if (top.length === 0) return <Leer text={nach === 'sb' ? 'Dafür sind noch zu wenige Antworten da.' : 'Dafür sind noch zu wenige Fremdbilder da.'} />
  return (
    <div className="au-topflop">
      <Liste titel={`Top ${top.length}`} zeilen={top} ton="top" nach={nach} />
      <Liste titel={`Flop ${flop.length}`} zeilen={flop} ton="flop" nach={nach} />
    </div>
  )
}
