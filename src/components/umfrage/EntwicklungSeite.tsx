import { initiale } from '../../lib/rechte'
import { entwicklungFertig, type Antworten, type Kollege } from '../../lib/umfrage'

/** Schritt 1: Entwicklung des Monats. Auswahl nur unter den Kollegen, man selbst steht nicht zur Wahl. */
export default function EntwicklungSeite({
  kollegen,
  antworten,
  onWaehle,
  onBegruendung,
  onZurueck,
  onWeiter,
}: {
  kollegen: Kollege[]
  antworten: Antworten
  onWaehle: (id: string) => void
  onBegruendung: (text: string) => void
  onZurueck: () => void
  onWeiter: () => void
}) {
  return (
    <div className="um-seite">
      <div className="karte">
        <h2 className="um-kartentitel">Entwicklung des Monats</h2>
        <div className="um-label" id="um-dev-frage">
          Bei welchem Kollegen hast du in diesem Monat eine besonders positive Entwicklung im Verhalten beobachtet?{' '}
          <em>(Du kannst dich selbst nicht auswählen.)</em>
        </div>
        <div className="um-dev-grid" role="radiogroup" aria-labelledby="um-dev-frage">
          {kollegen.map((k) => {
            const gewaehlt = antworten.entwicklungPersonId === k.id
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={gewaehlt}
                className={`um-dev-btn${gewaehlt ? ' sel' : ''}`}
                onClick={() => onWaehle(k.id)}
              >
                <span className="um-dev-av" aria-hidden="true">
                  {initiale(k.name)}
                </span>
                <span className="um-dev-name">{k.name}</span>
              </button>
            )
          })}
        </div>

        {antworten.entwicklungPersonId && (
          <div>
            <label className="um-label" htmlFor="um-dev-begruendung">
              Warum hast du so entschieden?
            </label>
            <textarea
              id="um-dev-begruendung"
              className="um-ta"
              rows={3}
              style={{ minHeight: 80 }}
              placeholder="Begründung…"
              value={antworten.entwicklungBegruendung}
              onChange={(e) => onBegruendung(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="um-nav">
        <button type="button" className="btn btn-sekundaer" onClick={onZurueck}>
          Zurück
        </button>
        <button type="button" className="btn btn-primaer" disabled={!entwicklungFertig(antworten)} onClick={onWeiter}>
          Weiter
        </button>
      </div>
    </div>
  )
}
