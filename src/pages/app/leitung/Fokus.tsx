import { useState } from 'react'
import { Link } from 'react-router-dom'
import Abschnitt from '../../../components/auswertung/Abschnitt'
import LadeFehler from '../../../components/auswertung/LadeFehler'
import Seitenkopf from '../../../components/auswertung/Seitenkopf'
import { ladeFokus, setzeFokus } from '../../../lib/api'
import type { FokusVerhalten } from '../../../lib/agenda'
import { datumDe } from '../../../lib/pdf'
import { useLaden } from '../../../lib/useLaden'

type Meldung = { art: 'ok' | 'fehler'; text: string } | null

function Formular({ v, beschaeftigt, onSpeichern, onAbbrechen }: { v: FokusVerhalten; beschaeftigt: boolean; onSpeichern: (begruendung: string, bis: string) => void; onAbbrechen: () => void }) {
  const [begruendung, setBegruendung] = useState(v.begruendung ?? '')
  const [bis, setBis] = useState(v.bis ?? '')
  return (
    <form
      className="lt-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSpeichern(begruendung, bis)
      }}
    >
      <label className="lt-label" htmlFor={`fokus-warum-${v.nr}`}>
        Warum ist dieses Verhalten gerade wichtig? (erscheint in der Agenda)
      </label>
      <textarea id={`fokus-warum-${v.nr}`} className="lt-text" rows={3} maxLength={400} value={begruendung} onChange={(e) => setBegruendung(e.target.value)} />
      <label className="lt-label" htmlFor={`fokus-bis-${v.nr}`}>
        Befristet bis (leer = bis auf Weiteres)
      </label>
      <input id={`fokus-bis-${v.nr}`} className="lt-feld" type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
      <div className="knopfreihe">
        <button type="submit" className="btn btn-primaer btn-klein" disabled={beschaeftigt}>
          {v.aktiv ? 'Speichern' : 'Zum Fokus machen'}
        </button>
        <button type="button" className="btn btn-sekundaer btn-klein" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </form>
  )
}

/** /app/leitung/fokus – welche Verhalten gerade besonders wichtig sind. Die Agenda stellt sie an die erste Stelle. */
export default function Fokus() {
  const l = useLaden(ladeFokus, 'fokus')
  const [offen, setOffen] = useState<string | null>(null)
  const [arbeitet, setArbeitet] = useState(false)
  const [meldung, setMeldung] = useState<Meldung>(null)
  const d = l.daten
  if (!d) return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Fokus-Verhalten werden geladen …" />

  async function aendern(v: FokusVerhalten, an: boolean, begruendung?: string, bis?: string) {
    setArbeitet(true)
    setMeldung(null)
    try {
      await setzeFokus(v.verhalten_id, an, begruendung, bis)
      setMeldung({ art: 'ok', text: an ? `Verhalten ${v.nr} ist im Fokus.` : `Verhalten ${v.nr} ist nicht mehr im Fokus.` })
      setOffen(null)
    } catch {
      setMeldung({ art: 'fehler', text: 'Das hat nicht geklappt. Bitte versuche es noch einmal.' })
    } finally {
      setArbeitet(false)
      l.neuLaden()
    }
  }

  const imFokus = d.verhalten.filter((v) => v.aktiv)
  return (
    <>
      <Seitenkopf titel="Fokus-Verhalten" text="Welche Verhalten sind gerade besonders wichtig? Die Agenda für das Teammeeting beginnt mit ihnen." />
      {l.fehler && <p className="hinweis hinweis-fehler">Die Liste konnte nicht aktualisiert werden.</p>}
      {meldung && (
        <p className={meldung.art === 'ok' ? 'hinweis' : 'hinweis hinweis-fehler'} role={meldung.art === 'ok' ? 'status' : 'alert'}>
          {meldung.text}
        </p>
      )}

      <Abschnitt titel={`Aktuell im Fokus (${imFokus.length})`} hinweis="Die Agenda nimmt höchstens drei Fokus-Verhalten in den Fokus-Block auf. Beendete Einträge bleiben im Verlauf erhalten.">
        {imFokus.length === 0 ? (
          <p className="text-gedimmt">Im Moment ist kein Verhalten im Fokus. Ohne Fokus nimmt die Agenda die größten Differenzen und Veränderungen des Monats.</p>
        ) : (
          <ul className="lt-personen">
            {imFokus.map((v) => (
              <li key={v.verhalten_id} className="lt-person">
                <div className="lt-person-kopf">
                  <strong>
                    {v.nr}. {v.titel}
                  </strong>
                  <span className="lt-chip ok">Im Fokus</span>
                </div>
                <p className="text-gedimmt text-klein">
                  seit {v.seit ? datumDe(v.seit) : '–'}
                  {v.bis ? `, bis ${datumDe(v.bis)}` : ', bis auf Weiteres'}
                </p>
                {v.begruendung && <p>Warum wichtig: {v.begruendung}</p>}
                {offen === v.verhalten_id ? (
                  <Formular v={v} beschaeftigt={arbeitet} onSpeichern={(b, bis) => void aendern(v, true, b, bis)} onAbbrechen={() => setOffen(null)} />
                ) : (
                  <div className="knopfreihe">
                    <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => setOffen(v.verhalten_id)}>
                      Begründung ändern
                    </button>
                    <button type="button" className="btn btn-sekundaer btn-klein" disabled={arbeitet} onClick={() => void aendern(v, false)}>
                      Aus dem Fokus nehmen
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Abschnitt>

      <Abschnitt titel="Alle Verhalten" hinweis="Wähle ein Verhalten aus, das im Team gerade Aufmerksamkeit braucht.">
        <ul className="lt-personen">
          {d.verhalten
            .filter((v) => !v.aktiv)
            .map((v) => (
              <li key={v.verhalten_id} className="lt-person">
                <div className="lt-person-kopf">
                  <strong>
                    {v.nr}. {v.titel}
                  </strong>
                  {v.saeule && <span className="text-gedimmt text-klein">{v.saeule}</span>}
                </div>
                {offen === v.verhalten_id ? (
                  <Formular v={v} beschaeftigt={arbeitet} onSpeichern={(b, bis) => void aendern(v, true, b, bis)} onAbbrechen={() => setOffen(null)} />
                ) : (
                  <div className="knopfreihe">
                    <button type="button" className="btn btn-sekundaer btn-klein" disabled={arbeitet} onClick={() => setOffen(v.verhalten_id)}>
                      Zum Fokus machen
                    </button>
                  </div>
                )}
              </li>
            ))}
        </ul>
        <p className="text-gedimmt text-klein">
          Die fertige Agenda findest du unter <Link to="../agenda">Agenda</Link>.
        </p>
      </Abschnitt>
    </>
  )
}
