import { einordnung, fmt, fmtDiff } from '../../lib/auswertung'

/** Ø Selbstbild · Ø Fremdbild · Differenz mit Einordnung · Ø Ausfülldauer (§5.6). */
export default function KennzahlKacheln({
  sb,
  fb,
  diff,
  dauerMin,
  schwelle,
  teamSicht = false,
  fremdbilder,
}: {
  sb: number | null
  fb: number | null
  diff: number | null
  dauerMin: number | null
  schwelle: number
  /** Team-Sicht nutzt die Kurzform „SB > FB“ */
  teamSicht?: boolean
  /** Hinweis unter dem Fremdbild, z. B. „von 5 Kolleg:innen“ */
  fremdbilder?: string
}) {
  const ein = einordnung(diff, schwelle)
  return (
    <div className="au-kacheln" aria-label="Kennzahlen">
      <div className="au-kachel au-kachel-sb">
        <span className="au-kachel-label">Ø Selbstbild</span>
        <span className="au-kachel-wert">{fmt(sb)}</span>
        <span className="au-kachel-sub">von 5</span>
      </div>
      <div className="au-kachel au-kachel-fb">
        <span className="au-kachel-label">Ø Fremdbild</span>
        <span className="au-kachel-wert">{fmt(fb)}</span>
        <span className="au-kachel-sub">{fremdbilder ?? 'von 5'}</span>
      </div>
      <div className="au-kachel">
        <span className="au-kachel-label">Differenz</span>
        <span className={`au-kachel-wert${ein ? ` au-ton-${ein.ton}` : ''}`}>{fmtDiff(diff)}</span>
        <span className="au-kachel-sub">
          {ein ? <span className={`abzeichen ${ein.ton === 'gut' ? 'abzeichen-gruen' : 'abzeichen-rot'}`}>{teamSicht ? ein.kurz : ein.text}</span> : 'SB − FB'}
        </span>
      </div>
      <div className="au-kachel">
        <span className="au-kachel-label">Ø Ausfülldauer</span>
        <span className="au-kachel-wert">{dauerMin === null ? '–' : fmt(dauerMin, 1)}</span>
        <span className="au-kachel-sub">Minuten</span>
      </div>
    </div>
  )
}
