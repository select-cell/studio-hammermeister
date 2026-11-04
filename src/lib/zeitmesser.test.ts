import { describe, expect, it } from 'vitest'
import { LEERLAUF_MS, Zeitmesser } from './zeitmesser'

/** Künstliche Uhr: `vor(ms)` lässt Zeit vergehen. */
function uhr() {
  let t = 1000 // beliebiger Startwert, performance.now() beginnt auch nicht bei null
  return { jetzt: () => t, vor: (ms: number) => { t += ms } }
}
const S = (index: number, nr: number | null = null) => ({ index, nr })

/** Lässt `sek` Sekunden vergehen und tippt dabei alle 10 s (der Nutzer ist die ganze Zeit aktiv). */
function aktiv(z: Zeitmesser, u: ReturnType<typeof uhr>, sek: number) {
  for (let i = 0; i < sek; i += 10) {
    u.vor(Math.min(10, sek - i) * 1000)
    z.eingabe()
  }
}

describe('Zeitmesser', () => {
  it('zählt 120 s durchgehender Bedienung als 120 s', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    aktiv(z, u, 120)
    expect(z.stand().aktiveSek).toBe(120)
  })

  it('zählt den Moment des Startklicks als erste Eingabe', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    u.vor(30_000)
    expect(z.stand().aktiveSek).toBe(30)
  })

  it('zählt nichts, solange die Seite verborgen ist', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    aktiv(z, u, 30)
    z.sichtbarkeit(false)
    u.vor(60_000)
    z.sichtbarkeit(true)
    z.eingabe() // der Nutzer tippt wieder
    aktiv(z, u, 30)
    expect(z.stand().aktiveSek).toBe(60)
  })

  it('hört nach der Leerlaufzeit auf zu zählen: 90 s ohne Eingabe ergeben 45 s', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    u.vor(90_000)
    expect(z.stand().aktiveSek).toBe(LEERLAUF_MS / 1000)
    u.vor(600_000)
    expect(z.stand().aktiveSek).toBe(LEERLAUF_MS / 1000)
  })

  it('zählt nach einer Pause erst wieder ab der nächsten Eingabe', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    u.vor(100_000) // 45 s zählen, dann Leerlauf
    z.eingabe()
    u.vor(20_000)
    expect(z.stand().aktiveSek).toBe(45 + 20)
  })

  it('Rückkehr in den Tab ist keine Eingabe: ohne Tippen zählt es nicht weiter', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    aktiv(z, u, 10)
    z.sichtbarkeit(false)
    u.vor(300_000)
    z.sichtbarkeit(true)
    u.vor(120_000)
    // letzte Eingabe war vor 420 s: nichts kommt hinzu
    expect(z.stand().aktiveSek).toBe(10)
    z.eingabe()
    u.vor(5_000)
    expect(z.stand().aktiveSek).toBe(15)
  })

  it('geht ein Tab im Hintergrund in den Leerlauf, zählt nur der Anteil bis zum Ausblenden', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    u.vor(20_000)
    z.sichtbarkeit(false) // nach 20 s ausgeblendet, kein Ereignis dazwischen
    u.vor(1_000_000)
    expect(z.stand().aktiveSek).toBe(20)
  })

  it('bucht die Zeit dem offenen Schritt gut, Wechsel teilt sauber auf', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    aktiv(z, u, 20)
    z.wechsle(S(5, 1))
    aktiv(z, u, 40)
    z.wechsle(S(6, 2))
    aktiv(z, u, 10)
    z.wechsle(S(5, 1)) // zurück: addiert sich
    aktiv(z, u, 10)
    const s = z.stand()
    expect(s.aktiveSek).toBe(80)
    expect(s.schritte).toEqual([
      { index: 1, nr: null, sek: 20 },
      { index: 5, nr: 1, sek: 50 },
      { index: 6, nr: 2, sek: 10 },
    ])
  })

  it('die Schritte ergeben zusammen nie mehr als die Gesamtzeit (Abrunden)', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    for (let i = 0; i < 30; i++) {
      u.vor(1_700)
      z.eingabe()
      z.wechsle(S(2 + (i % 7), null))
    }
    const s = z.stand()
    expect(s.schritte.reduce((a, x) => a + x.sek, 0)).toBeLessThanOrEqual(s.aktiveSek)
    expect(s.aktiveSek).toBe(Math.floor((30 * 1700) / 1000))
  })

  it('übernimmt den Stand vom Server und zählt darauf weiter (Neuladen)', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(5, 1))
    z.uebernimm({ aktiveSek: 100, schritte: [{ index: 1, nr: null, sek: 30 }, { index: 5, nr: 1, sek: 70 }] })
    aktiv(z, u, 20)
    const s = z.stand()
    expect(s.aktiveSek).toBe(120)
    expect(s.schritte).toEqual([
      { index: 1, nr: null, sek: 30 },
      { index: 5, nr: 1, sek: 90 },
    ])
  })

  it('nach stop() kommt nichts mehr hinzu, auch nicht durch Eingaben', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    aktiv(z, u, 10)
    z.stop()
    u.vor(60_000)
    z.eingabe()
    u.vor(60_000)
    expect(z.stand().aktiveSek).toBe(10)
    expect(z.istGestartet).toBe(false)
  })

  it('ohne start() zählt nichts', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    u.vor(10_000)
    z.eingabe()
    u.vor(10_000)
    expect(z.stand()).toEqual({ aktiveSek: 0, schritte: [] })
  })

  it('die Uhr des Geräts spielt keine Rolle: nur die übergebene Uhr zählt', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt)
    z.start(S(1))
    const echtesDatum = Date.now
    try {
      Date.now = () => echtesDatum() + 2 * 3600 * 1000 // Gerätezeit springt um 2 Stunden
      aktiv(z, u, 30)
      expect(z.stand().aktiveSek).toBe(30)
    } finally {
      Date.now = echtesDatum
    }
  })

  it('eine eigene Leerlaufzeit ist einstellbar', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt, 10_000)
    z.start(S(1))
    u.vor(60_000)
    expect(z.stand().aktiveSek).toBe(10)
  })

  it('startet verborgen: zählt erst, wenn die Seite sichtbar wird und etwas passiert', () => {
    const u = uhr()
    const z = new Zeitmesser(u.jetzt, LEERLAUF_MS, false)
    z.start(S(1))
    u.vor(30_000)
    expect(z.stand().aktiveSek).toBe(0)
    z.sichtbarkeit(true)
    z.eingabe()
    u.vor(10_000)
    expect(z.stand().aktiveSek).toBe(10)
  })
})
