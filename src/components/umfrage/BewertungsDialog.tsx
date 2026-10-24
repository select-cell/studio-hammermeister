import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { kommentarPflicht, stufenName, type Kriterium } from '../../lib/umfrage'

/** So lange nach dem Öffnen ignoriert das Popup Klicks und Eingaben auf seine Knöpfe: Ein Doppeltipp auf die Zahl soll nicht gleich „Locked In“ auslösen. */
const SCHUTZZEIT_MS = 350

interface Props {
  /** „Selbstbild“ oder „Fremdbild“ */
  art: 'Selbstbild' | 'Fremdbild'
  /** „du selbst“ oder der Name des Kollegen */
  person: string
  /** Titel des Verhaltens */
  frage: string
  /** die angeklickte Zahl */
  wert: number
  kriterien: Kriterium[]
  /** Bestätigt die Bewertung („Locked In“). Der Kommentar ist dann getrimmt und bei Pflicht nicht leer. */
  onLockedIn: (kommentar: string) => void
  /** Verwirft die Wahl: Abbrechen, Esc und Klick auf den abgedunkelten Rand. Es wird nichts gespeichert. */
  onAbbrechen: () => void
}

/**
 * Das Bestätigungs-Popup einer einzelnen Bewertung: zeigt die vollständige Beschreibung der gewählten Stufe,
 * fragt den Kommentar ab (ab Bewertung 4 Pflicht) und sperrt die Bewertung erst mit „Locked In“.
 * Ein natives <dialog>: Der Rest der Seite ist währenddessen gesperrt, der Fokus bleibt im Popup, Esc bricht ab.
 */
export default function BewertungsDialog({ art, person, frage, wert, kriterien, onLockedIn, onAbbrechen }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const feld = useRef<HTMLTextAreaElement>(null)
  const knopf = useRef<HTMLButtonElement>(null)
  const mausAmRand = useRef(false)
  const geoeffnetUm = useRef(0)
  const [kommentar, setKommentar] = useState('')

  const pflicht = kommentarPflicht(wert)
  const frei = !pflicht || kommentar.trim().length > 0
  const k = kriterien.find((x) => x.stufe === wert)
  const name = stufenName(kriterien, wert)
  const hatText = !!k && (!!k.leitsatz || k.punkte.length > 0)

  const zuFruh = () => performance.now() - geoeffnetUm.current < SCHUTZZEIT_MS

  useEffect(() => {
    geoeffnetUm.current = performance.now()
    const d = dialog.current
    if (d && !d.open) d.showModal()
    // Anfangsfokus: bei Kommentarpflicht ins Feld, sonst auf „Locked In“
    if (pflicht) feld.current?.focus()
    else knopf.current?.focus()
    // Die Seite dahinter soll nicht mitscrollen
    const vorher = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = vorher
    }
  }, [pflicht])

  // Der Fokus bleibt im Popup: Tab vom letzten Feld geht zum ersten, Umschalt+Tab vom ersten zum letzten
  const taste = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab' || !dialog.current) return
    const felder = [...dialog.current.querySelectorAll<HTMLElement>('textarea, button:not(:disabled)')]
    if (felder.length === 0) return
    const erstes = felder[0]
    const letztes = felder[felder.length - 1]
    const aktiv = document.activeElement
    const draussen = !aktiv || !dialog.current.contains(aktiv)
    if (e.shiftKey && (draussen || aktiv === erstes)) {
      e.preventDefault()
      letztes.focus()
    } else if (!e.shiftKey && (draussen || aktiv === letztes)) {
      e.preventDefault()
      erstes.focus()
    }
  }

  const absenden = (e: FormEvent) => {
    e.preventDefault()
    if (frei && !zuFruh()) onLockedIn(kommentar.trim())
  }

  const abbrechen = () => {
    if (!zuFruh()) onAbbrechen()
  }

  // Klick auf den abgedunkelten Rand bricht ab. Nur, wenn auch das Drücken dort begann (wer im Textfeld Text
  // markiert und außerhalb loslässt, soll nichts verlieren) und solange noch kein Kommentar getippt ist.
  const maus = (e: MouseEvent<HTMLDialogElement>) => {
    mausAmRand.current = e.target === dialog.current
  }
  const klick = (e: MouseEvent<HTMLDialogElement>) => {
    if (mausAmRand.current && e.target === dialog.current && kommentar.trim() === '') abbrechen()
    mausAmRand.current = false
  }

  return (
    <dialog
      ref={dialog}
      className="um-dialog"
      aria-labelledby="um-dialog-art um-dialog-titel"
      aria-describedby="um-dialog-hinweis"
      onCancel={(e) => {
        e.preventDefault() // Esc: selbst abbrechen, damit nichts anderes passiert
        onAbbrechen()
      }}
      onMouseDown={maus}
      onClick={klick}
      onKeyDown={taste}
    >
      <form className="um-dialog-innen" onSubmit={absenden}>
        <div className="um-dialog-kopf">
          <span className={`um-krit-badge um-kb-${wert}`} aria-hidden="true">
            {wert}
          </span>
          <div className="um-dialog-wer">
            <div id="um-dialog-art" className="um-dialog-art">
              {art} · {person}
            </div>
            <div className="um-dialog-frage">{frage}</div>
          </div>
        </div>

        <h2 id="um-dialog-titel" className="um-dialog-titel">
          Bewertung {wert} · {name}
          {k?.prozent ? ` · ${k.prozent}` : ''}
        </h2>

        {hatText && (
          <div className="um-dialog-stufe">
            {k?.leitsatz && <p className="um-dialog-leitsatz">{k.leitsatz}</p>}
            {k && k.punkte.length > 0 && (
              <ul>
                {k.punkte.map((p, n) => (
                  <li key={n}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="um-dialog-kommentar">
          <label className="um-kommentar-label" htmlFor="um-dialog-ta">
            <span className={pflicht ? 'um-pflicht' : 'um-freiwillig'}>{pflicht ? 'Pflichtfeld' : 'Optional'}</span>
            {pflicht ? 'Was genau ist dir aufgefallen?' : 'Möchtest du etwas ergänzen?'}
          </label>
          <textarea
            id="um-dialog-ta"
            ref={feld}
            className="um-ta"
            aria-required={pflicht}
            placeholder={pflicht ? 'Bitte konkret beschreiben…' : 'Zusätzliche Anmerkungen…'}
            value={kommentar}
            onChange={(e) => setKommentar(e.target.value)}
          />
        </div>

        <p id="um-dialog-hinweis" className="um-dialog-hinweis">
          Mit „Locked In“ bestätigst du diese Bewertung. Danach lässt sich die Bewertung nicht mehr ändern.
        </p>

        <div className="um-dialog-knoepfe">
          <button type="button" className="btn btn-sekundaer" onClick={abbrechen}>
            Abbrechen
          </button>
          <button type="submit" ref={knopf} className="btn btn-primaer" disabled={!frei}>
            Locked In
          </button>
        </div>
      </form>
    </dialog>
  )
}
