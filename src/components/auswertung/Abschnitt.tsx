import type { ReactNode } from 'react'

/** Karte für einen Auswertungs-Baustein: Titel, optionaler Hinweis, Inhalt. */
export default function Abschnitt({ titel, hinweis, aktion, children }: { titel: string; hinweis?: string; aktion?: ReactNode; children: ReactNode }) {
  return (
    <section className="karte au-abschnitt">
      <div className="karte-kopf">
        <h2 className="karte-titel">{titel}</h2>
        {aktion}
      </div>
      {hinweis && <p className="text-gedimmt text-klein">{hinweis}</p>}
      {children}
    </section>
  )
}

export function Leer({ text }: { text: string }) {
  return <p className="au-leer">{text}</p>
}
