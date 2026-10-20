import { describe, expect, it } from 'vitest'
import { MIN_LAENGE, passwortFehlerText, pruefePasswort } from './passwort'

describe('Passwort ändern', () => {
  it('akzeptiert ein ausreichend langes, abweichendes und bestätigtes Passwort', () => {
    expect(pruefePasswort('alt-passwort', 'neues-passwort', 'neues-passwort')).toBeNull()
  })
  it('verlangt das aktuelle Passwort', () => {
    expect(pruefePasswort('', 'neues-passwort', 'neues-passwort')).toBe('aktuellFehlt')
  })
  it('verlangt die Mindestlänge – genau die Grenze ist erlaubt', () => {
    const grenze = 'x'.repeat(MIN_LAENGE)
    expect(pruefePasswort('alt', grenze.slice(1), grenze.slice(1))).toBe('zuKurz')
    expect(pruefePasswort('alt', grenze, grenze)).toBeNull()
  })
  it('verlangt zwei gleiche Eingaben', () => {
    expect(pruefePasswort('alt', 'neues-passwort', 'neues-passwort!')).toBe('verschieden')
  })
  it('lehnt das unveränderte Passwort ab', () => {
    expect(pruefePasswort('gleiches-passwort', 'gleiches-passwort', 'gleiches-passwort')).toBe('gleich')
  })
  it('hat für jeden Fehler einen Text', () => {
    for (const f of ['aktuellFehlt', 'zuKurz', 'verschieden', 'gleich', 'aktuellFalsch', 'zuSchwach', 'zuVieleAnfragen', 'fehler'] as const) {
      expect(passwortFehlerText[f].length).toBeGreaterThan(10)
    }
  })
})
