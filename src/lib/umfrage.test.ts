import { describe, expect, it } from 'vitest'
import {
  baueNutzlast,
  bereinigeEntwurf,
  entwicklungFertig,
  fremdKey,
  gesamtSchritte,
  leereAntworten,
  ritualKey,
  ritualProblem,
  schrittNummer,
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
    expect(n.bewertungen).toHaveLength(2 * 3) // 2 Verhalten × (ich + 2 Kolleg:innen)
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

describe('Zwischenstand bereinigen', () => {
  const entwurf = (a: Antworten, schritt: Entwurf['schritt']): Entwurf => ({ v: 1, gestartetAm: 'x', schritt, antworten: a })

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
  it('setzt einen ungültigen Schritt auf die Entwicklungsfrage zurück', () => {
    expect(bereinigeEntwurf(entwurf(vollstaendig(), { art: 'verhalten', index: 5 }), inhalt).schritt).toEqual({ art: 'entwicklung' })
    expect(bereinigeEntwurf(entwurf(vollstaendig(), { art: 'ritual', index: 3 }), inhalt).schritt).toEqual({ art: 'entwicklung' })
  })
})
