// Fokus-Verhalten, Team-Agenda und Meeting-Termine (Erweiterung F, Migration 020): Typen der Antworten und kleine Hilfen.
// Wer was sieht, entscheidet die Datenbank: Fokus und Agenda nur Verantwortliche und Admin, Termine nur der Admin.
import type { Analyse } from './abschluss'

// ── Fokus-Verhalten ─────────────────────────────────────────────────────────────

export interface FokusVerhalten {
  verhalten_id: string
  nr: number
  titel: string
  grundpfeiler: string | null
  saeule: string | null
  aktiv: boolean
  begruendung: string | null
  /** YYYY-MM-DD */
  seit: string | null
  /** YYYY-MM-DD, leer = bis auf Weiteres */
  bis: string | null
}

export interface FokusListe {
  /** Berliner Tag, YYYY-MM-DD */
  heute: string
  verhalten: FokusVerhalten[]
}

// ── Agenda ──────────────────────────────────────────────────────────────────────

export interface AgendaBlock {
  id: 'einstieg' | 'kennzahlen' | 'fokus' | 'entwicklung' | 'vereinbarungen'
  titel: string
  minuten: number
  punkte: string[]
}

export interface AgendaInhalt {
  monat: string
  bloecke: AgendaBlock[]
  summe_minuten: number
  /** z. B. „Der Monat ist noch nicht abgeschlossen. Stand unvollständig: 1 von 7 Einzelanalysen liegen vor.“ */
  hinweis: string | null
  /** In der Agenda stehen anonymisierte Kommentar-Beispiele (nur auf der Plattform, nie in Mails) */
  beispiele_enthalten: boolean
  fokus_nrs: number[]
}

/** Die Agenda ist eine Analyse vom Typ „team_agenda“. */
export type Agenda = Analyse & { typ: 'team_agenda'; inhalt?: AgendaInhalt & Record<string, unknown> }

// ── Termine ─────────────────────────────────────────────────────────────────────

export type MailArt = 'vorab' | 'kurz'

export interface TerminMail {
  art: MailArt
  status: 'in_arbeit' | 'gesendet' | 'fehler'
  gesendet_am: string
  versuche: number
  fehler: string | null
  /** Nach drei Versuchen gibt der Versand auf */
  endgueltig_fehlgeschlagen: boolean
}

export interface Termin {
  id: string
  startet_am: string
  /** Berliner Uhrzeit als „YYYY-MM-DDTHH:MM“ */
  startet_lokal: string
  titel: string
  /** 'YYYY-MM', leer = Monat vor dem Termin */
  bezugsmonat: string | null
  bezugsmonat_effektiv: string
  vorlauf_tage: number[]
  vorlauf_stunden: number[]
  cc_admin: boolean
  aktiv: boolean
  vergangen: boolean
  empfaenger: string[]
  mails: TerminMail[]
}

export type Rhythmus = 'woechentlich' | 'zweiwoechentlich' | 'monatlich'

export const RHYTHMUS_TEXT: Record<Rhythmus, string> = {
  woechentlich: 'jede Woche',
  zweiwoechentlich: 'alle zwei Wochen',
  monatlich: 'jeden Monat',
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/** „2026-10-26T10:00“ (Berliner Uhrzeit) → „Mo, 26.10.2026, 10:00 Uhr“. Es wird nur gelesen, nicht umgerechnet. */
export function terminText(lokal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(lokal)
  if (!m) return lokal
  const tag = WOCHENTAGE[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()]
  return `${tag}, ${m[3]}.${m[2]}.${m[1]}, ${m[4]}:${m[5]} Uhr`
}

/** Zahlen für die Anzeige: 2 → „2“, 0.5 → „0,5“. */
const zahl = (n: number): string => String(n).replace('.', ',')

/** „2 Tage vorher, 1 Stunde vorher“ aus dem größten Vorlauf; mehrere Werte sind erlaubt, der größte löst aus. */
export function vorlaufText(tage: number[], stunden: number[]): string {
  const t = Math.max(...tage)
  const h = Math.max(...stunden)
  return `Agenda ${zahl(t)} ${t === 1 ? 'Tag' : 'Tage'} vorher, Erinnerung ${zahl(h)} ${h === 1 ? 'Stunde' : 'Stunden'} vorher`
}

/**
 * „2; 1“, „2, 1“ oder „2 1“ → [2, 1]. Trenner sind Leerzeichen, Semikolon oder ein Komma mit Leerzeichen dahinter;
 * ein Komma zwischen Ziffern ist das Dezimalzeichen („0,5“). Gibt null zurück, wenn etwas keine Zahl in [min, max] ist
 * (bei `ganz` auch keine Nachkommastelle) oder die Liste leer oder zu lang ist.
 */
export function parseZahlenliste(text: string, min: number, max: number, ganz: boolean): number[] | null {
  const teile = text.trim().split(/[\s;]+|,\s+/).filter(Boolean)
  if (teile.length < 1 || teile.length > 5) return null
  if (teile.some((t) => !/^\d+([.,]\d+)?$/.test(t))) return null
  const werte = teile.map((t) => Number(t.replace(',', '.')))
  if (werte.some((w) => w < min || w > max || (ganz && !Number.isInteger(w)))) return null
  return werte
}

/** Für die Anzeige im Eingabefeld; parseZahlenliste liest es wieder ein. */
export const zahlenText = (liste: number[]): string => liste.map(zahl).join('; ')

/** Was zu einer Mail eines Termins zu sagen ist. */
export function mailZustand(m: TerminMail | undefined, art: MailArt, termin: Pick<Termin, 'vergangen' | 'aktiv'>): { text: string; ton: 'ok' | 'warn' | 'fehler' | 'neutral' } {
  const name = art === 'vorab' ? 'Agenda-Mail' : 'Erinnerung'
  if (!m) {
    if (!termin.aktiv) return { text: `${name}: pausiert`, ton: 'neutral' }
    return termin.vergangen ? { text: `${name}: nicht gesendet`, ton: 'neutral' } : { text: `${name}: geplant`, ton: 'neutral' }
  }
  if (m.status === 'gesendet') return { text: `${name}: gesendet`, ton: 'ok' }
  if (m.status === 'in_arbeit') return { text: `${name}: wird gesendet …`, ton: 'warn' }
  if (m.endgueltig_fehlgeschlagen) return { text: `${name}: nach ${m.versuche} Versuchen fehlgeschlagen`, ton: 'fehler' }
  return { text: `${name}: Fehler (Versuch ${m.versuche} von 3), wird erneut versucht`, ton: 'fehler' }
}

/** Beginn des Tages in Berlin als Eingabe für ein `datetime-local`-Feld: morgen um 10:00 Uhr als Vorschlag. */
export function terminVorschlag(heute: string): string {
  const [j, m, t] = heute.split('-').map(Number)
  const d = new Date(Date.UTC(j, m - 1, t + 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T10:00`
}

/** Die Agenda ohne Zeilen mit Kommentar-Beispielen (für das PDF: dort stehen keine Kommentarauszüge). */
export function ohneBeispiele(text: string | null | undefined): string {
  return (text ?? '')
    .split('\n')
    .filter((z) => !/^\s*[-*•]\s+Beispiele aus den Kommentaren/.test(z))
    .join('\n')
}
