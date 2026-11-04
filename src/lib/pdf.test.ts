import { describe, expect, it } from 'vitest'
import { datumDe, dateiteil, pdfDateiname } from './pdf'

describe('pdfDateiname', () => {
  it('Monatsbericht: <salon>_<monat>_monatsbericht.pdf', () => {
    expect(pdfDateiname('Hammermeister', '2026-10', { monatsbericht: true })).toBe('hammermeister_2026-10_monatsbericht.pdf')
  })
  it('Personenbericht mit dem Namen der Person', () => {
    expect(pdfDateiname('Hammermeister', '2026-11', { person: 'Jaroslaw Schatalov' })).toBe('hammermeister_2026-11_jaroslaw-schatalov.pdf')
  })
  it('Umlaute und Sonderzeichen werden lesbar umgeschrieben', () => {
    expect(dateiteil('Jürgen Müller-Lüdenscheidt')).toBe('juergen-mueller-luedenscheidt')
    expect(dateiteil('Straße Ärger Öl')).toBe('strasse-aerger-oel')
    expect(dateiteil('José Núñez')).toBe('jose-nunez')
  })
  it('Sonderzeichen, die nie in einem Dateinamen stehen sollen, fallen weg', () => {
    expect(dateiteil('../etc/passwd')).toBe('etc-passwd')
    expect(dateiteil('a"b*c?d<e>f|g:h')).toBe('a-b-c-d-e-f-g-h')
  })
  it('ein leerer Name ergibt trotzdem einen gültigen Dateinamen', () => {
    expect(pdfDateiname('', '2026-10', { person: '***' })).toBe('salon_2026-10_person.pdf')
  })
})

describe('datumDe', () => {
  it('2026-11-04 → 04.11.2026', () => {
    expect(datumDe('2026-11-04')).toBe('04.11.2026')
    expect(datumDe('2026-11-04T10:00:00Z')).toBe('04.11.2026')
  })
})
