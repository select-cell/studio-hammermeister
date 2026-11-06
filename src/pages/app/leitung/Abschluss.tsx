import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import Abschnitt from '../../../components/auswertung/Abschnitt'
import LadeFehler from '../../../components/auswertung/LadeFehler'
import MonatsAuswahl from '../../../components/auswertung/MonatsAuswahl'
import PdfKnopf from '../../../components/auswertung/PdfKnopf'
import Seitenkopf from '../../../components/auswertung/Seitenkopf'
import AnalyseDetail, { AnalyseStatus, KiAbzeichen, datumZeit } from '../../../components/leitung/AnalyseText'
import {
  bearbeiteAnalyse, bearbeiteGesamt, erstelleAnalyse, erstelleGesamt, gebeAnalyseFrei, gebeGesamtFrei, ladeAbschluss, ladeGesamt, ladeKiKontext,
  schliesseMonatAb, speichereKiKontext, starteSammellauf,
} from '../../../lib/api'
import { AnalyseFehler, sammellaufText, type AbschlussPerson, type AbschlussUebersicht, type Analyse } from '../../../lib/abschluss'
import { istMonat, monatName } from '../../../lib/monat'
import { istAdmin } from '../../../lib/rechte'
import { useLaden } from '../../../lib/useLaden'

type Wo = 'abschluss' | 'gesamt' | 'einzel'
type Meldung = { art: 'ok' | 'fehler'; text: string; wo: Wo } | null

/** Höchstens so viele Durchgänge je Sammellauf (jeder Durchgang erledigt bis zu zwei Personen): eine Sicherung gegen Endlosschleifen. */
const MAX_DURCHGAENGE = 60

const fehlerText = (e: unknown) => (e instanceof AnalyseFehler ? e.message : 'Das hat nicht geklappt. Bitte versuche es noch einmal.')

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
        {p.hat_auswertung ? (
          <>
            <AnalyseStatus a={a} leer="Noch keine Analyse" />
            {a && <KiAbzeichen a={a} />}
          </>
        ) : (
          <span className="lt-chip">Keine Fremdbilder in diesem Monat</span>
        )}
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
      {a && offen && (
        <AnalyseDetail key={`${a.id}-${a.bearbeitet_am ?? a.erstellt_am}`} a={a} titel={`Text der Analyse (${monatName(monat)})`} beschaeftigt={beschaeftigt} onSpeichern={onSpeichern} />
      )}
    </li>
  )
}

function MeldungZeile({ m, wo }: { m: Meldung; wo: Wo }) {
  if (!m || m.wo !== wo) return null
  return (
    <p className={m.art === 'ok' ? 'hinweis' : 'hinweis hinweis-fehler'} role={m.art === 'ok' ? 'status' : 'alert'}>
      {m.text}
    </p>
  )
}

/** Die Gesamtauswertung des Monats: nur Teamwerte, von der KI formuliert, von der Leitung geprüft und freigegeben. */
function GesamtAbschnitt({
  monat, gesamt, beschaeftigt, arbeitet, meldung, tu, offen, setOffen,
}: {
  monat: string
  gesamt: Analyse | null
  beschaeftigt: boolean
  arbeitet: string | null
  meldung: Meldung
  tu: (id: string, wo: Wo, aktion: () => Promise<string | void>) => Promise<void>
  offen: boolean
  setOffen: (o: boolean) => void
}) {
  const erstellen = (neu: boolean) => {
    if (neu && gesamt && (gesamt.bearbeitet_am || gesamt.status === 'freigegeben') && !window.confirm('Der bearbeitete oder freigegebene Text geht verloren und wird durch eine neue Gesamtauswertung ersetzt. Fortfahren?')) return
    void tu('gesamt', 'gesamt', async () => {
      const r = await erstelleGesamt(monat, neu)
      setOffen(true)
      return r.neu_erzeugt ? 'Die Gesamtauswertung wurde erstellt.' : 'Es gab schon eine Gesamtauswertung zu denselben Daten, es wurde nichts neu erzeugt.'
    })
  }
  return (
    <Abschnitt
      titel="Gesamtauswertung"
      hinweis="Die Gesamtauswertung beschreibt das ganze Team. Die KI bekommt nur Teamwerte, keine Namen und keine Kommentare. Alle Zahlen kommen aus der Datenbank; ein Faktencheck prüft jede Zahl im Text."
      aktion={<AnalyseStatus a={gesamt} leer="Noch keine Gesamtauswertung" />}
    >
      {gesamt && (
        <p>
          <KiAbzeichen a={gesamt} />
        </p>
      )}
      <div className="knopfreihe">
        {!gesamt ? (
          <button type="button" className="btn btn-primaer btn-klein" disabled={beschaeftigt} onClick={() => erstellen(false)}>
            {arbeitet === 'gesamt' ? 'Gesamtauswertung wird erstellt …' : 'Gesamtauswertung erstellen'}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-sekundaer btn-klein" aria-expanded={offen} onClick={() => setOffen(!offen)}>
              {offen ? 'Zuklappen' : 'Ansehen'}
            </button>
            {gesamt.status === 'freigegeben' ? (
              <button type="button" className="btn btn-sekundaer btn-klein" disabled={beschaeftigt} onClick={() => void tu('gesamt', 'gesamt', async () => { await gebeGesamtFrei(gesamt.id, false) })}>
                Freigabe zurücknehmen
              </button>
            ) : (
              <button type="button" className="btn btn-primaer btn-klein" disabled={beschaeftigt} onClick={() => void tu('gesamt', 'gesamt', async () => { await gebeGesamtFrei(gesamt.id, true); return 'Die Gesamtauswertung ist freigegeben.' })}>
                Freigeben
              </button>
            )}
            <button type="button" className="btn btn-sekundaer btn-klein" disabled={beschaeftigt} onClick={() => erstellen(true)}>
              {arbeitet === 'gesamt' ? 'Wird neu erstellt …' : 'Neu generieren'}
            </button>
          </>
        )}
      </div>
      {arbeitet === 'gesamt' && (
        <p className="text-gedimmt" role="status">
          Die Gesamtauswertung wird erstellt. Das dauert etwa eine halbe Minute.
        </p>
      )}
      <MeldungZeile m={meldung} wo="gesamt" />
      {gesamt && offen && (
        <AnalyseDetail
          key={`${gesamt.id}-${gesamt.bearbeitet_am ?? gesamt.erstellt_am}`}
          a={gesamt}
          titel={`Text der Gesamtauswertung (${monatName(monat)})`}
          beschaeftigt={beschaeftigt}
          onSpeichern={(text) => tu('gesamt', 'gesamt', async () => { await bearbeiteGesamt(gesamt.id, text); return 'Text gespeichert.' })}
        />
      )}
    </Abschnitt>
  )
}

/** Kontext für die KI (nur Admin): Leitbild, Ton und Besonderheiten des Salons. Er geht mit jeder KI-Anfrage mit, nie mit Namen. */
function KontextAbschnitt() {
  const l = useLaden(ladeKiKontext, 'kontext')
  const [text, setText] = useState<string | null>(null)
  const [arbeitet, setArbeitet] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)
  const aktuell = text ?? l.daten?.kontext ?? ''

  async function speichern() {
    setArbeitet(true)
    setMeldung(null)
    try {
      const r = await speichereKiKontext(aktuell)
      setText(r.kontext ?? '')
      setMeldung({ art: 'ok', text: r.kontext ? 'Kontext gespeichert. Er gilt ab der nächsten KI-Anfrage; bereits erstellte Texte bleiben, bis du sie neu generierst.' : 'Kontext gelöscht.' })
      l.neuLaden()
    } catch (e) {
      const f = e as { code?: string; message?: string }
      setMeldung({ art: 'fehler', text: f.code === '22023' && f.message ? f.message : 'Der Kontext konnte nicht gespeichert werden. Bitte versuche es noch einmal.' })
    } finally {
      setArbeitet(false)
    }
  }

  return (
    <Abschnitt
      titel="Kontext für die KI (nur Admin)"
      hinweis="Was die KI über euren Salon wissen soll: Leitbild, Ton im Team, Besonderheiten. Bitte ohne Namen von Personen und ohne Zahlen aus Auswertungen. Der Text wird mit jeder KI-Anfrage mitgeschickt (Plattform → n8n → Anthropic)."
    >
      {!l.daten && !l.fehler ? (
        <p className="text-gedimmt">Kontext wird geladen …</p>
      ) : l.fehler && !l.daten ? (
        <p className="hinweis hinweis-fehler" role="alert">Der Kontext konnte nicht geladen werden.</p>
      ) : (
        <>
          <label className="lt-label" htmlFor="ki-kontext">
            Kontext des Salons
          </label>
          <textarea id="ki-kontext" className="lt-text" rows={8} maxLength={2000} value={aktuell} onChange={(e) => setText(e.target.value)} placeholder="z. B. Leitbild, wie im Team gesprochen wird, was euch im Salon wichtig ist …" />
          <p className="text-gedimmt text-klein lt-zaehler">{aktuell.length} von 2000 Zeichen</p>
          <div className="knopfreihe">
            <button type="button" className="btn btn-primaer btn-klein" disabled={arbeitet || aktuell === (l.daten?.kontext ?? '')} onClick={() => void speichern()}>
              {arbeitet ? 'Wird gespeichert …' : 'Kontext speichern'}
            </button>
          </div>
          {!l.daten?.kontext && <p className="text-gedimmt text-klein">Noch kein Kontext eingetragen. Die KI arbeitet dann nur mit den Zahlen und den Kriterien der Verhalten.</p>}
          {meldung && (
            <p className={meldung.art === 'ok' ? 'hinweis' : 'hinweis hinweis-fehler'} role={meldung.art === 'ok' ? 'status' : 'alert'}>
              {meldung.text}
            </p>
          )}
        </>
      )}
    </Abschnitt>
  )
}

function Inhalt({ d, monat, neuLaden }: { d: AbschlussUebersicht; monat: string; neuLaden: () => void }) {
  const { person } = useAuth()
  const [arbeitet, setArbeitet] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<Meldung>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [gesamtOffen, setGesamtOffen] = useState(false)
  const [fortschritt, setFortschritt] = useState<{ fertig: number; gesamt: number } | null>(null)
  const [gescheitert, setGescheitert] = useState<{ person_id: string; name: string; meldung: string }[]>([])
  const anhalten = useRef(false)
  const gesamt = useLaden<Analyse | null>(() => (d.ki_erlaubt ? ladeGesamt(monat) : Promise.resolve(null)), `${monat}-${d.ki_erlaubt}`)

  async function tu(id: string, wo: Wo, aktion: () => Promise<string | void>) {
    setArbeitet(id)
    setMeldung(null)
    try {
      const text = await aktion()
      if (text) setMeldung({ art: 'ok', text, wo })
    } catch (e) {
      setMeldung({ art: 'fehler', text: fehlerText(e), wo })
    } finally {
      setArbeitet(null)
      neuLaden()
      gesamt.neuLaden()
    }
  }

  const erstellen = (p: AbschlussPerson, neu: boolean) => {
    if (neu && p.analyse && (p.analyse.bearbeitet_am || p.analyse.status === 'freigegeben') && !window.confirm('Der bearbeitete oder freigegebene Text geht verloren und wird durch eine neue Analyse ersetzt. Fortfahren?')) return
    void tu(p.person_id, 'einzel', async () => {
      const r = await erstelleAnalyse(p.person_id, monat, neu)
      setOffen(p.person_id)
      return r.neu_erzeugt ? `Analyse für ${p.name} erstellt.` : `Für ${p.name} gab es schon eine Analyse zu denselben Daten, es wurde nichts neu erzeugt.`
    })
  }

  const fehlend = d.personen.filter((p) => p.hat_auswertung && !p.analyse)

  /** Sammellauf: Durchgang für Durchgang (je zwei Personen), damit kein Aufruf zu lange dauert. Wer scheitert, wird in diesem Lauf nicht noch einmal versucht. */
  async function sammellauf() {
    setArbeitet('alle')
    setMeldung(null)
    setGescheitert([])
    anhalten.current = false
    const gesamtZahl = fehlend.length
    const ausgenommen: string[] = []
    const fehler: { person_id: string; name: string; meldung: string }[] = []
    let erstellt = 0
    try {
      for (let i = 0; i < MAX_DURCHGAENGE; i++) {
        setFortschritt({ fertig: erstellt + fehler.length, gesamt: gesamtZahl })
        const r = await starteSammellauf(monat, ausgenommen)
        erstellt += r.erstellt.length
        for (const f of r.fehlgeschlagen) {
          fehler.push(f)
          ausgenommen.push(f.person_id)
        }
        setGescheitert([...fehler])
        if (r.verbleibend === 0 || r.erstellt.length + r.fehlgeschlagen.length === 0 || anhalten.current) break
      }
      setMeldung({ art: fehler.length ? 'fehler' : 'ok', text: `${sammellaufText(erstellt, fehler.length)}${anhalten.current ? ' Der Lauf wurde angehalten.' : ''}`, wo: 'einzel' })
    } catch (e) {
      setMeldung({ art: 'fehler', text: `${fehlerText(e)}${erstellt ? ` (${sammellaufText(erstellt, fehler.length)})` : ''}`, wo: 'einzel' })
    } finally {
      setFortschritt(null)
      setArbeitet(null)
      neuLaden()
    }
  }

  const anteil = d.analysen_gesamt ? Math.round((d.analysen_fertig / d.analysen_gesamt) * 100) : 0
  const admin = !!person && istAdmin(person)
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
            onClick={() => void tu('abschluss', 'abschluss', async () => { const r = await schliesseMonatAb(monat); return r.unvollstaendig ? `${monatName(monat)} abgeschlossen, unvollständig (${r.abgaben_vorhanden} von ${r.abgaben_erwartet} Abgaben).` : `${monatName(monat)} abgeschlossen.` })}
          >
            {d.abschluss ? 'Zählung aktualisieren' : 'Monat abschließen'}
          </button>
        </div>
        <MeldungZeile m={meldung} wo="abschluss" />
      </Abschnitt>

      {!d.ki_erlaubt ? (
        <Abschnitt titel="Auswertung mit KI">
          <p className="text-gedimmt">Einzelanalysen, Gesamtauswertung und Agenda mit KI sind für den Admin freigeschaltet.</p>
        </Abschnitt>
      ) : (
        <>
          <GesamtAbschnitt
            monat={monat}
            gesamt={gesamt.daten ?? null}
            beschaeftigt={arbeitet !== null}
            arbeitet={arbeitet}
            meldung={meldung}
            tu={tu}
            offen={gesamtOffen}
            setOffen={setGesamtOffen}
          />

          <Abschnitt
            titel="Einzelanalysen"
            hinweis="Alle Zahlen kommen aus der Datenbank, die KI formuliert nur den Text. Ein Faktencheck prüft, ob jede Zahl im Text aus den Daten stammt. Zur Auswertung werden die Feedbacktexte ohne Namen von der Plattform über den Automatisierungsdienst n8n an Anthropic (Claude) übertragen."
          >
            <div className="lt-fortschritt">
              <progress max={Math.max(d.analysen_gesamt, 1)} value={d.analysen_fertig} aria-label="Fortschritt der Analysen" />
              <span>
                {d.analysen_fertig} von {d.analysen_gesamt} Analysen erstellt, {d.freigegeben} freigegeben ({anteil} %)
              </span>
            </div>
            {fehlend.length > 0 && (
              <div className="knopfreihe">
                <button type="button" className="btn btn-primaer btn-klein" disabled={arbeitet !== null || !d.abschluss} onClick={() => void sammellauf()}>
                  {arbeitet === 'alle' && fortschritt ? `Analyse ${Math.min(fortschritt.fertig + 1, fortschritt.gesamt)} von ${fortschritt.gesamt} läuft …` : `Alle fehlenden Analysen erstellen (${fehlend.length})`}
                </button>
                {arbeitet === 'alle' && (
                  <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => { anhalten.current = true }}>
                    Nach diesem Durchgang anhalten
                  </button>
                )}
              </div>
            )}
            {fehlend.length > 0 && !d.abschluss && <p className="text-gedimmt text-klein">Alle Analysen auf einmal gibt es erst, wenn der Monat abgeschlossen ist. Einzelne Analysen kannst du jederzeit erstellen.</p>}
            {arbeitet && arbeitet !== 'alle' && arbeitet !== 'abschluss' && arbeitet !== 'gesamt' && (
              <p className="text-gedimmt" role="status">
                Die Analyse wird erstellt. Das dauert etwa eine halbe Minute.
              </p>
            )}
            {arbeitet === 'alle' && (
              <p className="text-gedimmt" role="status">
                Die Analysen werden nacheinander erstellt, jeweils zwei auf einmal. Bitte lass diese Seite offen.
              </p>
            )}
            <MeldungZeile m={meldung} wo="einzel" />
            {gescheitert.length > 0 && (
              <ul className="lt-sammel-fehler" aria-label="Nicht erstellte Analysen">
                {gescheitert.map((f) => (
                  <li key={f.person_id}>
                    <strong>{f.name}:</strong> {f.meldung}
                  </li>
                ))}
              </ul>
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
                  onFreigeben={(frei) => void tu(p.person_id, 'einzel', async () => { if (p.analyse) await gebeAnalyseFrei(p.analyse.id, frei) })}
                  onSpeichern={(text) => tu(p.person_id, 'einzel', async () => { if (p.analyse) { await bearbeiteAnalyse(p.analyse.id, text); return 'Text gespeichert.' } })}
                />
              ))}
            </ul>
          </Abschnitt>

          {admin && <KontextAbschnitt />}
        </>
      )}
    </>
  )
}

/** /app/leitung/abschluss/:monat – Monat abschließen, Gesamtauswertung und Einzelanalysen erstellen, prüfen, bearbeiten, freigeben und als PDF laden. */
export default function Abschluss() {
  const { monat: param } = useParams()
  const navigate = useNavigate()
  const monatParam = param && istMonat(param) ? param : undefined
  const l = useLaden(() => ladeAbschluss(monatParam), monatParam ?? 'neuester')
  const d = l.daten
  if (!d) return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Monatsabschluss wird geladen …" />

  return (
    <>
      <Seitenkopf
        titel="Monatsabschluss"
        text={
          d.monat
            ? `${monatName(d.monat)}: abschließen${d.ki_erlaubt ? ', Gesamtauswertung und Einzelanalysen für das Gespräch erstellen.' : '.'}`
            : 'Hier erscheint der Abschluss, sobald die erste Umfrage abgegeben ist.'
        }
      >
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
