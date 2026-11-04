// Zeit-Auswertung der Umfrage für die Leitung (Antwort von zeit_auswertung(), Migration 016). Gerechnet wird in der Datenbank.

export interface ZeitPerson {
  person_id: string
  name: string
  /** Aktive Minuten; null, wenn ohne Zeitmessung abgegeben wurde. */
  aktiv_min: number | null
  gesamt_min: number | null
  flags: string[]
  /** false bei zu_schnell oder sehr_lang (zählt dann nicht in den Schnitten); null = unbekannt. */
  dauer_gueltig: boolean | null
  /** Anzahl der Versuche, die mit „Neu beginnen“ abgebrochen wurden. */
  abgebrochen: number
  /** Aktive Sekunden je Verhalten (Schlüssel: Nummer des Verhaltens). */
  verhalten: Record<string, number>
}

export interface ZeitVerhalten {
  nr: number
  titel: string
  median_sek: number | null
  n: number
}

export interface ZeitSchwellen {
  min_sek_pro_verhalten: number
  sehr_lang_min: number
  pausen_quote: number
  luecke_min: number
}

export interface ZeitTeam {
  abgaben: number
  gueltig: number
  median_aktiv_min: number | null
  min_aktiv_min: number | null
  max_aktiv_min: number | null
  median_gesamt_min: number | null
}

export interface ZeitAuswertung {
  /** 'YYYY-MM'; null, wenn es noch keine abgeschlossene Sitzung gibt. */
  monat: string | null
  monate: string[]
  schwellen?: ZeitSchwellen
  team?: ZeitTeam
  personen?: ZeitPerson[]
  verhalten?: ZeitVerhalten[]
}

export interface FlagInfo {
  text: string
  hinweis: string
  /** `warn`: Zeit sollte mit Vorsicht gelesen werden; `info`: nur zur Einordnung. */
  ton: 'warn' | 'info'
}

const zahl = (n: number) => String(n).replace('.', ',')

/** Beschriftung und Erklärung eines Kennzeichens; unbekannte Kennzeichen erscheinen unverändert. */
export function flagInfo(flag: string, s?: ZeitSchwellen): FlagInfo {
  switch (flag) {
    case 'zu_schnell':
      return { text: 'Sehr schnell', hinweis: `Aktive Zeit unter ${s ? zahl(s.min_sek_pro_verhalten) : '5'} Sekunden je Verhalten. Zählt nicht in den Schnitten.`, ton: 'warn' }
    case 'sehr_lang':
      return { text: 'Sehr lang', hinweis: `Gesamtdauer über ${s ? zahl(s.sehr_lang_min / 60) : '4'} Stunden. Zählt nicht in den Schnitten.`, ton: 'warn' }
    case 'viele_pausen':
      return { text: 'Viele Pausen', hinweis: `Weniger als ${s ? Math.round(s.pausen_quote * 100) : 30} % der Gesamtdauer aktiv.`, ton: 'info' }
    case 'wiederaufgenommen':
      return { text: 'Fortgesetzt', hinweis: 'Die Umfrage wurde unterbrochen und später (oder auf einem anderen Gerät) fortgesetzt.', ton: 'info' }
    case 'heartbeat_luecke':
      return { text: 'Funkloch', hinweis: `Länger als ${s ? zahl(s.luecke_min) : '3'} Minuten kein Signal vom Gerät (Handy im Hintergrund, Verbindung weg).`, ton: 'info' }
    case 'ohne_sitzung':
      return { text: 'Ohne Zeitmessung', hinweis: 'Abgegeben, ohne dass die Zeitmessung gestartet war (z. B. keine Verbindung beim Start). Es gibt keine geprüfte Zeit.', ton: 'info' }
    case 'neu_begonnen':
      return { text: 'Neu begonnen', hinweis: 'Ein Versuch wurde mit „Neu beginnen“ abgebrochen.', ton: 'info' }
    default:
      return { text: flag, hinweis: '', ton: 'info' }
  }
}
