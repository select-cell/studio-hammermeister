import { describe, expect, it, vi } from 'vitest'
import {
  agendaLink,
  baueMail,
  gleichInZeit,
  lauf,
  leseKonfiguration,
  maskiere,
  MAX_MAILS_PRO_LAUF,
  monatsname,
  resendSender,
  terminLang,
  uhrzeit,
  wichtigstePunkte,
  type Agenda,
  type Faellig,
  type Konfiguration,
  type Mail,
  type Rpc,
} from './versand'

const konfig: Konfiguration = { resendKey: 're_GEHEIM_123', absender: 'Salon <plattform@example.invalid>', cronSecret: 'cron-geheim', plattformUrl: 'https://plattform.example.invalid' }

const faellig = (art: 'vorab' | 'kurz' = 'vorab', extra: Partial<Faellig> = {}): Faellig => ({
  termin_id: '00000000-0000-4000-8000-000000000001',
  art,
  salon: 'Hammermeister',
  titel: 'Teammeeting',
  startet_am: '2026-10-26T09:00:00+00:00',
  startet_lokal: '2026-10-26T10:00',
  bezugsmonat: '2026-09',
  empfaenger: ['michael@example.invalid'],
  ...extra,
})

const agenda: Agenda = {
  status: 'freigegeben',
  monat: '2026-09',
  hinweis: null,
  bloecke: [
    { id: 'einstieg', titel: 'Einstieg und Beteiligung', minuten: 2, punkte: ['Danke an alle: 7 von 7 haben die Umfrage für September 2026 abgegeben.'] },
    { id: 'kennzahlen', titel: 'Team-Kennzahlen des Monats', minuten: 3, punkte: ['Selbstbild 3,50, Fremdbild 3,17, Differenz +0,33 (Selbstüberschätzung).', 'Das Fremdbild liegt in der Stufe „mittel“.'] },
    { id: 'fokus', titel: 'Fokus-Verhalten', minuten: 7, punkte: ['Fokus – Verhalten 3: Unterstützt Kollegen. Fremdbild 3,19.', 'Warum wichtig: Begrüßung zählt.', 'Größte Teamdifferenz – Verhalten 1: Nutzt Leerlaufzeiten.'] },
    { id: 'entwicklung', titel: 'Entwicklungsfelder und Differenzen', minuten: 4, punkte: ['Entwicklungsfeld – Verhalten 9: Fremdbild 2,10.'] },
    { id: 'vereinbarungen', titel: 'Vereinbarungen für den nächsten Monat', minuten: 2, punkte: ['Wer kümmert sich um welchen Punkt, und bis wann?'] },
  ],
}

describe('Konfiguration', () => {
  it('meldet fehlende Secrets, ohne Werte zu nennen', () => {
    const k = leseKonfiguration({ RESEND_API_KEY: 're_x', CRON_SECRET: '  ' })
    expect(k).toEqual({ ok: false, fehlend: ['MAIL_ABSENDER', 'CRON_SECRET', 'PLATTFORM_URL'] })
  })
  it('nimmt die vollständige Konfiguration und kürzt den Schrägstrich der Adresse', () => {
    const k = leseKonfiguration({ RESEND_API_KEY: 're_x', MAIL_ABSENDER: 'a@b.de', CRON_SECRET: 's', PLATTFORM_URL: 'https://p.example.invalid//' })
    expect(k.ok && k.konfig.plattformUrl).toBe('https://p.example.invalid')
  })
  it('verlangt eine Adresse mit https:// oder http://', () => {
    const k = leseKonfiguration({ RESEND_API_KEY: 're_x', MAIL_ABSENDER: 'a@b.de', CRON_SECRET: 's', PLATTFORM_URL: 'p.example.invalid' })
    expect(k.ok).toBe(false)
  })
})

describe('gleichInZeit', () => {
  it('vergleicht Inhalt und Länge', () => {
    expect(gleichInZeit('abc', 'abc')).toBe(true)
    expect(gleichInZeit('abc', 'abd')).toBe(false)
    expect(gleichInZeit('abc', 'abcd')).toBe(false)
    expect(gleichInZeit('', 'abc')).toBe(false)
    expect(gleichInZeit('', '')).toBe(true)
    expect(gleichInZeit('äö', 'äö')).toBe(true)
  })
})

describe('Formatierung', () => {
  it('Termin in Berliner Uhrzeit, ohne Umrechnung', () => {
    expect(terminLang('2026-10-26T10:00')).toBe('Montag, 26. Oktober 2026, 10:00 Uhr')
    expect(terminLang('2027-03-30T08:05')).toBe('Dienstag, 30. März 2027, 08:05 Uhr')
    expect(uhrzeit('2026-10-26T10:00')).toBe('10:00 Uhr')
    expect(monatsname('2026-09')).toBe('September 2026')
  })
  it('maskiert HTML', () => {
    expect(maskiere(`<script>"x" & 'y'</script>`)).toBe('&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;')
  })
  it('Link zur Agenda des Bezugsmonats', () => {
    expect(agendaLink(konfig, '2026-09')).toBe('https://plattform.example.invalid/app/leitung/agenda?monat=2026-09')
  })
})

describe('Mail „vorab“', () => {
  const m = baueMail('vorab', faellig('vorab'), agenda, konfig)
  it('Betreff nennt Titel und Tag', () => {
    expect(m.betreff).toBe('Agenda für Teammeeting am Montag, 26. Oktober 2026')
  })
  it('enthält alle fünf Blöcke mit Minuten und Punkten', () => {
    for (const b of agenda.bloecke) {
      expect(m.text).toContain(`${b.titel} (${b.minuten} Min.)`)
      for (const p of b.punkte) expect(m.text).toContain(p)
    }
    expect(m.text).toContain('Zusammen etwa 18 Minuten.')
  })
  it('hat Link, Zeit und den Hinweis auf Teamebene', () => {
    expect(m.text).toContain('Montag, 26. Oktober 2026, 10:00 Uhr')
    expect(m.text).toContain('https://plattform.example.invalid/app/leitung/agenda?monat=2026-09')
    expect(m.text).toContain('keine Kommentare einzelner Kollegen')
    expect(m.html).toContain('href="https://plattform.example.invalid/app/leitung/agenda?monat=2026-09"')
  })
  it('freigegebene Agenda ohne Entwurfs-Hinweis, Entwurf mit', () => {
    expect(m.text).not.toContain('Entwurf')
    const e = baueMail('vorab', faellig('vorab'), { ...agenda, status: 'entwurf' }, konfig)
    expect(e.text).toContain('Stand: Entwurf, noch nicht freigegeben.')
  })
  it('zeigt den Hinweis „Stand unvollständig“', () => {
    const u = baueMail('vorab', faellig('vorab'), { ...agenda, hinweis: 'Stand unvollständig: 1 von 7 Einzelanalysen liegen vor.' }, konfig)
    expect(u.text).toContain('Hinweis: Stand unvollständig: 1 von 7 Einzelanalysen liegen vor.')
    expect(u.html).toContain('Stand unvollständig: 1 von 7 Einzelanalysen liegen vor.')
  })
  it('maskiert fremde Texte im HTML, im Klartext bleiben sie lesbar', () => {
    const boese: Agenda = { ...agenda, bloecke: [{ ...agenda.bloecke[0], punkte: ['<img src=x onerror=alert(1)> & mehr'] }, ...agenda.bloecke.slice(1)] }
    const b = baueMail('vorab', faellig('vorab', { titel: '<b>Titel</b>' }), boese, konfig)
    expect(b.html).not.toContain('<img')
    expect(b.html).not.toContain('<b>Titel</b>')
    expect(b.html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; mehr')
    expect(b.text).toContain('<img src=x onerror=alert(1)> & mehr')
  })
})

describe('Mail „kurz“', () => {
  it('Betreff mit Uhrzeit und genau drei Punkte', () => {
    const m = baueMail('kurz', faellig('kurz'), agenda, konfig)
    expect(m.betreff).toBe('Gleich geht es los: Teammeeting um 10:00 Uhr')
    const punkte = m.text.split('\n').filter((z) => z.startsWith('  - '))
    expect(punkte).toHaveLength(3)
    expect(m.text).toContain('Die wichtigsten Punkte aus der Umfrage September 2026')
    expect(m.text).toContain('https://plattform.example.invalid/app/leitung/agenda?monat=2026-09')
    expect(m.text).not.toContain('Einstieg und Beteiligung')
  })
  it('wichtigste Punkte: Fokus zuerst, dann Kennzahlen', () => {
    expect(wichtigstePunkte(agenda)).toEqual([
      'Fokus – Verhalten 3: Unterstützt Kollegen. Fremdbild 3,19.',
      'Warum wichtig: Begrüßung zählt.',
      'Selbstbild 3,50, Fremdbild 3,17, Differenz +0,33 (Selbstüberschätzung).',
    ])
  })
  it('füllt mit anderen Blöcken auf, wenn der Fokus wenig hergibt, und kommt mit wenig Inhalt aus', () => {
    const wenig: Agenda = { ...agenda, bloecke: [{ id: 'fokus', titel: 'Fokus', minuten: 6, punkte: ['Nur ein Punkt'] }] }
    expect(wichtigstePunkte(wenig)).toEqual(['Nur ein Punkt'])
    expect(wichtigstePunkte({ ...agenda, bloecke: [] })).toEqual([])
  })
})

describe('Mail ohne Daten', () => {
  const ohne: Agenda = { status: 'keine_daten', monat: '2026-09', hinweis: 'Für diesen Monat liegt noch keine Auswertung vor.', bloecke: [] }
  it.each(['vorab', 'kurz'] as const)('%s: ehrlicher Hinweis statt leerer Agenda', (art) => {
    const m = baueMail(art, faellig(art), ohne, konfig)
    expect(m.text).toContain('Für diesen Monat liegt noch keine Auswertung vor.')
    expect(m.text).toContain('https://plattform.example.invalid/app/leitung/agenda')
    expect(m.text).not.toContain('Min.)')
  })
})

describe('Resend', () => {
  const mail: Mail = { betreff: 'B', text: 'T', html: '<p>H</p>' }
  it('sendet mit Schlüssel im Kopf, Idempotenz-Schlüssel und allen Empfängern', async () => {
    const holen = vi.fn(async () => new Response('{"id":"x"}', { status: 200 }))
    await resendSender(konfig, holen as unknown as typeof fetch)(['a@x.de', 'b@x.de'], mail, 'termin-vorab')
    expect(holen).toHaveBeenCalledOnce()
    const [url, init] = holen.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const h = init.headers as Record<string, string>
    expect(h.authorization).toBe('Bearer re_GEHEIM_123')
    expect(h['idempotency-key']).toBe('termin-vorab')
    expect(JSON.parse(init.body as string)).toEqual({ from: konfig.absender, to: ['a@x.de', 'b@x.de'], subject: 'B', text: 'T', html: '<p>H</p>' })
  })
  it('wirft bei Ablehnung eine lesbare Meldung ohne den Schlüssel', async () => {
    const holen = vi.fn(async () => new Response('{"name":"validation_error","message":"The domain is not verified."}', { status: 403 }))
    const f = resendSender(konfig, holen as unknown as typeof fetch)(['a@x.de'], mail, 'k')
    await expect(f).rejects.toThrow('HTTP 403, validation_error: The domain is not verified.')
    await expect(resendSender(konfig, holen as unknown as typeof fetch)(['a@x.de'], mail, 'k')).rejects.not.toThrow(/re_GEHEIM/)
  })
  it('meldet einen nicht erreichbaren Dienst, ohne Technik oder Schlüssel', async () => {
    const holen = vi.fn(async () => {
      throw new TypeError('fetch failed: https://api.resend.com Bearer re_GEHEIM_123')
    })
    const e = await resendSender(konfig, holen as unknown as typeof fetch)(['a@x.de'], mail, 'k').catch((x: Error) => x)
    expect((e as Error).message).toBe('Der Mail-Dienst ist nicht erreichbar (TypeError).')
  })
})

describe('Lauf', () => {
  type Aufruf = { name: string; args?: Record<string, unknown> }
  function bauRpc(opts: { faellig: Faellig[]; anspruch?: (f: { p_termin: string; p_art: string }) => unknown; agenda?: Agenda | null; abschlussFehler?: number }) {
    const aufrufe: Aufruf[] = []
    let abschlussFehler = opts.abschlussFehler ?? 0
    const rpc: Rpc = async (name, args) => {
      aufrufe.push({ name, args })
      if (name === 'versand_faellig') return opts.faellig
      if (name === 'versand_beanspruchen') return opts.anspruch ? opts.anspruch(args as { p_termin: string; p_art: string }) : { id: `log-${args!.p_art}`, versuche: 1 }
      if (name === 'agenda_fuer_versand') return opts.agenda === undefined ? agenda : opts.agenda
      if (name === 'versand_abschliessen') {
        if (abschlussFehler-- > 0) throw new Error('Datenbank kurz weg')
        return null
      }
      throw new Error(`unbekannt: ${name}`)
    }
    return { rpc, aufrufe }
  }
  const abschluesse = (a: Aufruf[]) => a.filter((x) => x.name === 'versand_abschliessen').map((x) => x.args)

  it('sendet jede fällige Mail einmal und trägt den Erfolg ein', async () => {
    const { rpc, aufrufe } = bauRpc({ faellig: [faellig('vorab'), faellig('kurz')] })
    const senden = vi.fn(async (_an: string[], _m: Mail, _k: string) => {})
    const erg = await lauf(rpc, senden, konfig)
    expect(erg).toMatchObject({ faellig: 2, gesendet: 2, fehler: 0, uebersprungen: 0 })
    expect(senden).toHaveBeenCalledTimes(2)
    expect(senden.mock.calls[0]).toMatchObject([['michael@example.invalid'], { betreff: expect.stringContaining('Agenda für') }, '00000000-0000-4000-8000-000000000001-vorab'])
    expect(senden.mock.calls[1][2]).toBe('00000000-0000-4000-8000-000000000001-kurz')
    expect(abschluesse(aufrufe)).toEqual([
      { p_id: 'log-vorab', p_erfolg: true, p_fehler: null },
      { p_id: 'log-kurz', p_erfolg: true, p_fehler: null },
    ])
  })

  it('überspringt Mails, die ein anderer Lauf schon hat – es wird nichts gebaut oder gesendet', async () => {
    const { rpc, aufrufe } = bauRpc({ faellig: [faellig('vorab')], anspruch: () => null })
    const senden = vi.fn(async () => {})
    const erg = await lauf(rpc, senden, konfig)
    expect(erg).toMatchObject({ gesendet: 0, uebersprungen: 1, fehler: 0 })
    expect(senden).not.toHaveBeenCalled()
    expect(aufrufe.map((a) => a.name)).toEqual(['versand_faellig', 'versand_beanspruchen'])
  })

  it('trägt einen Sendefehler mit Meldung ein und macht mit der nächsten Mail weiter', async () => {
    const { rpc, aufrufe } = bauRpc({ faellig: [faellig('vorab'), faellig('kurz')] })
    const senden = vi.fn(async (_an: string[], m: Mail) => {
      if (m.betreff.startsWith('Agenda für')) throw new Error('Der Mail-Dienst hat abgelehnt (HTTP 403).')
    })
    const erg = await lauf(rpc, senden, konfig)
    expect(erg).toMatchObject({ gesendet: 1, fehler: 1 })
    expect(erg.eintraege[0]).toMatchObject({ art: 'vorab', ergebnis: 'fehler', meldung: 'Der Mail-Dienst hat abgelehnt (HTTP 403).' })
    expect(abschluesse(aufrufe)).toEqual([
      { p_id: 'log-vorab', p_erfolg: false, p_fehler: 'Der Mail-Dienst hat abgelehnt (HTTP 403).' },
      { p_id: 'log-kurz', p_erfolg: true, p_fehler: null },
    ])
  })

  it('ein unbekannter Termin wird als Fehler eingetragen und nicht gesendet', async () => {
    const { rpc, aufrufe } = bauRpc({ faellig: [faellig('vorab')], agenda: null })
    const senden = vi.fn(async () => {})
    const erg = await lauf(rpc, senden, konfig)
    expect(erg.fehler).toBe(1)
    expect(senden).not.toHaveBeenCalled()
    expect(abschluesse(aufrufe)[0]).toMatchObject({ p_erfolg: false })
  })

  it('schreibt das Ergebnis notfalls zweimal und gibt dann auf, ohne den Lauf abzubrechen', async () => {
    const a = bauRpc({ faellig: [faellig('vorab')], abschlussFehler: 1 })
    expect((await lauf(a.rpc, vi.fn(async () => {}), konfig)).gesendet).toBe(1)
    expect(a.aufrufe.filter((x) => x.name === 'versand_abschliessen')).toHaveLength(2)
    const b = bauRpc({ faellig: [faellig('vorab'), faellig('kurz')], abschlussFehler: 2 })
    const erg = await lauf(b.rpc, vi.fn(async () => {}), konfig)
    expect(erg.gesendet).toBe(2)
    expect(b.aufrufe.filter((x) => x.name === 'versand_abschliessen')).toHaveLength(3)
  })

  it('begrenzt die Zahl der Mails je Lauf', async () => {
    const viele = Array.from({ length: MAX_MAILS_PRO_LAUF + 5 }, (_, i) => faellig('vorab', { termin_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }))
    const { rpc } = bauRpc({ faellig: viele })
    const senden = vi.fn(async () => {})
    const erg = await lauf(rpc, senden, konfig)
    expect(erg.faellig).toBe(MAX_MAILS_PRO_LAUF + 5)
    expect(senden).toHaveBeenCalledTimes(MAX_MAILS_PRO_LAUF)
  })

  it('nichts fällig: keine weiteren Aufrufe', async () => {
    const { rpc, aufrufe } = bauRpc({ faellig: [] })
    const erg = await lauf(rpc, vi.fn(async () => {}), konfig)
    expect(erg).toEqual({ faellig: 0, gesendet: 0, fehler: 0, uebersprungen: 0, eintraege: [] })
    expect(aufrufe).toHaveLength(1)
  })

  it('die Zusammenfassung enthält keine Adressen und keine Mail-Inhalte', async () => {
    const { rpc } = bauRpc({ faellig: [faellig('vorab')] })
    const erg = await lauf(rpc, vi.fn(async () => {}), konfig)
    expect(JSON.stringify(erg)).not.toMatch(/@|Selbstbild|Fremdbild/)
  })
})
