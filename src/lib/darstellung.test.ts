import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DARSTELLUNGEN, istDarstellung, istDunkel, leseDarstellung, naechsteDarstellung, speichereDarstellung } from './darstellung'

describe('Darstellung wechseln', () => {
  it('geht der Reihe nach: automatisch → dunkel → hell → automatisch', () => {
    expect(naechsteDarstellung('auto')).toBe('dunkel')
    expect(naechsteDarstellung('dunkel')).toBe('hell')
    expect(naechsteDarstellung('hell')).toBe('auto')
  })
  it('kommt nach drei Klicks wieder am Anfang an', () => {
    expect(DARSTELLUNGEN.reduce((d) => naechsteDarstellung(d), 'auto' as ReturnType<typeof naechsteDarstellung>)).toBe('auto')
  })
})

describe('Dunkel oder hell?', () => {
  it('„dunkel“ und „hell“ gelten immer, egal was das Gerät will', () => {
    expect(istDunkel('dunkel', false)).toBe(true)
    expect(istDunkel('hell', true)).toBe(false)
  })
  it('„automatisch“ folgt dem Gerät', () => {
    expect(istDunkel('auto', true)).toBe(true)
    expect(istDunkel('auto', false)).toBe(false)
  })
  it('erkennt gültige Werte', () => {
    expect(istDarstellung('dunkel')).toBe(true)
    expect(['night', '', null, undefined, 1].some(istDarstellung)).toBe(false)
  })
})

describe('Speichern im Browser', () => {
  const speicher = new Map<string, string>()
  beforeEach(() => {
    speicher.clear()
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => speicher.get(k) ?? null, setItem: (k: string, v: string) => void speicher.set(k, v) } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('merkt sich die Wahl', () => {
    expect(leseDarstellung()).toBe('auto')
    speichereDarstellung('dunkel')
    expect(leseDarstellung()).toBe('dunkel')
  })
  it('fällt bei unbekannten Werten auf „automatisch“ zurück', () => {
    speicher.set('hm-darstellung', 'schwarz')
    expect(leseDarstellung()).toBe('auto')
  })
  it('läuft ohne Speicher weiter (z. B. privates Fenster)', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('gesperrt')
        },
        setItem: () => {
          throw new Error('gesperrt')
        },
      },
    })
    expect(leseDarstellung()).toBe('auto')
    expect(() => speichereDarstellung('hell')).not.toThrow()
  })
})
