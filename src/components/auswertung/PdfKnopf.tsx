import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { istLeitung } from '../../lib/rechte'

/**
 * „PDF“-Knopf für den Monatsbericht (art „monat“) oder den Personenbericht (art „person“). Nur für Verantwortliche und Admin sichtbar;
 * der Schutz liegt in der Datenbank (pdf_monatsbericht und pdf_personenbericht lehnen alle anderen mit 42501 ab).
 * Die PDF-Bibliothek wird erst beim Klick geladen.
 */
export default function PdfKnopf({ art, monat, personId, label }: { art: 'monat' | 'person'; monat: string | null; personId?: string; label?: string }) {
  const { person } = useAuth()
  const [zustand, setZustand] = useState<'bereit' | 'laedt' | 'fertig' | 'fehler'>('bereit')
  if (!person || !istLeitung(person) || !monat || (art === 'person' && !personId)) return null

  async function los() {
    if (!monat) return
    setZustand('laedt')
    try {
      const { erzeugePdf } = await import('../../pdf/erzeuge')
      await erzeugePdf(art === 'monat' ? { art, monat } : { art, personId: personId as string, monat })
      setZustand('fertig')
    } catch {
      setZustand('fehler')
    }
  }

  return (
    <div className="au-pdf">
      <button type="button" className="btn btn-sekundaer btn-klein" onClick={los} disabled={zustand === 'laedt'} aria-busy={zustand === 'laedt'}>
        {zustand === 'laedt' ? 'PDF wird erstellt …' : (label ?? (art === 'monat' ? 'Monatsbericht als PDF' : 'Personenbericht als PDF'))}
      </button>
      <span className="au-pdf-status text-klein" role="status">
        {zustand === 'fertig' && 'Das PDF wurde heruntergeladen.'}
        {zustand === 'fehler' && 'Das PDF konnte nicht erstellt werden. Bitte versuche es noch einmal.'}
      </span>
    </div>
  )
}
