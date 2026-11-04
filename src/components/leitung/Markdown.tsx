import { markdownBloecke } from '../../lib/abschluss'

/** Zeigt den Text einer Analyse (Überschriften, Listen, Absätze). Alles wird als Text gesetzt, nie als HTML. */
export default function Markdown({ text }: { text: string | null | undefined }) {
  const bloecke = markdownBloecke(text)
  if (bloecke.length === 0) return <p className="text-gedimmt">Kein Text.</p>
  return (
    <div className="lt-md">
      {bloecke.map((b, i) =>
        b.art === 'ueberschrift' ? (
          <h4 key={i}>{b.text}</h4>
        ) : b.art === 'liste' ? (
          <ul key={i}>
            {b.punkte.map((p, j) => (
              <li key={j}>{p}</li>
            ))}
          </ul>
        ) : b.art === 'hinweis' ? (
          <p key={i} className="lt-md-hinweis">
            {b.text}
          </p>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  )
}
