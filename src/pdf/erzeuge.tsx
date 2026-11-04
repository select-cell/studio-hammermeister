// Erzeugt die PDF-Berichte im Browser und löst den Download aus. Dieses Modul (mit @react-pdf/renderer, rund 1,5 MB)
// wird nur geladen, wenn eine berechtigte Person auf „PDF“ klickt (dynamischer Import in PdfKnopf).
import { pdf } from '@react-pdf/renderer'
import { BRAND } from '../config/brand'
import { ladePdfMonatsbericht, ladePdfPersonenbericht } from '../lib/api'
import { pdfDateiname } from '../lib/pdf'
import { ladeLogo } from './logo'
import Monatsbericht from './Monatsbericht'
import Personenbericht from './Personenbericht'
import { registriereSchriften } from './schriften'

export type PdfAuftrag = { art: 'monat'; monat: string } | { art: 'person'; personId: string; monat: string }

function speichere(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = dateiname
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Holt die Daten (die Datenbank prüft die Rolle und protokolliert), baut das PDF und startet den Download. Gibt den Dateinamen zurück. */
export async function erzeugePdf(auftrag: PdfAuftrag): Promise<string> {
  registriereSchriften()
  const logo = await ladeLogo(BRAND.logo.hell)
  if (auftrag.art === 'monat') {
    const daten = await ladePdfMonatsbericht(auftrag.monat)
    const blob = await pdf(<Monatsbericht daten={daten} logo={logo} />).toBlob()
    const name = pdfDateiname(daten.salon.name, daten.monat, { monatsbericht: true })
    speichere(blob, name)
    return name
  }
  const daten = await ladePdfPersonenbericht(auftrag.personId, auftrag.monat)
  const blob = await pdf(<Personenbericht daten={daten} logo={logo} />).toBlob()
  const name = pdfDateiname(daten.salon.name, daten.monat, { person: daten.person.name })
  speichere(blob, name)
  return name
}
