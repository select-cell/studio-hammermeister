import { fmt, type RitualWert, type TeamMonat } from '../../lib/auswertung'

/** Antworten einer Person auf die Rituale-Fragen, gruppiert nach Ritual. */
export function RitualeEinzel({ rituale }: { rituale: RitualWert[] }) {
  const gruppen = [...new Set(rituale.map((r) => r.ritual))]
  return (
    <div className="au-rituale">
      {gruppen.map((name) => (
        <div key={name} className="au-ritual">
          <h3 className="au-ritual-titel">{name}</h3>
          <dl>
            {rituale
              .filter((r) => r.ritual === name)
              .sort((a, b) => a.frage_nr - b.frage_nr)
              .map((r) => (
                <div key={r.frage_nr} className="au-ritual-zeile">
                  <dt>{r.frage}</dt>
                  <dd>{r.zahl !== null ? fmt(r.zahl, Number.isInteger(r.zahl) ? 0 : 2) : (r.text ?? '–')}</dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

/** Team-Schnitte der Rituale: Skalen-Schnitte und die am häufigsten genannten „am wenigsten stabilen Phasen“. */
export function RitualeTeam({ rituale }: { rituale: TeamMonat['rituale'] }) {
  const gruppen = [...new Set([...rituale.skalen.map((s) => s.ritual), ...rituale.phasen.map((p) => p.ritual)])]
  return (
    <div className="au-rituale">
      {gruppen.map((name) => (
        <div key={name} className="au-ritual">
          <h3 className="au-ritual-titel">{name}</h3>
          <dl>
            {rituale.skalen
              .filter((s) => s.ritual === name)
              .map((s) => (
                <div key={`s${s.frage_nr}`} className="au-ritual-zeile">
                  <dt>{s.frage}</dt>
                  <dd>
                    Ø {fmt(s.schnitt)} <small>({s.anzahl} Antworten)</small>
                  </dd>
                </div>
              ))}
            {rituale.phasen
              .filter((p) => p.ritual === name)
              .map((p) => (
                <div key={`p${p.frage_nr}-${p.phase}`} className="au-ritual-zeile">
                  <dt>{p.frage}</dt>
                  <dd>
                    {p.phase} <small>({p.nennungen}×)</small>
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

export const hatTeamRituale = (r: TeamMonat['rituale'] | undefined): r is TeamMonat['rituale'] => !!r && r.skalen.length + r.phasen.length > 0
