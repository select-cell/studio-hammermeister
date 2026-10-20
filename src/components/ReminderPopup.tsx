import { useEffect, useRef, type MouseEvent } from 'react'
import { reminderSatz, type UeberfaelligEintrag } from '../lib/abgabe'

/**
 * Reminder für Verantwortliche und Admin (§6): wer die Umfrage noch nicht abgegeben hat und wie lange schon.
 * Ein natives <dialog>: Fokus bleibt im Popup, Esc schließt, der Rest der Seite ist währenddessen gesperrt.
 * Wegklicken ist ausdrücklich erlaubt; die Seite entscheidet, wann es wiederkommt.
 */
export default function ReminderPopup({ eintraege, onSchliessen }: { eintraege: UeberfaelligEintrag[]; onSchliessen: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
  }, [])

  const schliessen = () => dialog.current?.close()

  const zumStatus = () => {
    schliessen()
    const karte = document.getElementById('abgabe-status')
    karte?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    karte?.focus({ preventScroll: true })
  }

  // Klick auf den abgedunkelten Rand schließt ebenfalls
  const klick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialog.current) schliessen()
  }

  return (
    <dialog ref={dialog} className="ab-popup" aria-labelledby="ab-popup-titel" onClose={onSchliessen} onClick={klick}>
      <div className="ab-popup-innen">
        <h2 id="ab-popup-titel" className="karte-titel">
          Offene Umfragen
        </h2>
        <p className="text-gedimmt">Diese Abgaben fehlen noch und sind über der Frist:</p>
        <ul className="ab-popup-liste">
          {eintraege.map((e) => (
            <li key={`${e.person_id}:${e.monat}`}>{reminderSatz(e)}</li>
          ))}
        </ul>
        <p className="text-klein text-gedimmt">Der Hinweis kommt beim nächsten Besuch wieder, solange noch etwas offen ist.</p>
        <div className="knopfreihe">
          <button type="button" className="btn btn-primaer" onClick={zumStatus}>
            Zum Abgabe-Status
          </button>
          <button type="button" className="btn btn-sekundaer" onClick={schliessen}>
            Schließen
          </button>
        </div>
      </div>
    </dialog>
  )
}
