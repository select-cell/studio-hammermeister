import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  erinnerungsSchluessel,
  formatDatum,
  formatZeitpunkt,
  heuteAusAdresse,
  reminderGesehen,
  reminderMerken,
  reminderSatz,
  sortiereStatus,
  tageText,
  type StatusPerson,
  type UeberfaelligEintrag,
} from './abgabe'

const eintrag = (extra: Partial<UeberfaelligEintrag> = {}): UeberfaelligEintrag => ({
  person_id: 'p1',
  name: 'Olena Pankova',
  ist_ich: false,
  monat: '2026-10',
  frist: '2026-10-31',
  tage_ueberfaellig: 5,
  ...extra,
})

describe('Texte', () => {
  it('beugt „Tag“ richtig', () => {
    expect(tageText(1)).toBe('1 Tag')
    expect(tageText(4)).toBe('4 Tage')
    expect(tageText(35)).toBe('35 Tage')
  })
  it('formuliert den Reminder wie in der Bauanleitung (§6)', () => {
    expect(reminderSatz(eintrag())).toBe('Olena Pankova hat die Umfrage für Oktober 2026 noch nicht abgegeben (5 Tage überfällig).')
    expect(reminderSatz(eintrag({ tage_ueberfaellig: 1 }))).toContain('(1 Tag überfällig)')
  })
  it('spricht die eingeloggte Person direkt an', () => {
    expect(reminderSatz(eintrag({ ist_ich: true }))).toBe('Du hast die Umfrage für Oktober 2026 noch nicht abgegeben (5 Tage überfällig).')
  })
  it('schreibt Datum und Berliner Uhrzeit deutsch', () => {
    expect(formatDatum('2026-10-31')).toBe('31.10.2026')
    // Sommerzeit: 12:32 UTC ist 14:32 in Berlin; Winterzeit: 12:32 UTC ist 13:32
    expect(formatZeitpunkt('2026-10-18T12:32:00+00:00')).toBe('18.10., 14:32')
    expect(formatZeitpunkt('2026-11-06T12:32:00+00:00')).toBe('06.11., 13:32')
    // Mitternacht Berliner Zeit ist schon der nächste Tag
    expect(formatZeitpunkt('2026-10-31T23:30:00+00:00')).toBe('01.11., 00:30')
  })
})

describe('Schlüssel des Popups', () => {
  it('hängt nicht von Reihenfolge und Tageszahl ab', () => {
    const a = eintrag({ person_id: 'a' })
    const b = eintrag({ person_id: 'b' })
    expect(erinnerungsSchluessel([a, b])).toBe(erinnerungsSchluessel([b, a]))
    expect(erinnerungsSchluessel([a, b])).toBe(erinnerungsSchluessel([{ ...a, tage_ueberfaellig: 9 }, b]))
  })
  it('ändert sich, wenn jemand dazukommt oder ein weiterer Monat fehlt', () => {
    const a = eintrag({ person_id: 'a' })
    const b = eintrag({ person_id: 'b' })
    expect(erinnerungsSchluessel([a])).not.toBe(erinnerungsSchluessel([a, b]))
    expect(erinnerungsSchluessel([a])).not.toBe(erinnerungsSchluessel([a, eintrag({ person_id: 'a', monat: '2026-11' })]))
  })
  it('ist bei leerer Liste leer', () => {
    expect(erinnerungsSchluessel([])).toBe('')
  })
})

describe('Testdatum aus der Adresse', () => {
  it('liest ein gültiges Datum', () => {
    expect(heuteAusAdresse('?heute=2026-11-04')).toBe('2026-11-04')
    expect(heuteAusAdresse('foo=1&heute=2026-02-28')).toBe('2026-02-28')
  })
  it('ignoriert alles Ungültige', () => {
    for (const s of ['', '?heute=', '?heute=morgen', '?heute=2026-02-30', '?heute=2026-13-01', '?heute=2026-1-1', '?heute=2026-11-04x']) {
      expect(heuteAusAdresse(s)).toBeNull()
    }
  })
  it('erkennt Schaltjahre', () => {
    expect(heuteAusAdresse('?heute=2028-02-29')).toBe('2028-02-29')
    expect(heuteAusAdresse('?heute=2027-02-29')).toBeNull()
  })
})

describe('Popup merken (nur für diese Sitzung)', () => {
  beforeEach(() => {
    const speicher = new Map<string, string>()
    vi.stubGlobal('window', {
      sessionStorage: { getItem: (k: string) => speicher.get(k) ?? null, setItem: (k: string, v: string) => void speicher.set(k, v) },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('läuft ohne Speicher weiter (z. B. privates Fenster): das Popup kommt dann eben jedes Mal', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => {
          throw new Error('gesperrt')
        },
        setItem: () => {
          throw new Error('gesperrt')
        },
      },
    })
    expect(() => reminderMerken('a')).not.toThrow()
    expect(reminderGesehen('a')).toBe(false)
  })

  it('merkt sich den weggeklickten Stand', () => {
    expect(reminderGesehen('a|b')).toBe(false)
    reminderMerken('a|b')
    expect(reminderGesehen('a|b')).toBe(true)
  })
  it('zeigt das Popup wieder, wenn sich die Fälle ändern', () => {
    reminderMerken('a|b')
    expect(reminderGesehen('a|b|c')).toBe(false)
  })
})

const person = (name: string, extra: Partial<StatusPerson> = {}): StatusPerson => ({
  id: name,
  name,
  rolle: 'mitarbeiter',
  erwartet: true,
  abgegeben: false,
  zeitpunkt: null,
  verspaetet: false,
  tage_ueberfaellig: 0,
  ueberfaellig: false,
  ...extra,
})

describe('Reihenfolge im Status', () => {
  it('stellt Überfällige vor Offene, Abgegebene und Nicht-Erwartete', () => {
    const sortiert = sortiereStatus([
      person('Anna', { abgegeben: true }),
      person('Berta', { erwartet: false }),
      person('Carla'),
      person('Dora', { ueberfaellig: true, tage_ueberfaellig: 5 }),
      person('Ägidia', { abgegeben: true }),
    ])
    expect(sortiert.map((p) => p.name)).toEqual(['Dora', 'Carla', 'Ägidia', 'Anna', 'Berta'])
  })
  it('verändert die Eingabe nicht', () => {
    const eingabe = [person('B'), person('A')]
    sortiereStatus(eingabe)
    expect(eingabe.map((p) => p.name)).toEqual(['B', 'A'])
  })
})
