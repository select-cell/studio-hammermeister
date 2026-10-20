import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import LadeFehler from '../../components/auswertung/LadeFehler'
import MonatsAuswahl from '../../components/auswertung/MonatsAuswahl'
import Seitenkopf from '../../components/auswertung/Seitenkopf'
import TeamAnsicht from '../../components/auswertung/TeamAnsicht'
import TeamDashboardAnsicht from '../../components/auswertung/TeamDashboardAnsicht'
import { ladeTeamErgebnisse } from '../../lib/api'
import { neuesterMonat, schwellenVon } from '../../lib/auswertung'
import { istLeitung } from '../../lib/rechte'
import { useLaden } from '../../lib/useLaden'

/** Teammitglieder sehen das Team nur als Schnitt. */
function TeamSchnitt() {
  const { person } = useAuth()
  const l = useLaden(ladeTeamErgebnisse, 'team')
  const [auswahl, setAuswahl] = useState<string | null>(null)
  if (!person) return null
  if (!l.daten) return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Team-Ergebnisse werden geladen …" />

  const monat = auswahl && l.daten.monate.includes(auswahl) ? auswahl : neuesterMonat(l.daten.monate)
  return (
    <>
      <Seitenkopf titel="Team-Ergebnisse" text="So steht das Team insgesamt da – als Durchschnitt, ohne einzelne Personen.">
        <MonatsAuswahl monate={l.daten.monate} monat={monat} onWahl={setAuswahl} />
      </Seitenkopf>
      <TeamAnsicht daten={l.daten} monat={monat} schwellen={schwellenVon(person.salon)} />
    </>
  )
}

/** /app/team – Verantwortliche und Admin: Dashboard; alle anderen: Team-Schnitt. */
export default function Team() {
  const { person } = useAuth()
  if (!person) return null
  return istLeitung(person) ? <TeamDashboardAnsicht schwellen={schwellenVon(person.salon)} /> : <TeamSchnitt />
}
