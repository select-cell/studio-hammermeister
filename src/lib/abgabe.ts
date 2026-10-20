// Abgabe-Status und Reminder (Phase 4). Gerechnet wird in der Datenbank (Migration 008);
// hier nur Typen, Texte und das Merken des weggeklickten Popups.
import { monatName } from './monat'
import type { Rolle } from './types'

export interface UeberfaelligEintrag {
  person_id: string
  name: string
  /** die eingeloggte Person selbst */
  ist_ich: boolean
  /** 'YYYY-MM' */
  monat: string
  /** letzter Tag der Abgabefrist, YYYY-MM-DD */
  frist: string
  tage_ueberfaellig: number
}

/** Antwort von ueberfaellige_abgaben(). */
export interface Ueberfaellige {
  heute: string
  erinnerung_ab_tag: number
  eintraege: UeberfaelligEintrag[]
}

export interface StatusPerson {
  id: string
  name: string
  rolle: Rolle
  /** muss für diesen Monat abgeben (aktiv_ab erreicht) */
  erwartet: boolean
  abgegeben: boolean
  /** ISO-Zeitpunkt der Abgabe */
  zeitpunkt: string | null
  verspaetet: boolean
  tage_ueberfaellig: number
  ueberfaellig: boolean
}

/** Antwort von abgabe_status(). `monat` ist null, solange die erste Umfrage noch nicht gestartet ist. */
export interface AbgabeStatus {
  monat: string | null
  frist: string | null
  heute: string
  start_monat: string
  monate: string[]
  erwartet: number
  abgegeben: number
  offen: number
  ueberfaellig: number
  erinnerung_ab_tag: number
  personen: StatusPerson[]
}

export const tageText = (n: number): string => `${n} Tag${n === 1 ? '' : 'e'}`

/** „Olena Pankova hat die Umfrage für Oktober 2026 noch nicht abgegeben (5 Tage überfällig).“ */
export function reminderSatz(e: UeberfaelligEintrag): string {
  const wer = e.ist_ich ? 'Du hast' : `${e.name} hat`
  return `${wer} die Umfrage für ${monatName(e.monat)} noch nicht abgegeben (${tageText(e.tage_ueberfaellig)} überfällig).`
}

/** Dieselbe Menge offener Fälle ergibt denselben Schlüssel, unabhängig von Reihenfolge und Tageszahl. */
export const erinnerungsSchluessel = (eintraege: UeberfaelligEintrag[]): string =>
  eintraege
    .map((e) => `${e.person_id}:${e.monat}`)
    .sort()
    .join('|')

/** Das Testdatum aus der Adresse (`?heute=2026-11-04`); ungültige Angaben werden ignoriert. */
export function heuteAusAdresse(suche: string): string | null {
  const wert = new URLSearchParams(suche).get('heute')
  if (!wert || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return null
  const d = new Date(`${wert}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== wert ? null : wert
}

/** '2026-10-31' → '31.10.2026' */
export const formatDatum = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('.')

/** ISO-Zeitpunkt → '18.10., 14:32' in Berliner Zeit */
export function formatZeitpunkt(iso: string): string {
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const t = (typ: string) => teile.find((x) => x.type === typ)?.value ?? ''
  return `${t('day')}.${t('month')}., ${t('hour')}:${t('minute')}`
}

// ── Popup: weggeklickt für diese Sitzung ──────────────────────────────────
// Das Popup kommt beim nächsten Besuch (neue Sitzung des Browsers) wieder, solange etwas offen ist,
// und sofort wieder, wenn sich die Menge der offenen Fälle ändert. Der Speicher ist nur Komfort.

const GESEHEN = 'hm-reminder-gesehen'

export function reminderGesehen(schluessel: string): boolean {
  try {
    return window.sessionStorage.getItem(GESEHEN) === schluessel
  } catch {
    return false
  }
}

export function reminderMerken(schluessel: string): void {
  try {
    window.sessionStorage.setItem(GESEHEN, schluessel)
  } catch {
    // ohne Speicher kommt das Popup eben bei jedem Öffnen von /app
  }
}

/** Reihenfolge der Personen im Status: überfällig, offen, abgegeben, nicht erwartet – jeweils nach Name. */
export function sortiereStatus(personen: StatusPerson[]): StatusPerson[] {
  const rang = (p: StatusPerson) => (!p.erwartet ? 3 : p.abgegeben ? 2 : p.ueberfaellig ? 0 : 1)
  return [...personen].sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'de'))
}
