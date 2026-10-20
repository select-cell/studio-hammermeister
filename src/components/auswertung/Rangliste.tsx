import { einordnung, fmt, fmtDiff, type DashboardPerson } from '../../lib/auswertung'

/** Teammitglieder nach Ø Fremdbild; Platz 1–3 hervorgehoben, gewählte Person markiert (§5.6). */
export default function Rangliste({
  personen,
  schwelle,
  gewaehlt,
  onWahl,
}: {
  personen: DashboardPerson[]
  schwelle: number
  gewaehlt?: string | null
  onWahl?: (id: string) => void
}) {
  const sortiert = [...personen].sort((a, b) => (a.rang ?? 999) - (b.rang ?? 999) || a.name.localeCompare(b.name, 'de'))
  return (
    <ol className="au-rangliste">
      {sortiert.map((p) => {
        const ein = einordnung(p.diff, schwelle)
        const inhalt = (
          <>
            <span className={`au-platz${p.rang !== null && p.rang <= 3 ? ` au-platz-${p.rang}` : ''}`}>{p.rang ?? '–'}</span>
            <span className="au-rang-name">{p.name}</span>
            <span className="au-rang-wert" title="Ø Fremdbild">
              {fmt(p.fb)}
            </span>
            <span className={`au-rang-diff${ein ? ` au-ton-${ein.ton}` : ''}`} title={ein ? ein.text : 'Noch keine Differenz'}>
              {fmtDiff(p.diff)}
            </span>
          </>
        )
        return (
          <li key={p.id} className={`au-rang${p.id === gewaehlt ? ' au-rang-gewaehlt' : ''}`} aria-current={p.id === gewaehlt ? 'true' : undefined}>
            {onWahl ? (
              <button type="button" className="au-rang-knopf" onClick={() => onWahl(p.id)}>
                {inhalt}
              </button>
            ) : (
              <div className="au-rang-knopf">{inhalt}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
