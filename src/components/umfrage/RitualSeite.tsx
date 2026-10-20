import { ritualKey, type Antworten, type Ritual, type RitualAntwort } from '../../lib/umfrage'

/** Eine Ritual-Seite: Einleitungstext und Fragen (Skala, Auswahl, Text). Hammermeister hat aktuell keine Rituale. */
export default function RitualSeite({
  ritual,
  antworten,
  fehlerNr,
  onAntwort,
  onZurueck,
  onWeiter,
}: {
  ritual: Ritual
  antworten: Antworten
  fehlerNr: number | null
  onAntwort: (frageNr: number, wert: RitualAntwort) => void
  onZurueck: () => void
  onWeiter: () => void
}) {
  return (
    <div className="um-seite">
      <div className="karte">
        <h2 className="um-kartentitel">{ritual.titel}</h2>
        {ritual.untertitel && <div className="um-krit-titel">{ritual.untertitel}</div>}
        {ritual.einleitung.length > 0 && (
          <div className="hervorhebung um-einleitung">
            {ritual.einleitung.map((absatz, i) => (
              <p key={i} style={{ whiteSpace: 'pre-line' }}>
                {absatz}
              </p>
            ))}
          </div>
        )}
      </div>

      {ritual.fragen.map((f) => {
        const wert = antworten.rituale[ritualKey(ritual.id, f.nr)] ?? null
        const labels = f.labels ?? []
        return (
          <div className="karte um-rit-frage" id={`um-rit-${f.nr}`} key={f.nr}>
            <div className="um-kommentar-label" style={{ marginBottom: '.4rem' }}>
              <span className={f.pflicht ? 'um-pflicht' : 'um-freiwillig'}>{f.pflicht ? 'Pflichtfeld' : 'Optional'}</span>
            </div>
            <h3 className="um-kartentitel">{f.frage}</h3>
            {f.hinweis && <div className="um-hinweis">{f.hinweis}</div>}

            {f.typ === 'skala' && (
              <div className="um-reihe">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} type="button" className={`um-rbtn${wert === i ? ' rsel' : ''}`} onClick={() => onAntwort(f.nr, i)}>
                    <span className="um-rnum">{i}</span>
                    {labels[i - 1] && <span className="um-rlbl">{labels[i - 1]}</span>}
                  </button>
                ))}
              </div>
            )}

            {f.typ === 'auswahl' && (
              <div className="um-opt-grid">
                {(f.optionen ?? []).map((o) => (
                  <button key={o} type="button" className={`um-opt-btn${wert === o ? ' sel' : ''}`} onClick={() => onAntwort(f.nr, o)}>
                    {o}
                  </button>
                ))}
              </div>
            )}

            {f.typ === 'text' && (
              <textarea
                className="um-ta"
                placeholder={f.pflicht ? 'Bitte ausfüllen…' : 'Optional…'}
                value={typeof wert === 'string' ? wert : ''}
                onChange={(e) => onAntwort(f.nr, e.target.value)}
              />
            )}

            {fehlerNr === f.nr && <div className="um-fehlertext">Bitte beantworten.</div>}
          </div>
        )
      })}

      <div className="um-nav">
        <button type="button" className="btn btn-sekundaer" onClick={onZurueck}>
          Zurück
        </button>
        <button type="button" className="btn btn-primaer" onClick={onWeiter}>
          Weiter
        </button>
      </div>
    </div>
  )
}
