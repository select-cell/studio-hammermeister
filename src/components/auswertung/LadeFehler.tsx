import Laden from '../Laden'

/** Ladezustand und Fehlerfall für Auswertungsseiten, solange noch gar keine Daten da sind. */
export default function LadeFehler({ laedt, fehler, neuLaden, text }: { laedt: boolean; fehler: boolean; neuLaden: () => void; text: string }) {
  if (laedt && !fehler) return <Laden text={text} />
  return (
    <section className="karte au-fehler">
      <h2 className="karte-titel">Das hat nicht geklappt</h2>
      <p className="text-gedimmt">Die Auswertung konnte nicht geladen werden. Bitte prüfe die Verbindung und versuche es noch einmal.</p>
      <div className="knopfreihe">
        <button type="button" className="btn btn-primaer" onClick={neuLaden}>
          Erneut versuchen
        </button>
      </div>
    </section>
  )
}
