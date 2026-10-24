// Typen und reine Logik der Monatsumfrage: Validierung, Payload, Zwischenstand, Video-Quelle.
// Fachlich wie referenz/umfrage-hammermeister.html, nur ohne Namensauswahl (der Feedbackgeber ist der Login)
// und mit „Locked In“: Jede Bewertung zählt erst nach der Bestätigung im Popup und ist danach gesperrt.

export const PFLICHT_AB = 4 // ab dieser Bewertung ist ein Kommentar Pflicht
export const UMFRAGE_VERSION = 'plattform-1'
/** Namen der fünf Stufen: stehen unter den Zahlen und im Popup, wenn für ein Verhalten nichts anderes hinterlegt ist. */
export const STUFEN_KURZNAMEN = ['Bewusstsein', 'Aufbau', 'Stabilität', 'Profi', 'High Performer']

// ── Inhalt (kommt aus umfrage_inhalt()) ───────────────────────────────────

export interface Kriterium {
  stufe: number
  bezeichnung: string | null
  prozent: string | null
  leitsatz: string | null
  punkte: string[]
}

/** Name einer Stufe ohne die vorangestellte Zahl („4 – Profi“ → „Profi“); ohne Eintrag der Standardname. */
export function stufenName(kriterien: Kriterium[], stufe: number): string {
  const roh = kriterien.find((k) => k.stufe === stufe)?.bezeichnung?.replace(/^\s*\d+\s*[–-]\s*/, '').trim()
  return roh || STUFEN_KURZNAMEN[stufe - 1] || ''
}

/**
 * Stufenname für die schmalen Knöpfe: lange Wörter bekommen Trennstellen (unsichtbare Weichtrennzeichen),
 * damit sie auf kleinen Handys an einer sinnvollen Stelle umbrechen statt mitten im Wort.
 */
export const mitTrennstellen = (name: string): string =>
  name.replace(/Bewusstsein/g, 'Bewusst\u00ADsein').replace(/Performer/g, 'Per\u00ADformer').replace(/Stabilität/g, 'Stabi\u00ADlität').replace(/Aufbau/g, 'Auf\u00ADbau')

export interface Verhalten {
  id: string
  nr: number
  grundpfeiler: string | null
  saeule: string | null
  titel: string
  video_url: string | null
  kriterien: Kriterium[]
}

export interface RitualFrage {
  nr: number
  typ: 'skala' | 'auswahl' | 'text'
  frage: string
  hinweis: string | null
  optionen: string[] | null
  labels: string[] | null
  pflicht: boolean
}

export interface Ritual {
  id: string
  nr: number
  titel: string
  untertitel: string | null
  einleitung: string[]
  video_url: string | null
  fragen: RitualFrage[]
}

export interface Kollege {
  id: string
  name: string
}

export interface UmfrageInhalt {
  verhalten: Verhalten[]
  rituale: Ritual[]
  kollegen: Kollege[]
}

export interface OffenerMonat {
  monat: string // YYYY-MM
  frist: string // YYYY-MM-DD
  ueberfaellig: boolean
  tage_ueberfaellig: number
}

// ── Antworten ─────────────────────────────────────────────────────────────

/** Eine bestätigte Bewertung („Locked In“). Gespeichert wird nur Bestätigtes: note = null heißt noch offen. */
export interface Bewertung {
  note: number | null
  kommentar: string
}

/** Wer bewertet wird: man selbst oder ein Kollege. */
export type Ziel = { art: 'selbst' } | { art: 'fremd'; kollegeId: string }

export type RitualAntwort = string | number | null

export interface Antworten {
  entwicklungPersonId: string | null
  entwicklungBegruendung: string
  rituale: Record<string, RitualAntwort> // "<ritualId>:<frageNr>"
  selbst: Record<number, Bewertung> // verhalten.nr
  fremd: Record<string, Bewertung> // "<verhaltenNr>:<kollegeId>"
  videoGesehen: Record<number, boolean> // verhalten.nr
}

export const leereAntworten = (): Antworten => ({
  entwicklungPersonId: null,
  entwicklungBegruendung: '',
  rituale: {},
  selbst: {},
  fremd: {},
  videoGesehen: {},
})

export const ritualKey = (ritualId: string, frageNr: number): string => `${ritualId}:${frageNr}`
export const fremdKey = (verhaltenNr: number, kollegeId: string): string => `${verhaltenNr}:${kollegeId}`

const leer = (): Bewertung => ({ note: null, kommentar: '' })
export const selbstVon = (a: Antworten, nr: number): Bewertung => a.selbst[nr] ?? leer()
export const fremdVon = (a: Antworten, nr: number, kollegeId: string): Bewertung => a.fremd[fremdKey(nr, kollegeId)] ?? leer()
export const bewertungVon = (a: Antworten, nr: number, z: Ziel): Bewertung => (z.art === 'selbst' ? selbstVon(a, nr) : fremdVon(a, nr, z.kollegeId))
export const istBestaetigt = (b: Bewertung): boolean => b.note !== null

/** Ab dieser Bewertung ist der Kommentar Pflicht. */
export const kommentarPflicht = (note: number): boolean => note >= PFLICHT_AB

/** Trägt eine bestätigte Bewertung ein. Was schon bestätigt ist, bleibt unverändert (Sperre nach „Locked In“). */
export function bestaetige(a: Antworten, nr: number, z: Ziel, note: number, kommentar: string): Antworten {
  if (istBestaetigt(bewertungVon(a, nr, z))) return a
  if (!Number.isInteger(note) || note < 1 || note > 5) return a
  const text = kommentar.trim()
  if (kommentarPflicht(note) && !text) return a
  const neu: Bewertung = { note, kommentar: text }
  return z.art === 'selbst'
    ? { ...a, selbst: { ...a.selbst, [nr]: neu } }
    : { ...a, fremd: { ...a.fremd, [fremdKey(nr, z.kollegeId)]: neu } }
}

/** Alle Bewertungsfelder einer Seite in fester Reihenfolge: zuerst man selbst, dann die Kollegen. */
export const zieleDerSeite = (kollegen: Kollege[]): Ziel[] => [{ art: 'selbst' }, ...kollegen.map((k): Ziel => ({ art: 'fremd', kollegeId: k.id }))]

/** Das erste Feld ohne bestätigte Bewertung, außer dem gerade bestätigten; null, wenn die Seite fertig ist. */
export function naechstesOffenes(v: Verhalten, kollegen: Kollege[], a: Antworten, ausser?: Ziel): Ziel | null {
  const gleich = (x: Ziel, y: Ziel) => x.art === y.art && (x.art === 'selbst' || (y.art === 'fremd' && x.kollegeId === y.kollegeId))
  for (const z of zieleDerSeite(kollegen)) {
    if (ausser && gleich(z, ausser)) continue
    if (!istBestaetigt(bewertungVon(a, v.nr, z))) return z
  }
  return null
}

// ── Validierung (Reihenfolge wie in der Umfrage) ──────────────────────────

export function entwicklungFertig(a: Antworten): boolean {
  return !!a.entwicklungPersonId && a.entwicklungBegruendung.trim().length > 0
}

const istLeer = (v: RitualAntwort | undefined): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** Nummer der ersten unbeantworteten Pflichtfrage eines Rituals, sonst null. */
export function ritualProblem(ritual: Ritual, a: Antworten): number | null {
  for (const f of ritual.fragen) {
    if (f.pflicht && istLeer(a.rituale[ritualKey(ritual.id, f.nr)])) return f.nr
  }
  return null
}

export type VerhaltenProblem =
  | { art: 'video' }
  | { art: 'selbst' }
  | { art: 'selbstKommentar' }
  | { art: 'fremd'; kollegeId: string }
  | { art: 'fremdKommentar'; kollegeId: string }

/** Das erste Problem einer Verhaltens-Seite, sonst null: Video → Selbstbild → Kommentar → jedes Fremdbild. */
export function verhaltenProblem(v: Verhalten, kollegen: Kollege[], a: Antworten): VerhaltenProblem | null {
  if (!a.videoGesehen[v.nr]) return { art: 'video' }
  const s = selbstVon(a, v.nr)
  if (s.note === null) return { art: 'selbst' }
  if (s.note >= PFLICHT_AB && !s.kommentar.trim()) return { art: 'selbstKommentar' }
  for (const k of kollegen) {
    const f = fremdVon(a, v.nr, k.id)
    if (f.note === null) return { art: 'fremd', kollegeId: k.id }
    if (f.note >= PFLICHT_AB && !f.kommentar.trim()) return { art: 'fremdKommentar', kollegeId: k.id }
  }
  return null
}

// ── Schritte ──────────────────────────────────────────────────────────────

export type Schritt =
  | { art: 'front' }
  | { art: 'entwicklung' }
  | { art: 'ritual'; index: number }
  | { art: 'verhalten'; index: number }

/** Entwicklungsfrage + Rituale + alle Verhalten. */
export const gesamtSchritte = (inhalt: UmfrageInhalt): number => 1 + inhalt.rituale.length + inhalt.verhalten.length

/** Position für die Fortschrittsanzeige (0 = Frontblatt). */
export function schrittNummer(s: Schritt, inhalt: UmfrageInhalt): number {
  switch (s.art) {
    case 'front':
      return 0
    case 'entwicklung':
      return 1
    case 'ritual':
      return 2 + s.index
    case 'verhalten':
      return 2 + inhalt.rituale.length + s.index
  }
}

/**
 * Die erste Stelle der ganzen Umfrage, an der noch etwas fehlt (Entwicklung des Monats, Rituale, Verhalten),
 * sonst null. Abgesendet wird erst, wenn hier null herauskommt: alle Verhalten sind durchbewertet.
 */
export function umfrageLuecke(inhalt: UmfrageInhalt, a: Antworten): { schritt: Schritt; text: string } | null {
  if (!entwicklungFertig(a)) return { schritt: { art: 'entwicklung' }, text: 'Die Entwicklung des Monats ist noch nicht ausgefüllt.' }
  for (let i = 0; i < inhalt.rituale.length; i++) {
    if (ritualProblem(inhalt.rituale[i], a) !== null) return { schritt: { art: 'ritual', index: i }, text: `Bei Ritual ${i + 1} fehlt noch eine Pflichtantwort.` }
  }
  for (let i = 0; i < inhalt.verhalten.length; i++) {
    if (verhaltenProblem(inhalt.verhalten[i], inhalt.kollegen, a)) {
      return { schritt: { art: 'verhalten', index: i }, text: `Verhalten ${i + 1} ist noch nicht vollständig bewertet.` }
    }
  }
  return null
}

// ── Payload für umfrage_einreichen_v2 ─────────────────────────────────────

export interface Nutzlast {
  version: string
  monat: string
  zeitpunkt: string
  gestartet_am: string
  entwicklung: { person_id: string; begruendung: string }
  rituale: { ritual_id: string; frage_nr: number; antwort: RitualAntwort }[]
  bewertungen: { verhalten_nr: number; bewertete_person_id: string; note: number; kommentar: string }[]
}

export function baueNutzlast(p: {
  monat: string
  gestartetAm: string
  personId: string
  inhalt: UmfrageInhalt
  antworten: Antworten
  jetzt?: Date
}): Nutzlast {
  const { inhalt, antworten: a } = p
  if (!a.entwicklungPersonId) throw new Error('Entwicklung des Monats fehlt')

  const bewertungen: Nutzlast['bewertungen'] = []
  for (const v of inhalt.verhalten) {
    const s = selbstVon(a, v.nr)
    if (s.note === null) throw new Error(`Selbstbild für Verhalten ${v.nr} fehlt`)
    if (kommentarPflicht(s.note) && !s.kommentar.trim()) throw new Error(`Kommentar zum Selbstbild für Verhalten ${v.nr} fehlt`)
    bewertungen.push({ verhalten_nr: v.nr, bewertete_person_id: p.personId, note: s.note, kommentar: s.kommentar.trim() })
    for (const k of inhalt.kollegen) {
      const f = fremdVon(a, v.nr, k.id)
      if (f.note === null) throw new Error(`Fremdbild für Verhalten ${v.nr} und ${k.name} fehlt`)
      if (kommentarPflicht(f.note) && !f.kommentar.trim()) throw new Error(`Kommentar zum Fremdbild für Verhalten ${v.nr} und ${k.name} fehlt`)
      bewertungen.push({ verhalten_nr: v.nr, bewertete_person_id: k.id, note: f.note, kommentar: f.kommentar.trim() })
    }
  }

  return {
    version: UMFRAGE_VERSION,
    monat: p.monat,
    zeitpunkt: (p.jetzt ?? new Date()).toISOString(),
    gestartet_am: p.gestartetAm,
    entwicklung: { person_id: a.entwicklungPersonId, begruendung: a.entwicklungBegruendung.trim() },
    rituale: inhalt.rituale.flatMap((r) =>
      r.fragen.map((f) => {
        const antwort = a.rituale[ritualKey(r.id, f.nr)]
        return { ritual_id: r.id, frage_nr: f.nr, antwort: typeof antwort === 'string' ? antwort.trim() : (antwort ?? null) }
      }),
    ),
    bewertungen,
  }
}

// ── Video ─────────────────────────────────────────────────────────────────

export type VideoQuelle = { typ: 'keine' } | { typ: 'datei'; url: string } | { typ: 'vimeo'; url: string }

/** video_url darf eine .mp4-URL, ein Vimeo-Link oder der komplette Vimeo-Einbettungscode sein. */
export function videoQuelle(roh: string | null | undefined): VideoQuelle {
  const text = String(roh ?? '').trim()
  if (!text) return { typ: 'keine' }
  const embed = text.match(/src=["']([^"']+)["']/) // Einbettungscode → src herausziehen
  let url = (embed ? embed[1] : text).replace(/&amp;/g, '&')
  if (/vimeo\.com/.test(url)) {
    const id = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1]
    if (!id) return { typ: 'keine' }
    if (!/player\.vimeo\.com/.test(url)) {
      // normaler Vimeo-Link → Player-URL
      const h = url.match(/vimeo\.com\/\d+\/([0-9a-f]+)/)?.[1]
      url = `https://player.vimeo.com/video/${id}${h ? `?h=${h}` : ''}`
    }
    return { typ: 'vimeo', url }
  }
  return { typ: 'datei', url }
}

/** 0:08 */
export const zeitText = (sek: number): string => `${Math.floor(sek / 60)}:${String(Math.floor(sek % 60)).padStart(2, '0')}`

// ── Zwischenstand (localStorage) ──────────────────────────────────────────

export interface Entwurf {
  v: 2
  gestartetAm: string
  schritt: Schritt
  antworten: Antworten
}

export const entwurfSchluessel = (nutzerId: string, monat: string): string => `hammermeister-umfrage:${nutzerId}:${monat}`

type EntwurfRoh = Omit<Entwurf, 'v'> & { v: number }

function istEntwurf(x: unknown): x is EntwurfRoh {
  if (!x || typeof x !== 'object') return false
  const e = x as Partial<EntwurfRoh>
  return typeof e.v === 'number' && typeof e.gestartetAm === 'string' && !!e.schritt && typeof e.schritt.art === 'string' && !!e.antworten && typeof e.antworten === 'object'
}

export function ladeEntwurf(schluessel: string): Entwurf | null {
  try {
    const roh = window.localStorage.getItem(schluessel)
    if (!roh) return null
    const e: unknown = JSON.parse(roh)
    if (!istEntwurf(e)) return null
    if (e.v === 2) return e as Entwurf
    // Version 1 (vor „Locked In“): Entwicklung, Rituale, „Video gesehen“ und Startzeit bleiben erhalten.
    // Die damaligen Bewertungen waren nie bestätigt und müssen noch einmal bestätigt werden.
    if (e.v === 1) return { v: 2, gestartetAm: e.gestartetAm, schritt: e.schritt, antworten: { ...e.antworten, selbst: {}, fremd: {} } }
    return null
  } catch {
    return null
  }
}

export function speichereEntwurf(schluessel: string, entwurf: Entwurf): void {
  try {
    window.localStorage.setItem(schluessel, JSON.stringify(entwurf))
  } catch {
    /* privater Modus oder voll: die Umfrage funktioniert auch ohne Zwischenstand */
  }
}

export function loescheEntwurf(schluessel: string): void {
  try {
    window.localStorage.removeItem(schluessel)
  } catch {
    /* siehe oben */
  }
}

/** Nur eine vollständig bestätigte Bewertung bleibt im Zwischenstand (Wert 1 bis 5, ab 4 mit Kommentar). */
function istGueltigeBewertung(b: unknown): b is Bewertung {
  if (!b || typeof b !== 'object') return false
  const { note, kommentar } = b as Partial<Bewertung>
  if (typeof note !== 'number' || !Number.isInteger(note) || note < 1 || note > 5) return false
  if (typeof kommentar !== 'string') return false
  return !kommentarPflicht(note) || kommentar.trim().length > 0
}

/**
 * Passt einen gespeicherten Zwischenstand an den aktuellen Inhalt an: Antworten zu Verhalten oder
 * Personen, die es nicht mehr gibt, fallen weg, ebenso alles, was nicht bestätigt sein kann, und der
 * Schritt bleibt im gültigen Bereich.
 */
export function bereinigeEntwurf(e: Entwurf, inhalt: UmfrageInhalt): Entwurf {
  const nrs = new Set(inhalt.verhalten.map((v) => v.nr))
  const kollegen = new Set(inhalt.kollegen.map((k) => k.id))
  const ritualKeys = new Set(inhalt.rituale.flatMap((r) => r.fragen.map((f) => ritualKey(r.id, f.nr))))
  const a = e.antworten

  const antworten: Antworten = {
    entwicklungPersonId: a.entwicklungPersonId && kollegen.has(a.entwicklungPersonId) ? a.entwicklungPersonId : null,
    entwicklungBegruendung: typeof a.entwicklungBegruendung === 'string' ? a.entwicklungBegruendung : '',
    rituale: Object.fromEntries(Object.entries(a.rituale ?? {}).filter(([k]) => ritualKeys.has(k))),
    selbst: Object.fromEntries(Object.entries(a.selbst ?? {}).filter(([k, b]) => nrs.has(Number(k)) && istGueltigeBewertung(b))),
    fremd: Object.fromEntries(
      Object.entries(a.fremd ?? {}).filter(([k, b]) => {
        const [nr, id] = k.split(':')
        return nrs.has(Number(nr)) && kollegen.has(id) && istGueltigeBewertung(b)
      }),
    ),
    videoGesehen: Object.fromEntries(Object.entries(a.videoGesehen ?? {}).filter(([k]) => nrs.has(Number(k)))),
  }

  // Nur ein Schritt, den es wirklich gibt; alles andere (auch von Hand veränderte Werte) beginnt bei der Entwicklungsfrage
  const gueltig = (i: unknown, n: number) => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < n
  const s = e.schritt as { art: string; index?: unknown }
  let schritt: Schritt = { art: 'entwicklung' }
  if (s.art === 'front' || s.art === 'entwicklung') schritt = { art: s.art }
  else if (s.art === 'ritual' && gueltig(s.index, inhalt.rituale.length)) schritt = { art: 'ritual', index: s.index as number }
  else if (s.art === 'verhalten' && gueltig(s.index, inhalt.verhalten.length)) schritt = { art: 'verhalten', index: s.index as number }
  return { ...e, schritt, antworten }
}
