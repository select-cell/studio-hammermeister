// PDF-Export (Erweiterung C, Migration 017): Typen der Berichtsdaten und der Dateiname.
// Die Daten liefern pdf_monatsbericht() und pdf_personenbericht(), nur für Verantwortliche und Admin; das PDF entsteht im Browser (src/pdf/).
import type { AbgabeStatus } from './abgabe'
import type { PersonMonat, Schwellen, TeamDashboard, VerlaufPunkt } from './auswertung'

export interface PdfSalon {
  id: string
  name: string
}

export interface PdfMonatsdaten {
  salon: PdfSalon
  schwellen: Schwellen
  /** 'YYYY-MM' */
  monat: string
  /** YYYY-MM-DD, Berliner Tag */
  erstellt_am: string
  dashboard: TeamDashboard
  beteiligung: AbgabeStatus
  kommentare: {
    bewertungen: number
    kommentare: number
    pflicht: number
    pflicht_mit_kommentar: number
    freiwillig: number
    quote: number | null
  }
  zeit: { median_aktiv_min: number | null; abgaben: number }
}

export interface PdfPersonendaten {
  salon: PdfSalon
  schwellen: Schwellen
  person: { id: string; name: string }
  monat: string
  vormonat: string | null
  erstellt_am: string
  verlauf: VerlaufPunkt[]
  aktuell: PersonMonat
  vorher: PersonMonat | null
  entwicklung: { nennungen: number; begruendungen: string[] }
}

export interface ProtokollEintrag {
  erstellt_am: string
  von: string
  art: 'monatsbericht' | 'personenbericht'
  person: string | null
  monat: string
}

/** Kleinbuchstaben ohne Umlaute und Sonderzeichen, Wörter mit Bindestrich: „Max Mustermann“ → „max-mustermann“. */
export function dateiteil(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** `<salon>_<YYYY-MM>_<monatsbericht|person-name>.pdf` */
export function pdfDateiname(salon: string, monat: string, art: { monatsbericht: true } | { person: string }): string {
  const teil = 'monatsbericht' in art ? 'monatsbericht' : dateiteil(art.person) || 'person'
  return `${dateiteil(salon) || 'salon'}_${monat}_${teil}.pdf`
}

/** 2026-11-04 → 04.11.2026 */
export function datumDe(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split('-')
  return `${t}.${m}.${j}`
}
