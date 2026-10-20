import { describe, expect, it } from 'vitest'
import { fristEnde, istMonat, laufenderMonat, monatAusDatum, monatName, monatVerschieben } from './monat'

describe('monat', () => {
  it('erkennt gültige Monatsangaben', () => {
    expect(istMonat('2026-10')).toBe(true)
    expect(istMonat('2026-13')).toBe(false)
    expect(istMonat('2026-1')).toBe(false)
    expect(istMonat('Oktober')).toBe(false)
  })

  it('rechnet den laufenden Monat nach Berliner Zeit', () => {
    expect(laufenderMonat(new Date('2026-10-15T12:00:00Z'))).toBe('2026-10')
    // 31.10. 23:30 UTC ist in Berlin (MEZ) bereits der 1.11. um 00:30
    expect(laufenderMonat(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11')
    // Sommerzeit: 30.9. 22:30 UTC ist in Berlin (MESZ) bereits der 1.10.
    expect(laufenderMonat(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10')
  })

  it('benennt Monate auf Deutsch', () => {
    expect(monatName('2026-10')).toBe('Oktober 2026')
    expect(monatName('2027-03')).toBe('März 2027')
  })

  it('findet den letzten Tag des Monats', () => {
    expect(fristEnde('2026-10')).toBe('31.10.2026')
    expect(fristEnde('2026-02')).toBe('28.02.2026')
    expect(fristEnde('2028-02')).toBe('29.02.2028')
    expect(fristEnde('2026-04')).toBe('30.04.2026')
  })

  it('verschiebt Monate über Jahresgrenzen', () => {
    expect(monatVerschieben('2026-12', 1)).toBe('2027-01')
    expect(monatVerschieben('2026-01', -1)).toBe('2025-12')
    expect(monatVerschieben('2026-10', 0)).toBe('2026-10')
  })

  it('kürzt Datenbank-Datumswerte auf den Monat', () => {
    expect(monatAusDatum('2026-10-01')).toBe('2026-10')
  })
})
