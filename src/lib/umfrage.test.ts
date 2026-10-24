import { describe, expect, it } from 'vitest'
import {
  baueNutzlast,
  bereinigeEntwurf,
  bestaetige,
  bewertungVon,
  entwicklungFertig,
  fremdKey,
  gesamtSchritte,
  istBestaetigt,
  kommentarPflicht,
  ladeEntwurf,
  leereAntworten,
  naechstesOffenes,
  ritualKey,
  ritualProblem,
  schrittNummer,
  stufenName,
  umfrageLuecke,
  verhaltenProblem,
  videoQuelle,
  zeitText,
  type Antworten,
  type Entwurf,
  type UmfrageInhalt,
} from './umfrage'

const inhalt: UmfrageInhalt = {
  verhalten: [
    { id: 'v1', nr: 1, grundpfeiler: null, saeule: null, titel: 'Eins', video_url: null, kriterien: [] },
    { id: 'v2', nr: 2, grundpfeiler: null, saeule: null, titel: 'Zwei', video_url: null, kriterien: [] },
  ],
  rituale: [
    {
      id: 'r1', nr: 1, titel: 'Empfang', untertitel: null, einleitung: [], video_url: null,
      fragen: [
        { nr: 1, typ: 'skala', frage: 'Wie nah?', hinweis: null, optionen: null, labels: null, pflicht: true },
        { nr: 2, typ: 'text', frage: 'Anmerkungen', hinweis: null, optionen: null, labels: null, pflicht: false },
      ],
    },
  ],
  kollegen: [
    { id: 'k1', name: 'Anna' },
    { id: 'k2', name: 'Ben' },
  ],
}

/** Alles ausgefüllt: Videos gesehen, überall Note 3 (kein Kommentar nötig). */
function vollstaendig(): Antworten {
  const a = leereAntworten()
  a.entwicklungPersonId = 'k1'
  a.entwicklungBegruendung = '  Sehr gut  '
  a.rituale[ritualKey('r1', 1)] = 4
  a.rituale[ritualKey('r1', 2)] = '  ok  '
  for (const v of inhalt.verhalten) {
    a.videoGesehen[v.nr] = true
    a.selbst[v.nr] = { note: 3, kommentar: '' }
    for (const k of inhalt.kollegen) a.fremd[fremdKey(v.nr, k.id)] = { note: 2, kommentar: '' }
  }
  return a
}

describe('Entwicklung des Monats', () => {
  it('braucht eine Person und eine Begründung', () => {
    const a = leereAntworten()
    expect(entwicklungFertig(a)).toBe(false)
    a.entwicklungPersonId = 'k1'
    expect(entwicklungFertig(a)).toBe(false)
    a.entwicklungBegruendung = '   '
    expect(entwicklungFertig(a)).toBe(false)
    a.entwicklungBegruendung = 'weil'
    expect(entwicklungFertig(a)).toBe(true)
  })
})

describe('Rituale', () => {
  it('meldet die erste unbeantwortete Pflichtfrage', () => {
    const a = leereAntworten()
    expect(ritualProblem(inhalt.rituale[0], a)).toBe(1)
    a.rituale[ritualKey('r1', 1)] = 3
    expect(ritualProblem(inhalt.rituale[0], a)).toBeNull() // Frage 2 ist freiwillig
  })
  it('zählt auch leere Texte als unbeantwortet', () => {
    const a = leereAntworten()
    a.rituale[ritualKey('r1', 1)] = '  '
    expect(ritualProblem(inhalt.rituale[0], a)).toBe(1)
  })
})

describe('Verhaltens-Seite: Reihenfolge der Prüfung', () => {
  const v = inhalt.verhalten[0]
  const kollegen = inhalt.kollegen

  it('verlangt zuerst das Video', () => {
    expect(verhaltenProblem(v, kollegen, leereAntworten())).toEqual({ art: 'video' })
  })
  it('verlangt danach das Selbstbild', () => {
    const a = leereAntworten()
    a.videoGesehen[1] = true
    expect(verhaltenProblem(v, kollegen, a)).toEqual({ art: 'selbst' })
  })
  it('verlangt ab Note 4 einen Kommentar beim Selbstbild', () => {
    const a = leereAntworten()
    a.videoGesehen[1] = true
    a.selbst[1] = { note: 4, kommentar: '   ' }
    expect(verhaltenProblem(v, kollegen, a)).toEqual({ art: 'selbstKommentar' })
    a.selbst[1] = { note: 3, kommentar: '' }
    expect(verhaltenProblem(v, kollegen, a)).toEqual({ art: 'fremd', kollegeId: 'k1' })
  })
  it('verlangt jedes Fremdbild und ab Note 4 deren Kommentar', () => {
    const a = leereAntworten()
    a.videoGesehen[1] = true
    a.selbst[1] = { note: 5, kommentar: 'weil' }
    a.fremd[fremdKey(1, 'k1')] = { note: 5, kommentar: '' }
    expect(verhaltenProblem(v, kollegen, a)).toEqual({ art: 'fremdKommentar', kollegeId: 'k1' })
    a.fremd[fremdKey(1, 'k1')] = { note: 5, kommentar: 'stark' }
    expect(verhaltenProblem(v, kollegen, a)).toEqual({ art: 'fremd', kollegeId: 'k2' })
    a.fremd[fremdKey(1, 'k2')] = { note: 1, kommentar: '' }
    expect(verhaltenProblem(v, kollegen, a)).toBeNull()
  })
  it('Note 3 braucht keinen Kommentar, Note 4 schon', () => {
    const a = vollstaendig()
    expect(verhaltenProblem(v, kollegen, a)).toBeNull()
    a.fremd[fremdKey(1, 'k2')] = { note: 4, kommentar: '' }
    expect(verhaltenProblem(v, kollegen, a)).toEqual({ art: 'fremdKommentar', kollegeId: 'k2' })
  })
})

describe('Fortschritt', () => {
  it('zählt Entwicklungsfrage, Rituale und Verhalten', () => {
    expect(gesamtSchritte(inhalt)).toBe(1 + 1 + 2)
    expect(schrittNummer({ art: 'front' }, inhalt)).toBe(0)
    expect(schrittNummer({ art: 'entwicklung' }, inhalt)).toBe(1)
    expect(schrittNummer({ art: 'ritual', index: 0 }, inhalt)).toBe(2)
    expect(schrittNummer({ art: 'verhalten', index: 0 }, inhalt)).toBe(3)
    expect(schrittNummer({ art: 'verhalten', index: 1 }, inhalt)).toBe(4)
  })
  it('ohne Rituale beginnt das erste Verhalten bei Schritt 2', () => {
    const ohne = { ...inhalt, rituale: [] }
    expect(gesamtSchritte(ohne)).toBe(3)
    expect(schrittNummer({ art: 'verhalten', index: 0 }, ohne)).toBe(2)
  })
})

describe('Payload', () => {
  const jetzt = new Date('2026-10-20T10:12:30.000Z')

  it('enthält je Verhalten das Selbstbild und alle Fremdbilder', () => {
    const n = baueNutzlast({ monat: '2026-10', gestartetAm: '2026-10-20T10:00:00.000Z', personId: 'me', inhalt, antworten: vollstaendig(), jetzt })
    expect(n.monat).toBe('2026-10')
    expect(n.zeitpunkt).toBe('2026-10-20T10:12:30.000Z')
    expect(n.gestartet_am).toBe('2026-10-20T10:00:00.000Z')
    expect(n.entwicklung).toEqual({ person_id: 'k1', begruendung: 'Sehr gut' })
    expect(n.bewertungen).toHaveLength(2 * 3) // 2 Verhalten × (ich + 2 Kollegen)
    expect(n.bewertungen.filter((b) => b.bewertete_person_id === 'me')).toHaveLength(2)
    expect(n.bewertungen[0]).toEqual({ verhalten_nr: 1, bewertete_person_id: 'me', note: 3, kommentar: '' })
    expect(n.bewertungen[1]).toEqual({ verhalten_nr: 1, bewertete_person_id: 'k1', note: 2, kommentar: '' })
  })
  it('schickt Namen nie mit: nur IDs', () => {
    const n = baueNutzlast({ monat: '2026-10', gestartetAm: 'x', personId: 'me', inhalt, antworten: vollstaendig(), jetzt })
    const text = JSON.stringify(n)
    expect(text).not.toContain('Anna')
    expect(text).not.toContain('feedbackgeber')
  })
  it('trimmt Kommentare und Ritual-Texte', () => {
    const a = vollstaendig()
    a.selbst[1] = { note: 5, kommentar: '  stark  ' }
    const n = baueNutzlast({ monat: '2026-10', gestartetAm: 'x', personId: 'me', inhalt, antworten: a, jetzt })
    expect(n.bewertungen[0].kommentar).toBe('stark')
    expect(n.rituale).toEqual([
      { ritual_id: 'r1', frage_nr: 1, antwort: 4 },
      { ritual_id: 'r1', frage_nr: 2, antwort: 'ok' },
    ])
  })
  it('lässt unbeantwortete freiwillige Ritual-Fragen als null', () => {
    const a = vollstaendig()
    delete a.rituale[ritualKey('r1', 2)]
    const n = baueNutzlast({ monat: '2026-10', gestartetAm: 'x', personId: 'me', inhalt, antworten: a, jetzt })
    expect(n.rituale[1]).toEqual({ ritual_id: 'r1', frage_nr: 2, antwort: null })
  })
  it('weigert sich bei fehlenden Antworten', () => {
    const a = vollstaendig()
    delete a.fremd[fremdKey(2, 'k2')]
    expect(() => baueNutzlast({ monat: '2026-10', gestartetAm: 'x', personId: 'me', inhalt, antworten: a, jetzt })).toThrow(/Fremdbild/)
    const b = vollstaendig()
    b.entwicklungPersonId = null
    expect(() => baueNutzlast({ monat: '2026-10', gestartetAm: 'x', personId: 'me', inhalt, antworten: b, jetzt })).toThrow(/Entwicklung/)
  })
})

describe('Video-Quelle', () => {
  it('erkennt „kein Video“ als Platzhalter', () => {
    expect(videoQuelle(null)).toEqual({ typ: 'keine' })
    expect(videoQuelle('')).toEqual({ typ: 'keine' })
    expect(videoQuelle('   ')).toEqual({ typ: 'keine' })
  })
  it('erkennt Dateien', () => {
    expect(videoQuelle('https://example.com/film.mp4')).toEqual({ typ: 'datei', url: 'https://example.com/film.mp4' })
  })
  it('erkennt die Vimeo-Player-URL', () => {
    expect(videoQuelle('https://player.vimeo.com/video/123456789')).toEqual({ typ: 'vimeo', url: 'https://player.vimeo.com/video/123456789' })
  })
  it('macht aus einem normalen Vimeo-Link eine Player-URL, auch mit privatem Hash', () => {
    expect(videoQuelle('https://vimeo.com/123456789')).toEqual({ typ: 'vimeo', url: 'https://player.vimeo.com/video/123456789' })
    expect(videoQuelle('https://vimeo.com/123456789/abcdef0123')).toEqual({ typ: 'vimeo', url: 'https://player.vimeo.com/video/123456789?h=abcdef0123' })
  })
  it('zieht die URL aus dem Einbettungscode', () => {
    const code = '<iframe src="https://player.vimeo.com/video/42?h=abc&amp;badge=0" width="640"></iframe>'
    expect(videoQuelle(code)).toEqual({ typ: 'vimeo', url: 'https://player.vimeo.com/video/42?h=abc&badge=0' })
  })
  it('weist Vimeo-Adressen ohne Video-ID ab', () => {
    expect(videoQuelle('https://vimeo.com/')).toEqual({ typ: 'keine' })
  })
})

describe('Zeitanzeige', () => {
  it('formatiert Sekunden als m:ss', () => {
    expect(zeitText(0)).toBe('0:00')
    expect(zeitText(8)).toBe('0:08')
    expect(zeitText(75)).toBe('1:15')
  })
})

describe('Bewertung bestätigen („Locked In“)', () => {
  const selbst = { art: 'selbst' } as const
  const fremd = (id: string) => ({ art: 'fremd', kollegeId: id }) as const

  it('trägt eine bestätigte Bewertung ein und trimmt den Kommentar', () => {
    const a = bestaetige(leereAntworten(), 1, selbst, 4, '  weil  ')
    expect(a.selbst[1]).toEqual({ note: 4, kommentar: 'weil' })
    const b = bestaetige(a, 1, fremd('k1'), 2, '')
    expect(b.fremd[fremdKey(1, 'k1')]).toEqual({ note: 2, kommentar: '' })
  })
  it('lässt Bestätigtes unverändert: auch ein zweiter Versuch ändert nichts', () => {
    const a = bestaetige(leereAntworten(), 1, selbst, 3, '')
    expect(bestaetige(a, 1, selbst, 5, 'neu')).toBe(a)
    const b = bestaetige(a, 1, fremd('k1'), 2, '')
    expect(bestaetige(b, 1, fremd('k1'), 4, 'neu')).toBe(b)
  })
  it('verlangt ab Bewertung 4 einen Kommentar, darunter nicht', () => {
    const leer = leereAntworten()
    expect(bestaetige(leer, 1, selbst, 4, '   ')).toBe(leer)
    expect(bestaetige(leer, 1, selbst, 5, '')).toBe(leer)
    expect(bestaetige(leer, 1, selbst, 3, '').selbst[1].note).toBe(3)
    expect(kommentarPflicht(3)).toBe(false)
    expect(kommentarPflicht(4)).toBe(true)
  })
  it('weist Werte außerhalb von 1 bis 5 ab', () => {
    const leer = leereAntworten()
    expect(bestaetige(leer, 1, selbst, 0, '')).toBe(leer)
    expect(bestaetige(leer, 1, selbst, 6, 'x')).toBe(leer)
    expect(bestaetige(leer, 1, selbst, 2.5, '')).toBe(leer)
  })
  it('nur bestätigte Felder zählen als erledigt', () => {
    expect(istBestaetigt({ note: null, kommentar: '' })).toBe(false)
    expect(istBestaetigt(bewertungVon(bestaetige(leereAntworten(), 1, selbst, 3, ''), 1, selbst))).toBe(true)
    expect(istBestaetigt(bewertungVon(leereAntworten(), 1, fremd('k1')))).toBe(false)
  })
})

describe('Weiterspringen nach „Locked In“', () => {
  const v1 = inhalt.verhalten[0]
  const selbst = { art: 'selbst' } as const
  const fremd = (id: string) => ({ art: 'fremd', kollegeId: id }) as const

  it('beginnt bei einer leeren Seite mit einem selbst', () => {
    expect(naechstesOffenes(v1, inhalt.kollegen, leereAntworten())).toEqual(selbst)
  })
  it('geht in fester Reihenfolge zur ersten offenen Person, außer der gerade bestätigten', () => {
    const a = leereAntworten()
    expect(naechstesOffenes(v1, inhalt.kollegen, a, selbst)).toEqual(fremd('k1'))
    const b = bestaetige(a, 1, selbst, 3, '')
    expect(naechstesOffenes(v1, inhalt.kollegen, b, fremd('k1'))).toEqual(fremd('k2'))
  })
  it('springt zur frühesten offenen Person zurück, wenn man außer der Reihe bewertet hat', () => {
    // k2 ist schon bestätigt, selbst und k1 sind offen: nach k2 kommt selbst
    const a = bestaetige(leereAntworten(), 1, fremd('k2'), 2, '')
    expect(naechstesOffenes(v1, inhalt.kollegen, a, fremd('k2'))).toEqual(selbst)
  })
  it('meldet null, wenn alles bestätigt ist (dann geht es zur nächsten Seite)', () => {
    let a = bestaetige(leereAntworten(), 1, selbst, 3, '')
    a = bestaetige(a, 1, fremd('k1'), 2, '')
    expect(naechstesOffenes(v1, inhalt.kollegen, a)).toEqual(fremd('k2')) // k2 ist noch offen …
    expect(naechstesOffenes(v1, inhalt.kollegen, a, fremd('k2'))).toBeNull() // … aber gerade in Arbeit: danach ist die Seite fertig
    a = bestaetige(a, 1, fremd('k2'), 2, '')
    expect(naechstesOffenes(v1, inhalt.kollegen, a)).toBeNull()
  })
})

describe('Absenden erst, wenn alles durchbewertet ist', () => {
  it('meldet bei einer vollständigen Umfrage keine Lücke', () => {
    expect(umfrageLuecke(inhalt, vollstaendig())).toBeNull()
  })
  it('meldet das erste Verhalten mit einer offenen Bewertung', () => {
    const a = vollstaendig()
    delete a.fremd[fremdKey(1, 'k2')]
    expect(umfrageLuecke(inhalt, a)).toEqual({ schritt: { art: 'verhalten', index: 0 }, text: 'Verhalten 1 ist noch nicht vollständig bewertet.' })
  })
  it('meldet auch eine Lücke vor der letzten Seite, wenn man dort schon steht', () => {
    const a = vollstaendig()
    a.selbst[1] = { note: null, kommentar: '' }
    expect(umfrageLuecke(inhalt, a)?.schritt).toEqual({ art: 'verhalten', index: 0 })
  })
  it('verlangt auch das Video und die Schritte davor', () => {
    const a = vollstaendig()
    a.videoGesehen[2] = false
    expect(umfrageLuecke(inhalt, a)?.schritt).toEqual({ art: 'verhalten', index: 1 })
    const b = vollstaendig()
    b.entwicklungBegruendung = ''
    expect(umfrageLuecke(inhalt, b)?.schritt).toEqual({ art: 'entwicklung' })
    const c = vollstaendig()
    delete c.rituale[ritualKey('r1', 1)]
    expect(umfrageLuecke(inhalt, c)?.schritt).toEqual({ art: 'ritual', index: 0 })
  })
  it('die Payload weigert sich zusätzlich bei einer Pflicht-Bewertung ohne Kommentar', () => {
    const a = vollstaendig()
    a.fremd[fremdKey(2, 'k1')] = { note: 4, kommentar: ' ' }
    expect(() => baueNutzlast({ monat: '2026-10', gestartetAm: 'x', personId: 'ich', inhalt, antworten: a })).toThrow(/Kommentar/)
  })
})

describe('Stufenname', () => {
  const krit = [{ stufe: 4, bezeichnung: '4 – Profi', prozent: '75–100%', leitsatz: null, punkte: [] }]
  it('nimmt den hinterlegten Namen ohne die vorangestellte Zahl', () => {
    expect(stufenName(krit, 4)).toBe('Profi')
  })
  it('fällt auf den Standardnamen zurück', () => {
    expect(stufenName([], 1)).toBe('Bewusstsein')
    expect(stufenName(krit, 5)).toBe('High Performer')
    expect(stufenName([{ stufe: 2, bezeichnung: null, prozent: null, leitsatz: null, punkte: [] }], 2)).toBe('Aufbau')
  })
})

describe('Zwischenstand bereinigen', () => {
  const entwurf = (a: Antworten, schritt: Entwurf['schritt']): Entwurf => ({ v: 2, gestartetAm: 'x', schritt, antworten: a })

  it('lässt einen passenden Zwischenstand unverändert', () => {
    const e = entwurf(vollstaendig(), { art: 'verhalten', index: 1 })
    expect(bereinigeEntwurf(e, inhalt)).toEqual(e)
  })
  it('wirft Antworten zu entfernten Personen, Verhalten und Ritualen weg', () => {
    const a = vollstaendig()
    a.fremd[fremdKey(1, 'weg')] = { note: 3, kommentar: '' }
    a.fremd[fremdKey(99, 'k1')] = { note: 3, kommentar: '' }
    a.selbst[99] = { note: 3, kommentar: '' }
    a.videoGesehen[99] = true
    a.rituale[ritualKey('weg', 1)] = 3
    const b = bereinigeEntwurf(entwurf(a, { art: 'entwicklung' }), inhalt).antworten
    expect(Object.keys(b.fremd).sort()).toEqual([fremdKey(1, 'k1'), fremdKey(1, 'k2'), fremdKey(2, 'k1'), fremdKey(2, 'k2')].sort())
    expect(Object.keys(b.selbst)).toEqual(['1', '2'])
    expect(Object.keys(b.videoGesehen)).toEqual(['1', '2'])
    expect(Object.keys(b.rituale)).toEqual([ritualKey('r1', 1), ritualKey('r1', 2)])
  })
  it('vergisst eine Entwicklungs-Person, die nicht mehr im Team ist', () => {
    const a = vollstaendig()
    a.entwicklungPersonId = 'weg'
    expect(bereinigeEntwurf(entwurf(a, { art: 'entwicklung' }), inhalt).antworten.entwicklungPersonId).toBeNull()
  })
  it('behält nur bestätigte Bewertungen: ohne Wert oder ohne Pflicht-Kommentar fallen sie weg', () => {
    const a = vollstaendig()
    a.selbst[1] = { note: null, kommentar: 'getippt' }
    a.selbst[2] = { note: 4, kommentar: '  ' }
    a.fremd[fremdKey(1, 'k1')] = { note: 7, kommentar: '' }
    a.fremd[fremdKey(1, 'k2')] = { note: 5, kommentar: 'ok' }
    const b = bereinigeEntwurf(entwurf(a, { art: 'verhalten', index: 0 }), inhalt).antworten
    expect(b.selbst[1]).toBeUndefined()
    expect(b.selbst[2]).toBeUndefined()
    expect(b.fremd[fremdKey(1, 'k1')]).toBeUndefined()
    expect(b.fremd[fremdKey(1, 'k2')]).toEqual({ note: 5, kommentar: 'ok' })
  })
  it('ein Zwischenstand aus der Zeit vor „Locked In“ (Version 1) wird nicht übernommen', () => {
    const alt = JSON.stringify({ v: 1, gestartetAm: 'x', schritt: { art: 'entwicklung' }, antworten: vollstaendig() })
    const speicher = new Map<string, string>([['k', alt]])
    ;(globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => speicher.get(k) ?? null } }
    try {
      expect(ladeEntwurf('k')).toBeNull()
      speicher.set('k', JSON.stringify({ v: 2, gestartetAm: 'x', schritt: { art: 'entwicklung' }, antworten: vollstaendig() }))
      expect(ladeEntwurf('k')?.v).toBe(2)
    } finally {
      delete (globalThis as { window?: unknown }).window
    }
  })
  it('setzt einen ungültigen Schritt auf die Entwicklungsfrage zurück', () => {
    expect(bereinigeEntwurf(entwurf(vollstaendig(), { art: 'verhalten', index: 5 }), inhalt).schritt).toEqual({ art: 'entwicklung' })
    expect(bereinigeEntwurf(entwurf(vollstaendig(), { art: 'ritual', index: 3 }), inhalt).schritt).toEqual({ art: 'entwicklung' })
  })
})
