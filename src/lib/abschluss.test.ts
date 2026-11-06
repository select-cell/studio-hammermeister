import { describe, expect, it } from 'vitest'
import { herkunftText, markdownBloecke, sammellaufText, vonKi, zahlText } from './abschluss'

describe('markdownBloecke', () => {
  it('zerlegt Überschriften, Listen und Absätze', () => {
    expect(markdownBloecke('## Stärken\n- Zuverlässig\n- Freundlich\n\n## Empfehlung\nSpricht über Verhalten 2.\nUnd mehr.')).toEqual([
      { art: 'ueberschrift', text: 'Stärken' },
      { art: 'liste', punkte: ['Zuverlässig', 'Freundlich'] },
      { art: 'ueberschrift', text: 'Empfehlung' },
      { art: 'absatz', text: 'Spricht über Verhalten 2. Und mehr.' },
    ])
  })
  it('kommt mit leerem Text, Aufzählungszeichen und fehlenden Leerzeilen zurecht', () => {
    expect(markdownBloecke(null)).toEqual([])
    expect(markdownBloecke('')).toEqual([])
    expect(markdownBloecke('* eins\n• zwei\n# Titel\nText')).toEqual([
      { art: 'liste', punkte: ['eins', 'zwei'] },
      { art: 'ueberschrift', text: 'Titel' },
      { art: 'absatz', text: 'Text' },
    ])
  })
  it('lässt HTML als Text stehen (es wird nie als HTML eingesetzt)', () => {
    expect(markdownBloecke('<script>alert(1)</script>')).toEqual([{ art: 'absatz', text: '<script>alert(1)</script>' }])
  })
})

describe('zahlText', () => {
  it('Dezimalpunkt wird Komma', () => {
    expect(zahlText('4.71')).toBe('4,71')
    expect(zahlText('99')).toBe('99')
  })
})

describe('vonKi und herkunftText', () => {
  it('erkennt KI-Texte am Anbieter; die Vorlage der Plattform ist keiner', () => {
    expect(vonKi({ modell: 'webhook' })).toBe(true)
    expect(vonKi({ modell: 'claude-sonnet-4-5' })).toBe(true)
    expect(vonKi({ modell: 'vorlage' })).toBe(false)
    expect(vonKi({ modell: null })).toBe(false)
  })
  it('nennt die Herkunft in Worten, mit der Zahl der Versuche ab dem zweiten', () => {
    expect(herkunftText({ modell: 'webhook', versuche: 1 })).toBe('von der KI formuliert, über n8n')
    expect(herkunftText({ modell: 'webhook', versuche: 3 })).toBe('von der KI formuliert, über n8n (3 Versuche)')
    expect(herkunftText({ modell: 'webhook' })).toBe('von der KI formuliert, über n8n')
    expect(herkunftText({ modell: 'vorlage', versuche: null })).toBe('aus der Vorlage der Plattform')
    expect(herkunftText({ modell: 'claude-x', versuche: 2 })).toBe('von der KI formuliert, claude-x (2 Versuche)')
    expect(herkunftText({ modell: null })).toBe('unbekannte Herkunft')
  })
})

describe('sammellaufText', () => {
  it('zählt Erfolge und Fehlschläge', () => {
    expect(sammellaufText(1, 0)).toBe('1 Analyse erstellt.')
    expect(sammellaufText(5, 0)).toBe('5 Analysen erstellt.')
    expect(sammellaufText(3, 2)).toBe('3 Analysen erstellt, 2 fehlgeschlagen.')
    expect(sammellaufText(0, 1)).toBe('0 Analysen erstellt, 1 fehlgeschlagen.')
  })
})
