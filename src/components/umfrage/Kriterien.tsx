import { useState } from 'react'
import { STUFEN_NAMEN, type Kriterium } from '../../lib/umfrage'

/** Aufklappbare Bewertungsstufen 1–5. Ohne Inhalte wird der ganze Block ausgeblendet. */
export default function Kriterien({ kriterien }: { kriterien: Kriterium[] }) {
  const [offen, setOffen] = useState<number[]>([])
  if (!kriterien.some((k) => k.leitsatz || k.punkte.length > 0)) return null

  const umschalten = (stufe: number) => setOffen((o) => (o.includes(stufe) ? o.filter((s) => s !== stufe) : [...o, stufe]))

  return (
    <div className="um-krit">
      <div className="um-krit-titel">Bewertungsstufen</div>
      <div className="um-krit-liste">
        {STUFEN_NAMEN.map((standardName, i) => {
          const stufe = i + 1
          const k = kriterien.find((x) => x.stufe === stufe)
          const istOffen = offen.includes(stufe)
          return (
            <div className={`um-krit-eintrag${istOffen ? ' offen' : ''}`} key={stufe}>
              <button type="button" className="um-krit-kopf" aria-expanded={istOffen} onClick={() => umschalten(stufe)}>
                <span className={`um-krit-badge um-kb-${stufe}`}>{stufe}</span>
                <span className="um-krit-kopftext">
                  <span className="um-krit-label">{k?.bezeichnung || standardName}</span>
                  {k?.prozent && <span className="um-krit-prozent" style={{ display: 'block' }}>{k.prozent}</span>}
                </span>
                <svg className="um-krit-pfeil" viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div className="um-krit-inhalt">
                {k?.leitsatz && <div className="um-krit-leitsatz">{k.leitsatz}</div>}
                {k && k.punkte.length > 0 && (
                  <ul>
                    {k.punkte.map((p, n) => (
                      <li key={n}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
