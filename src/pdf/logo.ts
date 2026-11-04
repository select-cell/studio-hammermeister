// Das Logo für das PDF. react-pdf zeigt keine SVG-Bilder; deshalb wird die Logo-Datei (SVG, PNG oder WebP) im Browser
// vierfach vergrößert in ein PNG gezeichnet. Fehlt das Logo oder lässt es sich nicht laden, zeigt das PDF den Salonnamen als Text.
export interface PdfLogo {
  src: string
  /** Seitenverhältnis Breite / Höhe */
  verhaeltnis: number
}

export async function ladeLogo(url: string | null): Promise<PdfLogo | null> {
  if (!url || typeof document === 'undefined') return null
  try {
    const bild = new Image()
    bild.src = url
    await bild.decode()
    const b = bild.naturalWidth || 200
    const h = bild.naturalHeight || 40
    const faktor = 4
    const leinwand = document.createElement('canvas')
    leinwand.width = Math.round(b * faktor)
    leinwand.height = Math.round(h * faktor)
    const ctx = leinwand.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bild, 0, 0, leinwand.width, leinwand.height)
    return { src: leinwand.toDataURL('image/png'), verhaeltnis: b / h }
  } catch {
    return null
  }
}
