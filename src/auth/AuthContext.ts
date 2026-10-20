import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Person } from '../lib/types'

/**
 * leer      – nicht eingeloggt
 * laedt     – eingeloggt, Person wird geladen
 * bereit    – Person gefunden und aktiv
 * unbekannt – eingeloggt, aber keiner Person in `personen` zugeordnet
 * inaktiv   – Person gefunden, aber deaktiviert
 * fehler    – Person konnte nicht geladen werden
 */
export type PersonStatus = 'leer' | 'laedt' | 'bereit' | 'unbekannt' | 'inaktiv' | 'fehler'

export interface AuthWert {
  /** Die Sitzung wird noch geprüft (Seitenstart, Rücksprung aus dem Magic Link). */
  laedt: boolean
  session: Session | null
  /** Nur gesetzt, wenn die Person gefunden wurde und aktiv ist. */
  person: Person | null
  personStatus: PersonStatus
  abmelden: () => Promise<void>
  neuLaden: () => void
}

export const AuthContext = createContext<AuthWert | null>(null)

export function useAuth(): AuthWert {
  const wert = useContext(AuthContext)
  if (!wert) throw new Error('useAuth braucht den AuthProvider')
  return wert
}
