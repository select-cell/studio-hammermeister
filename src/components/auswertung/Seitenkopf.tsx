import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Kopf einer Auswertungsseite: Titel, Erläuterung und rechts die Monatsauswahl. */
export default function Seitenkopf({ titel, text, zurueck, children }: { titel: string; text?: string; zurueck?: { pfad: string; label: string }; children?: ReactNode }) {
  return (
    <>
      {zurueck && (
        <p className="zurueck">
          <Link to={zurueck.pfad}>← {zurueck.label}</Link>
        </p>
      )}
      <header className="au-kopf">
        <div>
          <h1 className="au-titel">{titel}</h1>
          {text && <p className="text-gedimmt">{text}</p>}
        </div>
        {children}
      </header>
    </>
  )
}
