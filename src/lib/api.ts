// Gebündelter Datenzugriff: dünne Wrapper um Supabase. Berechnungen gehören in SQL-Funktionen, nicht hierher.
import { supabase } from './supabase'
import type { PersonErgebnisse, TeamDashboard, TeamErgebnisse } from './auswertung'
import type { Person } from './types'
import type { Nutzlast, OffenerMonat, UmfrageInhalt } from './umfrage'

/** Eigene Zeile aus `personen` samt Salon. `null`, wenn der Login keiner Person zugeordnet ist. */
export async function ladeIch(): Promise<Person | null> {
  const { data, error } = await supabase.rpc('ich')
  if (error) throw error
  return (data as Person | null) ?? null
}

export type AnmeldeErgebnis = 'ok' | 'falsch' | 'nichtBestaetigt' | 'zuVieleAnfragen' | 'fehler'

const istZuVieleAnfragen = (error: { status?: number; code?: string }) =>
  error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit'

/**
 * Anmeldung mit E-Mail und Passwort. Neue Zugänge entstehen hier nicht: Die Person und ihr Login legt der Admin an.
 * Supabase antwortet bei unbekannter Adresse und falschem Passwort gleich („invalid_credentials“),
 * so lässt sich nicht durchprobieren, wer einen Zugang hat.
 */
export async function anmelden(email: string, passwort: string): Promise<AnmeldeErgebnis> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: passwort })
  if (!error) return 'ok'
  const code = (error as { code?: string }).code
  if (code === 'invalid_credentials') return 'falsch'
  if (code === 'email_not_confirmed') return 'nichtBestaetigt'
  if (istZuVieleAnfragen(error)) return 'zuVieleAnfragen'
  return 'fehler'
}

export type PasswortErgebnis = 'ok' | 'aktuellFalsch' | 'zuSchwach' | 'gleich' | 'zuVieleAnfragen' | 'fehler'

/** Passwort ändern. Das aktuelle Passwort wird vorher geprüft, damit niemand an einem offenen Gerät fremde Zugänge übernimmt. */
export async function passwortAendern(email: string, aktuell: string, neu: string): Promise<PasswortErgebnis> {
  const pruefung = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: aktuell })
  if (pruefung.error) {
    if ((pruefung.error as { code?: string }).code === 'invalid_credentials') return 'aktuellFalsch'
    return istZuVieleAnfragen(pruefung.error) ? 'zuVieleAnfragen' : 'fehler'
  }
  const { error } = await supabase.auth.updateUser({ password: neu })
  if (!error) return 'ok'
  const code = (error as { code?: string }).code
  if (code === 'same_password') return 'gleich'
  if (code === 'weak_password') return 'zuSchwach'
  return istZuVieleAnfragen(error) ? 'zuVieleAnfragen' : 'fehler'
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

// ── Auswertungen ──────────────────────────────────────────────────────────
// Gerechnet wird in der Datenbank (Migration 006). Wer die Absender sehen darf, entscheidet allein die Datenbank.

/** Eigene Ergebnisse aller Monate (nur Teilnehmer der Teamumfrage). */
export async function ladeMeineErgebnisse(): Promise<PersonErgebnisse> {
  const { data, error } = await supabase.rpc('meine_ergebnisse')
  if (error) throw error
  return data as PersonErgebnisse
}

/** Team-Schnitte aller Monate – ohne einzelne Personen. */
export async function ladeTeamErgebnisse(): Promise<TeamErgebnisse> {
  const { data, error } = await supabase.rpc('team_ergebnisse')
  if (error) throw error
  return data as TeamErgebnisse
}

/** Ergebnisse einer Person (nur Verantwortlicher und Admin). */
export async function ladePersonErgebnisse(personId: string): Promise<PersonErgebnisse> {
  const { data, error } = await supabase.rpc('person_ergebnisse', { p_person: personId })
  if (error) throw error
  return data as PersonErgebnisse
}

/** Team-Dashboard eines Monats ('YYYY-MM'); ohne Angabe der neueste Monat mit Abgaben (nur Verantwortlicher und Admin). */
export async function ladeTeamDashboard(monat?: string): Promise<TeamDashboard> {
  const { data, error } = await supabase.rpc('team_dashboard', { p_monat: monat ? `${monat}-01` : null })
  if (error) throw error
  return data as TeamDashboard
}
