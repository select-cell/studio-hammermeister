// Schriften für das PDF. Sie werden mit der Plattform ausgeliefert (Pakete @fontsource/…, Vite legt die Dateien ab);
// es gibt keine Anfragen an Google Fonts oder andere Fremdserver. Das Latin-Paket enthält Umlaute, ß, „ “ – · Ø und −.
import { Font } from '@react-pdf/renderer'
import sans400 from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?url'
import sans500 from '@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff?url'
import serif400 from '@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff?url'

export const SANS = 'DM Sans'
export const SERIF = 'DM Serif Display'

let registriert = false

/** Einmal vor dem ersten Dokument aufrufen. */
export function registriereSchriften(): void {
  if (registriert) return
  registriert = true
  Font.register({
    family: SANS,
    fonts: [
      { src: sans400, fontWeight: 400 },
      { src: sans500, fontWeight: 500 },
    ],
  })
  Font.register({ family: SERIF, src: serif400, fontWeight: 400 })
  // Keine Silbentrennung: Namen und Fachwörter sollen ganz bleiben
  Font.registerHyphenationCallback((wort) => [wort])
}
