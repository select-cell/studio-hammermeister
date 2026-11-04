// Gebündelter Datenzugriff: dünne Wrapper um Supabase. Berechnungen gehören in SQL-Funktionen, nicht hierher.
import { aktuellerZugriffstoken, supabase, supabaseSchluessel, supabaseUrl } from './supabase'
import type { AbgabeStatus, Ueberfaellige } from './abgabe'
import type { PersonErgebnisse, TeamDashboard, TeamErgebnisse } from './auswertung'
import type { Person } from './types'
import type { PdfMonatsdaten, PdfPersonendaten, ProtokollEintrag } from './pdf'
import type { Nutzlast, OffenerMonat, UmfrageInhalt } from './umfrage'
import type { ZeitAuswertung } from './zeit'
import type { SchrittZeit, ZeitStand } from './zeitmesser'

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

/** Verhalten mit Stufen, Rituale und bewertbare Kollegen für die eingeloggte Person. */
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

/** Die Zeit der Sitzung, wie sie mit der Abgabe an den Server geht (Migration 016). */
export interface ZeitAbschluss {
  sitzungId: string | null
  aktiveSek: number
  schritte: SchrittZeit[]
}

export type EinreichErgebnis =
  | { art: 'ok'; id: string; aktiveSek: number | null }
  | { art: 'bereits'; meldung: string }
  | { art: 'fehler'; meldung: string }

/**
 * Speichert die Umfrage samt Zeit der Sitzung. „Bereits abgegeben“ (23505) ist kein Fehler, sondern ein eigener Ausgang.
 * `aktiveSek` ist die eigene aktive Zeit für die Abschlussseite (null, wenn keine Sitzung bestand).
 */
export async function umfrageEinreichen(nutzlast: Nutzlast, zeit?: ZeitAbschluss): Promise<EinreichErgebnis> {
  const { data, error } = await supabase.rpc('umfrage_einreichen_v3', {
    payload: nutzlast,
    p_sitzung: zeit?.sitzungId ?? null,
    p_aktive_sek: zeit ? zeit.aktiveSek : null,
    p_schritte: zeit ? zeit.schritte : null,
  })
  if (!error) {
    const r = data as { id: string; aktive_sek: number | null } | null
    return { art: 'ok', id: String(r?.id ?? ''), aktiveSek: r?.aktive_sek ?? null }
  }
  if (error.code === '23505') return { art: 'bereits', meldung: error.message }
  return { art: 'fehler', meldung: error.message }
}

// ── Zeiterfassung (Migration 016) ──────────────────────────────────────────

export interface ZeitStartAntwort {
  sitzung_id: string
  aktive_sek: number
  wiederaufgenommen: boolean
  schritte: { index: number; nr: number | null; sek: number }[]
}

/** Beginnt eine Sitzung für den Monat ('YYYY-MM') oder nimmt die offene wieder auf. `neu`: „Neu beginnen“. */
export async function zeitStarten(monat: string, neu: boolean): Promise<ZeitStartAntwort> {
  const { data, error } = await supabase.rpc('umfrage_starten', { p_monat: `${monat}-01`, p_neu: neu })
  if (error) throw error
  return data as ZeitStartAntwort
}

/** Meldet den Zählerstand. Der Server deckelt ihn auf die echte Zeit; ein Fehler ist nicht schlimm, der nächste Herzschlag trägt alles nach. */
export async function zeitHerzschlag(sitzungId: string, stand: ZeitStand): Promise<void> {
  const { error } = await supabase.rpc('umfrage_heartbeat', {
    p_sitzung: sitzungId,
    p_aktive_sek: stand.aktiveSek,
    p_schritte: stand.schritte,
  })
  if (error) throw error
}

/**
 * Letzter Herzschlag beim Schließen oder Verlassen der Seite. Ein normaler Aufruf würde abgebrochen; `keepalive` lässt die Anfrage
 * die Seite überleben. (`sendBeacon` kann keine Anmeldung mitschicken.) Geht auch das schief, fehlen höchstens die letzten Sekunden.
 */
export function zeitHerzschlagBeimSchliessen(sitzungId: string, stand: ZeitStand): void {
  const token = aktuellerZugriffstoken()
  if (!token || !supabaseUrl) {
    void zeitHerzschlag(sitzungId, stand).catch(() => undefined)
    return
  }
  try {
    void fetch(`${supabaseUrl}/rest/v1/rpc/umfrage_heartbeat`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: supabaseSchluessel, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ p_sitzung: sitzungId, p_aktive_sek: stand.aktiveSek, p_schritte: stand.schritte }),
    }).catch(() => undefined)
  } catch {
    /* nichts zu tun: der nächste Besuch nimmt die Sitzung wieder auf */
  }
}

/** Zeit-Auswertung eines Monats ('YYYY-MM'; ohne Angabe der neueste mit Abgaben), nur für Verantwortliche und Admin. */
export async function ladeZeitAuswertung(monat?: string): Promise<ZeitAuswertung> {
  const { data, error } = await supabase.rpc('zeit_auswertung', { p_monat: monat ? `${monat}-01` : null })
  if (error) throw error
  return data as ZeitAuswertung
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

// ── Abgabe-Status und Reminder (nur Verantwortliche und Admin) ─────────────
// `heute` simuliert das Datum zum Testen (`/app?heute=2026-11-04`); ohne Angabe gilt der Berliner Tag.

/** Fehlende Abgaben, die länger als `reminder_tage_nach_frist` über der Frist sind. */
export async function ladeUeberfaellige(heute?: string): Promise<Ueberfaellige> {
  const { data, error } = await supabase.rpc('ueberfaellige_abgaben', { p_heute: heute ?? null })
  if (error) throw error
  return data as Ueberfaellige
}

/** Wer hat für einen Monat ('YYYY-MM', Standard: laufender Monat) abgegeben? */
export async function ladeAbgabeStatus(monat?: string, heute?: string): Promise<AbgabeStatus> {
  const { data, error } = await supabase.rpc('abgabe_status', { p_monat: monat ? `${monat}-01` : null, p_heute: heute ?? null })
  if (error) throw error
  return data as AbgabeStatus
}

// ── PDF-Export (Migration 017, nur Verantwortliche und Admin) ──────────────
// Die Funktionen prüfen die Rolle selbst und protokollieren jeden Abruf; das PDF wird im Browser gebaut (src/pdf/).

/** Daten für das Monats-PDF; ohne Monat der neueste mit Abgaben. */
export async function ladePdfMonatsbericht(monat?: string): Promise<PdfMonatsdaten> {
  const { data, error } = await supabase.rpc('pdf_monatsbericht', { p_monat: monat ? `${monat}-01` : null })
  if (error) throw error
  return data as PdfMonatsdaten
}

/** Daten für das Personen-PDF (Kommentare ohne Absender). */
export async function ladePdfPersonenbericht(personId: string, monat?: string): Promise<PdfPersonendaten> {
  const { data, error } = await supabase.rpc('pdf_personenbericht', { p_person: personId, p_monat: monat ? `${monat}-01` : null })
  if (error) throw error
  return data as PdfPersonendaten
}

/** Das Export-Protokoll (nur Admin). */
export async function ladePdfProtokoll(limit = 100): Promise<ProtokollEintrag[]> {
  const { data, error } = await supabase.rpc('pdf_export_protokoll', { p_limit: limit })
  if (error) throw error
  return (data as ProtokollEintrag[] | null) ?? []
}
