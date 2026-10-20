// Gebündelter Datenzugriff: dünne Wrapper um Supabase. Berechnungen gehören in SQL-Funktionen, nicht hierher.
import { supabase } from './supabase'
import type { Person } from './types'
import type { Nutzlast, OffenerMonat, UmfrageInhalt } from './umfrage'

/** Eigene Zeile aus `personen` samt Salon. `null`, wenn der Login keiner Person zugeordnet ist. */
export async function ladeIch(): Promise<Person | null> {
  const { data, error } = await supabase.rpc('ich')
  if (error) throw error
  return (data as Person | null) ?? null
}

export type LinkErgebnis = 'gesendet' | 'zuVieleAnfragen' | 'fehler'

/** Schickt den Magic Link. Es werden keine neuen Zugänge angelegt (shouldCreateUser: false). */
export async function anmeldelinkSenden(email: string): Promise<LinkErgebnis> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  if (!error) return 'gesendet'

  const code = (error as { code?: string }).code
  if (error.status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return 'zuVieleAnfragen'
  }
  // Nicht angelegte Adresse: dieselbe Antwort wie bei Erfolg, damit niemand Adressen durchprobieren kann.
  if (code === 'otp_disabled' || /signups not allowed/i.test(error.message)) return 'gesendet'
  return 'fehler'
}

export async function abmelden(): Promise<void> {
  await supabase.auth.signOut()
}

// ── Monatsumfrage ─────────────────────────────────────────────────────────

/** Verhalten mit Stufen, Rituale und bewertbare Kolleg:innen für die eingeloggte Person. */
export async function ladeUmfrageInhalt(): Promise<UmfrageInhalt> {
  const { data, error } = await supabase.rpc('umfrage_inhalt')
  if (error) throw error
  return data as UmfrageInhalt
}

/** Monate ohne Abgabe, jeweils mit Frist und Überfälligkeit (nur für Teilnehmer der Teamumfrage). */
export async function ladeOffeneMonate(): Promise<OffenerMonat[]> {
  const { data, error } = await supabase.rpc('meine_offenen_monate')
  if (error) throw error
  return (data as OffenerMonat[] | null) ?? []
}

export type EinreichErgebnis =
  | { art: 'ok'; id: string }
  | { art: 'bereits'; meldung: string }
  | { art: 'fehler'; meldung: string }

/** Speichert die Umfrage. „Bereits abgegeben“ (23505) ist kein Fehler, sondern ein eigener Ausgang. */
export async function umfrageEinreichen(nutzlast: Nutzlast): Promise<EinreichErgebnis> {
  const { data, error } = await supabase.rpc('umfrage_einreichen_v2', { payload: nutzlast })
  if (!error) return { art: 'ok', id: String(data) }
  if (error.code === '23505') return { art: 'bereits', meldung: error.message }
  return { art: 'fehler', meldung: error.message }
}
