import { monatName } from '../../lib/monat'

/** Monatsauswahl oben auf jeder Auswertungsseite: Auswahlfeld plus Vor/Zurück. `monate` ist aufsteigend sortiert. */
export default function MonatsAuswahl({
  monate,
  monat,
  onWahl,
  id = 'au-monat',
}: {
  monate: string[]
  monat: string | null
  onWahl: (monat: string) => void
  id?: string
}) {
  if (monate.length === 0) return null
  const index = monat ? monate.indexOf(monat) : -1
  const frueher = index > 0 ? monate[index - 1] : null
  const spaeter = index >= 0 && index < monate.length - 1 ? monate[index + 1] : null

  return (
    <div className="au-monat">
      <label htmlFor={id} className="au-monat-label">
        Monat
      </label>
      <button type="button" className="btn btn-sekundaer btn-klein" aria-label="Vorheriger Monat" disabled={!frueher} onClick={() => frueher && onWahl(frueher)}>
        ‹
      </button>
      <select id={id} className="au-monat-feld" value={monat ?? ''} onChange={(e) => onWahl(e.target.value)}>
        {[...monate].reverse().map((m) => (
          <option key={m} value={m}>
            {monatName(m)}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-sekundaer btn-klein" aria-label="Nächster Monat" disabled={!spaeter} onClick={() => spaeter && onWahl(spaeter)}>
        ›
      </button>
    </div>
  )
}
