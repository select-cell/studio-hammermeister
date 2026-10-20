/** Abgabe-Status des laufenden Monats für Verantwortliche und Admin (Phase 4: abgabe_status(), Reminder-Popup). */
export default function StatusKarte() {
  return (
    <section className="karte" aria-labelledby="status-karte-titel">
      <div className="karte-kopf">
        <h2 className="karte-titel" id="status-karte-titel">
          Abgabe-Status
        </h2>
        <span className="abzeichen">Kommt bald</span>
      </div>
      <p className="text-gedimmt">
        Hier siehst du, wer die Umfrage für den laufenden Monat schon abgegeben hat – und wer erinnert werden sollte.
      </p>
    </section>
  )
}
