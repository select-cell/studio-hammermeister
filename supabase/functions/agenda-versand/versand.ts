// Logik der Edge Function „agenda-versand“ (Erweiterung F): schickt Verantwortlichen die Agenda vor dem Teammeeting per Mail.
// Reines TypeScript ohne Deno-Bezug, damit sich alles mit Vitest testen lässt.
//
// Wer, was und wann entscheidet die Datenbank (Migration 020):
//   - versand_faellig()       welche Mails jetzt fällig sind (Berliner Uhrzeit, Zeitumstellung-fest) und an wen
//   - versand_beanspruchen()  genau ein Lauf darf eine Mail senden (UNIQUE je Termin und Art), höchstens 3 Versuche
//   - agenda_fuer_versand()   die Agenda des Termins, ohne Kommentar-Beispiele und ohne Namen (nur Teamebene)
//   - versand_abschliessen()  Ergebnis im Mail-Protokoll
// Diese Datei baut nur den Text der Mail, spricht mit dem Mail-Dienst (Resend) und führt den Ablauf aus.

export type Art = 'vorab' | 'kurz'

export type Faellig = {
  termin_id: string
  art: Art
  salon: string | null
  titel: string
  startet_am: string
  /** Berliner Uhrzeit des Beginns als „YYYY-MM-DDTHH:MM“ */
  startet_lokal: string
  /** Bezugsmonat der Agenda als „YYYY-MM“ */
  bezugsmonat: string
  empfaenger: string[]
}

export type Block = { id: string; titel: string; minuten: number; punkte: string[] }

export type Agenda = {
  status: 'entwurf' | 'freigegeben' | 'keine_daten'
  monat: string
  hinweis: string | null
  bloecke: Block[]
}

export type Mail = { betreff: string; text: string; html: string }

export type Konfiguration = {
  resendKey: string
  absender: string
  cronSecret: string
  plattformUrl: string
}

/** Höchstens so viele Mails je Lauf; der nächste Lauf (alle 15 Minuten) macht weiter. */
export const MAX_MAILS_PRO_LAUF = 20

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

// ── Konfiguration ───────────────────────────────────────────────────────────────

const SECRETS: Array<[keyof Konfiguration, string]> = [
  ['resendKey', 'RESEND_API_KEY'],
  ['absender', 'MAIL_ABSENDER'],
  ['cronSecret', 'CRON_SECRET'],
  ['plattformUrl', 'PLATTFORM_URL'],
]

/** Prüft die Secrets, bevor irgendetwas beansprucht wird: Ohne Konfiguration verbrennt kein Versuch. */
export function leseKonfiguration(env: Record<string, string | undefined>): { ok: true; konfig: Konfiguration } | { ok: false; fehlend: string[] } {
  const fehlend: string[] = []
  const konfig = {} as Konfiguration
  for (const [feld, name] of SECRETS) {
    const wert = (env[name] ?? '').trim()
    if (!wert) fehlend.push(name)
    else konfig[feld] = wert
  }
  if (fehlend.length > 0) return { ok: false, fehlend }
  konfig.plattformUrl = konfig.plattformUrl.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(konfig.plattformUrl)) return { ok: false, fehlend: ['PLATTFORM_URL (muss mit https:// beginnen)'] }
  return { ok: true, konfig }
}

/** Vergleich in gleicher Zeit, damit sich das Secret nicht über die Antwortzeit erraten lässt. */
export function gleichInZeit(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let unterschied = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) unterschied |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return unterschied === 0
}

// ── Formatierung ────────────────────────────────────────────────────────────────

export function monatsname(monat: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(monat)
  if (!m) return monat
  return `${MONATE[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

/** „2026-10-26T10:00“ (Berliner Uhrzeit) → „Montag, 26. Oktober 2026, 10:00 Uhr“. Es wird nur gelesen, nicht umgerechnet. */
export function terminLang(lokal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(lokal)
  if (!m) return lokal
  const tag = WOCHENTAGE[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()]
  return `${tag}, ${Number(m[3])}. ${MONATE[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]} Uhr`
}

export function uhrzeit(lokal: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(lokal)
  return m ? `${m[1]}:${m[2]} Uhr` : lokal
}

export const maskiere = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function agendaLink(konfig: Konfiguration, monat: string): string {
  return `${konfig.plattformUrl}/app/leitung/agenda?monat=${encodeURIComponent(monat)}`
}

/** Die drei wichtigsten Punkte für die Kurz-Mail: zuerst der Fokus, dann die Team-Kennzahlen, dann alles Übrige in der Reihenfolge der Agenda. */
export function wichtigstePunkte(agenda: Agenda, anzahl = 3): string[] {
  const nach = (id: string) => agenda.bloecke.find((b) => b.id === id)?.punkte ?? []
  const reihe = [...nach('fokus').slice(0, 2), ...nach('kennzahlen').slice(0, 1), ...nach('fokus').slice(2), ...nach('entwicklung'), ...nach('einstieg')]
  const eindeutig: string[] = []
  for (const p of reihe) if (!eindeutig.includes(p)) eindeutig.push(p)
  return eindeutig.slice(0, anzahl)
}

const STIL = {
  seite: 'font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;line-height:1.5;font-size:15px;max-width:640px',
  block: 'margin:18px 0 6px;font-size:16px;font-weight:bold',
  hinweis: 'margin:12px 0;padding:8px 12px;border-left:4px solid #b88a2a;background:#faf4e4',
  knopf: 'display:inline-block;margin-top:14px;padding:10px 18px;background:#2b2b2b;color:#ffffff;text-decoration:none;border-radius:4px',
  klein: 'margin-top:24px;font-size:12px;color:#6b6b6b',
}

function statusZeile(a: Agenda): string | null {
  if (a.status === 'entwurf') return 'Stand: Entwurf, noch nicht freigegeben.'
  return null
}

// ── Die Mails ───────────────────────────────────────────────────────────────────

export function baueMail(art: Art, f: Faellig, agenda: Agenda, konfig: Konfiguration): Mail {
  const link = agendaLink(konfig, f.bezugsmonat)
  const monat = monatsname(f.bezugsmonat)
  const wann = terminLang(f.startet_lokal)
  const ohneDaten = agenda.status === 'keine_daten' || agenda.bloecke.length === 0

  let betreff: string
  const text: string[] = []
  const html: string[] = []
  const absatz = (t: string) => {
    text.push(t, '')
    html.push(`<p style="margin:10px 0">${maskiere(t)}</p>`)
  }

  if (art === 'vorab') {
    betreff = `Agenda für ${f.titel} am ${wann.replace(/,\s*\d{2}:\d{2} Uhr$/, '')}`
    absatz('Hallo,')
    absatz(`am ${wann} findet „${f.titel}“ statt. Hier ist die Agenda auf Grundlage der Umfrage ${monat}. Sie enthält nur Zahlen und Themen des Teams, keine Kommentare einzelner Kollegen.`)
  } else {
    betreff = `Gleich geht es los: ${f.titel} um ${uhrzeit(f.startet_lokal)}`
    absatz('Hallo,')
    absatz(`„${f.titel}“ beginnt um ${uhrzeit(f.startet_lokal)} (${wann.replace(/,\s*\d{2}:\d{2} Uhr$/, '')}). Die wichtigsten Punkte aus der Umfrage ${monat}:`)
  }

  if (ohneDaten) {
    absatz(agenda.hinweis ?? `Für ${monat} liegt noch keine Auswertung vor.`)
  } else {
    if (agenda.hinweis) {
      text.push(`Hinweis: ${agenda.hinweis}`, '')
      html.push(`<p style="${STIL.hinweis}">${maskiere(agenda.hinweis)}</p>`)
    }
    if (art === 'vorab') {
      for (const b of agenda.bloecke) {
        text.push(`${b.titel} (${b.minuten} Min.)`)
        html.push(`<p style="${STIL.block}">${maskiere(b.titel)} <span style="font-weight:normal;color:#6b6b6b">(${b.minuten} Min.)</span></p><ul style="margin:0 0 8px;padding-left:20px">`)
        for (const p of b.punkte) {
          text.push(`  - ${p}`)
          html.push(`<li>${maskiere(p)}</li>`)
        }
        html.push('</ul>')
        text.push('')
      }
      const summe = agenda.bloecke.reduce((n, b) => n + b.minuten, 0)
      absatz(`Zusammen etwa ${summe} Minuten.`)
    } else {
      const punkte = wichtigstePunkte(agenda)
      html.push('<ul style="margin:8px 0;padding-left:20px">')
      for (const p of punkte) {
        text.push(`  - ${p}`)
        html.push(`<li>${maskiere(p)}</li>`)
      }
      html.push('</ul>')
      text.push('')
    }
    const s = statusZeile(agenda)
    if (s) absatz(s)
  }

  text.push(`Die ganze Agenda auf der Plattform: ${link}`, '', 'Diese Mail wurde automatisch von der Salon-Plattform versendet. Sie geht nur an Verantwortliche.')
  html.push(`<p><a href="${maskiere(link)}" style="${STIL.knopf}">Agenda auf der Plattform öffnen</a></p>`)
  html.push(`<p style="${STIL.klein}">Diese Mail wurde automatisch von der Salon-Plattform versendet. Sie geht nur an Verantwortliche.</p>`)

  return {
    betreff,
    text: text.join('\n'),
    html: `<!doctype html><html lang="de"><body><div style="${STIL.seite}">${html.join('')}</div></body></html>`,
  }
}

// ── Mail-Dienst (Resend) ────────────────────────────────────────────────────────

export type Senden = (an: string[], mail: Mail, idempotenzSchluessel: string) => Promise<void>

export function resendSender(konfig: Konfiguration, holen: typeof fetch = fetch): Senden {
  return async (an, mail, schluessel) => {
    let antwort: Response
    try {
      antwort = await holen('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${konfig.resendKey}`,
          'content-type': 'application/json',
          // Resend erkennt eine wiederholte Anfrage am Schlüssel und sendet nicht noch einmal (24 Stunden)
          'idempotency-key': schluessel,
        },
        body: JSON.stringify({ from: konfig.absender, to: an, subject: mail.betreff, text: mail.text, html: mail.html }),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      throw new Error(`Der Mail-Dienst ist nicht erreichbar (${e instanceof Error ? e.name : 'Fehler'}).`)
    }
    if (!antwort.ok) {
      let detail = ''
      try {
        const j = (await antwort.json()) as { message?: string; name?: string }
        detail = [j.name, j.message].filter(Boolean).join(': ')
      } catch {
        /* keine lesbare Antwort */
      }
      throw new Error(`Der Mail-Dienst hat abgelehnt (HTTP ${antwort.status}${detail ? `, ${detail.slice(0, 200)}` : ''}).`)
    }
  }
}

// ── Ablauf ──────────────────────────────────────────────────────────────────────

export type Rpc = (name: string, args?: Record<string, unknown>) => Promise<unknown>

export type Ergebnis = {
  faellig: number
  gesendet: number
  fehler: number
  uebersprungen: number
  /** Zusammenfassung ohne Adressen und ohne Inhalte */
  eintraege: Array<{ termin_id: string; art: Art; ergebnis: 'gesendet' | 'fehler' | 'uebersprungen'; meldung?: string }>
}

/**
 * Ein Lauf: fällige Mails holen, jede einzeln beanspruchen, bauen, senden, Ergebnis eintragen.
 * Fehler bei einer Mail halten die anderen nicht auf. Eine Mail, die ein anderer Lauf schon hat, wird übersprungen.
 */
export async function lauf(rpc: Rpc, senden: Senden, konfig: Konfiguration): Promise<Ergebnis> {
  const faellig = ((await rpc('versand_faellig')) as Faellig[] | null) ?? []
  const erg: Ergebnis = { faellig: faellig.length, gesendet: 0, fehler: 0, uebersprungen: 0, eintraege: [] }

  for (const f of faellig.slice(0, MAX_MAILS_PRO_LAUF)) {
    const anspruch = (await rpc('versand_beanspruchen', { p_termin: f.termin_id, p_art: f.art })) as { id: string; versuche: number } | null
    if (!anspruch) {
      erg.uebersprungen++
      erg.eintraege.push({ termin_id: f.termin_id, art: f.art, ergebnis: 'uebersprungen' })
      continue
    }
    try {
      const agenda = (await rpc('agenda_fuer_versand', { p_termin: f.termin_id })) as Agenda | null
      if (!agenda) throw new Error('Der Termin existiert nicht mehr.')
      const mail = baueMail(f.art, f, agenda, konfig)
      await senden(f.empfaenger, mail, `${f.termin_id}-${f.art}`)
    } catch (e) {
      const meldung = e instanceof Error ? e.message : 'Unbekannter Fehler'
      await abschliessen(rpc, anspruch.id, false, meldung)
      erg.fehler++
      erg.eintraege.push({ termin_id: f.termin_id, art: f.art, ergebnis: 'fehler', meldung })
      continue
    }
    await abschliessen(rpc, anspruch.id, true)
    erg.gesendet++
    erg.eintraege.push({ termin_id: f.termin_id, art: f.art, ergebnis: 'gesendet' })
  }
  return erg
}

/**
 * Das Ergebnis ins Protokoll schreiben, notfalls zweimal. Gelingt es nicht, bleibt die Mail „in Arbeit“ und wird nach 10 Minuten
 * erneut beansprucht; der Idempotenz-Schlüssel verhindert dann beim Mail-Dienst eine doppelte Zustellung.
 */
async function abschliessen(rpc: Rpc, id: string, erfolg: boolean, fehler?: string): Promise<void> {
  for (let versuch = 0; versuch < 2; versuch++) {
    try {
      await rpc('versand_abschliessen', { p_id: id, p_erfolg: erfolg, p_fehler: fehler ?? null })
      return
    } catch {
      /* zweiter Versuch */
    }
  }
}
