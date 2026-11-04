import { useAuth } from '../../auth/AuthContext'
import { ladePdfProtokoll } from '../../lib/api'
import { monatName } from '../../lib/monat'
import { useLaden } from '../../lib/useLaden'

const zeitpunkt = (iso: string) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })

/** Das Export-Protokoll der PDF-Berichte: nur der Admin sieht es (die Datenbank lehnt alle anderen ab). */
function ExportProtokoll() {
  const l = useLaden(() => ladePdfProtokoll(50), 'protokoll')
  return (
    <section className="karte info-abschnitt">
      <h2 className="karte-titel">Export-Protokoll (nur Admin)</h2>
      <p>Jeder Abruf eines PDF-Berichts wird festgehalten: wann, von wem, welcher Bericht.</p>
      {!l.daten ? (
        <p className="text-gedimmt">{l.fehler ? 'Das Protokoll konnte nicht geladen werden.' : 'Protokoll wird geladen …'}</p>
      ) : l.daten.length === 0 ? (
        <p className="text-gedimmt">Noch wurde kein PDF erstellt.</p>
      ) : (
        <div className="au-tabelle-wrap">
          <table className="au-tabelle">
            <thead>
              <tr>
                <th scope="col">Zeitpunkt</th>
                <th scope="col">Von</th>
                <th scope="col">Bericht</th>
                <th scope="col">Monat</th>
              </tr>
            </thead>
            <tbody>
              {l.daten.map((e, i) => (
                <tr key={i}>
                  <td>{zeitpunkt(e.erstellt_am)}</td>
                  <td>{e.von}</td>
                  <td>{e.art === 'monatsbericht' ? 'Monatsbericht' : `Personenbericht${e.person ? `: ${e.person}` : ''}`}</td>
                  <td>{monatName(e.monat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** /app/info – Hinweise zu Datenschutz und Funktionen der Plattform, für alle eingeloggten Personen. */
export default function Info() {
  const { person } = useAuth()
  return (
    <>
      <header className="au-kopf">
        <div>
          <h1 className="au-titel">Info und Datenschutz</h1>
          <p className="text-gedimmt">Was die Plattform speichert und wer es sehen kann.</p>
        </div>
      </header>

      <section className="karte info-abschnitt">
        <h2 className="karte-titel">Anmeldung</h2>
        <p>
          Dein Zugang gehört nur dir. Das Passwort kannst du jederzeit unter „Passwort ändern“ selbst ändern. Neue Zugänge legt der
          Plattformbetreiber an.
        </p>
      </section>

      <section className="karte info-abschnitt">
        <h2 className="karte-titel">Kommentare in der Umfrage</h2>
        <p>
          Deine Kommentare sehen deine Kollegen nie mit deinem Namen. Die Verantwortlichen sehen aber, wie häufig und ausführlich Feedback-Kommentare
          geschrieben werden: je Person die Zahl der Kommentare, ihre Länge und ob jemand zu einem Verhalten gar nichts geschrieben hat. Die Texte
          selbst gehören dazu nicht.
        </p>
      </section>

      <section className="karte info-abschnitt">
        <h2 className="karte-titel">Ausfüllzeit der Umfrage</h2>
        <p>
          Während du die Monatsumfrage ausfüllst, misst die Plattform, wie lange du aktiv dabei bist: Die Seite ist sichtbar und du bedienst
          sie. Pausen zählen nicht. Am Ende siehst du deine eigene Zeit. Die Salonleitung sieht die Zeit je Person und je Verhalten.
        </p>
        <p>
          Gespeichert werden nur Zeiten, nicht, was du dabei tippst oder ansiehst. Auffällig schnelle oder sehr lange Zeiten werden markiert,
          aber nicht gelöscht.
        </p>
      </section>

      {person?.rolle === 'admin' && <ExportProtokoll />}
    </>
  )
}
