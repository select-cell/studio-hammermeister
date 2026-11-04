// Kommentar-Auswertung (Erweiterung D, Migration 018): Typen der Antwort von kommentar_auswertung() und Hilfen zur Anzeige.
// Gerechnet wird in der Datenbank. Kommentartexte enthält die Auswertung nie.

export interface KommentarVerlaufPunkt {
  monat: string
  quote: number | null
  freiwillig_quote: number | null
  woerter_schnitt: number | null
  kommentare: number
  bewertungen: number
}

export interface KommentarPerson {
  person_id: string
  name: string
  rolle: 'mitarbeiter' | 'verantwortlicher' | 'admin'
  abgegeben: boolean
  bewertungen: number
  kommentare: number
  quote: number | null
  pflicht: number
  pflicht_mit_kommentar: number
  freiwillig_moeglich: number
  freiwillig: number
  freiwillig_quote: number | null
  woerter_schnitt: number | null
  woerter_schnitt_freiwillig: number | null
  kurz: number
  kurz_anteil: number | null
  duplikate: number
  verhalten_gesamt: number
  verhalten_ohne_kommentar: number
  verlauf: KommentarVerlaufPunkt[]
}

export interface KommentarTeam {
  absender: number
  bewertungen: number
  kommentare: number
  quote: number | null
  pflicht: number
  pflicht_mit_kommentar: number
  freiwillig_moeglich: number
  freiwillig: number
  freiwillig_quote: number | null
  woerter_schnitt: number | null
  kurz_anteil: number | null
  duplikate: number
}

export interface KommentarAuswertung {
  /** 'YYYY-MM'; null, wenn es noch keine Abgabe gibt */
  monat: string | null
  monate: string[]
  konfig: { eigene_analyse_nur_admin: boolean; eigene_werte_verborgen: boolean }
  team: KommentarTeam | null
  personen: KommentarPerson[]
  /** haben abgegeben, aber keinen Kommentar geschrieben */
  ohne_kommentare: string[]
  /** haben für den Monat nicht abgegeben */
  nicht_abgegeben: string[]
}

/** 42,5 % – oder „–“, wenn es keinen Wert gibt. */
export function prozent(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

/** Ø 12,3 Wörter */
export function woerterText(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  return n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
