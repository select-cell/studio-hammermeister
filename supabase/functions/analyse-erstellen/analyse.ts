// Logik der Edge Function „analyse-erstellen“ für die KI-Analysen (Erweiterung E). Reines TypeScript ohne Deno-Bezug,
// damit sich alles mit Vitest testen lässt. Aufgaben:
//   - der Prompt (versioniert: PROMPT_VERSION wird mit gespeichert),
//   - die Provider-Anbindung (Anthropic API oder Webhook, umschaltbar über das Secret AI_PROVIDER),
//   - Prüfung und Umwandlung der strukturierten Ausgabe,
//   - die Schleife „erzeugen → Faktencheck → bei Fehler neu erzeugen“ mit höchstens 2 Wiederholungen.
//
// Alle Zahlen stammen aus SQL (analyse_eingabe). Die KI formuliert nur Text. Ob jede Zahl im Text aus den Daten stammt,
// entscheidet die Datenbank (analyse_pruefen / analyse_speichern), nicht diese Funktion.

/** Wird mit jeder Analyse gespeichert. Wer den Prompt ändert, erhöht die Version: Dann gilt die Eingabe als „neu“. */
export const PROMPT_VERSION = 'person-v1'

/** Eine Anfrage und höchstens zwei Wiederholungen (Fehler beim Anbieter oder nicht bestandener Faktencheck). */
export const MAX_AUFRUFE = 3

export const ZEITLIMIT_MS = 60_000

export type Fehlerart = 'ki_nicht_eingerichtet' | 'ki_fehler' | 'zeitueberschreitung' | 'ungueltige_ausgabe'

/** Fehler mit einer Meldung, die die Oberfläche unverändert zeigen darf (Deutsch, ohne Technik). */
export class KiFehler extends Error {
  constructor(
    public readonly art: Fehlerart,
    meldung: string,
  ) {
    super(meldung)
    this.name = 'KiFehler'
  }
}

export interface Eingabe {
  monat: string
  vormonat: string | null
  verhalten: { nr: number; titel: string }[]
  [schluessel: string]: unknown
}

export interface Ausgabe {
  staerken: string[]
  entwicklungsfelder: string[]
  auffaellige_differenzen: string[]
  kommentar_themen: string[]
  kommentar_qualitaet_hinweis: string
  empfehlung: string
  /** Nummern der Verhalten, auf die sich das nächste Gespräch konzentrieren sollte */
  fokus_verhalten: number[]
}

// ── Prompt ─────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Du schreibst für die Salonleitung eines Friseursalons eine kurze Einzelanalyse zum Monatsfeedback einer Person.

Regeln:
- Antworte NUR mit einem JSON-Objekt, ohne Text davor oder danach.
- Verwende ausschließlich Zahlen, die in den Daten stehen, und schreibe sie genau so (nicht runden, keine Prozentwerte, keine eigenen Summen, Mittelwerte oder Differenzen berechnen). Wenn du keine Zahl brauchst, lass sie weg.
- Nenne keine Namen. Sprich von „der Person“. Die Daten enthalten bereits Platzhalter wie „Kollege A“; übernimm sie nicht.
- Zitiere Kommentare nicht wörtlich, fasse sie sinngemäß zusammen.
- Bewertungsskala: 1 bis 5. Das Fremdbild ist der Durchschnitt der Kollegen, das Selbstbild die eigene Einschätzung. Die Einordnung („ausgewogen“, „selbstueberschaetzung“, „selbstunterschaetzung“) und die Stufen (hoch, mittel, niedrig) sind in den Daten schon berechnet.
- Ton: wertschätzend, konkret, handlungsorientiert. Kein Gendern, keine Sternchen oder Doppelpunkte.
- Schreibe auf Deutsch (Du-Form ist nicht nötig, die Leitung liest es).

Ausgabeformat (JSON-Objekt mit genau diesen Schlüsseln):
{
  "staerken": [string, …],                  // 2 bis 4 Stärken
  "entwicklungsfelder": [string, …],        // 2 bis 4 Entwicklungsfelder
  "auffaellige_differenzen": [string, …],   // Verhalten mit großer Differenz zwischen Selbst- und Fremdbild; leer, wenn es keine gibt
  "kommentar_themen": [string, …],          // wiederkehrende Themen in den Kommentaren der Kollegen; leer, wenn es keine Kommentare gibt
  "kommentar_qualitaet_hinweis": string,    // ein Satz dazu, wie konkret die Kommentare sind (Hinweis, keine Note)
  "empfehlung": string,                     // ein bis drei Sätze: worauf sollte sich das nächste Gespräch richten
  "fokus_verhalten": [number, …]            // Nummern (nr) von 1 bis 3 Verhalten aus den Daten
}`

export function baueNutzerText(eingabe: Eingabe, rueckmeldung?: string[]): string {
  const teile = [`Daten zur Person (alle Zahlen kommen aus der Datenbank):\n${JSON.stringify(eingabe, null, 1)}`]
  if (rueckmeldung && rueckmeldung.length > 0) {
    teile.push(
      `Dein letzter Entwurf enthielt Zahlen, die nicht in den Daten stehen: ${rueckmeldung.join(', ')}. ` +
        'Schreibe die Analyse neu und verwende nur Zahlen, die genau so in den Daten vorkommen (oder gar keine).',
    )
  }
  return teile.join('\n\n')
}

// ── Ausgabe prüfen ─────────────────────────────────────────────────────────

const LIMIT_EINTRAG = 600
const LIMIT_LISTE = 8

function textListe(wert: unknown, name: string): string[] {
  if (!Array.isArray(wert)) throw new KiFehler('ungueltige_ausgabe', `Die Antwort der KI war unvollständig („${name}“ fehlt).`)
  return wert
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().slice(0, LIMIT_EINTRAG))
    .filter((x) => x.length > 0)
    .slice(0, LIMIT_LISTE)
}

/** Holt das JSON aus der Antwort (auch aus ```json-Blöcken) und prüft Form und Verhaltensnummern. */
export function parseAusgabe(roh: unknown, eingabe: Pick<Eingabe, 'verhalten'>): Ausgabe {
  let obj: unknown = roh
  if (typeof roh === 'string') {
    const m = roh.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const kandidat = (m ? m[1] : roh).trim()
    const von = kandidat.indexOf('{')
    const bis = kandidat.lastIndexOf('}')
    if (von < 0 || bis <= von) throw new KiFehler('ungueltige_ausgabe', 'Die Antwort der KI enthielt kein JSON.')
    try {
      obj = JSON.parse(kandidat.slice(von, bis + 1))
    } catch {
      throw new KiFehler('ungueltige_ausgabe', 'Die Antwort der KI war kein gültiges JSON.')
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new KiFehler('ungueltige_ausgabe', 'Die Antwort der KI hatte nicht das erwartete Format.')
  const o = obj as Record<string, unknown>
  const nummern = new Set(eingabe.verhalten.map((v) => v.nr))
  const fokusRoh = o.fokus_verhalten
  if (!Array.isArray(fokusRoh)) throw new KiFehler('ungueltige_ausgabe', 'Die Antwort der KI war unvollständig („fokus_verhalten“ fehlt).')
  const fokus = [...new Set(fokusRoh.map((x) => (typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x)).filter((x): x is number => Number.isInteger(x) && nummern.has(x as number)))].slice(0, 3)
  const empfehlung = typeof o.empfehlung === 'string' ? o.empfehlung.trim().slice(0, 1200) : ''
  if (!empfehlung) throw new KiFehler('ungueltige_ausgabe', 'Die Antwort der KI war unvollständig („empfehlung“ fehlt).')
  return {
    staerken: textListe(o.staerken, 'staerken'),
    entwicklungsfelder: textListe(o.entwicklungsfelder, 'entwicklungsfelder'),
    auffaellige_differenzen: textListe(o.auffaellige_differenzen ?? [], 'auffaellige_differenzen'),
    kommentar_themen: textListe(o.kommentar_themen ?? [], 'kommentar_themen'),
    kommentar_qualitaet_hinweis: typeof o.kommentar_qualitaet_hinweis === 'string' ? o.kommentar_qualitaet_hinweis.trim().slice(0, LIMIT_EINTRAG) : '',
    empfehlung,
    fokus_verhalten: fokus,
  }
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
export const monatText = (m: string): string => `${MONATE[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

/** Die lesbare Fassung: Markdown mit Überschriften und Listen. Dieser Text wird bearbeitet, freigegeben und ins PDF übernommen. */
export function zuMarkdown(a: Ausgabe, eingabe: Pick<Eingabe, 'verhalten'>): string {
  const liste = (titel: string, eintraege: string[]) => (eintraege.length ? `## ${titel}\n${eintraege.map((e) => `- ${e}`).join('\n')}\n` : '')
  const fokus = a.fokus_verhalten.map((nr) => {
    const v = eingabe.verhalten.find((x) => x.nr === nr)
    return `Verhalten ${nr}${v ? `: ${v.titel}` : ''}`
  })
  return [
    liste('Stärken', a.staerken),
    liste('Entwicklungsfelder', a.entwicklungsfelder),
    liste('Auffällige Differenzen zwischen Selbst- und Fremdbild', a.auffaellige_differenzen),
    liste('Themen in den Kommentaren', a.kommentar_themen),
    a.kommentar_qualitaet_hinweis ? `## Hinweis zu den Kommentaren\n${a.kommentar_qualitaet_hinweis}\n` : '',
    `## Empfehlung für das Gespräch\n${a.empfehlung}\n`,
    liste('Fokus-Verhalten', fokus),
  ]
    .filter(Boolean)
    .join('\n')
    .trim()
}

// ── Provider ───────────────────────────────────────────────────────────────

export interface ProviderUmgebung {
  AI_PROVIDER?: string
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_MODEL?: string
  AI_WEBHOOK_URL?: string
  AI_WEBHOOK_SECRET?: string
}

export interface Anfrage {
  system: string
  nutzer: string
  context: Record<string, unknown>
}

export interface Antwort {
  /** Text oder bereits fertiges Objekt */
  inhalt: unknown
  modell: string
}

export type Provider = (anfrage: Anfrage, signal?: AbortSignal) => Promise<Antwort>
type Abruf = typeof fetch

const FEHLER_NICHT_EINGERICHTET = 'Die KI ist noch nicht eingerichtet. Der Plattformbetreiber muss den Anbieter hinterlegen (Secret AI_PROVIDER).'

/** Technische Fehler, bei denen sich ein neuer Versuch lohnt (Überlastung, Serverfehler, Zeitüberschreitung). */
export const istVorubergehend = (status: number): boolean => status === 408 || status === 409 || status === 429 || status >= 500

export function waehleProvider(env: ProviderUmgebung, abruf: Abruf = fetch): Provider {
  const art = (env.AI_PROVIDER ?? '').trim().toLowerCase()
  if (art === 'claude') {
    const key = env.ANTHROPIC_API_KEY
    if (!key) throw new KiFehler('ki_nicht_eingerichtet', 'Der Anthropic-Schlüssel fehlt (Secret ANTHROPIC_API_KEY).')
    const modell = env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5'
    return async (a, signal) => {
      const r = await abruf('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modell, max_tokens: 2000, system: a.system, messages: [{ role: 'user', content: a.nutzer }] }),
        signal,
      })
      if (!r.ok) throw new HttpFehler(r.status)
      const daten = (await r.json()) as { content?: { type: string; text?: string }[] }
      const text = (daten.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
      if (!text) throw new KiFehler('ungueltige_ausgabe', 'Die KI hat keinen Text geliefert.')
      return { inhalt: text, modell: `claude:${modell}` }
    }
  }
  if (art === 'webhook') {
    const url = env.AI_WEBHOOK_URL
    if (!url) throw new KiFehler('ki_nicht_eingerichtet', 'Die Adresse des Webhooks fehlt (Secret AI_WEBHOOK_URL).')
    return async (a, signal) => {
      const kopf: Record<string, string> = { 'content-type': 'application/json' }
      if (env.AI_WEBHOOK_SECRET) kopf.authorization = `Bearer ${env.AI_WEBHOOK_SECRET}`
      // Der bestehende n8n-Webhook erwartet { message, context }: die Anweisung und die Daten als Text, dazu die Daten strukturiert
      const r = await abruf(url, { method: 'POST', headers: kopf, body: JSON.stringify({ message: `${a.system}\n\n${a.nutzer}`, context: a.context }), signal })
      if (!r.ok) throw new HttpFehler(r.status)
      const typ = r.headers.get('content-type') ?? ''
      const daten: unknown = typ.includes('json') ? await r.json() : await r.text()
      return { inhalt: webhookInhalt(daten), modell: 'webhook' }
    }
  }
  throw new KiFehler('ki_nicht_eingerichtet', FEHLER_NICHT_EINGERICHTET)
}

/** Der Webhook darf den Text unter einem üblichen Schlüssel liefern oder das Objekt selbst. */
export function webhookInhalt(daten: unknown): unknown {
  if (typeof daten === 'string') return daten
  if (Array.isArray(daten)) return daten.length ? webhookInhalt(daten[0]) : ''
  if (daten && typeof daten === 'object') {
    const o = daten as Record<string, unknown>
    if ('staerken' in o && 'empfehlung' in o) return o
    for (const k of ['output', 'text', 'message', 'response', 'content', 'antwort']) if (o[k] !== undefined) return webhookInhalt(o[k])
    return daten
  }
  return ''
}

class HttpFehler extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`)
  }
}

// ── Erzeugen mit Faktencheck ───────────────────────────────────────────────

export interface Pruefergebnis {
  geprueft: boolean
  unbekannt: string[]
}

export interface Ergebnis {
  ausgabe: Ausgabe
  text_md: string
  modell: string
  /** Anzahl der Aufrufe beim Anbieter (1 bis MAX_AUFRUFE) */
  aufrufe: number
  /** Ergebnis des letzten Faktenchecks; bei geprueft = false wird der Entwurf trotzdem geliefert und so gekennzeichnet */
  pruefung: Pruefergebnis
}

/**
 * Erzeugt die Analyse. Höchstens MAX_AUFRUFE Aufrufe beim Anbieter (also zwei Wiederholungen), geteilt zwischen
 *  - vorübergehenden Fehlern (Überlastung, Serverfehler, Zeitüberschreitung) und
 *  - nicht bestandenem Faktencheck (dann bekommt die KI die Liste der unbekannten Zahlen zurück).
 * Nach dem letzten Aufruf wird der Entwurf auch ohne bestandenen Faktencheck geliefert (mit pruefung.geprueft = false).
 */
export async function erzeuge(
  provider: Provider,
  eingabe: Eingabe,
  pruefe: (ausgabe: Ausgabe, text_md: string) => Promise<Pruefergebnis>,
  optionen: { zeitlimitMs?: number; maxAufrufe?: number; warte?: (ms: number) => Promise<void> } = {},
): Promise<Ergebnis> {
  const max = optionen.maxAufrufe ?? MAX_AUFRUFE
  const warte = optionen.warte ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let rueckmeldung: string[] | undefined
  let letzter: Ergebnis | null = null
  let letzterFehler: KiFehler | null = null

  for (let aufruf = 1; aufruf <= max; aufruf++) {
    try {
      const antwort = await provider(
        { system: SYSTEM_PROMPT, nutzer: baueNutzerText(eingabe, rueckmeldung), context: { eingabe, prompt_version: PROMPT_VERSION } },
        AbortSignal.timeout(optionen.zeitlimitMs ?? ZEITLIMIT_MS),
      )
      const ausgabe = parseAusgabe(antwort.inhalt, eingabe)
      const text_md = zuMarkdown(ausgabe, eingabe)
      const pruefung = await pruefe(ausgabe, text_md)
      letzter = { ausgabe, text_md, modell: antwort.modell, aufrufe: aufruf, pruefung }
      if (pruefung.geprueft) return letzter
      rueckmeldung = pruefung.unbekannt
    } catch (e) {
      letzterFehler = uebersetzeFehler(e)
      // Ungültiges Format oder vorübergehender Fehler: noch einmal versuchen, solange noch Aufrufe übrig sind
      if (letzterFehler.art === 'ki_nicht_eingerichtet') throw letzterFehler
      if (aufruf < max) await warte(Math.min(2000 * aufruf, 5000))
    }
  }
  if (letzter) return letzter
  throw letzterFehler ?? new KiFehler('ki_fehler', 'Die KI hat nicht geantwortet. Bitte versuche es später noch einmal.')
}

/** Aus jedem Fehler eine verständliche Meldung machen. */
export function uebersetzeFehler(e: unknown): KiFehler {
  if (e instanceof KiFehler) return e
  if (e instanceof HttpFehler) {
    if (e.status === 401 || e.status === 403) return new KiFehler('ki_nicht_eingerichtet', 'Der KI-Anbieter hat den Zugang abgelehnt. Bitte den Schlüssel prüfen.')
    if (istVorubergehend(e.status)) return new KiFehler('ki_fehler', 'Der KI-Anbieter ist gerade überlastet oder nicht erreichbar. Bitte versuche es später noch einmal.')
    return new KiFehler('ki_fehler', `Der KI-Anbieter hat die Anfrage abgelehnt (Fehler ${e.status}).`)
  }
  const name = (e as { name?: string } | null)?.name
  if (name === 'TimeoutError' || name === 'AbortError') return new KiFehler('zeitueberschreitung', 'Die KI hat zu lange gebraucht. Bitte versuche es noch einmal.')
  return new KiFehler('ki_fehler', 'Die Verbindung zur KI ist fehlgeschlagen. Bitte versuche es später noch einmal.')
}

/** SHA-256 als Hexadezimalzahl. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Der input_hash einer Analyse: gleiche Eingabe und gleiche Prompt-Version ergeben denselben Wert. */
export const inputHash = (eingabeHash: string): Promise<string> => sha256Hex(`${PROMPT_VERSION}\n${eingabeHash}`)
