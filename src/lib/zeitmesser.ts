// Aktive Zeit der Monatsumfrage. Reine Logik ohne Browser-Bezug: Die Uhr wird übergeben (im Browser performance.now()),
// damit sich alles mit einer künstlichen Uhr testen lässt. Datum und Uhrzeit des Geräts spielen nie eine Rolle.

/** So lange nach der letzten Eingabe zählt die Zeit noch als aktiv (Standard 45 s). */
export const LEERLAUF_MS = 45_000

/** Ein Schritt der Umfrage: Index wie `schrittNummer()` (0 = Frontblatt), bei Verhalten-Seiten die Nummer des Verhaltens. */
export interface SchrittRef {
  index: number
  nr: number | null
}

export interface SchrittZeit extends SchrittRef {
  sek: number
}

/** Zählerstand, wie ihn der Server bekommt: kumuliert, in ganzen Sekunden. */
export interface ZeitStand {
  aktiveSek: number
  schritte: SchrittZeit[]
}

/**
 * Aktiv ist die Zeit, in der die Seite sichtbar ist UND in den letzten `leerlaufMs` eine Eingabe stattfand.
 * Die Zeit wird dem Schritt gutgeschrieben, der gerade offen ist. Gebucht wird bei jedem Ereignis (Eingabe,
 * Sichtbarkeitswechsel, Schrittwechsel) und beim Abfragen des Stands; dazwischen wird nichts mitgezählt.
 *
 * Rückkehr in den Tab zählt nicht als Eingabe: Wer nach einer Pause zurückkommt, muss erst etwas tun.
 */
export class Zeitmesser {
  private gesamtMs = 0
  private readonly schritte = new Map<number, { nr: number | null; ms: number }>()
  private schritt: SchrittRef | null = null
  private letzteBuchung = 0
  private letzteEingabe = Number.NEGATIVE_INFINITY
  private sichtbar: boolean
  private laeuft = false

  constructor(
    private readonly jetzt: () => number,
    private readonly leerlaufMs: number = LEERLAUF_MS,
    sichtbar = true,
  ) {
    this.sichtbar = sichtbar
  }

  get istGestartet(): boolean {
    return this.laeuft
  }

  /** Beginnt mit dem Zählen. Der Klick, der die Umfrage startet, ist die erste Eingabe. */
  start(schritt: SchrittRef): void {
    const t = this.jetzt()
    this.schritt = schritt
    this.letzteBuchung = t
    this.letzteEingabe = t
    this.laeuft = true
  }

  /** Hört auf zu zählen (nach dem Absenden oder beim Verlassen der Umfrage). */
  stop(): void {
    this.buche()
    this.laeuft = false
  }

  /** Eine Eingabe (Tippen, Klicken, Scrollen, Video läuft …): bucht die Zeit bis jetzt nach der alten Eingabe, danach zählt die neue. */
  eingabe(): void {
    if (!this.laeuft) return
    this.buche()
    this.letzteEingabe = this.letzteBuchung
  }

  /** Seite sichtbar oder verborgen (Tab-Wechsel, Bildschirm aus). */
  sichtbarkeit(sichtbar: boolean): void {
    this.buche()
    this.sichtbar = sichtbar
  }

  /** Ein anderer Schritt ist offen: die bisherige Zeit gehört noch zum alten. */
  wechsle(schritt: SchrittRef): void {
    this.buche()
    this.schritt = schritt
  }

  /** Übernimmt den Stand der Sitzung vom Server (nach Neuladen oder Gerätewechsel). Nur einmal je Sitzung aufrufen. */
  uebernimm(stand: ZeitStand): void {
    this.gesamtMs += Math.max(0, stand.aktiveSek) * 1000
    for (const s of stand.schritte) {
      const alt = this.schritte.get(s.index)
      this.schritte.set(s.index, { nr: s.nr ?? alt?.nr ?? null, ms: (alt?.ms ?? 0) + Math.max(0, s.sek) * 1000 })
    }
  }

  /** Der Zählerstand in ganzen Sekunden (abgerundet, damit die Schritte zusammen nie mehr ergeben als das Ganze). */
  stand(): ZeitStand {
    this.buche()
    const schritte: SchrittZeit[] = []
    for (const [index, s] of this.schritte) {
      const sek = Math.floor(s.ms / 1000)
      if (sek > 0) schritte.push({ index, nr: s.nr, sek })
    }
    schritte.sort((a, b) => a.index - b.index)
    return { aktiveSek: Math.floor(this.gesamtMs / 1000), schritte }
  }

  private buche(): void {
    const t = this.jetzt()
    if (this.laeuft && this.sichtbar && this.schritt) {
      const bis = Math.min(t, this.letzteEingabe + this.leerlaufMs)
      if (bis > this.letzteBuchung) {
        const ms = bis - this.letzteBuchung
        this.gesamtMs += ms
        const s = this.schritte.get(this.schritt.index)
        if (s) s.ms += ms
        else this.schritte.set(this.schritt.index, { nr: this.schritt.nr, ms })
      }
    }
    if (t > this.letzteBuchung) this.letzteBuchung = t
  }
}
