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
    </>
  )
}
