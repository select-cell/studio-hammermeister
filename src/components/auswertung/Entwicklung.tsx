import Abschnitt from './Abschnitt'

/** „Entwicklung des Monats“: wie oft wurde jede Person genannt. Ohne Nennungen wird nichts gezeigt. */
export default function Entwicklung({ eintraege }: { eintraege: { name: string; nennungen: number }[] }) {
  if (eintraege.length === 0) return null
  return (
    <Abschnitt titel="Entwicklung des Monats" hinweis="Wer wurde in diesem Monat für die größte Entwicklung genannt?">
      <ul className="au-nennungen">
        {eintraege.map((e) => (
          <li key={e.name}>
            <span>{e.name}</span>
            <strong>
              {e.nennungen}× genannt
            </strong>
          </li>
        ))}
      </ul>
    </Abschnitt>
  )
}
