export type Rolle = 'mitarbeiter' | 'verantwortlicher' | 'admin'

export interface SalonInfo {
  id: string
  name: string
  /** 1. des ersten Monats, ab dem Umfragen und Reminder zählen (YYYY-MM-DD) */
  start_monat: string
  schwelle_ausgewogen: number
  schwelle_niedrig: number
  schwelle_hoch: number
  reminder_tage_nach_frist: number
}

/** Rückgabe von ich() – die eigene Zeile aus `personen` samt Salon. */
export interface Person {
  id: string
  name: string
  email: string
  rolle: Rolle
  nimmt_an_teamumfrage: boolean
  aktiv: boolean
  aktiv_ab: string | null
  salon: SalonInfo | null
}
