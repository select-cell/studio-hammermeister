/** /app/info – Hinweise zu Datenschutz und Funktionen der Plattform, für alle eingeloggten Personen. */
export default function Info() {
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
    </>
  )
}
