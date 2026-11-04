import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Abschnitt from '../../../components/auswertung/Abschnitt'
import LadeFehler from '../../../components/auswertung/LadeFehler'
import MonatsAuswahl from '../../../components/auswertung/MonatsAuswahl'
import PdfKnopf from '../../../components/auswertung/PdfKnopf'
import Seitenkopf from '../../../components/auswertung/Seitenkopf'
import Markdown from '../../../components/leitung/Markdown'
import { bearbeiteAnalyse, erstelleAnalyse, gebeAnalyseFrei, ladeAbschluss, schliesseMonatAb } from '../../../lib/api'
import { AnalyseFehler, zahlText, type AbschlussPerson, type AbschlussUebersicht, type Analyse } from '../../../lib/abschluss'
import { istMonat, monatName } from '../../../lib/monat'
import { useLaden } from '../../../lib/useLaden'

const datumZeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })

type Meldung = { art: 'ok' | 'fehler'; text: string } | null

function Status({ a }: { a: Analyse | null }) {
  if (!a) return <span className="lt-chip">Noch keine Analyse</span>
  if (a.status === 'freigegeben') return <span className="lt-chip ok">Freigegeben</span>
  if (!a.geprueft) return <span className="lt-chip warn">Entwurf, Zahlen nicht geprüft</span>
  return <span className="lt-chip">Entwurf</span>
}

function Detail({ a, monat, beschaeftigt, onSpeichern }: { a: Analyse; monat: string; beschaeftigt: boolean; onSpeichern: (text: string) => Promise<void> }) {
  const [bearbeiten, setBearbeiten] = useState(false)
  const [text, setText] = useState(a.text_md ?? '')
  return (
    <div className="lt-detail">
      {!a.geprueft && (
        <p className="hinweis hinweis-fehler" role="alert">
          Faktencheck nicht bestanden: {a.fakten_hinweis.map(zahlText).join(', ')} {a.fakten_hinweis.length === 1 ? 'steht' : 'stehen'} nicht in den Daten. Bitte den Text prüfen und anpassen, bevor du ihn freigibst.
        </p>
      )}
      {bearbeiten ? (
        <>
          <label className="lt-label" htmlFor={`lt-text-${a.id}`}>
            Text der Analyse ({monatName(monat)})
          </label>
          <textarea id={`lt-text-${a.id}`} className="lt-text" rows={14} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="knopfreihe">
            <button
              type="button"
              className="btn btn-primaer btn-klein"
              disabled={beschaeftigt || !text.trim()}
              onClick={async () => {
                await onSpeichern(text)
                setBearbeiten(false)
              }}
            >
              Speichern
            </button>
            <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => { setText(a.text_md ?? ''); setBearbeiten(false) }}>
              Abbrechen
            </button>
          </div>
          <p className="text-gedimmt text-klein">Überschriften mit „## “, Listenpunkte mit „- “. Beim Speichern wird neu geprüft, ob alle Zahlen aus den Daten stammen; die Analyse geht danach zurück auf „Entwurf“.</p>
        </>
      ) : (
        <>
          <Markdown text={a.text_md} />
          <div className="knopfreihe">
            <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => setBearbeiten(true)}>
              Text bearbeiten
            </button>
          </div>
        </>
      )}
      <p className="text-gedimmt text-klein lt-fuss">
        Erstellt {datumZeit(a.erstellt_am)} · {a.modell ?? 'unbekanntes Modell'} · Prompt {a.prompt_version ?? '–'}
        {a.bearbeitet_am && a.bearbeitet_von ? ` · bearbeitet von ${a.bearbeitet_von} am ${datumZeit(a.bearbeitet_am)}` : ''}
        {a.freigegeben_am && a.freigegeben_von ? ` · freigegeben von ${a.freigegeben_von} am ${datumZeit(a.freigegeben_am)}` : ''}
      </p>
    </div>
  )
}

function PersonZeile({
  p, monat, offen, beschaeftigt, onOffnen, onErstellen, onFreigeben, onSpeichern,
}: {
  p: AbschlussPerson
  monat: string
  offen: boolean
  beschaeftigt: boolean
  onOffnen: () => void
  onErstellen: (neu: boolean) => void
  onFreigeben: (frei: boolean) => void
  onSpeichern: (text: string) => Promise<void>
}) {
  const a = p.analyse
  return (
    <li className="lt-person">
      <div className="lt-person-kopf">
        <strong>{p.name}</strong>
        {p.hat_auswertung ? <Status a={a} /> : <span className="lt-chip">Keine Fremdbilder in diesem Monat</span>}
      </div>
      {p.hat_auswertung && (
        <div className="knopfreihe">
          {!a ? (
            <button type="button" className="btn btn-primaer btn-klein" disabled={beschaeftigt} onClick={() => onErstellen(false)}>
              Analyse erstellen
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-sekundaer btn-klein" aria-expanded={offen} onClick={onOffnen}>
                {offen ? 'Zuklappen' : 'Ansehen'}
              </button>
              {a.status === 'freigegeben' ? (
                <button type="button" className="btn btn-sekundaer btn-klein" disabled={beschaeftigt} onClick={() => onFreigeben(false)}>
                  Freigabe zurücknehmen
                </button>
              ) : (
                <button type="button" className="btn btn-primaer btn-klein" disabled={beschaeftigt} onClick={() => onFreigeben(true)}>
                  Freigeben
                </button>
              )}
              <button type="button" className="btn btn-sekundaer btn-klein" disabled={beschaeftigt} onClick={() => onErstellen(true)}>
                Neu generieren
              </button>
              <PdfKnopf art="person" personId={p.person_id} monat={monat} label="PDF" />
            </>
          )}
        </div>
      )}
      {a && offen && <Detail key={`${a.id}-${a.bearbeitet_am ?? a.erstellt_am}`} a={a} monat={monat} beschaeftigt={beschaeftigt} onSpeichern={onSpeichern} />}
    </li>
  )
}

function Inhalt({ d, monat, neuLaden }: { d: AbschlussUebersicht; monat: string; neuLaden: () => void }) {
  const [arbeitet, setArbeitet] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<Meldung>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [fortschritt, setFortschritt] = useState<{ fertig: number; gesamt: number } | null>(null)

  const fehlerText = (e: unknown) => (e instanceof AnalyseFehler ? e.message : 'Das hat nicht geklappt. Bitte versuche es noch einmal.')
  async function tu(id: string, aktion: () => Promise<string | void>) {
    setArbeitet(id)
    setMeldung(null)
    try {
      const text = await aktion()
      if (text) setMeldung({ art: 'ok', text })
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlerText(e) })
    } finally {
      setArbeitet(null)
      neuLaden()
    }
  }

  const erstellen = (p: AbschlussPerson, neu: boolean) => {
    if (neu && p.analyse && (p.analyse.bearbeitet_am || p.analyse.status === 'freigegeben') && !window.confirm('Der bearbeitete oder freigegebene Text geht verloren und wird durch eine neue Analyse ersetzt. Fortfahren?')) return
    void tu(p.person_id, async () => {
      const r = await erstelleAnalyse(p.person_id, monat, neu)
      setOffen(p.person_id)
      return r.neu_erzeugt ? `Analyse für ${p.name} erstellt.` : `Für ${p.name} gab es schon eine Analyse zu denselben Daten, es wurde nichts neu erzeugt.`
    })
  }

  const fehlend = d.personen.filter((p) => p.hat_auswertung && !p.analyse)
  async function alleErstellen() {
    setArbeitet('alle')
    setMeldung(null)
    let fertig = 0
    try {
      for (const p of fehlend) {
        setFortschritt({ fertig, gesamt: fehlend.length })
        await erstelleAnalyse(p.person_id, monat, false)
        fertig++
      }
      setMeldung({ art: 'ok', text: `${fertig} Analysen erstellt.` })
    } catch (e) {
      setMeldung({ art: 'fehler', text: `${fehlerText(e)}${fertig ? ` (${fertig} von ${fehlend.length} sind fertig.)` : ''}` })
    } finally {
      setFortschritt(null)
      setArbeitet(null)
      neuLaden()
    }
  }

  const anteil = d.analysen_gesamt ? Math.round((d.analysen_fertig / d.analysen_gesamt) * 100) : 0
  return (
    <>
      <Abschnitt titel="Abschluss" hinweis="Den Monat kannst du auch abschließen, wenn noch Abgaben fehlen. Der Stand wird dann als „unvollständig“ gekennzeichnet.">
        {d.abschluss ? (
          <p>
            <strong>Abgeschlossen</strong> am {datumZeit(d.abschluss.abgeschlossen_am)} von {d.abschluss.abgeschlossen_von}
            {d.abschluss.abgaben_erwartet !== null && (
              <>
                {' · '}
                {d.abschluss.unvollstaendig ? <span className="lt-chip warn">unvollständig ({d.abschluss.abgaben_vorhanden} von {d.abschluss.abgaben_erwartet} Abgaben)</span> : <span className="lt-chip ok">vollständig ({d.abschluss.abgaben_vorhanden} von {d.abschluss.abgaben_erwartet} Abgaben)</span>}
              </>
            )}
          </p>
        ) : (
          <p className="text-gedimmt">{monatName(monat)} ist noch nicht abgeschlossen.</p>
        )}
        <div className="knopfreihe">
          <button
            type="button"
            className="btn btn-primaer btn-klein"
            disabled={arbeitet !== null}
            onClick={() => void tu('abschluss', async () => { const r = await schliesseMonatAb(monat); return r.unvollstaendig ? `${monatName(monat)} abgeschlossen, unvollständig (${r.abgaben_vorhanden} von ${r.abgaben_erwartet} Abgaben).` : `${monatName(monat)} abgeschlossen.` })}
          >
            {d.abschluss ? 'Zählung aktualisieren' : 'Monat abschließen'}
          </button>
        </div>
      </Abschnitt>

      <Abschnitt
        titel="Einzelanalysen"
        hinweis="Alle Zahlen kommen aus der Datenbank, die KI formuliert nur den Text. Ein Faktencheck prüft, ob jede Zahl im Text aus den Daten stammt. Zur Auswertung werden die Feedbacktexte ohne Namen an den eingestellten KI-Anbieter übertragen."
      >
        <div className="lt-fortschritt">
          <progress max={Math.max(d.analysen_gesamt, 1)} value={d.analysen_fertig} aria-label="Fortschritt der Analysen" />
          <span>
            {d.analysen_fertig} von {d.analysen_gesamt} Analysen erstellt, {d.freigegeben} freigegeben ({anteil} %)
          </span>
        </div>
        {fehlend.length > 0 && (
          <div className="knopfreihe">
            <button type="button" className="btn btn-primaer btn-klein" disabled={arbeitet !== null} onClick={() => void alleErstellen()}>
              {arbeitet === 'alle' && fortschritt ? `Analyse ${fortschritt.fertig + 1} von ${fortschritt.gesamt} läuft …` : `Alle fehlenden Analysen erstellen (${fehlend.length})`}
            </button>
          </div>
        )}
        {arbeitet && arbeitet !== 'alle' && arbeitet !== 'abschluss' && (
          <p className="text-gedimmt" role="status">
            Die Analyse wird erstellt. Das dauert etwa eine halbe Minute.
          </p>
        )}
        {meldung && (
          <p className={meldung.art === 'ok' ? 'hinweis' : 'hinweis hinweis-fehler'} role={meldung.art === 'ok' ? 'status' : 'alert'}>
            {meldung.text}
          </p>
        )}
        <ul className="lt-personen">
          {d.personen.map((p) => (
            <PersonZeile
              key={p.person_id}
              p={p}
              monat={monat}
              offen={offen === p.person_id}
              beschaeftigt={arbeitet !== null}
              onOffnen={() => setOffen(offen === p.person_id ? null : p.person_id)}
              onErstellen={(neu) => erstellen(p, neu)}
              onFreigeben={(frei) => void tu(p.person_id, async () => { if (p.analyse) await gebeAnalyseFrei(p.analyse.id, frei) })}
              onSpeichern={(text) => tu(p.person_id, async () => { if (p.analyse) { await bearbeiteAnalyse(p.analyse.id, text); return 'Text gespeichert.' } })}
            />
          ))}
        </ul>
      </Abschnitt>
    </>
  )
}

/** /app/leitung/abschluss/:monat – Monat abschließen, Einzelanalysen erstellen, prüfen, bearbeiten, freigeben und als PDF laden. */
export default function Abschluss() {
  const { monat: param } = useParams()
  const navigate = useNavigate()
  const monatParam = param && istMonat(param) ? param : undefined
  const l = useLaden(() => ladeAbschluss(monatParam), monatParam ?? 'neuester')
  const d = l.daten
  if (!d) return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Monatsabschluss wird geladen …" />

  return (
    <>
      <Seitenkopf titel="Monatsabschluss" text={d.monat ? `${monatName(d.monat)}: abschließen und Einzelanalysen für das Gespräch erstellen.` : 'Hier erscheint der Abschluss, sobald die erste Umfrage abgegeben ist.'}>
        <MonatsAuswahl monate={d.monate} monat={d.monat} onWahl={(m) => navigate(`/app/leitung/abschluss/${m}`)} />
      </Seitenkopf>
      {l.fehler && <p className="hinweis hinweis-fehler">Der Monat konnte nicht geladen werden.</p>}
      {!d.monat || d.monate.length === 0 ? (
        <Abschnitt titel="Noch kein Abschluss möglich">
          <p className="text-gedimmt">Sobald die ersten Umfragen abgegeben sind, kannst du den Monat hier abschließen.</p>
        </Abschnitt>
      ) : (
        <div className={l.laedt ? 'au-laedt' : undefined} aria-busy={l.laedt}>
          <Inhalt key={d.monat} d={d} monat={d.monat} neuLaden={l.neuLaden} />
        </div>
      )}
    </>
  )
}
