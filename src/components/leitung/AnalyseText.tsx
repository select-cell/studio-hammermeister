import { useState } from 'react'
import { herkunftText, vonKi, zahlText, type Analyse } from '../../lib/abschluss'
import Markdown from './Markdown'

export const datumZeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })

/** Stand eines Textes: Freigabe und Faktencheck. `leer` steht für „es gibt noch keinen Text“. */
export function AnalyseStatus({ a, leer }: { a: Pick<Analyse, 'status' | 'geprueft'> | null; leer: string }) {
  if (!a) return <span className="lt-chip">{leer}</span>
  if (a.status === 'freigegeben') return <span className="lt-chip ok">Freigegeben</span>
  if (!a.geprueft) return <span className="lt-chip warn">Entwurf, Zahlen nicht geprüft</span>
  return <span className="lt-chip">Entwurf</span>
}

/** Abzeichen „Von der KI formuliert“ – damit niemand einen KI-Text für Handarbeit hält. */
export function KiAbzeichen({ a }: { a: Pick<Analyse, 'modell' | 'bearbeitet_am'> }) {
  if (!vonKi(a)) return null
  return (
    <span className="lt-chip ki" title="Dieser Text wurde von der KI formuliert. Die Zahlen stammen aus der Datenbank.">
      {a.bearbeitet_am ? 'Von der KI formuliert, bearbeitet' : 'Von der KI formuliert'}
    </span>
  )
}

/** Hinweis, wenn der Faktencheck Zahlen im Text gefunden hat, die nicht in den Daten stehen. Die Freigabe bleibt möglich. */
export function FaktenHinweis({ a }: { a: Pick<Analyse, 'geprueft' | 'fakten_hinweis'> }) {
  if (a.geprueft) return null
  const zahlen = a.fakten_hinweis ?? []
  return (
    <p className="hinweis hinweis-fehler" role="alert">
      Faktencheck nicht bestanden:{' '}
      {zahlen.length
        ? `${zahlen.map(zahlText).join(', ')} ${zahlen.length === 1 ? 'steht' : 'stehen'} nicht in den Daten.`
        : 'Der Text passt nicht zum vorgegebenen Aufbau.'}{' '}
      Bitte den Text prüfen und anpassen, bevor du ihn freigibst.
    </p>
  )
}

/** Die Fußzeile: wann erstellt, von wem bearbeitet und freigegeben. */
export function AnalyseFuss({ a }: { a: Analyse }) {
  return (
    <p className="text-gedimmt text-klein lt-fuss">
      Erstellt {datumZeit(a.erstellt_am)} · {herkunftText(a)}
      {a.prompt_version && vonKi(a) ? ` · Prompt ${a.prompt_version}` : ''}
      {a.bearbeitet_am && a.bearbeitet_von ? ` · bearbeitet von ${a.bearbeitet_von} am ${datumZeit(a.bearbeitet_am)}` : ''}
      {a.freigegeben_am && a.freigegeben_von ? ` · freigegeben von ${a.freigegeben_von} am ${datumZeit(a.freigegeben_am)}` : ''}
    </p>
  )
}

/** Text einer Analyse ansehen und bearbeiten (Einzelanalyse und Gesamtauswertung). Die Datenbank prüft beim Speichern neu. */
export default function AnalyseDetail({
  a, titel, beschaeftigt, onSpeichern,
}: {
  a: Analyse
  titel: string
  beschaeftigt: boolean
  onSpeichern: (text: string) => Promise<void>
}) {
  const [bearbeiten, setBearbeiten] = useState(false)
  const [text, setText] = useState(a.text_md ?? '')
  return (
    <div className="lt-detail">
      <FaktenHinweis a={a} />
      {bearbeiten ? (
        <>
          <label className="lt-label" htmlFor={`lt-text-${a.id}`}>
            {titel}
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
          <p className="text-gedimmt text-klein">Überschriften mit „## “, Listenpunkte mit „- “. Beim Speichern wird neu geprüft, ob alle Zahlen aus den Daten stammen; der Text geht danach zurück auf „Entwurf“.</p>
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
      <AnalyseFuss a={a} />
    </div>
  )
}
