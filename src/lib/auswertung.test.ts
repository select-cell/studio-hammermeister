import { describe, expect, it } from 'vitest'
import {
  balkenDaten,
  einordnung,
  fmt,
  fmtDiff,
  gruppenTitel,
  hatSaeulen,
  monatKurz,
  neuesterMonat,
  niveau,
  schwellenVon,
  sortiereVerhalten,
  STANDARD_SCHWELLEN,
  topFlop,
  vornameVon,
  wertDerPerson,
  type DashboardVerhalten,
} from './auswertung'

describe('Zahlenformat', () => {
  it('schreibt deutsche Dezimalkommas mit zwei Stellen', () => {
    expect(fmt(3.04)).toBe('3,04')
    expect(fmt(4)).toBe('4,00')
    expect(fmt(7.5, 1)).toBe('7,5')
  })
  it('zeigt für fehlende Werte einen Strich', () => {
    expect(fmt(null)).toBe('–')
    expect(fmt(undefined)).toBe('–')
    expect(fmtDiff(null)).toBe('–')
  })
  it('setzt bei Differenzen das Vorzeichen', () => {
    expect(fmtDiff(0.25)).toBe('+0,25')
    expect(fmtDiff(-0.04)).toBe('−0,04')
    expect(fmtDiff(0)).toBe('0,00')
  })
})

describe('Einordnung der Differenz', () => {
  it('ist bis zur Schwelle ausgewogen – die Schwelle selbst eingeschlossen', () => {
    expect(einordnung(0.3, 0.3)?.text).toBe('Ausgewogen')
    expect(einordnung(-0.3, 0.3)?.text).toBe('Ausgewogen')
    expect(einordnung(0, 0.3)?.ton).toBe('gut')
  })
  it('erkennt Selbstüber- und -unterschätzung samt Kurzform für die Team-Sicht', () => {
    const ueber = einordnung(0.31, 0.3)
    expect(ueber).toMatchObject({ text: 'Selbstüberschätzung', kurz: 'SB > FB', ton: 'schlecht' })
    const unter = einordnung(-0.31, 0.3)
    expect(unter).toMatchObject({ text: 'Selbstunterschätzung', kurz: 'FB > SB', ton: 'schlecht' })
  })
  it('folgt der Schwelle aus dem Salon, nicht einem festen Wert', () => {
    expect(einordnung(0.4, 0.5)?.text).toBe('Ausgewogen')
    expect(einordnung(0.4, 0.3)?.text).toBe('Selbstüberschätzung')
  })
  it('liefert ohne Wert keine Einordnung', () => {
    expect(einordnung(null, 0.3)).toBeNull()
  })
})

describe('Score-Niveau', () => {
  const s = STANDARD_SCHWELLEN
  it('trennt hoch ≥ 3,5, mittel und niedrig < 2,5', () => {
    expect(niveau(3.5, s)).toBe('hoch')
    expect(niveau(3.49, s)).toBe('mittel')
    expect(niveau(2.5, s)).toBe('mittel')
    expect(niveau(2.49, s)).toBe('niedrig')
    expect(niveau(null, s)).toBeNull()
  })
  it('liest die Schwellen aus dem Salon', () => {
    const salon = { schwelle_ausgewogen: '0.5' as unknown as number, schwelle_niedrig: 3, schwelle_hoch: 4 }
    expect(schwellenVon(salon)).toEqual({ ausgewogen: 0.5, niedrig: 3, hoch: 4 })
    expect(schwellenVon(null)).toEqual(STANDARD_SCHWELLEN)
  })
})

describe('Monate und Namen', () => {
  it('kürzt Monate für Diagrammachsen', () => {
    expect(monatKurz('2026-10')).toBe('Okt 26')
    expect(monatKurz('2027-03')).toBe('Mär 27')
  })
  it('nimmt den neuesten Monat', () => {
    expect(neuesterMonat(['2026-10', '2026-11'])).toBe('2026-11')
    expect(neuesterMonat([])).toBeNull()
  })
  it('liefert den Vornamen', () => {
    expect(vornameVon('Behzad Pour Sakha')).toBe('Behzad')
  })
})

const v = (nr: number, fb: number | null, saeule: string | null = null, grundpfeiler: string | null = null) => ({ nr, titel: `V${nr}`, fb, saeule, grundpfeiler })

describe('Top und Flop', () => {
  it('nimmt die höchsten und die niedrigsten Fremdbilder', () => {
    const zeilen = [v(1, 3), v(2, 4.5), v(3, 2), v(4, 3.5), v(5, 1.5), v(6, 4), v(7, 2.5), v(8, 3.2), v(9, 4.2), v(10, 1.9)]
    const { top, flop } = topFlop(zeilen, 4)
    expect(top.map((z) => z.nr)).toEqual([2, 9, 6, 4])
    expect(flop.map((z) => z.nr)).toEqual([5, 10, 3, 7])
  })
  it('lässt Verhalten ohne Fremdbild aus', () => {
    const { top, flop } = topFlop([v(1, null), v(2, 3), v(3, 4)], 4)
    expect(top.map((z) => z.nr)).toEqual([3])
    expect(flop.map((z) => z.nr)).toEqual([2])
  })
  it('teilt kleine Listen, damit nichts doppelt vorkommt', () => {
    const { top, flop } = topFlop([v(1, 5), v(2, 4), v(3, 3), v(4, 2), v(5, 1), v(6, 3.5)], 4)
    expect(top).toHaveLength(3)
    expect(flop).toHaveLength(3)
    expect(new Set([...top, ...flop].map((z) => z.nr)).size).toBe(6)
  })
  it('bricht bei Gleichstand nach Nummer auf', () => {
    expect(topFlop([v(2, 4), v(1, 4), v(3, 2), v(4, 2)], 1).top[0].nr).toBe(1)
  })
  it('ist bei leeren Daten leer', () => {
    expect(topFlop([], 4)).toEqual({ top: [], flop: [] })
  })
})

describe('Gruppieren und Sortieren', () => {
  const z = (nr: number, grundpfeiler: string | null, saeule: string | null, fb: number | null) => ({ nr, grundpfeiler, saeule, fb })
  const mitSaeulen = [z(3, 'A', 'S2', 3), z(1, 'A', 'S1', 4), z(2, 'A', 'S1', 2), z(4, 'B', 'S3', null)]
  const ohneSaeulen = [z(2, null, null, 3), z(1, null, null, 4)]

  it('erkennt, ob es Säulen gibt', () => {
    expect(hatSaeulen(mitSaeulen)).toBe(true)
    expect(hatSaeulen(ohneSaeulen)).toBe(false)
  })
  it('Standard gruppiert nach Säulen in der Reihenfolge der Verhalten', () => {
    const g = sortiereVerhalten(mitSaeulen, 'standard', (x) => x.fb)
    expect(g.map((x) => x.saeule)).toEqual(['S1', 'S2', 'S3'])
    expect(g[0].zeilen.map((x) => x.nr)).toEqual([1, 2])
  })
  it('Standard ohne Säulen ergibt eine einzige Gruppe ohne Kopf', () => {
    const g = sortiereVerhalten(ohneSaeulen, 'standard', (x) => x.fb)
    expect(g).toHaveLength(1)
    expect(g[0].zeilen.map((x) => x.nr)).toEqual([1, 2])
    expect(gruppenTitel(g[0])).toBeNull()
  })
  it('Höchste und Niedrigste lösen die Gruppierung auf, leere Werte stehen zuletzt', () => {
    const hoch = sortiereVerhalten(mitSaeulen, 'hoechste', (x) => x.fb)
    expect(hoch).toHaveLength(1)
    expect(hoch[0].zeilen.map((x) => x.nr)).toEqual([1, 3, 2, 4])
    const tief = sortiereVerhalten(mitSaeulen, 'niedrigste', (x) => x.fb)
    expect(tief[0].zeilen.map((x) => x.nr)).toEqual([2, 3, 1, 4])
  })
  it('benennt Gruppen mit Grundpfeiler und Säule', () => {
    expect(gruppenTitel({ grundpfeiler: 'Haltung', saeule: 'Respekt' })).toBe('Haltung · Respekt')
    expect(gruppenTitel({ grundpfeiler: null, saeule: 'Respekt' })).toBe('Respekt')
  })
})

describe('Diagrammdaten', () => {
  const verhalten = [
    { nr: 1, titel: 'Pünktlich', sb: 4, fb: 3.5 },
    { nr: 2, titel: 'Freundlich', sb: 3, fb: 4 },
  ]
  it('zeigt ohne Säulen ein Verhalten je Balkengruppe', () => {
    const r = balkenDaten([], verhalten)
    expect(r.art).toBe('verhalten')
    expect(r.daten).toEqual([
      { name: '1', titel: '1. Pünktlich', sb: 4, fb: 3.5 },
      { name: '2', titel: '2. Freundlich', sb: 3, fb: 4 },
    ])
  })
  it('zeigt mit Säulen eine Säule je Balkengruppe', () => {
    const r = balkenDaten([{ grundpfeiler: 'Haltung', saeule: 'Respekt', sb: 3.5, fb: 3.75, diff: -0.25, anzahl_verhalten: 2 }], verhalten)
    expect(r.art).toBe('saeulen')
    expect(r.daten).toEqual([{ name: 'Respekt', titel: 'Haltung · Respekt', sb: 3.5, fb: 3.75 }])
  })
})

describe('Matrix Verhalten × Person', () => {
  const zeile: DashboardVerhalten = {
    nr: 1,
    titel: 'V1',
    grundpfeiler: null,
    saeule: null,
    team_sb: 3,
    team_fb: 3,
    team_diff: 0,
    werte: [{ person_id: 'a', sb: 4, fb: 3, diff: 1 }],
  }
  it('findet den Wert einer Person und liefert sonst null', () => {
    expect(wertDerPerson(zeile, 'a', 'sb')).toBe(4)
    expect(wertDerPerson(zeile, 'a', 'diff')).toBe(1)
    expect(wertDerPerson(zeile, 'b', 'fb')).toBeNull()
  })
})
