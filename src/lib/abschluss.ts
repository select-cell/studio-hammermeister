// Monatsabschluss und Einzelanalyse (Erweiterung E, Migration 019): Typen der Antworten und kleine Hilfen.
// Alle Zahlen kommen aus SQL; die KI formuliert nur den Text. Ob jede Zahl im Text aus den Daten stammt, prüft die Datenbank.

export type AnalyseStatus = 'entwurf' | 'freigegeben'

export interface Analyse {
  id: string
  monat: string
  typ: 'person' | 'team_agenda' | 'kommentar_qualitaet'
  person_id: string | null
  /** strukturierte Ausgabe der KI; in der Übersicht weggelassen */
  inhalt?: Record<string, unknown>
  text_md: string | null
  modell: string | null
  prompt_version: string | null
  input_hash: string | null
  status: AnalyseStatus
  /** Faktencheck bestanden: Jede Zahl im Text steht in den Daten. */
  geprueft: boolean
  /** Zahlen im Text, die nicht in den Daten stehen (z. B. „4.71“) */
  fakten_hinweis: string[]
  erstellt_am: string
  bearbeitet_von: string | null
  bearbeitet_am: string | null
  freigegeben_von: string | null
  freigegeben_am: string | null
}

export interface AbschlussPerson {
  person_id: string
  name: string
  /** Es gibt Fremdbilder über die Person: nur dann lässt sich eine Analyse erstellen. */
  hat_auswertung: boolean
  analyse: Analyse | null
}

export interface AbschlussInfo {
  abgeschlossen_am: string
  abgeschlossen_von: string
  abgaben_erwartet: number | null
  abgaben_vorhanden: number | null
  unvollstaendig: boolean
}

/** Antwort von abschluss_uebersicht(). */
export interface AbschlussUebersicht {
  monat: string | null
  monate: string[]
  abschluss: AbschlussInfo | null
  personen: AbschlussPerson[]
  analysen_gesamt: number
  analysen_fertig: number
  freigegeben: number
}

/** Antwort der Edge Function „analyse-erstellen“. */
export interface AnalyseErgebnis {
  analyse: Analyse
  /** false: gleiche Eingabe wie zuvor, es gab keinen neuen KI-Aufruf */
  neu_erzeugt: boolean
  ki_aufrufe: number
}

export type AnalyseFehlerArt =
  | 'ki_nicht_eingerichtet'
  | 'ki_fehler'
  | 'zeitueberschreitung'
  | 'ungueltige_ausgabe'
  | 'keine_berechtigung'
  | 'keine_daten'
  | 'nicht_erreichbar'
  | 'unbekannt'

export class AnalyseFehler extends Error {
  constructor(
    public readonly art: AnalyseFehlerArt,
    meldung: string,
  ) {
    super(meldung)
    this.name = 'AnalyseFehler'
  }
}

/** Zahlen aus dem Faktencheck so zeigen, wie man sie schreibt: „4.71“ → „4,71“. */
export const zahlText = (z: string): string => z.replace('.', ',')

// ── Markdown (nur das, was die Analyse braucht) ────────────────────────────

export type Block = { art: 'ueberschrift'; text: string } | { art: 'liste'; punkte: string[] } | { art: 'absatz'; text: string }

/** Zerlegt den Text der Analyse: „## Titel“, Listenpunkte mit „- “ und Absätze. Mehr kennt die Analyse nicht. */
export function markdownBloecke(text: string | null | undefined): Block[] {
  const bloecke: Block[] = []
  let liste: string[] | null = null
  let absatz: string[] = []
  const absatzSchliessen = () => {
    if (absatz.length) bloecke.push({ art: 'absatz', text: absatz.join(' ') })
    absatz = []
  }
  const listeSchliessen = () => {
    if (liste) bloecke.push({ art: 'liste', punkte: liste })
    liste = null
  }
  for (const roh of (text ?? '').split('\n')) {
    const zeile = roh.trim()
    const kopf = zeile.match(/^#{1,6}\s+(.*)$/)
    const punkt = zeile.match(/^[-*•]\s+(.*)$/)
    if (!zeile) {
      absatzSchliessen()
      listeSchliessen()
    } else if (kopf) {
      absatzSchliessen()
      listeSchliessen()
      bloecke.push({ art: 'ueberschrift', text: kopf[1] })
    } else if (punkt) {
      absatzSchliessen()
      ;(liste ??= []).push(punkt[1])
    } else {
      listeSchliessen()
      absatz.push(zeile)
    }
  }
  absatzSchliessen()
  listeSchliessen()
  return bloecke
}
