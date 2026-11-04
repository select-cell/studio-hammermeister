import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Abschnitt from '../../../components/auswertung/Abschnitt'
import LadeFehler from '../../../components/auswertung/LadeFehler'
import MonatsAuswahl from '../../../components/auswertung/MonatsAuswahl'
import Seitenkopf from '../../../components/auswertung/Seitenkopf'
import Markdown from '../../../components/leitung/Markdown'
import { bearbeiteAgenda, erzeugeAgenda, gebeAgendaFrei, ladeAbschluss, ladeAgenda } from '../../../lib/api'
import type { Agenda as AgendaDaten } from '../../../lib/agenda'
import { istMonat, monatName } from '../../../lib/monat'
import { useLaden } from '../../../lib/useLaden'

const datumZeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })

type Meldung = { art: 'ok' | 'fehler'; text: string } | null

function AgendaAnsicht({ a, monat, neuLaden, meldung, setMeldung }: { a: AgendaDaten; monat: string; neuLaden: () => void; meldung: Meldung; setMeldung: (m: Meldung) => void }) {
  const [bearbeiten, setBearbeiten] = useState(false)
  const [text, setText] = useState(a.text_md ?? '')
  const [arbeitet, setArbeitet] = useState(false)

  async function tu(aktion: () => Promise<string | void>) {
    setArbeitet(true)
    setMeldung(null)
    try {
      const t = await aktion()
      if (t) setMeldung({ art: 'ok', text: t })
    } catch {
      setMeldung({ art: 'fehler', text: 'Das hat nicht geklappt. Bitte versuche es noch einmal.' })
    } finally {
      setArbeitet(false)
      neuLaden()
    }
  }

  const neuErzeugen = () => {
    if ((a.bearbeitet_am || a.status === 'freigegeben') && !window.confirm('Der bearbeitete oder freigegebene Text geht verloren und wird durch eine neue Agenda aus den aktuellen Daten ersetzt. Fortfahren?')) return
    void tu(async () => {
      await erzeugeAgenda(monat)
      setBearbeiten(false)
      return 'Die Agenda wurde neu erzeugt.'
    })
  }

  const inhalt = a.inhalt
  return (
    <>
      <Abschnitt
        titel={`Agenda ${monatName(monat)}`}
        hinweis="Alle Zahlen kommen aus der Datenbank. Die Agenda enthält nur Themen und Zahlen des Teams, keine Rangliste einzelner Personen und keine Kommentare mit Namen."
        aktion={a.status === 'freigegeben' ? <span className="lt-chip ok">Freigegeben</span> : <span className="lt-chip">Entwurf</span>}
      >
        {inhalt && (
          <p className="text-gedimmt text-klein">
            {inhalt.bloecke.map((b) => `${b.titel.split(' ')[0]} ${b.minuten} Min.`).join(' · ')} · zusammen {inhalt.summe_minuten} Minuten
          </p>
        )}
        {bearbeiten ? (
          <>
            <label className="lt-label" htmlFor="agenda-text">
              Text der Agenda
            </label>
            <textarea id="agenda-text" className="lt-text" rows={20} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="knopfreihe">
              <button
                type="button"
                className="btn btn-primaer btn-klein"
                disabled={arbeitet || !text.trim()}
                onClick={() =>
                  void tu(async () => {
                    await bearbeiteAgenda(a.id, text)
                    setBearbeiten(false)
                    return 'Text gespeichert. Die Agenda ist wieder ein Entwurf.'
                  })
                }
              >
                Speichern
              </button>
              <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => { setText(a.text_md ?? ''); setBearbeiten(false) }}>
                Abbrechen
              </button>
            </div>
            <p className="text-gedimmt text-klein">Überschriften mit „## “, Listenpunkte mit „- “, Hinweise mit „&gt; “. Nach dem Speichern musst du die Agenda erneut freigeben.</p>
          </>
        ) : (
          <>
            <Markdown text={a.text_md} />
            <div className="knopfreihe">
              <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => setBearbeiten(true)}>
                Text bearbeiten
              </button>
              {a.status === 'freigegeben' ? (
                <button type="button" className="btn btn-sekundaer btn-klein" disabled={arbeitet} onClick={() => void tu(async () => { await gebeAgendaFrei(a.id, false) })}>
                  Freigabe zurücknehmen
                </button>
              ) : (
                <button type="button" className="btn btn-primaer btn-klein" disabled={arbeitet} onClick={() => void tu(async () => { await gebeAgendaFrei(a.id, true); return 'Die Agenda ist freigegeben und steht im Monatsbericht als PDF.' })}>
                  Freigeben
                </button>
              )}
              <button type="button" className="btn btn-sekundaer btn-klein" disabled={arbeitet} onClick={neuErzeugen}>
                Neu aus den Daten erzeugen
              </button>
            </div>
          </>
        )}
        {meldung && (
          <p className={meldung.art === 'ok' ? 'hinweis' : 'hinweis hinweis-fehler'} role={meldung.art === 'ok' ? 'status' : 'alert'}>
            {meldung.text}
          </p>
        )}
        <p className="text-gedimmt text-klein lt-fuss">
          Erstellt {datumZeit(a.erstellt_am)} · {a.modell === 'vorlage' ? 'aus der Vorlage der Plattform' : (a.modell ?? '')}
          {a.bearbeitet_am && a.bearbeitet_von ? ` · bearbeitet von ${a.bearbeitet_von} am ${datumZeit(a.bearbeitet_am)}` : ''}
          {a.freigegeben_am && a.freigegeben_von ? ` · freigegeben von ${a.freigegeben_von} am ${datumZeit(a.freigegeben_am)}` : ''}
        </p>
      </Abschnitt>
      <Abschnitt titel="Was in der Mail steht">
        <p className="text-gedimmt text-klein">
          Verantwortliche bekommen die Agenda vor dem Termin per Mail (Termine verwaltet der Admin). In der Mail stehen die Blöcke und Punkte der Agenda, aber nie die Kommentar-Beispiele aus dem Fokus-Block. Die freigegebene Agenda
          erscheint außerdem am Ende des Monatsberichts als PDF, ebenfalls ohne Kommentar-Beispiele.
        </p>
      </Abschnitt>
    </>
  )
}

function Inhalt({ monat }: { monat: string }) {
  const l = useLaden(() => ladeAgenda(monat), monat)
  const [arbeitet, setArbeitet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<Meldung>(null)
  if (l.laedt && l.daten === null && !l.fehler) return <p className="text-gedimmt">Agenda wird geladen …</p>
  if (l.fehler && l.daten === null) return <LadeFehler laedt={false} fehler neuLaden={l.neuLaden} text="Agenda wird geladen …" />

  if (!l.daten) {
    return (
      <Abschnitt titel={`Agenda ${monatName(monat)}`}>
        <p className="text-gedimmt">Für {monatName(monat)} gibt es noch keine Agenda. Sie entsteht aus den Ergebnissen des Monats und deinen Fokus-Verhalten.</p>
        <div className="knopfreihe">
          <button
            type="button"
            className="btn btn-primaer btn-klein"
            disabled={arbeitet}
            onClick={async () => {
              setArbeitet(true)
              setFehler(null)
              try {
                await erzeugeAgenda(monat)
                l.neuLaden()
              } catch {
                setFehler('Die Agenda konnte nicht erzeugt werden. Bitte versuche es noch einmal.')
              } finally {
                setArbeitet(false)
              }
            }}
          >
            {arbeitet ? 'Agenda wird erzeugt …' : 'Agenda erzeugen'}
          </button>
          <Link to="../fokus" className="btn btn-sekundaer btn-klein">
            Fokus-Verhalten festlegen
          </Link>
        </div>
        {fehler && (
          <p className="hinweis hinweis-fehler" role="alert">
            {fehler}
          </p>
        )}
      </Abschnitt>
    )
  }
  return (
    <div className={l.laedt ? 'au-laedt' : undefined} aria-busy={l.laedt}>
      <AgendaAnsicht key={`${l.daten.id}-${l.daten.erstellt_am}-${l.daten.bearbeitet_am ?? ''}-${l.daten.status}`} a={l.daten} monat={monat} neuLaden={l.neuLaden} meldung={meldung} setMeldung={setMeldung} />
    </div>
  )
}

/** /app/leitung/agenda/:monat – die Agenda für das Teammeeting: erzeugen, bearbeiten, freigeben. Der Link aus der Mail nutzt ?monat=YYYY-MM. */
export default function AgendaSeite() {
  const { monat: pfadMonat } = useParams()
  const [suche] = useSearchParams()
  const navigate = useNavigate()
  const gewuenscht = [pfadMonat, suche.get('monat')].find((m): m is string => !!m && istMonat(m))
  const l = useLaden(() => ladeAbschluss(gewuenscht), gewuenscht ?? 'neuester')
  const d = l.daten
  if (!d) return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Agenda wird geladen …" />

  return (
    <>
      <Seitenkopf titel="Agenda" text={d.monat ? `Teammeeting zu ${monatName(d.monat)}: 15 bis 20 Minuten, aus den Ergebnissen des Monats.` : 'Hier erscheint die Agenda, sobald die erste Umfrage abgegeben ist.'}>
        <MonatsAuswahl monate={d.monate} monat={d.monat} onWahl={(m) => navigate(`/app/leitung/agenda/${m}`)} />
      </Seitenkopf>
      {!d.monat || d.monate.length === 0 ? (
        <Abschnitt titel="Noch keine Agenda möglich">
          <p className="text-gedimmt">Sobald die ersten Umfragen abgegeben sind, kannst du hier die Agenda für das Teammeeting erzeugen.</p>
        </Abschnitt>
      ) : (
        <Inhalt key={d.monat} monat={d.monat} />
      )}
    </>
  )
}
