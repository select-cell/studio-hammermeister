import { describe, expect, it, vi } from 'vitest'
import {
  baueNutzerText,
  erzeuge,
  inputHash,
  KiFehler,
  MAX_AUFRUFE,
  parseAusgabe,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  uebersetzeFehler,
  waehleProvider,
  webhookInhalt,
  zuMarkdown,
  type Eingabe,
  type Provider,
} from './analyse'

const eingabe: Eingabe = {
  monat: '2026-10',
  vormonat: '2026-09',
  person: 'die bewertete Person',
  kennzahlen: { selbstbild: 3.5, fremdbild: 3.17 },
  verhalten: [
    { nr: 1, titel: 'Nutzt Leerlaufzeiten' },
    { nr: 2, titel: 'Übernimmt Aufgaben' },
    { nr: 3, titel: 'Unterstützt Kollegen' },
  ],
}

const gueltig = {
  staerken: ['Zuverlässig', 'Freundlich'],
  entwicklungsfelder: ['Ruhe in stressigen Momenten'],
  auffaellige_differenzen: [],
  kommentar_themen: ['Pünktlichkeit'],
  kommentar_qualitaet_hinweis: 'Die Kommentare sind eher knapp.',
  empfehlung: 'Im nächsten Gespräch über Verhalten 2 sprechen.',
  fokus_verhalten: [2],
}

const keinWarten = async () => undefined

describe('Prompt', () => {
  it('hat eine Version und verlangt JSON, echte Zahlen und keine Namen', () => {
    expect(PROMPT_VERSION).toBe('person-v1')
    expect(SYSTEM_PROMPT).toMatch(/NUR mit einem JSON-Objekt/)
    expect(SYSTEM_PROMPT).toMatch(/nicht runden/)
    expect(SYSTEM_PROMPT).toMatch(/Nenne keine Namen/)
    expect(SYSTEM_PROMPT).toMatch(/Kein Gendern/)
    for (const k of ['staerken', 'entwicklungsfelder', 'auffaellige_differenzen', 'kommentar_themen', 'kommentar_qualitaet_hinweis', 'empfehlung', 'fokus_verhalten']) expect(SYSTEM_PROMPT).toContain(k)
  })
  it('der Nutzertext enthält die Daten; bei einer Rückmeldung auch die unbekannten Zahlen', () => {
    const t = baueNutzerText(eingabe)
    expect(t).toContain('"fremdbild": 3.17')
    expect(t).not.toMatch(/nicht in den Daten/)
    const r = baueNutzerText(eingabe, ['4.71', '85'])
    expect(r).toContain('4.71, 85')
    expect(r).toMatch(/nicht in den Daten stehen/)
  })
})

describe('parseAusgabe', () => {
  it('nimmt ein gültiges Objekt', () => {
    expect(parseAusgabe(gueltig, eingabe)).toEqual(gueltig)
  })
  it('holt das JSON auch aus einem Textblock mit Zaun und Vorwort', () => {
    const text = 'Hier ist die Analyse:\n```json\n' + JSON.stringify(gueltig) + '\n```\nViel Erfolg!'
    expect(parseAusgabe(text, eingabe).empfehlung).toBe(gueltig.empfehlung)
    expect(parseAusgabe('Vorwort ' + JSON.stringify(gueltig) + ' Nachwort', eingabe).staerken).toEqual(gueltig.staerken)
  })
  it('lehnt Müll ab, mit verständlicher Meldung', () => {
    expect(() => parseAusgabe('keine Daten', eingabe)).toThrow(/kein JSON/)
    expect(() => parseAusgabe('{ kaputt', eingabe)).toThrow(KiFehler)
    expect(() => parseAusgabe([], eingabe)).toThrow(/Format/)
    expect(() => parseAusgabe(null, eingabe)).toThrow(/Format/)
    expect(() => parseAusgabe({ ...gueltig, empfehlung: '  ' }, eingabe)).toThrow(/empfehlung/)
    expect(() => parseAusgabe({ ...gueltig, staerken: 'x' }, eingabe)).toThrow(/staerken/)
    expect(() => parseAusgabe({ ...gueltig, fokus_verhalten: undefined }, eingabe)).toThrow(/fokus_verhalten/)
  })
  it('entfernt Fremdes: unbekannte Verhaltensnummern, Doppelte, mehr als drei, Nicht-Texte; kürzt Listen', () => {
    const a = parseAusgabe({ ...gueltig, fokus_verhalten: [3, '1', 3, 99, 2, 1.5, 'x'], staerken: ['a', 5, '  b  ', '', null, ...Array.from({ length: 20 }, (_, i) => `s${i}`)] }, eingabe)
    expect(a.fokus_verhalten).toEqual([3, 1, 2])
    expect(a.staerken.slice(0, 2)).toEqual(['a', 'b'])
    expect(a.staerken.length).toBe(8)
  })
  it('fehlende optionale Listen werden leer', () => {
    const { auffaellige_differenzen: _a, kommentar_themen: _k, ...rest } = gueltig
    const a = parseAusgabe(rest, eingabe)
    expect(a.auffaellige_differenzen).toEqual([])
    expect(a.kommentar_themen).toEqual([])
  })
})

describe('zuMarkdown', () => {
  it('baut lesbaren Text mit Überschriften und nennt die Fokus-Verhalten mit Titel', () => {
    const md = zuMarkdown(parseAusgabe(gueltig, eingabe), eingabe)
    expect(md).toContain('## Stärken\n- Zuverlässig\n- Freundlich')
    expect(md).toContain('## Empfehlung für das Gespräch')
    expect(md).toContain('## Fokus-Verhalten\n- Verhalten 2: Übernimmt Aufgaben')
    expect(md).not.toContain('Auffällige Differenzen') // leere Abschnitte entfallen
    expect(md).toContain('## Hinweis zu den Kommentaren')
  })
})

describe('Provider', () => {
  it('ohne AI_PROVIDER: „nicht eingerichtet“ mit klarer Meldung', () => {
    expect(() => waehleProvider({})).toThrow(/noch nicht eingerichtet/)
    try {
      waehleProvider({ AI_PROVIDER: 'gibtsnicht' })
    } catch (e) {
      expect((e as KiFehler).art).toBe('ki_nicht_eingerichtet')
    }
  })
  it('claude: ohne Schlüssel Fehler; mit Schlüssel richtiger Aufruf', async () => {
    expect(() => waehleProvider({ AI_PROVIDER: 'claude' })).toThrow(/ANTHROPIC_API_KEY/)
    const abruf = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"a":1}' }] }), { status: 200 }))
    const p = waehleProvider({ AI_PROVIDER: ' Claude ', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-test' }, abruf as unknown as typeof fetch)
    const r = await p({ system: 'S', nutzer: 'N', context: {} })
    expect(r).toEqual({ inhalt: '{"a":1}', modell: 'claude:claude-test' })
    const [url, init] = abruf.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const h = init.headers as Record<string, string>
    expect(h['x-api-key']).toBe('sk-test')
    expect(h['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('claude-test')
    expect(body.system).toBe('S')
    expect(body.messages).toEqual([{ role: 'user', content: 'N' }])
  })
  it('claude: Fehlerstatus werden zu verständlichen Meldungen', async () => {
    const mit = (status: number) => waehleProvider({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }, (async () => new Response('x', { status })) as unknown as typeof fetch)({ system: '', nutzer: '', context: {} })
    expect(uebersetzeFehler(await mit(429).catch((e) => e)).message).toMatch(/überlastet/)
    expect(uebersetzeFehler(await mit(401).catch((e) => e)).art).toBe('ki_nicht_eingerichtet')
    expect(uebersetzeFehler(await mit(400).catch((e) => e)).message).toMatch(/Fehler 400/)
    expect(uebersetzeFehler(await mit(503).catch((e) => e)).art).toBe('ki_fehler')
  })
  it('webhook: schickt { message, context } und liest verschiedene Antwortformen', async () => {
    expect(() => waehleProvider({ AI_PROVIDER: 'webhook' })).toThrow(/AI_WEBHOOK_URL/)
    const abruf = vi.fn(async () => new Response(JSON.stringify({ output: '{"x":1}' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const p = waehleProvider({ AI_PROVIDER: 'webhook', AI_WEBHOOK_URL: 'https://n8n.example/webhook/abc', AI_WEBHOOK_SECRET: 'geheim' }, abruf as unknown as typeof fetch)
    const r = await p({ system: 'S', nutzer: 'N', context: { eingabe: { a: 1 } } })
    expect(r).toEqual({ inhalt: '{"x":1}', modell: 'webhook' })
    const [url, init] = abruf.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://n8n.example/webhook/abc')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer geheim')
    expect(JSON.parse(init.body as string)).toEqual({ message: 'S\n\nN', context: { eingabe: { a: 1 } } })
    expect(webhookInhalt('text')).toBe('text')
    expect(webhookInhalt({ text: 'a' })).toBe('a')
    expect(webhookInhalt([{ message: 'b' }])).toBe('b')
    expect(webhookInhalt({ staerken: [], empfehlung: 'x' })).toEqual({ staerken: [], empfehlung: 'x' })
    expect(webhookInhalt({ data: { output: 'tief' } })).toEqual({ data: { output: 'tief' } })
  })
  it('Zeitüberschreitung und Netzfehler werden übersetzt', () => {
    const t = Object.assign(new Error('x'), { name: 'TimeoutError' })
    expect(uebersetzeFehler(t).art).toBe('zeitueberschreitung')
    expect(uebersetzeFehler(new TypeError('fetch failed')).art).toBe('ki_fehler')
    expect(uebersetzeFehler('komisch').message).toMatch(/Verbindung/)
  })
})

describe('erzeuge: Faktencheck und Wiederholungen', () => {
  const pruefeOk = async () => ({ geprueft: true, unbekannt: [] })

  it('besteht der Faktencheck sofort: genau ein Aufruf', async () => {
    const provider: Provider = vi.fn(async () => ({ inhalt: gueltig, modell: 'm' }))
    const e = await erzeuge(provider, eingabe, pruefeOk, { warte: keinWarten })
    expect(e.aufrufe).toBe(1)
    expect(e.pruefung.geprueft).toBe(true)
    expect(e.text_md).toContain('## Stärken')
    expect(e.modell).toBe('m')
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('fällt der Faktencheck durch, bekommt die KI die unbekannten Zahlen zurück und es wird neu erzeugt', async () => {
    const provider = vi.fn<Provider>(async () => ({ inhalt: gueltig, modell: 'm' }))
    const pruefe = vi.fn().mockResolvedValueOnce({ geprueft: false, unbekannt: ['4.71'] }).mockResolvedValueOnce({ geprueft: true, unbekannt: [] })
    const e = await erzeuge(provider, eingabe, pruefe, { warte: keinWarten })
    expect(e.aufrufe).toBe(2)
    expect(e.pruefung.geprueft).toBe(true)
    expect(provider.mock.calls[0][0].nutzer).not.toMatch(/nicht in den Daten/)
    expect(provider.mock.calls[1][0].nutzer).toContain('4.71')
  })

  it('besteht er nie: höchstens 3 Aufrufe (zwei Wiederholungen), dann der Entwurf mit „geprüft: nein“', async () => {
    const provider = vi.fn<Provider>(async () => ({ inhalt: gueltig, modell: 'm' }))
    const pruefe = vi.fn(async () => ({ geprueft: false, unbekannt: ['9.99'] }))
    const e = await erzeuge(provider, eingabe, pruefe, { warte: keinWarten })
    expect(MAX_AUFRUFE).toBe(3)
    expect(provider).toHaveBeenCalledTimes(3)
    expect(e.aufrufe).toBe(3)
    expect(e.pruefung).toEqual({ geprueft: false, unbekannt: ['9.99'] })
  })

  it('vorübergehende Fehler werden wiederholt (geteiltes Budget), danach klappt es', async () => {
    const provider = vi
      .fn<Provider>()
      .mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce({ inhalt: 'kein json', modell: 'm' })
      .mockResolvedValueOnce({ inhalt: gueltig, modell: 'm' })
    const e = await erzeuge(provider, eingabe, pruefeOk, { warte: keinWarten })
    expect(e.aufrufe).toBe(3)
    expect(provider).toHaveBeenCalledTimes(3)
  })

  it('bleibt der Fehler: klare Meldung statt Absturz, nach genau 3 Aufrufen', async () => {
    const provider = vi.fn<Provider>(async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' })
    })
    await expect(erzeuge(provider, eingabe, pruefeOk, { warte: keinWarten })).rejects.toMatchObject({ art: 'zeitueberschreitung', message: expect.stringMatching(/zu lange/) })
    expect(provider).toHaveBeenCalledTimes(3)
  })

  it('„nicht eingerichtet“ wird nicht wiederholt', async () => {
    const provider = vi.fn<Provider>(async () => {
      throw new KiFehler('ki_nicht_eingerichtet', 'nein')
    })
    await expect(erzeuge(provider, eingabe, pruefeOk, { warte: keinWarten })).rejects.toMatchObject({ art: 'ki_nicht_eingerichtet' })
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('ein Fehler nach einem gültigen, aber ungeprüften Entwurf liefert den Entwurf statt abzubrechen', async () => {
    const provider = vi
      .fn<Provider>()
      .mockResolvedValueOnce({ inhalt: gueltig, modell: 'm' })
      .mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }))
    const pruefe = vi.fn(async () => ({ geprueft: false, unbekannt: ['7.7'] }))
    const e = await erzeuge(provider, eingabe, pruefe, { warte: keinWarten })
    expect(e.pruefung.geprueft).toBe(false)
    expect(e.aufrufe).toBe(1)
  })
})

describe('input_hash', () => {
  it('ist stabil, hängt von Eingabe und Prompt-Version ab und ist ein SHA-256', async () => {
    const a = await inputHash('abc')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await inputHash('abc')).toBe(a)
    expect(await inputHash('abd')).not.toBe(a)
  })
})
