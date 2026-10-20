import { Link } from 'react-router-dom'
import { PFLICHT_AB, fremdVon, ritualKey, selbstVon, type Antworten, type UmfrageInhalt } from '../../lib/umfrage'

const note = (n: number | null) => (n === null ? '–' : <span className={`um-ssc ${n >= PFLICHT_AB ? 'hi' : 'lo'}`}>{n}</span>)

/** Abschlussseite: Dank, Status des Speicherns und alle Antworten zur Kontrolle. */
export default function Zusammenfassung({
  name,
  inhalt,
  antworten: a,
  status,
  dauerMin,
}: {
  name: string
  inhalt: UmfrageInhalt
  antworten: Antworten
  status: { art: 'ok' | 'warn'; text: string }
  dauerMin: number | null
}) {
  const entwicklung = inhalt.kollegen.find((k) => k.id === a.entwicklungPersonId)
  const erfasst = inhalt.rituale.length > 0 ? 'Entwicklungsfrage, Rituale und alle Verhalten erfasst' : 'Entwicklungsfrage und alle Verhalten erfasst'
  const segmentKey = (g: string | null, s: string | null) => `${g ?? ''}|${s ?? ''}`
  let letztesSegment: string | null = null

  return (
    <div className="um-seite">
      <div className="um-sum-hero">
        <div className="um-sum-check">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="um-sum-titel">Danke, {name}!</h1>
        <div className="um-sum-sub">
          {erfasst}
          {dauerMin !== null ? ` · ausgefüllt in ${dauerMin} Min` : ''}.
        </div>
      </div>

      <div className={`um-status ${status.art}`} role="status">
        {status.text}
      </div>

      <div className="um-sum-karte">
        <h2 className="um-kartentitel" style={{ marginBottom: '.6rem' }}>Entwicklung des Monats</h2>
        <p className="text-gedimmt" style={{ fontSize: 13 }}>
          <strong>{entwicklung?.name ?? '–'}</strong> – {a.entwicklungBegruendung}
        </p>
      </div>

      {inhalt.rituale.map((r) => (
        <div className="um-sum-karte" key={r.id}>
          <h2 className="um-kartentitel" style={{ marginBottom: '.6rem' }}>{r.titel}</h2>
          <table className="um-sum-tabelle">
            <tbody>
              {r.fragen.map((f) => {
                const v = a.rituale[ritualKey(r.id, f.nr)]
                return (
                  <tr key={f.nr}>
                    <td className="um-zelle-klein">{f.frage}</td>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{v === null || v === undefined || v === '' ? '–' : String(v)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {inhalt.verhalten.map((v) => {
        const key = segmentKey(v.grundpfeiler, v.saeule)
        const zeigeSegment = (v.grundpfeiler || v.saeule) && key !== letztesSegment
        if (v.grundpfeiler || v.saeule) letztesSegment = key
        const sb = selbstVon(a, v.nr)
        return (
          <div key={v.nr}>
            {zeigeSegment && (
              <div className="um-sum-seg">
                <div className="um-seg-gp">{v.grundpfeiler}</div>
                <div className="um-seg-sa">{v.saeule}</div>
              </div>
            )}
            <div className="um-sum-karte">
              <h2>{v.titel}</h2>
              <table className="um-sum-tabelle">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Art</th>
                    <th style={{ textAlign: 'center' }}>Note</th>
                    <th>Kommentar</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 500 }}>{name}</td>
                    <td><span className="um-art-sb">SB</span></td>
                    <td style={{ textAlign: 'center' }}>{note(sb.note)}</td>
                    <td className="um-zelle-klein">{sb.kommentar.trim() || '–'}</td>
                  </tr>
                  {inhalt.kollegen.map((k) => {
                    const f = fremdVon(a, v.nr, k.id)
                    return (
                      <tr key={k.id}>
                        <td className="text-gedimmt">{k.name}</td>
                        <td><span className="um-art-fb">FB</span></td>
                        <td style={{ textAlign: 'center' }}>{note(f.note)}</td>
                        <td className="um-zelle-klein">{f.kommentar.trim() || '–'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      <Link to="/app" className="btn btn-primaer btn-voll" style={{ marginTop: '1rem' }}>
        Zur Startseite
      </Link>
    </div>
  )
}
