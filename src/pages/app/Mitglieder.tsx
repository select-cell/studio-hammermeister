import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Abschnitt from '../../components/auswertung/Abschnitt'
import LadeFehler from '../../components/auswertung/LadeFehler'
import MonatsAuswahl from '../../components/auswertung/MonatsAuswahl'
import Seitenkopf from '../../components/auswertung/Seitenkopf'
import { ladeTeamDashboard } from '../../lib/api'
import { einordnung, fmt, fmtDiff, schwellenVon } from '../../lib/auswertung'
import { monatName } from '../../lib/monat'
import { rolleLabel } from '../../lib/rechte'
import { useLaden } from '../../lib/useLaden'

/** /app/mitglieder – alle Teilnehmer mit Kennzahlen; ein Klick führt zur individuellen Auswertung. */
export default function Mitglieder() {
  const { person } = useAuth()
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const l = useLaden(() => ladeTeamDashboard(auswahl ?? undefined), auswahl ?? 'neuester')
  if (!person) return null
  const d = l.daten
  if (!d) return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Mitglieder werden geladen …" />

  const schwelle = schwellenVon(person.salon).ausgewogen
  const personen = [...d.personen].sort((a, b) => a.name.localeCompare(b.name, 'de'))

  return (
    <>
      <Seitenkopf titel="Mitglieder" text={d.monat ? `Kennzahlen für ${monatName(d.monat)}` : 'Die individuelle Auswertung jedes Teammitglieds.'}>
        <MonatsAuswahl monate={d.monate} monat={d.monat} onWahl={setAuswahl} />
      </Seitenkopf>

      <Abschnitt titel="Teammitglieder" hinweis="Alle aktiven Teilnehmer der Teamumfrage.">
        <ul className="au-mitglieder">
          {personen.map((p) => {
            const ein = einordnung(p.diff, schwelle)
            return (
              <li key={p.id}>
                <Link to={`/app/mitglieder/${p.id}`} className="au-mitglied">
                  <span className="avatar" aria-hidden="true">
                    {p.name.charAt(0)}
                  </span>
                  <span className="au-mitglied-name">
                    <strong>{p.name}</strong>
                    <small>
                      {p.rolle !== 'mitarbeiter' && `${rolleLabel[p.rolle]} · `}
                      {d.monat ? (p.abgegeben ? 'Umfrage abgegeben' : 'Umfrage offen') : 'Noch keine Umfrage'}
                    </small>
                  </span>
                  <span className="au-mitglied-zahlen">
                    <span title="Ø Fremdbild">FB {fmt(p.fb)}</span>
                    <span className={ein ? `au-ton-${ein.ton}` : undefined} title={ein?.text ?? 'Differenz'}>
                      {fmtDiff(p.diff)}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        {personen.length === 0 && <p className="au-leer">Es gibt noch keine Teilnehmer.</p>}
      </Abschnitt>
    </>
  )
}
