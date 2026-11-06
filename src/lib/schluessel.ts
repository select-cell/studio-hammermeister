// Schutz vor dem schlimmsten Fehler: dem geheimen Schlüssel (service_role) in der .env des Frontends.
// Alles, was im Browser steht, kann jeder lesen. Mit dem service_role-Schlüssel gäbe es keine Zugriffsregeln mehr.
// Darum startet die App nicht, wenn der eingetragene Schlüssel erkennbar nicht der öffentliche ist.

export type SchluesselProblem = 'service_role' | 'geheimer_schluessel' | 'falsche_rolle'

function jwtNutzlast(schluessel: string): Record<string, unknown> | null {
  const teile = schluessel.split('.')
  if (teile.length !== 3) return null
  try {
    const b64 = teile[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    )
    const o: unknown = JSON.parse(json)
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Prüft den eingetragenen Schlüssel. `null` heißt: nichts Auffälliges.
 * - Ein JWT muss die Rolle „anon“ haben (service_role und alles andere wird abgelehnt).
 * - Ein neuer geheimer Schlüssel („sb_secret_…“) wird abgelehnt; „sb_publishable_…“ ist der öffentliche.
 * - Andere Formen lassen sich nicht prüfen und gelten als in Ordnung.
 */
export function pruefeSchluessel(schluessel: string | undefined): SchluesselProblem | null {
  const s = (schluessel ?? '').trim()
  if (!s) return null
  if (/^sb_secret_/i.test(s)) return 'geheimer_schluessel'
  const nutzlast = jwtNutzlast(s)
  if (nutzlast) {
    if (nutzlast.role === 'service_role') return 'service_role'
    if (nutzlast.role !== 'anon') return 'falsche_rolle'
  }
  return null
}
