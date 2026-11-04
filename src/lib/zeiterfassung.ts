// Zeiterfassung der Monatsumfrage im Browser: verbindet den Zeitmesser mit Seite, Eingaben und Server.
// Die Uhr ist performance.now() (monoton, unabhängig von Datum und Uhrzeit des Geräts). Start, Herzschläge und Abgabe
// stempelt der Server; vom Gerät kommen nur Zählerstände, die der Server ohnehin auf die echte Zeit deckelt (Migration 016).
import { zeitHerzschlag, zeitHerzschlagBeimSchliessen, zeitStarten, type ZeitAbschluss, type ZeitStartAntwort } from './api'
import { LEERLAUF_MS, Zeitmesser, type SchrittRef, type ZeitStand } from './zeitmesser'

/** Alle 30 s und bei jedem Schrittwechsel geht ein Herzschlag an den Server. */
export const HERZSCHLAG_MS = 30_000

/** Bewegung (Maus, Scrollen, Video) zählt höchstens alle halbe Sekunde als Eingabe: genug für 45 s Leerlauf, ohne zu belasten. */
const EINGABE_TAKT_MS = 500

/** Name des Ereignisses, mit dem Bausteine ohne Eingabe (ein laufendes Video) „der Nutzer ist dabei“ melden. */
const AKTIVITAET = 'umfrage-aktivitaet'
export const meldeAktivitaet = (): void => {
  window.dispatchEvent(new Event(AKTIVITAET))
}

const SOFORT = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input', 'click'] as const
const GEDROSSELT = ['pointermove', 'scroll', 'touchmove', AKTIVITAET] as const

/** Fehler, bei denen ein erneuter Versuch nichts bringt (schon abgegeben, Monat nicht offen, kein Zugang). */
const ENDGUELTIG = new Set(['23505', '22023', '42501'])

const istSichtbar = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden'

export interface ZeitApi {
  starten(monat: string, neu: boolean): Promise<ZeitStartAntwort>
  herzschlag(sitzungId: string, stand: ZeitStand): Promise<void>
  beimSchliessen(sitzungId: string, stand: ZeitStand): void
}

export const echteZeitApi: ZeitApi = { starten: zeitStarten, herzschlag: zeitHerzschlag, beimSchliessen: zeitHerzschlagBeimSchliessen }

/**
 * Eine Zeiterfassung für eine Umfrage, von `beginne()` bis `beende()`. Fällt die Verbindung aus, zählt der Browser
 * weiter und holt die Sitzung beim nächsten Takt nach; die Umfrage selbst hängt nie an der Zeiterfassung.
 */
export class Zeiterfassung {
  private mess: Zeitmesser | null = null
  private id: string | null = null
  private monat = ''
  private neu = false
  private timer: number | undefined
  private verbindet = false
  private unterwegs = false
  private aufgegeben = false
  private beendet = false
  private letzteBewegung = Number.NEGATIVE_INFINITY
  private abmelden: (() => void)[] = []
  private schritt: SchrittRef | null = null

  constructor(
    private readonly api: ZeitApi = echteZeitApi,
    private readonly jetzt: () => number = () => performance.now(),
    private readonly herzschlagMs: number = HERZSCHLAG_MS,
    private readonly leerlaufMs: number = LEERLAUF_MS,
  ) {}

  /** Die Sitzung dieses Ausfüllversuchs (null, solange der Server sie noch nicht bestätigt hat). */
  get sitzungId(): string | null {
    return this.id
  }

  /** `neu`: „Neu beginnen“ – der Server beendet die offene Sitzung als abgebrochen und startet eine neue. */
  beginne(monat: string, schritt: SchrittRef, neu = false): void {
    if (this.mess || this.beendet) return
    this.monat = monat
    this.neu = neu
    this.schritt = schritt
    this.mess = new Zeitmesser(this.jetzt, this.leerlaufMs, istSichtbar())
    this.mess.start(schritt)
    this.haengeAn()
    this.timer = window.setInterval(() => void this.herzschlag(), this.herzschlagMs)
    void this.verbinde()
  }

  /** Ein anderer Schritt ist offen. */
  wechsle(schritt: SchrittRef): void {
    if (!this.mess || this.beendet) return
    if (this.schritt && this.schritt.index === schritt.index && this.schritt.nr === schritt.nr) return
    this.schritt = schritt
    this.mess.wechsle(schritt)
    void this.herzschlag()
  }

  /** Stand für die Abgabe: Sitzung und Zählerstand. */
  abschluss(): ZeitAbschluss | null {
    if (!this.mess) return null
    const s = this.mess.stand()
    return { sitzungId: this.id, aktiveSek: s.aktiveSek, schritte: s.schritte }
  }

  /**
   * Hört auf. `senden`: noch einen letzten Herzschlag schicken (beim Verlassen der Umfrage); nach erfolgreichem
   * Absenden nicht mehr nötig, die Sitzung ist dann geschlossen.
   */
  beende(senden = true): void {
    if (this.beendet) return
    this.beendet = true
    if (this.timer !== undefined) window.clearInterval(this.timer)
    this.abmelden.forEach((f) => f())
    this.abmelden = []
    if (this.mess) {
      const stand = this.mess.stand()
      this.mess.stop()
      if (senden && this.id) void this.api.herzschlag(this.id, stand).catch(() => undefined)
    }
  }

  // ── intern ─────────────────────────────────────────────────────────────

  private async verbinde(): Promise<void> {
    if (this.id || this.verbindet || this.aufgegeben || this.beendet || !this.mess) return
    this.verbindet = true
    try {
      const a = await this.api.starten(this.monat, this.neu)
      if (this.beendet || !this.mess) return
      this.id = a.sitzung_id
      this.neu = false
      this.mess.uebernimm({ aktiveSek: a.aktive_sek, schritte: a.schritte.map((s) => ({ index: s.index, nr: s.nr, sek: s.sek })) })
    } catch (e) {
      // Ohne Verbindung zählt der Browser weiter; der nächste Takt versucht es noch einmal
      const code = (e as { code?: string } | null)?.code
      if (code && ENDGUELTIG.has(code)) this.aufgegeben = true
    } finally {
      this.verbindet = false
    }
  }

  private async herzschlag(): Promise<void> {
    if (this.beendet || !this.mess) return
    if (!this.id) {
      void this.verbinde()
      return
    }
    if (this.unterwegs) return
    this.unterwegs = true
    try {
      await this.api.herzschlag(this.id, this.mess.stand())
    } catch {
      /* der nächste Herzschlag trägt den ganzen Stand nach */
    } finally {
      this.unterwegs = false
    }
  }

  /** Beim Ausblenden oder Schließen der Seite: der Stand geht sofort raus, auf einem Weg, der das Schließen überlebt. */
  private schliesse(): void {
    if (this.beendet || !this.mess || !this.id) return
    this.api.beimSchliessen(this.id, this.mess.stand())
  }

  private haengeAn(): void {
    const mess = () => this.mess
    const merke = (ziel: EventTarget, art: string, f: EventListener, optionen: AddEventListenerOptions = {}) => {
      ziel.addEventListener(art, f, optionen)
      this.abmelden.push(() => ziel.removeEventListener(art, f, optionen))
    }
    const eingabe: EventListener = () => mess()?.eingabe()
    const gedrosselt: EventListener = () => {
      const t = this.jetzt()
      if (t - this.letzteBewegung < EINGABE_TAKT_MS) return
      this.letzteBewegung = t
      mess()?.eingabe()
    }
    for (const art of SOFORT) merke(window, art, eingabe, { capture: true, passive: true })
    for (const art of GEDROSSELT) merke(window, art, gedrosselt, { capture: true, passive: true })

    merke(document, 'visibilitychange', () => {
      const sichtbar = istSichtbar()
      mess()?.sichtbarkeit(sichtbar)
      if (!sichtbar) this.schliesse()
    })
    merke(window, 'pagehide', () => {
      mess()?.sichtbarkeit(false)
      this.schliesse()
    })
    merke(window, 'pageshow', () => mess()?.sichtbarkeit(istSichtbar()))
    // Fenster verliert den Fokus: die laufende Zeit wird gebucht. Wanderte der Fokus in ein eingebettetes Video, war das eine Eingabe.
    merke(window, 'blur', () => {
      if (document.activeElement instanceof HTMLIFrameElement) mess()?.eingabe()
      mess()?.stand()
    })
  }
}
