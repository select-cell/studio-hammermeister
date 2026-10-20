import { Component, type ReactNode } from 'react'

interface Zustand {
  fehler: boolean
}

/**
 * Fängt Fehler beim Anzeigen ab, vor allem nachgeladene Seiten, die nach einem Update nicht mehr existieren
 * (alter Tab, neue Version). Statt einer leeren Seite gibt es einen Knopf zum Neuladen.
 */
export default class Fehlergrenze extends Component<{ children: ReactNode }, Zustand> {
  state: Zustand = { fehler: false }

  static getDerivedStateFromError(): Zustand {
    return { fehler: true }
  }

  render() {
    if (!this.state.fehler) return this.props.children
    return (
      <section className="karte au-fehler">
        <h2 className="karte-titel">Diese Seite konnte nicht geladen werden</h2>
        <p className="text-gedimmt">Vielleicht gibt es eine neue Version der Plattform. Lade die Seite neu, dann klappt es meistens.</p>
        <div className="knopfreihe">
          <button type="button" className="btn btn-primaer" onClick={() => window.location.reload()}>
            Seite neu laden
          </button>
        </div>
      </section>
    )
  }
}
