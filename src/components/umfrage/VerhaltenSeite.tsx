import { initiale } from '../../lib/rechte'
import {
  BEWERTUNG_LABELS,
  PFLICHT_AB,
  fremdVon,
  selbstVon,
  type Antworten,
  type Bewertung,
  type Kollege,
  type Verhalten,
} from '../../lib/umfrage'
import Kriterien from './Kriterien'
import VideoBox from './VideoBox'

interface Props {
  verhalten: Verhalten
  /** Position innerhalb derselben Säule, wenn es Säulen gibt (z. B. 2 von 3) */
  segmentPosition: { nr: number; von: number } | null
  kollegen: Kollege[]
  antworten: Antworten
  platzhalterSekunden: number
  /** Der Nutzer hat schon „Weiter“ versucht: fehlende Pflicht-Kommentare werden angezeigt. */
  versucht: boolean
  sendet: boolean
  sendeFehler: string | null
  istLetzte: boolean
  onVideoGesehen: () => void
  onSelbst: (patch: Partial<Bewertung>) => void
  onFremd: (kollegeId: string, patch: Partial<Bewertung>) => void
  onZurueck: () => void
  onWeiter: () => void
}

const klasse = (gewaehlt: boolean, note: number) => (gewaehlt ? (note >= PFLICHT_AB ? ' rh' : ' rl') : '')

function Kommentar({
  id,
  note,
  wert,
  fehlt,
  klein,
  onChange,
}: {
  id: string
  note: number
  wert: string
  fehlt: boolean
  klein?: boolean
  onChange: (text: string) => void
}) {
  const pflicht = note >= PFLICHT_AB
  return (
    <div className="um-kommentar" style={klein ? { marginTop: '.4rem' } : undefined}>
      <label className="um-kommentar-label" htmlFor={id} style={klein ? { fontSize: 10 } : undefined}>
        <span className={pflicht ? 'um-pflicht' : 'um-freiwillig'}>{pflicht ? 'Pflichtfeld' : 'Optional'}</span>
        {klein
          ? pflicht ? 'Was ist dir aufgefallen?' : 'Anmerkung (optional)'
          : pflicht ? 'Was genau ist dir aufgefallen?' : 'Möchtest du etwas ergänzen?'}
      </label>
      <textarea
        id={id}
        className={`um-ta${fehlt ? ' err' : ''}`}
        style={klein ? { minHeight: 60, fontSize: 16 } : undefined}
        placeholder={klein ? (pflicht ? 'Bitte konkret…' : 'Optional…') : pflicht ? 'Bitte konkret beschreiben…' : 'Zusätzliche Anmerkungen…'}
        value={wert}
        onChange={(e) => onChange(e.target.value)}
      />
      {fehlt && <div className="um-fehlertext">{klein ? 'Kommentar erforderlich.' : 'Bitte einen Kommentar hinterlassen.'}</div>}
    </div>
  )
}

/** Eine Verhaltens-Seite: Titel des Verhaltens, Video, Bewertungsstufen, Selbstbild und Fremdbild aller Kollegen. */
export default function VerhaltenSeite(p: Props) {
  const { verhalten: v, antworten } = p
  const gesehen = !!antworten.videoGesehen[v.nr]
  const gesperrt = !gesehen
  const sb = selbstVon(antworten, v.nr)

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
        <h2 className="um-verhalten-titel">{v.titel}</h2>
      </div>

      <VideoBox
        key={v.nr}
        videoUrl={v.video_url}
        titel={`Verhalten ${v.nr} · ${v.titel.length > 45 ? `${v.titel.substring(0, 45)}…` : v.titel}`}
        gesehen={gesehen}
        platzhalterSekunden={p.platzhalterSekunden}
        onGesehen={p.onVideoGesehen}
      />

      <Kriterien kriterien={v.kriterien} />

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
          <div className="um-reihe" id="um-sb-reihe" role="group" aria-label="Selbstbild: Note 1 bis 5">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                disabled={gesperrt}
                aria-pressed={sb.note === i}
                className={`um-rbtn${klasse(sb.note === i, i)}`}
                onClick={() => p.onSelbst({ note: i })}
              >
                <span className="um-rnum">{i}</span>
                <span className="um-rlbl">{BEWERTUNG_LABELS[i - 1]}</span>
              </button>
            ))}
          </div>
          {sb.note !== null && (
            <Kommentar
              id="um-sb-ta"
              note={sb.note}
              wert={sb.kommentar}
              fehlt={p.versucht && sb.note >= PFLICHT_AB && !sb.kommentar.trim()}
              onChange={(kommentar) => p.onSelbst({ kommentar })}
            />
          )}
        </div>

        <div className="um-trenner" />

        <div>
          <div className="um-pill um-pill-fb">
            <span className="um-pill-punkt" />
            Fremdbild
          </div>
          <div className="um-fb" id="um-fb-bereich">
            {p.kollegen.map((k) => {
              const f = fremdVon(antworten, v.nr, k.id)
              return (
                <div className="um-fb-zeile" key={k.id}>
                  <span className="um-fb-av" aria-hidden="true">
                    {initiale(k.name)}
                  </span>
                  <div className="um-fb-info">
                    <div className="um-fb-name">{k.name}</div>
                    <div className="um-fb-reihe" role="group" aria-label={`Fremdbild ${k.name}: Note 1 bis 5`}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={gesperrt}
                          aria-pressed={f.note === i}
                          className={`um-fb-btn${klasse(f.note === i, i)}`}
                          onClick={() => p.onFremd(k.id, { note: i })}
                        >
                          {i}
                        </button>
                      ))}
                    </div>
                    {f.note !== null && (
                      <Kommentar
                        id={`um-fb-ta-${k.id}`}
                        note={f.note}
                        wert={f.kommentar}
                        fehlt={p.versucht && f.note >= PFLICHT_AB && !f.kommentar.trim()}
                        klein
                        onChange={(kommentar) => p.onFremd(k.id, { kommentar })}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {p.sendeFehler && (
        <div className="um-sendefehler" role="alert">
          {p.sendeFehler} Deine Eingaben sind noch da – bitte einfach erneut auf „Absenden“ tippen.
        </div>
      )}

      <div className="um-nav">
        <button type="button" className="btn btn-sekundaer" disabled={p.sendet} onClick={p.onZurueck}>
          Zurück
        </button>
        <button type="button" className="btn btn-primaer" disabled={p.sendet} onClick={p.onWeiter}>
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
