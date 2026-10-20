import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import LadeFehler from '../../components/auswertung/LadeFehler'
import MonatsAuswahl from '../../components/auswertung/MonatsAuswahl'
import PersonAnsicht from '../../components/auswertung/PersonAnsicht'
import Seitenkopf from '../../components/auswertung/Seitenkopf'
import { ladeMeineErgebnisse } from '../../lib/api'
import { neuesterMonat, schwellenVon } from '../../lib/auswertung'
import { useLaden } from '../../lib/useLaden'

/** /app/ergebnisse – die eigenen Ergebnisse; Kommentare ohne Absender (§5.6). */
export default function Ergebnisse() {
  const { person } = useAuth()
  const l = useLaden(ladeMeineErgebnisse, 'meine')
  const [auswahl, setAuswahl] = useState<string | null>(null)
  if (!person) return null
  if (!l.daten) return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Deine Ergebnisse werden geladen …" />

  const monat = auswahl && l.daten.monate.includes(auswahl) ? auswahl : neuesterMonat(l.daten.monate)
  return (
    <>
      <Seitenkopf titel="Meine Ergebnisse" text="So siehst du dich selbst – und so sehen dich deine Kolleg:innen.">
        <MonatsAuswahl monate={l.daten.monate} monat={monat} onWahl={setAuswahl} />
      </Seitenkopf>
      <PersonAnsicht daten={l.daten} monat={monat} schwellen={schwellenVon(person.salon)} eigene />
    </>
  )
}
