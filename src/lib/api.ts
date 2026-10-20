// Gebündelter Datenzugriff: dünne Wrapper um Supabase. Berechnungen gehören in SQL-Funktionen, nicht hierher.
import { supabase } from './supabase'
import type { Person } from './types'

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
