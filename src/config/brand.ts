// Die Marke dieser Instanz an genau einer Stelle: Name, Logo-Dateien und Farben.
// Das Logo wird nur über die Dateien in src/assets/brand/<salon-slug>/ getauscht, nicht im Code:
//   logo.svg (oder .png/.webp)       helle Fassung, Pflicht
//   logo-dark.svg (oder .png/.webp)  Fassung für den Nachtmodus, optional (ohne sie gilt die helle)
//   favicon.svg (oder .png)          Symbol im Browser-Tab (ist in index.html verlinkt)

/** Ordnername unter src/assets/brand/ */
export const SALON_SLUG = 'hammermeister'

/** Der Name erscheint, solange die Person keinem Salon zugeordnet ist (Admin), und im Alternativtext des Logos. */
export const SALON_NAME = 'Hammermeister'

const dateien = import.meta.glob('../assets/brand/*/*.{svg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

/** Die Datei zu einem Namen ohne Endung (logo, logo-dark, favicon) aus dem Ordner des Salons. */
export function brandDatei(name: string, ablage: Record<string, string> = dateien, slug: string = SALON_SLUG): string | null {
  for (const endung of ['svg', 'png', 'webp']) {
    const url = ablage[`../assets/brand/${slug}/${name}.${endung}`]
    if (url) return url
  }
  return null
}

export const BRAND = {
  slug: SALON_SLUG,
  name: SALON_NAME,
  logo: {
    hell: brandDatei('logo'),
    dunkel: brandDatei('logo-dark'),
  },
  favicon: brandDatei('favicon'),
  /**
   * Farben als Design-Token (für Oberfläche und Stile). Sie wechseln mit dem Nachtmodus mit.
   * Quelle: src/styles/tokens.css
   */
  farben: {
    akzent: 'var(--accent)',
    text: 'var(--text)',
    text2: 'var(--text2)',
    hintergrund: 'var(--cream)',
  },
  /**
   * Dieselben Farben als feste Werte für das PDF (dort gibt es keine CSS-Variablen; Papier ist immer hell).
   * Gleiche Werte wie die helle Palette in src/styles/tokens.css.
   */
  pdfFarben: {
    akzent: '#C4845A',
    akzentDunkel: '#A86840',
    text: '#1A1208',
    text2: '#6B5B45',
    muted: '#9B8E7E',
    rand: '#E2D9C8',
    flaeche: '#FAF8F3',
    flaeche2: '#F0EBE0',
    selbstbild: '#C4845A',
    fremdbild: '#4A7FA5',
    rituale: '#4CAF50',
    gruen: '#3B6D11',
    rot: '#A32D2D',
    gelb: '#854F0B',
  },
} as const
