import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Abschnitt from '../../../components/auswertung/Abschnitt'
import LadeFehler from '../../../components/auswertung/LadeFehler'
import MonatsAuswahl from '../../../components/auswertung/MonatsAuswahl'
import Seitenkopf from '../../../components/auswertung/Seitenkopf'
import Markdown from '../../../components/leitung/Markdown'
import { AnalyseFuss, FaktenHinweis, KiAbzeichen } from '../../../components/leitung/AnalyseText'
import { bearbeiteAgenda, erstelleAgendaMitKi, erzeugeAgenda, gebeAgendaFrei, ladeAbschluss, ladeAgenda } from '../../../lib/api'
import { AnalyseFehler, vonKi } from '../../../lib/abschluss'
import { useAuth } from '../../../auth/AuthContext'
import { istAdmin } from '../../../lib/rechte'
import type { Agenda as AgendaDaten } from '../../../lib/agenda'
import { istMonat, monatName } from '../../../lib/monat'
import { useLaden } from '../../../lib/useLaden'

type Meldung = { art: 'ok' | 'fehler'; text: string } | null

/** Meldungen der KI-Function und der Datenbank (42501: z. B. „Die Agenda dieses Monats kann nur der Admin ändern.“) zeigen, sonst ein allgemeiner Text. */
const fehlerText = (e: unknown, standard = 'Das hat nicht geklappt. Bitte versuche es noch einmal.') => {
  if (e instanceof AnalyseFehler) return e.message
  const f = e as { code?: string; message?: string } | null
  return f?.code === '42501' && f.message ? f.message : standard
}

function AgendaAnsicht({
  a, monat, kiErlaubt, neuLaden, meldung, setMeldung,
}: {
  a: AgendaDaten
  monat: string
  kiErlaubt: boolean
  neuLaden: () => void
  meldung: Meldung
  setMeldung: (m: Meldung) => void
}) {
  const { person } = useAuth()
  const [bearbeiten, setBearbeiten] = useState(false)
  const [text, setText] = useState(a.text_md ?? '')
  const [arbeitet, setArbeitet] = useState<'ki' | 'vorlage' | 'sonst' | null>(null)

  async function tu(wie: 'ki' | 'vorlage' | 'sonst', aktion: () => Promise<string | void>) {
    setArbeitet(wie)
    setMeldung(null)
    try {
      const t = await aktion()
      if (t) setMeldung({ art: 'ok', text: t })
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlerText(e) })
    } finally {
      setArbeitet(null)
      neuLaden()
    }
  }

  const ersetzt = !!(a.bearbeitet_am || a.status === 'freigegeben')
  const neuErzeugen = () => {
    if (ersetzt && !window.confirm('Der bearbeitete oder freigegebene Text geht verloren und wird durch eine neue Agenda aus den aktuellen Daten ersetzt. Fortfahren?')) return
    void tu('vorlage', async () => {
      await erzeugeAgenda(monat)
      setBearbeiten(false)
      return 'Die Agenda wurde neu erzeugt.'
    })
  }
  const neuMitKi = () => {
    if (ersetzt && !window.confirm('Der bearbeitete oder freigegebene Text geht verloren und wird durch eine neue, von der KI formulierte Agenda ersetzt. Fortfahren?')) return
    void tu('ki', async () => {
      const r = await erstelleAgendaMitKi(monat, true)
      setBearbeiten(false)
      return r.analyse.geprueft ? 'Die Agenda wurde von der KI formuliert.' : 'Die Agenda wurde von der KI formuliert, aber der Faktencheck hat etwas gefunden. Bitte den Text prüfen.'
    })
  }

  const inhalt = a.inhalt
  const beschaeftigt = arbeitet !== null
  return (
    <>
      <Abschnitt
        titel={`Agenda ${monatName(monat)}`}
        hinweis="Alle Zahlen kommen aus der Datenbank. Die Agenda enthält nur Themen und Zahlen des Teams, keine Rangliste einzelner Personen und keine Kommentare mit Namen."
        aktion={
          <span className="lt-chips">
            {a.status === 'freigegeben' ? <span className="lt-chip ok">Freigegeben</span> : <span className="lt-chip">Entwurf</span>}
            <KiAbzeichen a={a} />
          </span>
        }
      >
        {inhalt && (
          <p className="text-gedimmt text-klein">
            {inhalt.bloecke.map((b) => `${b.titel.split(' ')[0]} ${b.minuten} Min.`).join(' · ')} · zusammen {inhalt.summe_minuten} Minuten
          </p>
        )}
        <FaktenHinweis a={a} />
        {vonKi(a) && person && istAdmin(person) && (
          <p className="hinweis" role="note">
            Nur für dich sichtbar: Solange der Schalter „nur Admin“ an ist (Standard), sehen Verantwortliche diese KI-Agenda nicht, bekommen sie nicht per Mail und sehen sie nicht im Monatsbericht. In der Mail steht dann die Agenda aus der Vorlage.
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
                disabled={beschaeftigt || !text.trim()}
                onClick={() =>
                  void tu('sonst', async () => {
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
                <button type="button" className="btn btn-sekundaer btn-klein" disabled={beschaeftigt} onClick={() => void tu('sonst', async () => { await gebeAgendaFrei(a.id, false) })}>
                  Freigabe zurücknehmen
                </button>
              ) : (
                <button type="button" className="btn btn-primaer btn-klein" disabled={beschaeftigt} onClick={() => void tu('sonst', async () => { await gebeAgendaFrei(a.id, true); return 'Die Agenda ist freigegeben und steht im Monatsbericht als PDF.' })}>
                  Freigeben
                </button>
              )}
              {kiErlaubt && (
                <button type="button" className="btn btn-sekundaer btn-klein" disabled={beschaeftigt} onClick={neuMitKi}>
                  {arbeitet === 'ki' ? 'Wird formuliert …' : 'Neu mit KI formulieren'}
                </button>
              )}
              <button type="button" className="btn btn-sekundaer btn-klein" disabled={beschaeftigt} onClick={neuErzeugen}>
                Neu aus den Daten erzeugen
              </button>
            </div>
          </>
        )}
        {arbeitet === 'ki' && (
          <p className="text-gedimmt" role="status">
            Die Agenda wird formuliert. Das dauert etwa eine halbe Minute.
          </p>
        )}
        {meldung && (
          <p className={meldung.art === 'ok' ? 'hinweis' : 'hinweis hinweis-fehler'} role={meldung.art === 'ok' ? 'status' : 'alert'}>
            {meldung.text}
          </p>
        )}
        <AnalyseFuss a={a} />
      </Abschnitt>
      <Abschnitt titel="Was in der Mail steht">
        <p className="text-gedimmt text-klein">
          Verantwortliche bekommen die Agenda vor dem Termin per Mail (Termine verwaltet der Admin). In der Mail stehen die Blöcke und Punkte der Agenda, aber nie die Kommentar-Beispiele aus dem Fokus-Block. Die freigegebene Agenda
          erscheint außerdem am Ende des Monatsberichts als PDF, ebenfalls ohne Kommentar-Beispiele. Eine von der KI formulierte Agenda gehört dazu nur, wenn der Schalter „nur Admin“ aus ist; sonst gehen Mail und Monatsbericht der Verantwortlichen
          mit der Agenda aus der Vorlage hinaus.
        </p>
      </Abschnitt>
    </>
  )
}

function Inhalt({ monat, kiErlaubt }: { monat: string; kiErlaubt: boolean }) {
  const l = useLaden(() => ladeAgenda(monat), monat)
  const [arbeitet, setArbeitet] = useState<'ki' | 'vorlage' | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<Meldung>(null)
  if (l.laedt && l.daten === null && !l.fehler) return <p className="text-gedimmt">Agenda wird geladen …</p>
  if (l.fehler && l.daten === null) return <LadeFehler laedt={false} fehler neuLaden={l.neuLaden} text="Agenda wird geladen …" />

  async function erzeugen(wie: 'ki' | 'vorlage') {
    setArbeitet(wie)
    setFehler(null)
    try {
      if (wie === 'ki') {
        const r = await erstelleAgendaMitKi(monat)
        if (!r.analyse.geprueft) setMeldung({ art: 'fehler', text: 'Die Agenda wurde von der KI formuliert, aber der Faktencheck hat etwas gefunden. Bitte den Text prüfen.' })
      } else {
        await erzeugeAgenda(monat)
      }
      l.neuLaden()
    } catch (e) {
      setFehler(fehlerText(e, 'Die Agenda konnte nicht erzeugt werden. Bitte versuche es noch einmal.'))
    } finally {
      setArbeitet(null)
    }
  }

  if (!l.daten) {
    return (
      <Abschnitt titel={`Agenda ${monatName(monat)}`}>
        <p className="text-gedimmt">
          Für {monatName(monat)} gibt es noch keine Agenda. Sie entsteht aus den Ergebnissen des Monats und deinen Fokus-Verhalten.
          {kiErlaubt ? ' Die KI formuliert die Punkte der Blöcke; Blöcke, Zeiten und alle Zahlen stehen fest.' : ''}
        </p>
        <div className="knopfreihe">
          {kiErlaubt && (
            <button type="button" className="btn btn-primaer btn-klein" disabled={arbeitet !== null} onClick={() => void erzeugen('ki')}>
              {arbeitet === 'ki' ? 'Agenda wird formuliert …' : 'Mit KI formulieren'}
            </button>
          )}
          <button type="button" className={kiErlaubt ? 'btn btn-sekundaer btn-klein' : 'btn btn-primaer btn-klein'} disabled={arbeitet !== null} onClick={() => void erzeugen('vorlage')}>
            {arbeitet === 'vorlage' ? 'Agenda wird erzeugt …' : kiErlaubt ? 'Aus der Vorlage erzeugen' : 'Agenda erzeugen'}
          </button>
          <Link to="../fokus" className="btn btn-sekundaer btn-klein">
            Fokus-Verhalten festlegen
          </Link>
        </div>
        {arbeitet === 'ki' && (
          <p className="text-gedimmt" role="status">
            Die Agenda wird formuliert. Das dauert etwa eine halbe Minute.
          </p>
        )}
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
      <AgendaAnsicht
        key={`${l.daten.id}-${l.daten.erstellt_am}-${l.daten.bearbeitet_am ?? ''}-${l.daten.status}`}
        a={l.daten}
        monat={monat}
        kiErlaubt={kiErlaubt}
        neuLaden={l.neuLaden}
        meldung={meldung}
        setMeldung={setMeldung}
      />
    </div>
  )
}

/** /app/leitung/agenda/:monat – die Agenda für das Teammeeting: erzeugen (aus der Vorlage oder mit KI), bearbeiten, freigeben. Der Link aus der Mail nutzt ?monat=YYYY-MM. */
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
        <Inhalt key={d.monat} monat={d.monat} kiErlaubt={d.ki_erlaubt} />
      )}
    </>
  )
}
