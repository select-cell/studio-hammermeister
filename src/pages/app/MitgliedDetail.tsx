import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import LadeFehler from '../../components/auswertung/LadeFehler'
import MonatsAuswahl from '../../components/auswertung/MonatsAuswahl'
import PersonAnsicht from '../../components/auswertung/PersonAnsicht'
import Seitenkopf from '../../components/auswertung/Seitenkopf'
import { ladePersonErgebnisse } from '../../lib/api'
import { neuesterMonat, schwellenVon } from '../../lib/auswertung'
import { useLaden } from '../../lib/useLaden'

function Inhalt({ id }: { id: string }) {
  const { person } = useAuth()
  const l = useLaden(() => ladePersonErgebnisse(id), id)
  const [auswahl, setAuswahl] = useState<string | null>(null)
  if (!person) return null
  if (!l.daten) {
    return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Auswertung wird geladen …" />
  }
  const monat = auswahl && l.daten.monate.includes(auswahl) ? auswahl : neuesterMonat(l.daten.monate)
  return (
    <>
      <Seitenkopf titel={l.daten.person.name} text="Individuelle Auswertung" zurueck={{ pfad: '/app/mitglieder', label: 'Alle Mitglieder' }}>
        <MonatsAuswahl monate={l.daten.monate} monat={monat} onWahl={setAuswahl} />
      </Seitenkopf>
      <PersonAnsicht daten={l.daten} monat={monat} schwellen={schwellenVon(person.salon)} />
    </>
  )
}

/** /app/mitglieder/:id – die individuelle Auswertung eines Teammitglieds (nur Verantwortliche und Admin). */
export default function MitgliedDetail() {
  const { id } = useParams()
  return id ? <Inhalt key={id} id={id} /> : null
}
