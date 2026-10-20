import { useEffect, useState } from 'react'
import { darstellungLabel, leseDarstellung, naechsteDarstellung, speichereDarstellung, wendeDarstellungAn, type Darstellung } from '../lib/darstellung'

function Symbol({ darstellung }: { darstellung: Darstellung }) {
  const gemeinsam = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (darstellung === 'dunkel') {
    return (
      <svg {...gemeinsam}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  }
  if (darstellung === 'hell') {
    return (
      <svg {...gemeinsam}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }
  return (
    <svg {...gemeinsam}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </svg>
  )
}

/** Schaltet zwischen automatisch, dunkel und hell um (ein Klick = nächste Darstellung). */
export default function DarstellungSchalter() {
  const [darstellung, setDarstellung] = useState<Darstellung>(leseDarstellung)

  // Anwenden bei jeder Änderung; im Modus „automatisch“ auch, wenn sich die Einstellung des Geräts ändert
  useEffect(() => {
    wendeDarstellungAn(darstellung)
    if (darstellung !== 'auto' || typeof window.matchMedia !== 'function') return
    const abfrage = window.matchMedia('(prefers-color-scheme: dark)')
    const aktualisieren = () => wendeDarstellungAn('auto')
    abfrage.addEventListener('change', aktualisieren)
    return () => abfrage.removeEventListener('change', aktualisieren)
  }, [darstellung])

  const wechseln = () => {
    const neu = naechsteDarstellung(darstellung)
    speichereDarstellung(neu)
    setDarstellung(neu)
  }

  return (
    <button
      type="button"
      className="darstellung-schalter"
      onClick={wechseln}
      title={`Darstellung: ${darstellungLabel[darstellung]} – klicken zum Wechseln`}
      aria-label={`Darstellung: ${darstellungLabel[darstellung]}. Klicken, um zu wechseln.`}
    >
      <Symbol darstellung={darstellung} />
      <span className="darstellung-text">{darstellungLabel[darstellung]}</span>
    </button>
  )
}
