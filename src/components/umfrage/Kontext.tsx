import { initiale } from '../../lib/rechte'

/** Leiste über jedem Schritt: wer füllt aus, wo stehe ich. */
export default function Kontext({ name, zaehler }: { name: string; zaehler: string }) {
  return (
    <div className="um-ctx">
      <div className="um-ctx-links">
        <span className="um-ctx-av" aria-hidden="true">
          {initiale(name)}
        </span>
        <span className="um-ctx-name">{name}</span>
      </div>
      <span className="um-ctx-zaehler">{zaehler}</span>
    </div>
  )
}
