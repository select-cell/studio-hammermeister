import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { initiale } from '../../lib/rechte'
import {
  PFLICHT_AB,
  fremdVon,
  istBestaetigt,
  mitTrennstellen,
  naechstesOffenes,
  selbstVon,
  stufenName,
  type Antworten,
  type Bewertung,
  type Kollege,
  type Verhalten,
  type Ziel,
} from '../../lib/umfrage'
import BewertungsDialog from './BewertungsDialog'
import { scrollArt } from './markiere'
import VideoBox from './VideoBox'

interface Props {
  verhalten: Verhalten
  /** Position innerhalb derselben Säule, wenn es Säulen gibt (z. B. 2 von 3) */
  segmentPosition: { nr: number; von: number } | null
  kollegen: Kollege[]
  antworten: Antworten
  platzhalterSekunden: number
  /** Der Nutzer hat schon „Weiter“ versucht: fehlende Bewertungen werden angezeigt. */
  versucht: boolean
  sendet: boolean
  sendeFehler: string | null
  istLetzte: boolean
  /** Die ganze Umfrage ist vollständig bewertet: erst dann lässt sich absenden. */
  alleFertig: boolean
  /** Diese Seite ist fertig, aber an anderer Stelle fehlt noch etwas (nur auf der letzten Seite von Bedeutung). */
  luecke: { text: string; onGehe: () => void } | null
  onVideoGesehen: () => void
  /** Eine Bewertung wurde mit „Locked In“ bestätigt. */
  onBewerte: (ziel: Ziel, note: number, kommentar: string) => void
  /** Alle Felder dieser Seite sind bestätigt: weiter zur nächsten Seite bzw. zum Absenden. */
  onSeiteFertig: () => void
  onZurueck: () => void
  onWeiter: () => void
}

const klasse = (gewaehlt: boolean, note: number) => (gewaehlt ? (note >= PFLICHT_AB ? ' rh' : ' rl') : '')

const reiheId = (z: Ziel) => (z.art === 'selbst' ? 'um-sb-reihe' : `um-fb-reihe-${z.kollegeId}`)

/** Setzt den Fokus auf die erste Zahl eines Bewertungsfelds und holt es ins Bild. */
function fokussiereReihe(z: Ziel): void {
  const knopf = document.getElementById(reiheId(z))?.querySelector<HTMLButtonElement>('button:not(:disabled)')
  if (!knopf) return
  knopf.scrollIntoView({ behavior: scrollArt(), block: 'center' })
  knopf.focus({ preventScroll: true })
}

/** Das Kennzeichen und der Kommentar einer bestätigten Bewertung. */
function Bestaetigt({ b, klein }: { b: Bewertung; klein?: boolean }) {
  return (
    <div className={`um-fest${klein ? ' klein' : ''}`}>
      <span className="um-fest-marke">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Locked In
      </span>
      {b.kommentar && <blockquote className="um-fest-text">{b.kommentar}</blockquote>}
    </div>
  )
}

/** Eine Verhaltens-Seite: Titel, Video, Selbstbild und Fremdbild aller Kollegen. Jede Bewertung wird im Popup bestätigt. */
export default function VerhaltenSeite(p: Props) {
  const { verhalten: v, antworten } = p
  const gesehen = !!antworten.videoGesehen[v.nr]
  const gesperrt = !gesehen
  const sb = selbstVon(antworten, v.nr)
  const sbFest = istBestaetigt(sb)
  const [auswahl, setAuswahl] = useState<{ ziel: Ziel; wert: number } | null>(null)
  const ausloeser = useRef<HTMLElement | null>(null)
  const titel = useRef<HTMLHeadingElement>(null)
  const absendenGesperrt = p.istLetzte && !p.alleFertig

  // Bei jeder neuen Seite (auch nach dem automatischen Weiterspringen) steht der Fokus auf dem Titel:
  // Tastatur und Screenreader beginnen oben und hören, welches Verhalten jetzt dran ist.
  useEffect(() => {
    titel.current?.focus({ preventScroll: true })
  }, [])

  const oeffne = (e: MouseEvent<HTMLButtonElement>, ziel: Ziel, wert: number) => {
    ausloeser.current = e.currentTarget
    setAuswahl({ ziel, wert })
  }

  // Abbrechen, Esc oder Klick daneben: nichts wird gespeichert, der Fokus geht zurück auf die Zahl
  const abbrechen = () => {
    setAuswahl(null)
    const el = ausloeser.current
    window.setTimeout(() => el?.focus(), 0)
  }

  // „Locked In“: speichern, dann zum ersten noch offenen Feld, sonst weiter
  const lockedIn = (kommentar: string) => {
    if (!auswahl) return
    const { ziel, wert } = auswahl
    setAuswahl(null)
    p.onBewerte(ziel, wert, kommentar)
    const naechstes = naechstesOffenes(v, p.kollegen, antworten, ziel)
    window.setTimeout(() => (naechstes ? fokussiereReihe(naechstes) : p.onSeiteFertig()), 0)
  }

  const nameVon = (z: Ziel) => (z.art === 'selbst' ? 'du selbst' : (p.kollegen.find((k) => k.id === z.kollegeId)?.name ?? ''))

  return (
    <div className="um-seite">
      {(v.grundpfeiler || v.saeule) && (
        <div className="um-seg">
          <div className="um-seg-gp">{v.grundpfeiler}</div>
          <div className="um-seg-sa">
            {v.saeule}
            {p.segmentPosition && p.segmentPosition.von > 1 && (
              <span className="um-seg-pos">
                {p.segmentPosition.nr} / {p.segmentPosition.von}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="um-verhalten-kopf">
        <h2 ref={titel} tabIndex={-1} className="um-verhalten-titel">
          {v.titel}
        </h2>
      </div>

      <VideoBox
        key={v.nr}
        videoUrl={v.video_url}
        titel={`Verhalten ${v.nr} · ${v.titel.length > 45 ? `${v.titel.substring(0, 45)}…` : v.titel}`}
        gesehen={gesehen}
        platzhalterSekunden={p.platzhalterSekunden}
        onGesehen={p.onVideoGesehen}
      />

      {gesperrt && (
        <div className="um-gesperrt-hinweis" role="status">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Bitte zuerst das Video vollständig ansehen
        </div>
      )}

      <div className={`um-bkarte${gesperrt ? ' gesperrt' : ''}`}>
        <div>
          <div className="um-pill um-pill-sb">
            <span className="um-pill-punkt" />
            Selbstbild
          </div>
          <div className={`um-reihe${sbFest ? ' fest' : ''}`} id="um-sb-reihe" role="group" aria-label="Selbstbild: Bewertung 1 bis 5">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                disabled={gesperrt || sbFest}
                aria-pressed={sb.note === i}
                aria-label={`${i} ${stufenName(v.kriterien, i)}`}
                className={`um-rbtn${klasse(sb.note === i, i)}`}
                onClick={(e) => oeffne(e, { art: 'selbst' }, i)}
              >
                <span className="um-rnum" aria-hidden="true">
                  {i}
                </span>
                <span className="um-rlbl" aria-hidden="true">
                  {mitTrennstellen(stufenName(v.kriterien, i))}
                </span>
              </button>
            ))}
          </div>
          {sbFest && <Bestaetigt b={sb} />}
          {!sbFest && p.versucht && <div className="um-fehlertext">Bitte wähle eine Bewertung und bestätige sie mit „Locked In“.</div>}
        </div>

        <div className="um-trenner" />

        <div>
          <div className="um-pill um-pill-fb">
            <span className="um-pill-punkt" />
            Fremdbild
          </div>
          <div className="um-fb">
            {p.kollegen.map((k) => {
              const f = fremdVon(antworten, v.nr, k.id)
              const fest = istBestaetigt(f)
              return (
                <div className="um-fb-zeile" key={k.id}>
                  <div className="um-fb-kopf">
                    <span className="um-fb-av" aria-hidden="true">
                      {initiale(k.name)}
                    </span>
                    <div className="um-fb-name">{k.name}</div>
                  </div>
                  <div className="um-fb-info">
                    <div className={`um-fb-reihe${fest ? ' fest' : ''}`} id={`um-fb-reihe-${k.id}`} role="group" aria-label={`Fremdbild ${k.name}: Bewertung 1 bis 5`}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={gesperrt || fest}
                          aria-pressed={f.note === i}
                          aria-label={`${i} ${stufenName(v.kriterien, i)}`}
                          className={`um-fb-btn${klasse(f.note === i, i)}`}
                          onClick={(e) => oeffne(e, { art: 'fremd', kollegeId: k.id }, i)}
                        >
                          <span className="um-fb-num" aria-hidden="true">
                            {i}
                          </span>
                          <span className="um-fb-lbl" aria-hidden="true">
                            {mitTrennstellen(stufenName(v.kriterien, i))}
                          </span>
                        </button>
                      ))}
                    </div>
                    {fest && <Bestaetigt b={f} klein />}
                    {!fest && p.versucht && <div className="um-fehlertext">Bitte bewerten und mit „Locked In“ bestätigen.</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {auswahl && (
        <BewertungsDialog
          art={auswahl.ziel.art === 'selbst' ? 'Selbstbild' : 'Fremdbild'}
          person={nameVon(auswahl.ziel)}
          frage={v.titel}
          wert={auswahl.wert}
          kriterien={v.kriterien}
          onLockedIn={lockedIn}
          onAbbrechen={abbrechen}
        />
      )}

      {p.sendeFehler && (
        <div className="um-sendefehler" role="alert">
          {p.sendeFehler} Deine Eingaben sind noch da – bitte einfach erneut auf „Absenden“ tippen.
        </div>
      )}

      {p.istLetzte && p.luecke && (
        <div className="um-luecke" id="um-luecke" role="alert" tabIndex={-1}>
          <span>{p.luecke.text}</span>
          <button type="button" className="btn btn-sekundaer btn-klein" onClick={p.luecke.onGehe}>
            Dorthin
          </button>
        </div>
      )}

      {absendenGesperrt && (
        <p className="um-absenden-hinweis" id="um-absenden-hinweis">
          Absenden geht erst, wenn alle Verhalten bewertet sind.
        </p>
      )}

      <div className="um-nav">
        <button type="button" className="btn btn-sekundaer" disabled={p.sendet} onClick={p.onZurueck}>
          Zurück
        </button>
        <button
          type="button"
          id={p.istLetzte ? 'um-absenden' : undefined}
          className="btn btn-primaer"
          disabled={p.sendet}
          aria-disabled={absendenGesperrt || undefined}
          aria-describedby={absendenGesperrt ? 'um-absenden-hinweis' : undefined}
          onClick={p.onWeiter}
        >
          {p.sendet ? (
            <>
              <span className="spinner spinner-hell" aria-hidden="true" /> Wird gespeichert…
            </>
          ) : p.istLetzte ? (
            'Absenden'
          ) : (
            'Weiter'
          )}
        </button>
      </div>
    </div>
  )
}
