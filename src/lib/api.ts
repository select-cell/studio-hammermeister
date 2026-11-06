// Gebündelter Datenzugriff: dünne Wrapper um Supabase. Berechnungen gehören in SQL-Funktionen, nicht hierher.
import { aktuellerZugriffstoken, supabase, supabaseSchluessel, supabaseUrl } from './supabase'
import type { AbgabeStatus, Ueberfaellige } from './abgabe'
import type { PersonErgebnisse, TeamDashboard, TeamErgebnisse } from './auswertung'
import type { Person } from './types'
import type { Analyse, AnalyseErgebnis, AbschlussInfo, AbschlussUebersicht, SammellaufErgebnis } from './abschluss'
import type { Agenda, FokusListe, Rhythmus, Termin } from './agenda'
import { AnalyseFehler, type AnalyseFehlerArt } from './abschluss'
import type { KommentarAuswertung } from './kommentare'
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

// ── Kommentar-Auswertung (Migration 018, nur Verantwortliche und Admin) ────

/** Kennzahlen je Absender und Monat ('YYYY-MM'; ohne Angabe der neueste mit Abgaben). Keine Kommentartexte. */
export async function ladeKommentarAuswertung(monat?: string): Promise<KommentarAuswertung> {
  const { data, error } = await supabase.rpc('kommentar_auswertung', { p_monat: monat ? `${monat}-01` : null })
  if (error) throw error
  return data as KommentarAuswertung
}

// ── Monatsabschluss und Einzelanalyse (Migration 019, nur Verantwortliche und Admin) ──

/** Stand von Abschluss und Analysen eines Monats ('YYYY-MM'; ohne Angabe der neueste mit Abgaben). */
export async function ladeAbschluss(monat?: string): Promise<AbschlussUebersicht> {
  const { data, error } = await supabase.rpc('abschluss_uebersicht', { p_monat: monat ? `${monat}-01` : null })
  if (error) throw error
  return data as AbschlussUebersicht
}

/** Schließt den Monat ab, auch wenn Abgaben fehlen. */
export async function schliesseMonatAb(monat: string): Promise<AbschlussInfo & { monat: string }> {
  const { data, error } = await supabase.rpc('monat_abschliessen', { p_monat: `${monat}-01` })
  if (error) throw error
  return data as AbschlussInfo & { monat: string }
}

export async function ladeAnalyse(personId: string, monat: string): Promise<Analyse | null> {
  const { data, error } = await supabase.rpc('analyse_lesen', { p_person: personId, p_monat: `${monat}-01` })
  if (error) throw error
  return (data as Analyse | null) ?? null
}

export async function bearbeiteAnalyse(id: string, text: string): Promise<Analyse> {
  const { data, error } = await supabase.rpc('analyse_bearbeiten', { p_id: id, p_text_md: text })
  if (error) throw error
  return data as Analyse
}

export async function gebeAnalyseFrei(id: string, frei: boolean): Promise<Analyse> {
  const { data, error } = await supabase.rpc('analyse_freigeben', { p_id: id, p_freigabe: frei })
  if (error) throw error
  return data as Analyse
}

/** Der Weg zur KI: Browser → Edge Function „analyse-erstellen“ → n8n-Webhook → Anthropic und zurück. Es gibt keinen anderen. */
type KiAnfrage =
  | { aufgabe: 'einzelanalyse'; monat: string; person_id: string; neu?: boolean }
  | { aufgabe: 'gesamtauswertung' | 'agenda'; monat: string; neu?: boolean }
  | { aufgabe: 'sammellauf'; monat: string; ausgenommen?: string[] }

/** Ruft die Edge Function auf. Fehler kommen als AnalyseFehler mit einer Meldung, die die Oberfläche zeigen darf. */
async function rufeKi<T>(anfrage: KiAnfrage): Promise<T> {
  const { data, error } = await supabase.functions.invoke('analyse-erstellen', { body: anfrage })
  if (!error) return data as T
  const kontext = (error as { context?: unknown }).context
  if (kontext instanceof Response) {
    if (kontext.status === 404) throw new AnalyseFehler('ki_nicht_eingerichtet', 'Die KI-Funktion ist noch nicht eingerichtet.')
    try {
      const b = (await kontext.json()) as { fehler?: string; meldung?: string }
      throw new AnalyseFehler((b.fehler as AnalyseFehlerArt) ?? 'unbekannt', b.meldung ?? 'Die KI-Funktion hat nicht geklappt.')
    } catch (e) {
      if (e instanceof AnalyseFehler) throw e
    }
    throw new AnalyseFehler('unbekannt', 'Die KI-Funktion hat nicht geklappt.')
  }
  throw new AnalyseFehler('nicht_erreichbar', 'Die KI-Funktion konnte nicht gestartet werden. Bitte prüfe die Internetverbindung.')
}

/**
 * Lässt die KI die Einzelanalyse erstellen. Gleiche Eingabe wie zuvor: kein neuer KI-Aufruf, außer mit `neu`.
 * Nur der Admin (Schalter salons.ki_nur_admin); die Datenbank entscheidet.
 */
export const erstelleAnalyse = (personId: string, monat: string, neu = false): Promise<AnalyseErgebnis> =>
  rufeKi({ aufgabe: 'einzelanalyse', monat, person_id: personId, neu })

/** Die KI formuliert die Gesamtauswertung des Monats (nur Teamwerte). */
export const erstelleGesamt = (monat: string, neu = false): Promise<AnalyseErgebnis> => rufeKi({ aufgabe: 'gesamtauswertung', monat, neu })

/** Die KI formuliert die Agenda des Monats (Blöcke und Zeiten stehen fest, die KI schreibt die Punkte). */
export const erstelleAgendaMitKi = (monat: string, neu = false): Promise<AnalyseErgebnis> => rufeKi({ aufgabe: 'agenda', monat, neu })

/** Ein Durchgang des Sammellaufs (höchstens zwei Personen). `ausgenommen`: Personen, die nicht noch einmal versucht werden sollen. */
export const starteSammellauf = (monat: string, ausgenommen: string[] = []): Promise<SammellaufErgebnis> => rufeKi({ aufgabe: 'sammellauf', monat, ausgenommen })

// ── Gesamtauswertung des Monats und Kontext für die KI (Migration 021) ──────────

export async function ladeGesamt(monat: string): Promise<Analyse | null> {
  const { data, error } = await supabase.rpc('gesamt_lesen', { p_monat: `${monat}-01` })
  if (error) throw error
  return (data as Analyse | null) ?? null
}

export async function bearbeiteGesamt(id: string, text: string): Promise<Analyse> {
  const { data, error } = await supabase.rpc('gesamt_bearbeiten', { p_id: id, p_text_md: text })
  if (error) throw error
  return data as Analyse
}

export async function gebeGesamtFrei(id: string, frei: boolean): Promise<Analyse> {
  const { data, error } = await supabase.rpc('gesamt_freigeben', { p_id: id, p_freigabe: frei })
  if (error) throw error
  return data as Analyse
}

export interface KiKontext {
  /** Leitbild, Ton und Besonderheiten des Salons; leer, wenn noch nichts eingetragen ist */
  kontext: string | null
  ki_nur_admin: boolean
}

/** Nur der Admin. */
export async function ladeKiKontext(): Promise<KiKontext> {
  const { data, error } = await supabase.rpc('ki_kontext_lesen')
  if (error) throw error
  return data as KiKontext
}

/** Speichert den Kontext (höchstens 2000 Zeichen, ohne Namen von Personen); leer löscht ihn. Fehler der Datenbank tragen die Meldung in `message`. */
export async function speichereKiKontext(text: string): Promise<KiKontext> {
  const { data, error } = await supabase.rpc('ki_kontext_speichern', { p_text: text })
  if (error) throw error
  return data as KiKontext
}

// ── Fokus-Verhalten, Agenda und Termine (Migration 020) ────────────────────
// Fokus und Agenda: nur Verantwortliche und Admin. Termine: nur der Admin. Die Datenbank prüft die Rolle bei jedem Aufruf.

export async function ladeFokus(): Promise<FokusListe> {
  const { data, error } = await supabase.rpc('fokus_liste')
  if (error) throw error
  return data as FokusListe
}

/** Verhalten zum Fokus machen (mit Begründung, optional befristet bis `bis`: YYYY-MM-DD) oder aus dem Fokus nehmen. */
export async function setzeFokus(verhaltenId: string, an: boolean, begruendung?: string, bis?: string): Promise<FokusListe> {
  const { data, error } = await supabase.rpc('fokus_umschalten', { p_verhalten: verhaltenId, p_an: an, p_begruendung: begruendung ?? null, p_ab: null, p_bis: bis || null })
  if (error) throw error
  return data as FokusListe
}

/** Die Agenda eines Monats ('YYYY-MM'), `null` wenn es noch keine gibt. */
export async function ladeAgenda(monat: string): Promise<Agenda | null> {
  const { data, error } = await supabase.rpc('agenda_lesen', { p_monat: `${monat}-01` })
  if (error) throw error
  return (data as Agenda | null) ?? null
}

/** Baut die Agenda aus den Daten des Monats und speichert sie als Entwurf (ersetzt eine vorhandene). */
export async function erzeugeAgenda(monat: string): Promise<Agenda> {
  const { data, error } = await supabase.rpc('agenda_erzeugen', { p_monat: `${monat}-01` })
  if (error) throw error
  return data as Agenda
}

export async function bearbeiteAgenda(id: string, text: string): Promise<Agenda> {
  const { data, error } = await supabase.rpc('agenda_bearbeiten', { p_id: id, p_text_md: text })
  if (error) throw error
  return data as Agenda
}

export async function gebeAgendaFrei(id: string, frei: boolean): Promise<Agenda> {
  const { data, error } = await supabase.rpc('agenda_freigeben', { p_id: id, p_freigabe: frei })
  if (error) throw error
  return data as Agenda
}

export async function ladeTermine(): Promise<Termin[]> {
  const { data, error } = await supabase.rpc('termine_liste')
  if (error) throw error
  return (data as Termin[] | null) ?? []
}

export interface TerminEingabe {
  /** „YYYY-MM-DDTHH:MM“, Berliner Uhrzeit */
  startetLokal: string
  titel: string
  /** 'YYYY-MM' oder leer (Monat vor dem Termin) */
  bezugsmonat: string
  vorlaufTage: number[]
  vorlaufStunden: number[]
  ccAdmin: boolean
  aktiv: boolean
}

/** Neuer Termin (`id` leer) oder Termin ändern. */
export async function speichereTermin(id: string | null, e: TerminEingabe): Promise<string> {
  const { data, error } = await supabase.rpc('termin_speichern', {
    p_id: id,
    p_startet_lokal: e.startetLokal.length === 16 ? `${e.startetLokal}:00` : e.startetLokal,
    p_titel: e.titel,
    p_bezugsmonat: e.bezugsmonat ? `${e.bezugsmonat}-01` : null,
    p_vorlauf_tage: e.vorlaufTage,
    p_vorlauf_stunden: e.vorlaufStunden,
    p_cc_admin: e.ccAdmin,
    p_aktiv: e.aktiv,
  })
  if (error) throw error
  return data as string
}

/** Mehrere Termine auf einmal; die Uhrzeit bleibt in Berliner Zeit gleich, auch über die Zeitumstellung. */
export async function speichereTerminSerie(startLokal: string, titel: string, rhythmus: Rhythmus, anzahl: number, ccAdmin: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('termine_serie', {
    p_start_lokal: startLokal.length === 16 ? `${startLokal}:00` : startLokal,
    p_titel: titel,
    p_rhythmus: rhythmus,
    p_anzahl: anzahl,
    p_cc_admin: ccAdmin,
  })
  if (error) throw error
  return data as number
}

export async function entferneTermin(id: string): Promise<void> {
  const { error } = await supabase.rpc('termin_entfernen', { p_id: id })
  if (error) throw error
}
