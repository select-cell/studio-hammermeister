// Typen und reine Hilfen der Auswertungen (Phase 3). Gerechnet wird in der Datenbank (Migration 006);
// hier nur Darstellung: Zahlenformat, Einordnung nach den Schwellen des Salons, Sortieren, Gruppieren.
import type { Rolle } from './types'

// ── Daten aus den Funktionen ──────────────────────────────────────────────

export interface Kommentar {
  note: number
  text: string
  /** nur wenn die Absender sichtbar sind */
  von?: string
}

export interface VerhaltenWert {
  nr: number
  titel: string
  grundpfeiler: string | null
  saeule: string | null
  sb: number | null
  fb: number | null
  diff: number | null
  anzahl_fremdbilder: number
  sb_kommentar: string | null
  kommentare: Kommentar[]
  /** alle Einzelbewertungen mit Absender; null, wenn die Absender nicht sichtbar sind */
  fremdbilder: { von: string; note: number }[] | null
}

export interface SaeuleWert {
  grundpfeiler: string | null
  saeule: string | null
  sb: number | null
  fb: number | null
  diff: number | null
  anzahl_verhalten: number
}

export interface RitualWert {
  ritual: string
  frage_nr: number
  frage: string
  typ: string
  zahl: number | null
  text: string | null
}

export interface Gesamt {
  sb: number | null
  fb: number | null
  diff: number | null
  anzahl_fremdbilder?: number | null
  personen?: number
}

export interface PersonMonat {
  gesamt: Gesamt | null
  dauer_min: number | null
  saeulen: SaeuleWert[]
  verhalten: VerhaltenWert[]
  rituale: RitualWert[]
}

export interface VerlaufPunkt {
  monat: string
  sb: number | null
  fb: number | null
  diff: number | null
  rituale: number | null
  dauer_min: number | null
  abgaben?: number | null
  personen?: number | null
}

/** Antwort von meine_ergebnisse() und person_ergebnisse(). */
export interface PersonErgebnisse {
  person: { id: string; name: string }
  absender_sichtbar: boolean
  /** true: die Datenbank hat die Kommentare der Kollegen weggelassen (Mitarbeiter, Migration 012) */
  ohne_fremdkommentare?: boolean
  monate: string[]
  verlauf: VerlaufPunkt[]
  detail: Record<string, PersonMonat>
}

export interface TeamVerhalten {
  nr: number
  titel: string
  grundpfeiler: string | null
  saeule: string | null
  sb: number | null
  fb: number | null
  diff: number | null
}

export interface TeamMonat {
  gesamt: Gesamt | null
  dauer_min: number | null
  abgaben: number | null
  saeulen: SaeuleWert[]
  verhalten: TeamVerhalten[]
  rituale: {
    skalen: { ritual: string; frage_nr: number; frage: string; schnitt: number; anzahl: number }[]
    phasen: { ritual: string; frage_nr: number; frage: string; phase: string; nennungen: number }[]
  }
  entwicklung: { name: string; nennungen: number }[]
}

/** Antwort von team_ergebnisse(). */
export interface TeamErgebnisse {
  monate: string[]
  teilnehmer: number
  verlauf: VerlaufPunkt[]
  detail: Record<string, TeamMonat>
}

export interface DashboardPerson {
  id: string
  name: string
  rolle: Rolle
  abgegeben: boolean
  sb: number | null
  fb: number | null
  diff: number | null
  dauer_min: number | null
  anzahl_fremdbilder: number
  rang: number | null
}

export interface DashboardVerhalten {
  nr: number
  titel: string
  grundpfeiler: string | null
  saeule: string | null
  team_sb: number | null
  team_fb: number | null
  team_diff: number | null
  werte: { person_id: string; sb: number | null; fb: number | null; diff: number | null }[]
}

/** Antwort von team_dashboard(). */
export interface TeamDashboard {
  /** null, solange noch keine Umfrage abgegeben wurde */
  monat: string | null
  monate: string[]
  personen: DashboardPerson[]
  team: { sb: number | null; fb: number | null; diff: number | null; dauer_min: number | null; abgaben: number; teilnehmer: number } | null
  saeulen: SaeuleWert[]
  verhalten: DashboardVerhalten[]
  entwicklung: { name: string; nennungen: number }[]
}

// ── Schwellen (kommen aus salons, nicht aus dem Code) ──────────────────────

export interface Schwellen {
  ausgewogen: number
  niedrig: number
  hoch: number
}

export const STANDARD_SCHWELLEN: Schwellen = { ausgewogen: 0.3, niedrig: 2.5, hoch: 3.5 }

export function schwellenVon(salon: { schwelle_ausgewogen: number; schwelle_niedrig: number; schwelle_hoch: number } | null | undefined): Schwellen {
  return salon
    ? { ausgewogen: Number(salon.schwelle_ausgewogen), niedrig: Number(salon.schwelle_niedrig), hoch: Number(salon.schwelle_hoch) }
    : STANDARD_SCHWELLEN
}

// ── Darstellung ────────────────────────────────────────────────────────────

/** 3,04 – oder „–“, wenn es keinen Wert gibt. */
export function fmt(n: number | null | undefined, stellen = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  return n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen })
}

/** +0,25 / −0,04 / 0,00 */
export function fmtDiff(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  const vorzeichen = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${vorzeichen}${fmt(Math.abs(n))}`
}

export type Ton = 'gut' | 'schlecht'

export interface Einordnung {
  text: string
  /** Kurzform für die Team-Sicht */
  kurz: string
  ton: Ton
}

/** |SB − FB| ≤ Schwelle: ausgewogen (grün); sonst Selbstüber- bzw. -unterschätzung (rot). */
export function einordnung(diff: number | null | undefined, schwelle: number): Einordnung | null {
  if (diff === null || diff === undefined || Number.isNaN(diff)) return null
  if (Math.abs(diff) <= schwelle + 1e-9) return { text: 'Ausgewogen', kurz: 'Ausgewogen', ton: 'gut' }
  return diff > 0
    ? { text: 'Selbstüberschätzung', kurz: 'SB > FB', ton: 'schlecht' }
    : { text: 'Selbstunterschätzung', kurz: 'FB > SB', ton: 'schlecht' }
}

export type Niveau = 'hoch' | 'mittel' | 'niedrig'

/** hoch ≥ Schwelle hoch · niedrig < Schwelle niedrig · dazwischen mittel. */
export function niveau(score: number | null | undefined, s: Schwellen): Niveau | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null
  if (score >= s.hoch) return 'hoch'
  if (score < s.niedrig) return 'niedrig'
  return 'mittel'
}

export const vornameVon = (name: string): string => name.trim().split(/\s+/)[0] ?? name

const MONATSKUERZEL = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/** '2026-10' → 'Okt 26' (für Diagrammachsen; feste Kürzel, damit jeder Browser dasselbe zeigt) */
export function monatKurz(monat: string): string {
  const [jahr, nr] = monat.split('-').map(Number)
  return `${MONATSKUERZEL[nr - 1]} ${String(jahr).slice(2)}`
}

/** Der neueste Monat der Liste (die Liste ist aufsteigend sortiert) oder null. */
export const neuesterMonat = (monate: string[]): string | null => (monate.length ? monate[monate.length - 1] : null)

// ── Top / Flop ─────────────────────────────────────────────────────────────

/**
 * Die besten und die schwächsten Verhalten nach Fremdbild. Zeilen ohne Fremdbild zählen nicht.
 * Mit weniger als 2·n Verhalten wird die Liste geteilt, damit nichts doppelt vorkommt.
 */
export function topFlop<T extends { nr: number; fb: number | null }>(zeilen: T[], n = 4): { top: T[]; flop: T[] } {
  const sortiert = zeilen.filter((z) => z.fb !== null).sort((a, b) => (b.fb as number) - (a.fb as number) || a.nr - b.nr)
  const k = Math.min(n, Math.floor(sortiert.length / 2))
  return { top: sortiert.slice(0, k), flop: sortiert.slice(sortiert.length - k).reverse() }
}

// ── Gruppieren und Sortieren ───────────────────────────────────────────────

export type Sortierung = 'standard' | 'hoechste' | 'niedrigste'

export interface Gruppe<T> {
  schluessel: string
  grundpfeiler: string | null
  saeule: string | null
  zeilen: T[]
}

interface Gruppierbar {
  nr: number
  grundpfeiler: string | null
  saeule: string | null
}

/** „Grundpfeiler · Säule“ für Gruppenköpfe; null, wenn das Verhalten keiner Säule zugeordnet ist. */
export const gruppenTitel = (g: { grundpfeiler: string | null; saeule: string | null }): string | null =>
  [g.grundpfeiler, g.saeule].filter(Boolean).join(' · ') || null

/** Wert einer Person in der Dashboard-Matrix (Verhalten × Person). */
export function wertDerPerson(v: DashboardVerhalten, personId: string, art: 'sb' | 'fb' | 'diff'): number | null {
  return v.werte.find((w) => w.person_id === personId)?.[art] ?? null
}

/** Gibt es überhaupt Säulen oder Grundpfeiler? Ohne sie fallen alle Gruppierungen auf „je Verhalten“ zurück. */
export const hatSaeulen = (zeilen: { grundpfeiler: string | null; saeule: string | null }[]): boolean => zeilen.some((z) => z.grundpfeiler || z.saeule)

/**
 * Standard: nach Säulen gruppiert, in der Reihenfolge der Verhalten.
 * Höchste/Niedrigste: eine Liste ohne Gruppierung, nach `wert` sortiert (leere Werte zuletzt).
 */
export function sortiereVerhalten<T extends Gruppierbar>(zeilen: T[], sortierung: Sortierung, wert: (z: T) => number | null): Gruppe<T>[] {
  if (sortierung === 'standard') {
    const gruppen: Gruppe<T>[] = []
    for (const z of [...zeilen].sort((a, b) => a.nr - b.nr)) {
      const schluessel = `${z.grundpfeiler ?? ''}|${z.saeule ?? ''}`
      let g = gruppen.find((x) => x.schluessel === schluessel)
      if (!g) {
        g = { schluessel, grundpfeiler: z.grundpfeiler, saeule: z.saeule, zeilen: [] }
        gruppen.push(g)
      }
      g.zeilen.push(z)
    }
    return gruppen
  }
  const richtung = sortierung === 'hoechste' ? -1 : 1
  const sortiert = [...zeilen].sort((a, b) => {
    const x = wert(a)
    const y = wert(b)
    if (x === null && y === null) return a.nr - b.nr
    if (x === null) return 1
    if (y === null) return -1
    return (x - y) * richtung || a.nr - b.nr
  })
  return [{ schluessel: 'alle', grundpfeiler: null, saeule: null, zeilen: sortiert }]
}

// ── Diagrammdaten ──────────────────────────────────────────────────────────

export interface BalkenDatum {
  name: string
  /** vollständige Bezeichnung für den Tooltip */
  titel: string
  sb: number | null
  fb: number | null
}

/** Je Säule, wenn es Säulen gibt, sonst je Verhalten. */
export function balkenDaten(
  saeulen: SaeuleWert[],
  verhalten: { nr: number; titel: string; sb: number | null; fb: number | null }[],
): { art: 'saeulen' | 'verhalten'; daten: BalkenDatum[] } {
  if (saeulen.some((s) => s.saeule || s.grundpfeiler)) {
    return {
      art: 'saeulen',
      daten: saeulen.map((s) => {
        const name = s.saeule ?? s.grundpfeiler ?? 'Ohne Säule'
        return { name, titel: [s.grundpfeiler, s.saeule].filter(Boolean).join(' · ') || name, sb: s.sb, fb: s.fb }
      }),
    }
  }
  return { art: 'verhalten', daten: verhalten.map((v) => ({ name: String(v.nr), titel: `${v.nr}. ${v.titel}`, sb: v.sb, fb: v.fb })) }
}
