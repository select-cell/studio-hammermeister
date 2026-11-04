import { describe, expect, it } from 'vitest'
import { markdownBloecke } from './abschluss'
import { mailZustand, ohneBeispiele, parseZahlenliste, terminText, terminVorschlag, vorlaufText, zahlenText, type TerminMail } from './agenda'

describe('terminText', () => {
  it('liest die Berliner Uhrzeit, ohne umzurechnen', () => {
    expect(terminText('2026-10-26T10:00')).toBe('Mo, 26.10.2026, 10:00 Uhr')
    expect(terminText('2027-03-30T08:05')).toBe('Di, 30.03.2027, 08:05 Uhr')
    expect(terminText('2026-11-01T23:30')).toBe('So, 01.11.2026, 23:30 Uhr')
  })
  it('lässt Unbekanntes unverändert', () => {
    expect(terminText('bald')).toBe('bald')
  })
})

describe('terminVorschlag', () => {
  it('morgen um 10:00 Uhr, auch über Monats- und Jahresgrenzen', () => {
    expect(terminVorschlag('2026-11-04')).toBe('2026-11-05T10:00')
    expect(terminVorschlag('2026-11-30')).toBe('2026-12-01T10:00')
    expect(terminVorschlag('2026-12-31')).toBe('2027-01-01T10:00')
    expect(terminVorschlag('2028-02-28')).toBe('2028-02-29T10:00')
  })
})

describe('vorlaufText', () => {
  it('der größte Wert zählt, mit richtiger Einzahl und Mehrzahl', () => {
    expect(vorlaufText([2], [1])).toBe('Agenda 2 Tage vorher, Erinnerung 1 Stunde vorher')
    expect(vorlaufText([1, 3], [0.5, 2])).toBe('Agenda 3 Tage vorher, Erinnerung 2 Stunden vorher')
    expect(vorlaufText([1], [0.5])).toBe('Agenda 1 Tag vorher, Erinnerung 0,5 Stunden vorher')
  })
})

describe('parseZahlenliste', () => {
  it('liest Zahlen mit Komma, Semikolon oder Leerzeichen als Trenner', () => {
    expect(parseZahlenliste('2; 1', 0, 30, true)).toEqual([2, 1])
    expect(parseZahlenliste('2, 1', 0, 30, true)).toEqual([2, 1])
    expect(parseZahlenliste('3 1;0', 0, 30, true)).toEqual([3, 1, 0])
    expect(parseZahlenliste('0,5', 0, 72, false)).toEqual([0.5])
    expect(parseZahlenliste('1.5, 2', 0, 72, false)).toEqual([1.5, 2])
    expect(parseZahlenliste(' 0,5 ; 2 ', 0, 72, false)).toEqual([0.5, 2])
  })
  it('lehnt Ungültiges ab', () => {
    expect(parseZahlenliste('', 0, 30, true)).toBeNull()
    expect(parseZahlenliste('abc', 0, 30, true)).toBeNull()
    expect(parseZahlenliste('31', 0, 30, true)).toBeNull()
    expect(parseZahlenliste('-1', 0, 30, true)).toBeNull()
    expect(parseZahlenliste('1,5', 0, 30, true)).toBeNull() // Tage müssen ganz sein; „1,5“ ist eine Dezimalzahl, kein „1 und 5“
    expect(parseZahlenliste('1e1', 0, 30, true)).toBeNull()
    expect(parseZahlenliste('0x10', 0, 30, true)).toBeNull()
    expect(parseZahlenliste('73', 0, 72, false)).toBeNull()
    expect(parseZahlenliste('1 2 3 4 5 6', 0, 30, true)).toBeNull()
    expect(parseZahlenliste('Infinity', 0, 30, true)).toBeNull()
  })
  it('zahlenText ist die Umkehrung für die Anzeige', () => {
    expect(zahlenText([2, 0.5])).toBe('2; 0,5')
    expect(parseZahlenliste(zahlenText([2, 0.5]), 0, 72, false)).toEqual([2, 0.5])
  })
})

describe('mailZustand', () => {
  const termin = { vergangen: false, aktiv: true }
  const mail = (extra: Partial<TerminMail>): TerminMail => ({ art: 'vorab', status: 'gesendet', gesendet_am: '2026-10-24T08:00:00Z', versuche: 1, fehler: null, endgueltig_fehlgeschlagen: false, ...extra })
  it('geplant, pausiert, nicht gesendet', () => {
    expect(mailZustand(undefined, 'vorab', termin)).toEqual({ text: 'Agenda-Mail: geplant', ton: 'neutral' })
    expect(mailZustand(undefined, 'kurz', termin).text).toBe('Erinnerung: geplant')
    expect(mailZustand(undefined, 'vorab', { vergangen: false, aktiv: false }).text).toBe('Agenda-Mail: pausiert')
    expect(mailZustand(undefined, 'vorab', { vergangen: true, aktiv: true }).text).toBe('Agenda-Mail: nicht gesendet')
  })
  it('gesendet, in Arbeit, Fehler mit Versuchen, endgültig fehlgeschlagen', () => {
    expect(mailZustand(mail({}), 'vorab', termin)).toEqual({ text: 'Agenda-Mail: gesendet', ton: 'ok' })
    expect(mailZustand(mail({ status: 'in_arbeit' }), 'vorab', termin).ton).toBe('warn')
    expect(mailZustand(mail({ status: 'fehler', versuche: 2, fehler: 'x' }), 'vorab', termin)).toEqual({ text: 'Agenda-Mail: Fehler (Versuch 2 von 3), wird erneut versucht', ton: 'fehler' })
    expect(mailZustand(mail({ status: 'fehler', versuche: 3, endgueltig_fehlgeschlagen: true }), 'kurz', termin)).toEqual({ text: 'Erinnerung: nach 3 Versuchen fehlgeschlagen', ton: 'fehler' })
  })
})

describe('Agenda-Text', () => {
  const md = [
    '# Agenda für das Teammeeting (November 2026, 18 Minuten)',
    '',
    '> Der Monat ist noch nicht abgeschlossen. Stand unvollständig: 0 von 7 Einzelanalysen liegen vor.',
    '',
    '## Fokus-Verhalten (7 Min.)',
    '- Fokus – Verhalten 3: Unterstützt Kollegen. Fremdbild 3,19.',
    '- Beispiele aus den Kommentaren (ohne Namen): „Kollege A hilft immer“ · „super“',
    '- Warum wichtig: Begrüßung zählt.',
  ].join('\n')

  it('ohneBeispiele entfernt nur die Zeilen mit Kommentar-Beispielen', () => {
    const t = ohneBeispiele(md)
    expect(t).not.toContain('Beispiele aus den Kommentaren')
    expect(t).not.toContain('Kollege A')
    expect(t).toContain('Warum wichtig: Begrüßung zählt.')
    expect(t).toContain('Fokus – Verhalten 3')
    expect(ohneBeispiele(null)).toBe('')
  })

  it('markdownBloecke erkennt Hinweise mit „> “', () => {
    const b = markdownBloecke(md)
    expect(b[0]).toEqual({ art: 'ueberschrift', text: 'Agenda für das Teammeeting (November 2026, 18 Minuten)' })
    expect(b[1]).toEqual({ art: 'hinweis', text: 'Der Monat ist noch nicht abgeschlossen. Stand unvollständig: 0 von 7 Einzelanalysen liegen vor.' })
    expect(b[2]).toEqual({ art: 'ueberschrift', text: 'Fokus-Verhalten (7 Min.)' })
    expect(b[3]).toMatchObject({ art: 'liste' })
    expect(markdownBloecke('>')).toEqual([])
  })
})
