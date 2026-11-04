import { describe, expect, it } from 'vitest'
import { markdownBloecke, zahlText } from './abschluss'

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
