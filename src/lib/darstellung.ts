// Hell, Dunkel oder automatisch (folgt dem Gerät). Die Wahl gilt nur für diesen Browser (localStorage);
// ohne Speicher bleibt es bei „automatisch“. Das Skript in index.html setzt data-theme schon vor dem ersten
// Bild, damit die Seite nicht kurz hell aufblitzt.

export type Darstellung = 'auto' | 'hell' | 'dunkel'

export const DARSTELLUNGEN: Darstellung[] = ['auto', 'dunkel', 'hell']
const SCHLUESSEL = 'hm-darstellung'

export const darstellungLabel: Record<Darstellung, string> = {
  auto: 'Automatisch',
  dunkel: 'Dunkel',
  hell: 'Hell',
}

/** Reihenfolge beim Umschalten: automatisch → dunkel → hell → automatisch */
export const naechsteDarstellung = (d: Darstellung): Darstellung => DARSTELLUNGEN[(DARSTELLUNGEN.indexOf(d) + 1) % DARSTELLUNGEN.length]

export const istDarstellung = (wert: unknown): wert is Darstellung => wert === 'auto' || wert === 'hell' || wert === 'dunkel'

export function leseDarstellung(): Darstellung {
  try {
    const wert = window.localStorage.getItem(SCHLUESSEL)
    return istDarstellung(wert) ? wert : 'auto'
  } catch {
    return 'auto'
  }
}

export function speichereDarstellung(d: Darstellung): void {
  try {
    window.localStorage.setItem(SCHLUESSEL, d)
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Neuladen
  }
}

/** Ist es dunkel? „automatisch“ richtet sich nach dem Gerät. */
export const istDunkel = (d: Darstellung, geraetDunkel: boolean): boolean => d === 'dunkel' || (d === 'auto' && geraetDunkel)

const HINTERGRUND = { hell: '#FAF8F3', dunkel: '#15110C' }

/** Setzt data-theme am <html> und die Farbe der Browserleiste. */
export function wendeDarstellungAn(d: Darstellung): boolean {
  const geraetDunkel = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const dunkel = istDunkel(d, geraetDunkel)
  document.documentElement.dataset.theme = dunkel ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dunkel ? HINTERGRUND.dunkel : HINTERGRUND.hell)
  return dunkel
}
