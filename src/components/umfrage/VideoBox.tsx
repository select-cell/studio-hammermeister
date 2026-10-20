import { useEffect, useRef, useState } from 'react'
import { videoQuelle, zeitText } from '../../lib/umfrage'
import { ladeVimeoApi, type VimeoPlayer } from '../../lib/vimeo'

interface Props {
  videoUrl: string | null
  titel: string
  gesehen: boolean
  platzhalterSekunden: number
  onGesehen: () => void
}

/**
 * Video vor der Bewertung (Pflicht). Drei Fälle wie in der Umfrage:
 *  - keine URL: Platzhalter mit Timer, nach Ablauf gilt es als angesehen
 *  - .mp4-URL: normales Video, Steuerung erst nach dem Ansehen
 *  - Vimeo: Einbettung mit Vorspulsperre; lässt sich die Steuerung nicht laden, wird nichts blockiert
 * Pro Verhalten mit key={nr} einbinden, damit der Zustand zurückgesetzt wird.
 */
export default function VideoBox({ videoUrl, titel, gesehen, platzhalterSekunden, onGesehen }: Props) {
  const quelle = videoQuelle(videoUrl)
  const [laeuft, setLaeuft] = useState(false)
  const [sekunden, setSekunden] = useState(0)
  const [fortschritt, setFortschritt] = useState(0)
  const [zeit, setZeit] = useState('')
  const dateiRef = useRef<HTMLVideoElement>(null)
  const vimeoRef = useRef<HTMLIFrameElement>(null)
  const gesehenRef = useRef(onGesehen)
  gesehenRef.current = onGesehen

  // Platzhalter: Sekundentakt bis zum Ablauf
  useEffect(() => {
    if (quelle.typ !== 'keine' || !laeuft || gesehen) return
    const takt = window.setInterval(() => setSekunden((s) => s + 1), 1000)
    return () => window.clearInterval(takt)
  }, [quelle.typ, laeuft, gesehen])

  useEffect(() => {
    if (quelle.typ !== 'keine' || !laeuft || gesehen) return
    setFortschritt(Math.min((sekunden / platzhalterSekunden) * 100, 100))
    setZeit(`${zeitText(sekunden)} / ${zeitText(platzhalterSekunden)}`)
    if (sekunden >= platzhalterSekunden) gesehenRef.current()
  }, [sekunden, quelle.typ, laeuft, gesehen, platzhalterSekunden])

  // Vimeo: Vorspulen verhindern, am Ende als angesehen markieren
  const vimeoUrl = quelle.typ === 'vimeo' ? quelle.url : null
  useEffect(() => {
    if (!vimeoUrl || gesehen) return
    let abgebrochen = false
    let player: VimeoPlayer | null = null
    ladeVimeoApi()
      .then(() => {
        if (abgebrochen || !vimeoRef.current || !window.Vimeo) return
        player = new window.Vimeo.Player(vimeoRef.current)
        let maxGesehen = 0
        let dauer = 0
        let korrigiert = false
        player.getDuration().then((d) => { dauer = d }).catch(() => undefined)
        const waechter = (daten: { seconds: number }) => {
          if (korrigiert) return
          if (daten.seconds > maxGesehen + 2) {
            korrigiert = true
            player?.setCurrentTime(maxGesehen).finally(() => { korrigiert = false })
          } else {
            maxGesehen = Math.max(maxGesehen, daten.seconds)
            if (dauer) setFortschritt(Math.min((maxGesehen / dauer) * 100, 100))
          }
        }
        player.on('timeupdate', waechter)
        player.on('seeked', waechter)
        player.on('ended', () => {
          if (!dauer || maxGesehen >= dauer - 3) gesehenRef.current()
        })
      })
      .catch(() => {
        if (!abgebrochen) gesehenRef.current() // Steuerung nicht ladbar (z. B. Netzwerk): Bewertung nicht blockieren
      })
    return () => {
      abgebrochen = true
      player?.destroy().catch(() => undefined)
    }
  }, [vimeoUrl, gesehen])

  const abspielen = () => {
    if (gesehen) return
    setLaeuft(true)
    if (quelle.typ === 'datei') {
      dateiRef.current?.play().catch(() => setLaeuft(false))
    }
  }

  const zeigeOverlay = !gesehen && quelle.typ !== 'vimeo'
  const balken = gesehen ? 100 : fortschritt
  const zeitAnzeige = gesehen || quelle.typ === 'vimeo' ? '' : zeit || (quelle.typ === 'keine' ? `0:00 / ${zeitText(platzhalterSekunden)}` : '')

  return (
    <div className="um-video" id="um-video">
      {quelle.typ === 'keine' && (
        <div className="um-video-platz">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <div className="um-video-titel">{titel}</div>
        </div>
      )}

      {quelle.typ === 'datei' && (
        <video
          ref={dateiRef}
          className="um-video-datei"
          src={quelle.url}
          playsInline
          preload="metadata"
          controls={gesehen}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            if (!v.duration || gesehen) return
            setFortschritt(Math.min((v.currentTime / v.duration) * 100, 100))
            setZeit(`${zeitText(v.currentTime)} / ${zeitText(v.duration)}`)
          }}
          onEnded={() => gesehenRef.current()}
        />
      )}

      {quelle.typ === 'vimeo' && (
        <div className="um-video-vimeo">
          <iframe
            ref={vimeoRef}
            title="Video"
            src={`${quelle.url}${quelle.url.includes('?') ? '&' : '?'}badge=0&autopause=0&dnt=1`}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      <div className="um-video-balken">
        <div className="um-video-fuellung" style={{ width: `${balken}%` }} />
      </div>
      {zeitAnzeige && <div className="um-video-zeit">{zeitAnzeige}</div>}

      {gesehen && (
        <div className="um-video-abzeichen">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Angesehen
        </div>
      )}

      {zeigeOverlay && (
        <button type="button" className={`um-video-overlay${laeuft ? ' laeuft' : ''}`} onClick={abspielen} aria-label="Video ansehen zum Freischalten">
          {!laeuft && (
            <>
              <span className="um-video-play">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </span>
              <span className="um-video-hinweis">Video ansehen zum Freischalten</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}
