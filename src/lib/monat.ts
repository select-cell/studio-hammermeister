// Monate werden als 'YYYY-MM' geführt (Route, API). In der Datenbank steht jeweils der 1. des Monats.
const ZEITZONE = 'Europe/Berlin'

export function istMonat(wert: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(wert)
}

function zerlegen(monat: string): [number, number] {
  const [jahr, nr] = monat.split('-').map(Number)
  return [jahr, nr]
}

/** Laufender Monat nach Berliner Zeit, z. B. '2026-10'. */
export function laufenderMonat(jetzt: Date = new Date()): string {
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZEITZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(jetzt)
  const jahr = teile.find((t) => t.type === 'year')?.value
  const monat = teile.find((t) => t.type === 'month')?.value
  return `${jahr}-${monat}`
}

/** '2026-10' → 'Oktober 2026' */
export function monatName(monat: string): string {
  const [jahr, nr] = zerlegen(monat)
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(jahr, nr - 1, 1)),
  )
}

/** Letzter Tag des Monats als TT.MM.JJJJ. Bis dahin ist die Umfrage für diesen Monat abzugeben. */
export function fristEnde(monat: string): string {
  const [jahr, nr] = zerlegen(monat)
  const tag = new Date(Date.UTC(jahr, nr, 0)).getUTCDate()
  return `${String(tag).padStart(2, '0')}.${String(nr).padStart(2, '0')}.${jahr}`
}

/** Monat um `differenz` Monate verschieben: ('2026-12', 1) → '2027-01'. */
export function monatVerschieben(monat: string, differenz: number): string {
  const [jahr, nr] = zerlegen(monat)
  const d = new Date(Date.UTC(jahr, nr - 1 + differenz, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Datum aus der Datenbank ('2026-10-01') → Monat ('2026-10'). */
export function monatAusDatum(datum: string): string {
  return datum.slice(0, 7)
}
