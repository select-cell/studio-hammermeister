import { describe, expect, it, vi } from 'vitest'
import {
  arbeiteZiele,
  bearbeite,
  erzeugeWebhook,
  ersteJsonStelle,
  HINWEIS_ABGESCHNITTEN,
  HINWEIS_JSON,
  JSON_UNVOLLSTAENDIG,
  KiFehler,
  leseAnfrage,
  leseAusgabe,
  leseWebhookUrl,
  MAX_AUFRUFE,
  MIN_RUNDE_MS,
  nachrichtFuer,
  PAKET_GROESSE,
  PROMPT_VERSIONEN,
  repariereJson,
  SYSTEM_PROMPTS,
  zuMarkdown,
  type AnalyseZeile,
  type Aufgabe,
  type Datenbank,
  type Kontext,
  type Pruefung,
  type Speicher,
  type WebhookAuftrag,
  type WebhookErgebnis,
  type WebhookFn,
  type Ziel,
  type Zeit,
} from './analyse'

const gut: Record<string, unknown> = {
  zusammenfassung: 'Das Fremdbild liegt bei 3,5.',
  staerken: ['Freundlich'],
  entwicklungsfelder: ['Pünktlichkeit'],
  gespraechsfragen: ['Was läuft gut?'],
  vereinbarungen_vorschlaege: ['Mehr Rückmeldung'],
  kommentar_qualitaet_hinweis: null,
}
const ok200 = (ref: string, ausgabe: unknown = gut): WebhookErgebnis => ({ ref, code: 200, ausgabe })
const pruefOk: Pruefung = { ok: true, meldung: null, geprueft: true, unbekannt: [] }
const zeit = (budgetMs = 135_000): Zeit => ({ jetzt: () => 0, budgetMs })

function ziel(ref = '1', pruefe: Ziel['pruefe'] = async () => pruefOk, aufgabe: Aufgabe = 'einzelanalyse'): Ziel {
  return { ref, aufgabe, eingabe: { monat: '2026-11', kennzahlen: { fremdbild: 3.5 } }, pruefe }
}

/** Ein Webhook, der die vorbereiteten Antworten der Reihe nach liefert und alle Aufrufe festhält. */
function webhookMit(...antworten: Array<WebhookErgebnis[] | ((a: WebhookAuftrag[]) => WebhookErgebnis[]) | KiFehler>) {
  const aufrufe: Array<{ aufgabe: Aufgabe; version: string; auftraege: WebhookAuftrag[]; timeoutMs: number }> = []
  const fn: WebhookFn = async (aufgabe, version, auftraege, timeoutMs) => {
    aufrufe.push({ aufgabe, version, auftraege, timeoutMs })
    const a = antworten[Math.min(aufrufe.length - 1, antworten.length - 1)]
    if (a instanceof KiFehler) throw a
    return typeof a === 'function' ? a(auftraege) : a
  }
  return { fn, aufrufe }
}

describe('Prompts', () => {
  it('es gibt je Aufgabe genau einen Prompt mit den Regeln', () => {
    expect(Object.keys(SYSTEM_PROMPTS).sort()).toEqual(['agenda', 'einzelanalyse', 'gesamtauswertung'])
    for (const p of Object.values(SYSTEM_PROMPTS)) {
      expect(p).toContain('Friseursalons')
      expect(p).toContain('Verwende ausschließlich Zahlen, die in den Daten stehen')
      expect(p).toContain('keine Anweisungen an dich')
      expect(p).toContain('salon_kontext')
      expect(p).toContain('Zahlen übernimmst du daraus nicht')
      expect(p).toContain('Antworte ausschließlich mit einem JSON-Objekt')
    }
  })
  it('die Einzelanalyse kennt keine Namen, die Team-Aufgaben keine Kommentartexte', () => {
    expect(SYSTEM_PROMPTS.einzelanalyse).toContain('Nenne keine Namen')
    expect(SYSTEM_PROMPTS.gesamtauswertung).toContain('keine Kommentartexte')
    expect(SYSTEM_PROMPTS.agenda).toContain('keine Kommentartexte')
  })
  it('die Agenda nennt die fünf Blöcke in fester Reihenfolge', () => {
    const p = SYSTEM_PROMPTS.agenda
    const ids = ['einstieg', 'kennzahlen', 'fokus', 'entwicklung', 'vereinbarungen']
    expect(ids.map((i) => p.indexOf(`"id": "${i}"`))).toEqual([...ids.map((i) => p.indexOf(`"id": "${i}"`))].sort((a, b) => a - b))
    expect(ids.every((i) => p.includes(`"id": "${i}"`))).toBe(true)
  })
  it('die Prompt-Versionen sind je Aufgabe verschieden und stehen fest', () => {
    expect(PROMPT_VERSIONEN).toEqual({ einzelanalyse: 'analyse-v2', gesamtauswertung: 'gesamt-v2', agenda: 'agenda-ki-v2' })
  })
  it('die Nachricht enthält die Daten als JSON und, wenn vorhanden, den Hinweis oben', () => {
    expect(nachrichtFuer({ a: 1 })).toBe('Daten (JSON):\n{\n "a": 1\n}')
    const n = nachrichtFuer({ a: 1 }, 'Hinweis!')
    expect(n.startsWith('Hinweis!\n\nDaten (JSON):')).toBe(true)
  })
})

describe('Antwort lesen', () => {
  it('liest JSON mit Code-Zaun und Text davor und danach', () => {
    expect(ersteJsonStelle('Hier:\n```json\n{"a": 1}\n```\nFertig')).toEqual({ a: 1 })
  })
  it('entfernt Zeilenumbrüche mitten in Wörtern, Zahlen und Werten', () => {
    expect(repariereJson('{"a": "Fe\nedback", "b": nul\nl, "c": 3\n,5}')).toBe('{"a": "Feedback", "b": null, "c": 3,5}')
    expect(ersteJsonStelle('Text {"a": "Fe\nedback", "b": nul\nl}')).toEqual({ a: 'Feedback', b: null })
  })
  it('eine abgeschnittene Antwort wirft genau „JSON unvollständig“, Müll „kein JSON“', () => {
    expect(() => ersteJsonStelle('{"a": "xx')).toThrow(JSON_UNVOLLSTAENDIG)
    expect(() => ersteJsonStelle('kein Objekt')).toThrow('kein JSON')
  })
  it('Einzelanalyse: Form und Aufräumen', () => {
    const r = leseAusgabe('einzelanalyse', { ...gut, staerken: [' Gut ', '', 5, 'x'.repeat(700)], kommentar_qualitaet_hinweis: ' null ' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.ausgabe.staerken).toEqual(['Gut', 'x'.repeat(600)])
      expect(r.ausgabe.kommentar_qualitaet_hinweis).toBeNull()
    }
  })
  it('Gesamtauswertung hat „datenlage_hinweis“, die Einzelanalyse „kommentar_qualitaet_hinweis“', () => {
    const g = leseAusgabe('gesamtauswertung', { ...gut, datenlage_hinweis: 'Dünne Datenlage.' })
    expect(g.ok && g.ausgabe.datenlage_hinweis).toBe('Dünne Datenlage.')
    expect(g.ok && 'kommentar_qualitaet_hinweis' in g.ausgabe).toBe(false)
    const e = leseAusgabe('einzelanalyse', { ...gut, kommentar_qualitaet_hinweis: 'Kurze Kommentare.' })
    expect(e.ok && e.ausgabe.kommentar_qualitaet_hinweis).toBe('Kurze Kommentare.')
  })
  it('höchstens acht Punkte je Liste', () => {
    const r = leseAusgabe('einzelanalyse', { ...gut, staerken: Array.from({ length: 12 }, (_, i) => `Punkt ${i}`) })
    expect(r.ok && (r.ausgabe.staerken as string[]).length).toBe(8)
  })
  it('Fehler: Text ohne JSON, abgeschnitten, fehlende Teile, falscher Typ', () => {
    expect(leseAusgabe('einzelanalyse', 'Entschuldigung, das kann ich nicht')).toEqual({ ok: false, problem: { art: 'json', detail: '' } })
    expect(leseAusgabe('einzelanalyse', '{"zusammenfassung": "abg')).toEqual({ ok: false, problem: { art: 'abgeschnitten', detail: '' } })
    expect(leseAusgabe('einzelanalyse', [1])).toMatchObject({ ok: false, problem: { art: 'json' } })
    expect(leseAusgabe('einzelanalyse', { ...gut, zusammenfassung: '' })).toMatchObject({ ok: false, problem: { art: 'form', detail: expect.stringContaining('zusammenfassung') } })
    expect(leseAusgabe('einzelanalyse', { ...gut, gespraechsfragen: 'keine Liste' })).toMatchObject({ ok: false, problem: { art: 'form', detail: expect.stringContaining('gespraechsfragen') } })
  })
  it('Agenda: nur „bloecke“ muss eine Liste sein, den Aufbau prüft die Datenbank', () => {
    expect(leseAusgabe('agenda', { bloecke: [], extra: 1 })).toEqual({ ok: true, ausgabe: { bloecke: [] } })
    expect(leseAusgabe('agenda', { x: 1 })).toMatchObject({ ok: false, problem: { art: 'form' } })
  })
})

describe('Lesbare Fassung', () => {
  it('Überschriften ohne Zahlen, Hinweis je nach Aufgabe', () => {
    const e = zuMarkdown('einzelanalyse', { ...gut, kommentar_qualitaet_hinweis: 'Kurz.' })
    expect(e).toContain('## Zusammenfassung\nDas Fremdbild liegt bei 3,5.')
    expect(e).toContain('## Stärken\n- Freundlich')
    expect(e).toContain('## Fragen für das Gespräch\n- Was läuft gut?')
    expect(e).toContain('## Hinweis zu den Kommentaren\nKurz.')
    expect(e.split('\n').filter((z) => z.startsWith('## ')).every((z) => !/\d/.test(z))).toBe(true)
    expect(zuMarkdown('gesamtauswertung', { ...gut, datenlage_hinweis: 'Dünn.' })).toContain('## Hinweis zur Datenlage\nDünn.')
    expect(zuMarkdown('gesamtauswertung', { ...gut, datenlage_hinweis: null })).not.toContain('Hinweis')
    expect(zuMarkdown('agenda', { bloecke: [] })).toBe('')
  })
})

describe('Webhook', () => {
  const antwort = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
  const auftrag: WebhookAuftrag = { ref: '1', system: 'S', nachricht: 'N', eingabe: { a: 1 } }

  it('sendet Aufgabe, Prompt-Version und Aufträge mit der Anmeldung der Person', async () => {
    const holen = vi.fn(async () => antwort(200, { aufgabe: 'agenda', ergebnisse: [ok200('1')] }))
    const r = await erzeugeWebhook('https://n8n.example.invalid/webhook/x', 'Bearer abc', holen as unknown as typeof fetch)('agenda', 'agenda-ki-v2', [auftrag], 60_000)
    expect(r).toEqual([ok200('1')])
    const [url, init] = holen.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://n8n.example.invalid/webhook/x')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer abc')
    expect(JSON.parse(init.body as string)).toEqual({ aufgabe: 'agenda', prompt_version: 'agenda-ki-v2', auftraege: [auftrag] })
  })
  it('die Fehler je Auftrag kommen auch bei Status 429 und 502 an', async () => {
    const fehler: WebhookErgebnis = { ref: '1', code: 429, fehler: 'Ausgelastet' }
    const holen = vi.fn(async () => antwort(429, { aufgabe: 'einzelanalyse', ergebnisse: [fehler] }))
    expect(await erzeugeWebhook('https://x.example.invalid/w', 'B', holen as unknown as typeof fetch)('einzelanalyse', 'v', [auftrag], 1000)).toEqual([fehler])
  })
  it.each([
    [401, 'ki_abgelehnt'],
    [404, 'ki_nicht_erreichbar'],
    [429, 'ki_ueberlastet'],
    [400, 'ki_fehler'],
    [500, 'ki_fehler'],
  ])('Status %i ohne Ergebnisse wird zu %s', async (status, art) => {
    const holen = vi.fn(async () => antwort(status, { ok: false }))
    await expect(erzeugeWebhook('https://x.example.invalid/w', 'B', holen as unknown as typeof fetch)('einzelanalyse', 'v', [auftrag], 1000)).rejects.toMatchObject({ art })
  })
  it('keine Verbindung und Zeitüberschreitung', async () => {
    const aus = (e: Error) => erzeugeWebhook('https://x.example.invalid/w', 'B', (async () => { throw e }) as unknown as typeof fetch)('einzelanalyse', 'v', [auftrag], 1000)
    await expect(aus(new TypeError('fetch failed'))).rejects.toMatchObject({ art: 'ki_nicht_erreichbar' })
    const t = new Error('x')
    t.name = 'TimeoutError'
    await expect(aus(t)).rejects.toMatchObject({ art: 'zeitueberschreitung' })
  })
  it('die Fehlermeldungen enthalten keine Adresse und keine Anmeldung', async () => {
    const e = await erzeugeWebhook('https://geheim.example.invalid/webhook/pfad', 'Bearer GEHEIM', (async () => { throw new TypeError('fetch failed https://geheim.example.invalid') }) as unknown as typeof fetch)('einzelanalyse', 'v', [auftrag], 1000).catch((x: Error) => x)
    expect((e as Error).message).not.toMatch(/geheim|GEHEIM|https/i)
  })
  it('die Adresse kommt aus dem Secret und muss https sein', () => {
    expect(leseWebhookUrl({ AI_WEBHOOK_URL: ' https://n8n.example.invalid/webhook/a ' })).toBe('https://n8n.example.invalid/webhook/a')
    for (const env of [{}, { AI_WEBHOOK_URL: '' }, { AI_WEBHOOK_URL: 'http://unsicher.example.invalid/w' }, { AI_WEBHOOK_URL: 'n8n' }]) {
      expect(() => leseWebhookUrl(env)).toThrow(KiFehler)
      try {
        leseWebhookUrl(env)
      } catch (e) {
        expect((e as KiFehler).art).toBe('ki_nicht_eingerichtet')
        expect((e as KiFehler).message).toContain('AI_WEBHOOK_URL')
      }
    }
  })
})

describe('Runden', () => {
  it('besteht die erste Antwort, bleibt es bei einem Aufruf', async () => {
    const w = webhookMit([ok200('1')])
    const [e] = await arbeiteZiele('einzelanalyse', [ziel()], w.fn, zeit())
    expect(e).toMatchObject({ ref: '1', geprueft: true, aufrufe: 1 })
    expect(e.text_md).toContain('## Zusammenfassung')
    expect(w.aufrufe).toHaveLength(1)
    expect(w.aufrufe[0]).toMatchObject({ aufgabe: 'einzelanalyse', version: 'analyse-v2' })
    expect(w.aufrufe[0].auftraege[0]).toMatchObject({ ref: '1', system: SYSTEM_PROMPTS.einzelanalyse, eingabe: { monat: '2026-11', kennzahlen: { fremdbild: 3.5 } } })
    expect(w.aufrufe[0].auftraege[0].nachricht).toMatch(/^Daten \(JSON\):/)
  })

  it('erfundene Zahl: die zweite Runde bekommt die Zahl genannt und besteht', async () => {
    const pruefe = vi.fn()
    pruefe.mockResolvedValueOnce({ ok: true, meldung: null, geprueft: false, unbekannt: ['4.71'] }).mockResolvedValue(pruefOk)
    const w = webhookMit([ok200('1')])
    const [e] = await arbeiteZiele('einzelanalyse', [ziel('1', pruefe)], w.fn, zeit())
    expect(e).toMatchObject({ geprueft: true, aufrufe: 2 })
    expect(w.aufrufe[1].auftraege[0].nachricht).toMatch(/^Deine letzte Antwort enthielt Zahlen, die nicht in den Daten stehen: 4,71\. Formuliere neu/)
  })

  it('besteht der Faktencheck nie: nach drei Runden zählt die letzte lesbare Fassung, nicht geprüft', async () => {
    const w = webhookMit([ok200('1')])
    const [e] = await arbeiteZiele('einzelanalyse', [ziel('1', async () => ({ ok: true, meldung: null, geprueft: false, unbekannt: ['9.99'] }))], w.fn, zeit())
    expect(w.aufrufe).toHaveLength(MAX_AUFRUFE)
    expect(e).toMatchObject({ geprueft: false, aufrufe: 3 })
    expect(e.ausgabe).toBeTruthy()
    expect(e.fehler).toBeUndefined()
  })

  it('kein gültiges JSON und abgeschnittene Antwort: eigene Bitten, danach klappt es', async () => {
    const w = webhookMit([ok200('1', 'Entschuldigung')], [ok200('1', '{"zusammenfassung": "abg')], [ok200('1')])
    const [e] = await arbeiteZiele('einzelanalyse', [ziel()], w.fn, zeit())
    expect(e).toMatchObject({ geprueft: true, aufrufe: 3 })
    expect(w.aufrufe[1].auftraege[0].nachricht.startsWith(HINWEIS_JSON)).toBe(true)
    expect(w.aufrufe[2].auftraege[0].nachricht.startsWith(HINWEIS_ABGESCHNITTEN)).toBe(true)
  })

  it('Agenda: falscher Aufbau geht mit der Meldung der Datenbank zurück an die KI', async () => {
    const pruefe = vi.fn()
    pruefe.mockResolvedValueOnce({ ok: false, meldung: 'Block „fokus“ darf 6 bis 8 Minuten dauern, nicht 9', geprueft: false, unbekannt: [] }).mockResolvedValue(pruefOk)
    const w = webhookMit([ok200('1', { bloecke: [] })])
    const [e] = await arbeiteZiele('agenda', [ziel('1', pruefe, 'agenda')], w.fn, zeit())
    expect(e).toMatchObject({ geprueft: true, aufrufe: 2 })
    expect(w.aufrufe[1].auftraege[0].nachricht).toMatch(/^Deine letzte Antwort passt nicht zur Vorgabe: Block „fokus“ darf 6 bis 8 Minuten dauern, nicht 9 Halte dich genau an die fünf Blöcke, ihre Reihenfolge und die Minuten aus dem Zeitbudget\./)
    expect(w.aufrufe[1].version).toBe('agenda-ki-v2')
  })

  it('Agenda: bleibt der Aufbau falsch, gibt es einen Fehler statt einer Agenda', async () => {
    const w = webhookMit([ok200('1', { bloecke: [] })])
    const [e] = await arbeiteZiele('agenda', [ziel('1', async () => ({ ok: false, meldung: 'Falsch.', geprueft: false, unbekannt: [] }), 'agenda')], w.fn, zeit())
    expect(w.aufrufe).toHaveLength(3)
    expect(e.ausgabe).toBeUndefined()
    expect(e.fehler).toMatchObject({ art: 'ungueltige_ausgabe', message: 'Falsch.' })
  })

  it('mehrere Ziele in einem Aufruf; Antworten werden über „ref“ zugeordnet, nicht über die Reihenfolge', async () => {
    const eins = { ...gut, zusammenfassung: 'Erste.' }
    const zwei = { ...gut, zusammenfassung: 'Zweite.' }
    const w = webhookMit([ok200('2', zwei), ok200('1', eins)])
    const r = await arbeiteZiele('einzelanalyse', [ziel('1'), ziel('2')], w.fn, zeit())
    expect(w.aufrufe).toHaveLength(1)
    expect(w.aufrufe[0].auftraege.map((a) => a.ref)).toEqual(['1', '2'])
    expect(r[0].ausgabe?.zusammenfassung).toBe('Erste.')
    expect(r[1].ausgabe?.zusammenfassung).toBe('Zweite.')
  })

  it('scheitert nur ein Auftrag, geht nur dieser in die nächste Runde; sein Fehler bleibt, wenn es nicht klappt', async () => {
    const w = webhookMit([ok200('1'), { ref: '2', code: 502, fehler: 'Die KI ist nicht erreichbar.' }])
    const r = await arbeiteZiele('einzelanalyse', [ziel('1'), ziel('2')], w.fn, zeit())
    expect(w.aufrufe.map((a) => a.auftraege.map((x) => x.ref))).toEqual([['1', '2'], ['2'], ['2']])
    expect(r[0]).toMatchObject({ geprueft: true, aufrufe: 1 })
    expect(r[1].ausgabe).toBeUndefined()
    expect(r[1].fehler).toMatchObject({ art: 'ki_fehler', message: 'Die KI ist nicht erreichbar.' })
    expect(r[1].aufrufe).toBe(3)
  })

  it('Ausgelastet (429) je Auftrag wird zu „ki_ueberlastet“', async () => {
    const w = webhookMit([{ ref: '1', code: 429, fehler: 'Die KI ist gerade ausgelastet.' }])
    const [e] = await arbeiteZiele('einzelanalyse', [ziel()], w.fn, zeit())
    expect(e.fehler?.art).toBe('ki_ueberlastet')
  })

  it('ein fehlender Auftrag in der Antwort ist ein Fehler dieses Auftrags', async () => {
    const w = webhookMit([ok200('1')])
    const r = await arbeiteZiele('einzelanalyse', [ziel('1'), ziel('2')], w.fn, zeit())
    expect(r[0].geprueft).toBe(true)
    expect(r[1].fehler?.art).toBe('ki_fehler')
  })

  it('scheitert der Aufruf selbst in der ersten Runde, bricht alles mit diesem Fehler ab', async () => {
    const w = webhookMit(new KiFehler('ki_nicht_erreichbar', 'Nicht erreichbar.'))
    await expect(arbeiteZiele('einzelanalyse', [ziel()], w.fn, zeit())).rejects.toMatchObject({ art: 'ki_nicht_erreichbar' })
    expect(w.aufrufe).toHaveLength(1)
  })

  it('scheitert der Aufruf erst in einer späteren Runde, bleibt die lesbare Fassung erhalten', async () => {
    const w = webhookMit([ok200('1')], new KiFehler('ki_nicht_erreichbar', 'Nicht erreichbar.'))
    const [e] = await arbeiteZiele('einzelanalyse', [ziel('1', async () => ({ ok: true, meldung: null, geprueft: false, unbekannt: ['9'] }))], w.fn, zeit())
    expect(w.aufrufe).toHaveLength(2)
    expect(e).toMatchObject({ geprueft: false, aufrufe: 1 })
    expect(e.ausgabe).toBeTruthy()
  })

  it('bleibt zu wenig Zeit, beginnt keine neue Runde; die KI bekommt höchstens die Restzeit', async () => {
    let t = 0
    const w = webhookMit((a) => { t += 130_000; return [ok200(a[0].ref)] })
    const [e] = await arbeiteZiele('einzelanalyse', [ziel('1', async () => ({ ok: true, meldung: null, geprueft: false, unbekannt: ['9'] }))], w.fn, { jetzt: () => t, budgetMs: 135_000 })
    expect(w.aufrufe).toHaveLength(1)
    expect(135_000 - 130_000).toBeLessThan(MIN_RUNDE_MS)
    expect(e.geprueft).toBe(false)
    expect(w.aufrufe[0].timeoutMs).toBe(120_000)
  })
})

// ── Anfragen mit nachgebauter Datenbank ─────────────────────────────────────────

function datenbank(opts: { vorhanden?: AnalyseZeile | null; hash?: string; abgeschlossen?: boolean; offen?: Array<{ person_id: string; name: string }>; pruefung?: Pruefung; speichernFehler?: boolean } = {}) {
  const aufrufe: string[] = []
  const gespeichert: Array<{ aufgabe: Aufgabe; k: Kontext; s: Speicher }> = []
  const db: Datenbank = {
    async eingabe(a, k) {
      aufrufe.push(`eingabe:${a}:${k.person_id ?? '-'}`)
      return { eingabe: { monat: k.monat, person: k.person_id ?? null }, hash: opts.hash ?? `h-${k.person_id ?? a}` }
    },
    async lese(a) {
      aufrufe.push(`lese:${a}`)
      return opts.vorhanden ?? null
    },
    async pruefe() {
      aufrufe.push('pruefe')
      return opts.pruefung ?? pruefOk
    },
    async speichere(a, k, s) {
      aufrufe.push(`speichere:${a}:${k.person_id ?? '-'}`)
      if (opts.speichernFehler) throw new Error('Datenbank weg')
      gespeichert.push({ aufgabe: a, k, s })
      return { id: `analyse-${gespeichert.length}`, input_hash: s.hash, prompt_version: s.prompt_version }
    },
    async uebersicht() {
      aufrufe.push('uebersicht')
      return { abgeschlossen: opts.abgeschlossen ?? true, offen: opts.offen ?? [] }
    },
  }
  return { db, aufrufe, gespeichert }
}

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const P3 = '33333333-3333-4333-8333-333333333333'

describe('Einzelanalyse, Gesamtauswertung, Agenda', () => {
  it('erzeugt, prüft und speichert mit Hash, Prompt-Version und Zahl der Versuche', async () => {
    const d = datenbank()
    const w = webhookMit([ok200('1')])
    const r = await bearbeite({ aufgabe: 'einzelanalyse', monat: '2026-11', person_id: P1 }, d.db, w.fn, zeit())
    expect(r).toMatchObject({ neu_erzeugt: true, ki_aufrufe: 1 })
    expect(d.gespeichert).toHaveLength(1)
    expect(d.gespeichert[0].s).toMatchObject({ hash: `h-${P1}`, prompt_version: 'analyse-v2', versuche: 1 })
    expect(d.gespeichert[0].s.text_md).toContain('## Zusammenfassung')
    expect(d.aufrufe).toEqual([`eingabe:einzelanalyse:${P1}`, 'lese:einzelanalyse', 'pruefe', `speichere:einzelanalyse:${P1}`])
  })

  it('gleiche Eingabe und gleiche Prompt-Version: kein Aufruf der KI', async () => {
    const vorhanden: AnalyseZeile = { id: 'a', input_hash: 'h-x', prompt_version: 'gesamt-v2' }
    const d = datenbank({ vorhanden, hash: 'h-x' })
    const w = webhookMit([ok200('1')])
    const r = await bearbeite({ aufgabe: 'gesamtauswertung', monat: '2026-11' }, d.db, w.fn, zeit())
    expect(r).toEqual({ analyse: vorhanden, neu_erzeugt: false, ki_aufrufe: 0 })
    expect(w.aufrufe).toHaveLength(0)
    expect(d.gespeichert).toHaveLength(0)
  })

  it('„neu“, ein anderer Hash oder eine andere Prompt-Version lösen einen neuen Aufruf aus', async () => {
    const vorhanden: AnalyseZeile = { id: 'a', input_hash: 'h-x', prompt_version: 'gesamt-v2' }
    for (const [anfrage, db] of [
      [{ aufgabe: 'gesamtauswertung', monat: '2026-11', neu: true }, datenbank({ vorhanden, hash: 'h-x' })],
      [{ aufgabe: 'gesamtauswertung', monat: '2026-11' }, datenbank({ vorhanden, hash: 'h-neu' })],
      [{ aufgabe: 'gesamtauswertung', monat: '2026-11' }, datenbank({ vorhanden: { ...vorhanden, prompt_version: 'gesamt-v1' }, hash: 'h-x' })],
    ] as const) {
      const w = webhookMit([ok200('1', { ...gut, datenlage_hinweis: null })])
      const r = await bearbeite(anfrage, db.db, w.fn, zeit())
      expect(r).toMatchObject({ neu_erzeugt: true })
      expect(w.aufrufe).toHaveLength(1)
    }
  })

  it('die Gesamtauswertung nutzt die Aufgabe „gesamtauswertung“, die Agenda „agenda“ mit den Punkten statt Text', async () => {
    const g = datenbank()
    const wg = webhookMit([ok200('1', { ...gut, datenlage_hinweis: null })])
    await bearbeite({ aufgabe: 'gesamtauswertung', monat: '2026-11' }, g.db, wg.fn, zeit())
    expect(wg.aufrufe[0]).toMatchObject({ aufgabe: 'gesamtauswertung', version: 'gesamt-v2' })
    expect(g.aufrufe[0]).toBe('eingabe:gesamtauswertung:-')

    const a = datenbank({ vorhanden: { id: 'v', input_hash: 'h-agenda', prompt_version: 'agenda-vorlage-v1' }, hash: 'h-agenda' })
    const wa = webhookMit([ok200('1', { bloecke: [{ id: 'einstieg', minuten: 2, punkte: ['Danke.'] }] })])
    const r = await bearbeite({ aufgabe: 'agenda', monat: '2026-11' }, a.db, wa.fn, zeit())
    expect(r).toMatchObject({ neu_erzeugt: true })
    expect(wa.aufrufe[0]).toMatchObject({ aufgabe: 'agenda', version: 'agenda-ki-v2' })
    expect(a.gespeichert[0].s.ausgabe).toEqual({ bloecke: [{ id: 'einstieg', minuten: 2, punkte: ['Danke.'] }] })
    expect(a.gespeichert[0].s.text_md).toBe('')
  })

  it('eine Vorlage-Agenda wird durch die KI ersetzt, auch mit gleichem Hash (andere Prompt-Version)', async () => {
    const a = datenbank({ vorhanden: { id: 'v', input_hash: 'gleich', prompt_version: 'agenda-vorlage-v1' }, hash: 'gleich' })
    const w = webhookMit([ok200('1', { bloecke: [] })])
    expect(await bearbeite({ aufgabe: 'agenda', monat: '2026-11' }, a.db, w.fn, zeit())).toMatchObject({ neu_erzeugt: true })
  })

  it('ohne brauchbare Antwort wird nichts gespeichert und der Fehler weitergegeben', async () => {
    const d = datenbank({ pruefung: { ok: false, meldung: 'Falscher Aufbau.', geprueft: false, unbekannt: [] } })
    const w = webhookMit([ok200('1', { bloecke: [] })])
    await expect(bearbeite({ aufgabe: 'agenda', monat: '2026-11' }, d.db, w.fn, zeit())).rejects.toMatchObject({ art: 'ungueltige_ausgabe', message: 'Falscher Aufbau.' })
    expect(d.gespeichert).toHaveLength(0)
  })

  it('der Webhook wird nie gerufen, wenn die Datenbank die Eingabe verweigert', async () => {
    const d = datenbank()
    d.db.eingabe = async () => { throw new Error('Nur für Admins.') }
    const w = webhookMit([ok200('1')])
    await expect(bearbeite({ aufgabe: 'gesamtauswertung', monat: '2026-11' }, d.db, w.fn, zeit())).rejects.toThrow('Nur für Admins.')
    expect(w.aufrufe).toHaveLength(0)
  })
})

describe('Sammellauf', () => {
  const offen = [P1, P2, P3].map((person_id, i) => ({ person_id, name: `Person ${i + 1}` }))

  it('bearbeitet höchstens zwei Personen in EINEM Aufruf und meldet, wie viele verbleiben', async () => {
    const d = datenbank({ offen })
    const w = webhookMit([ok200('1'), ok200('2')])
    const r = await bearbeite({ aufgabe: 'sammellauf', monat: '2026-11' }, d.db, w.fn, zeit())
    expect(PAKET_GROESSE).toBe(2)
    expect(w.aufrufe).toHaveLength(1)
    expect(w.aufrufe[0].auftraege.map((a) => a.ref)).toEqual(['1', '2'])
    expect(r).toEqual({ erstellt: [offen[0], offen[1]], fehlgeschlagen: [], verbleibend: 1 })
    expect(d.gespeichert.map((g) => g.k.person_id)).toEqual([P1, P2])
    expect(d.gespeichert.every((g) => g.aufgabe === 'einzelanalyse' && g.s.prompt_version === 'analyse-v2')).toBe(true)
  })

  it('„ausgenommen“ überspringt Personen, die schon gescheitert sind', async () => {
    const d = datenbank({ offen })
    const w = webhookMit([ok200('1')])
    const r = await bearbeite({ aufgabe: 'sammellauf', monat: '2026-11', ausgenommen: [P1, P2] }, d.db, w.fn, zeit())
    expect(r).toEqual({ erstellt: [offen[2]], fehlgeschlagen: [], verbleibend: 0 })
    expect(w.aufrufe[0].auftraege).toHaveLength(1)
  })

  it('scheitert eine Person, steht sie mit Grund in der Liste; die andere wird gespeichert', async () => {
    const d = datenbank({ offen })
    const w = webhookMit([ok200('1'), { ref: '2', code: 502, fehler: 'Die KI ist nicht erreichbar.' }])
    const r = await bearbeite({ aufgabe: 'sammellauf', monat: '2026-11' }, d.db, w.fn, zeit())
    expect(r).toMatchObject({ erstellt: [offen[0]], fehlgeschlagen: [{ person_id: P2, name: 'Person 2', meldung: 'Die KI ist nicht erreichbar.' }], verbleibend: 1 })
    expect(d.gespeichert).toHaveLength(1)
  })

  it('ein Fehler beim Speichern einer Person steht in der Liste und stoppt die andere nicht', async () => {
    const d = datenbank({ offen: offen.slice(0, 2) })
    let n = 0
    const original = d.db.speichere
    d.db.speichere = async (a, k, s) => { if (++n === 1) throw new Error('weg'); return original(a, k, s) }
    const w = webhookMit([ok200('1'), ok200('2')])
    const r = await bearbeite({ aufgabe: 'sammellauf', monat: '2026-11' }, d.db, w.fn, zeit())
    expect(r).toMatchObject({ erstellt: [offen[1]], fehlgeschlagen: [{ person_id: P1, meldung: 'Die Analyse konnte nicht gespeichert werden.' }] })
  })

  it('ein Monat, der nicht abgeschlossen ist, wird abgelehnt, bevor die KI gefragt wird', async () => {
    const d = datenbank({ offen, abgeschlossen: false })
    const w = webhookMit([ok200('1')])
    await expect(bearbeite({ aufgabe: 'sammellauf', monat: '2026-11' }, d.db, w.fn, zeit())).rejects.toMatchObject({ art: 'monat_offen', message: 'Der Monat ist noch nicht abgeschlossen.' })
    expect(w.aufrufe).toHaveLength(0)
  })

  it('nichts zu tun: leere Antwort, keine KI', async () => {
    const d = datenbank({ offen: [] })
    const w = webhookMit([ok200('1')])
    expect(await bearbeite({ aufgabe: 'sammellauf', monat: '2026-11' }, d.db, w.fn, zeit())).toEqual({ erstellt: [], fehlgeschlagen: [], verbleibend: 0 })
    expect(w.aufrufe).toHaveLength(0)
  })
})

describe('Anfrage lesen', () => {
  it('gültige Anfragen', () => {
    expect(leseAnfrage({ aufgabe: 'einzelanalyse', monat: '2026-11', person_id: P1, neu: true })).toEqual({ aufgabe: 'einzelanalyse', monat: '2026-11', person_id: P1, neu: true })
    expect(leseAnfrage({ aufgabe: 'gesamtauswertung', monat: '2026-01' })).toEqual({ aufgabe: 'gesamtauswertung', monat: '2026-01', neu: false })
    expect(leseAnfrage({ aufgabe: 'agenda', monat: '2026-12', neu: true })).toEqual({ aufgabe: 'agenda', monat: '2026-12', neu: true })
    expect(leseAnfrage({ aufgabe: 'sammellauf', monat: '2026-11', ausgenommen: [P1, 'kaputt', 5] })).toEqual({ aufgabe: 'sammellauf', monat: '2026-11', ausgenommen: [P1] })
  })
  it('ungültige Anfragen', () => {
    for (const x of [null, 'x', {}, { aufgabe: 'unbekannt', monat: '2026-11' }, { aufgabe: 'agenda', monat: '2026-13' }, { aufgabe: 'agenda', monat: '2026-11-01' },
                     { aufgabe: 'einzelanalyse', monat: '2026-11' }, { aufgabe: 'einzelanalyse', monat: '2026-11', person_id: 'nicht-uuid' }]) {
      expect(leseAnfrage(x)).toBeNull()
    }
  })
})
