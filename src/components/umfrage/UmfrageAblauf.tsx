import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { umfrageEinreichen } from '../../lib/api'
import { SALON_NAME } from '../../config'
import { monatName } from '../../lib/monat'
import type { Person } from '../../lib/types'
import { Zeiterfassung } from '../../lib/zeiterfassung'
import type { SchrittRef } from '../../lib/zeitmesser'
import {
  baueNutzlast,
  bereinigeEntwurf,
  bestaetige,
  entwicklungFertig,
  entwurfSchluessel,
  gesamtSchritte,
  ladeEntwurf,
  leereAntworten,
  loescheEntwurf,
  ritualKey,
  ritualProblem,
  schrittNummer,
  speichereEntwurf,
  umfrageLuecke,
  verhaltenProblem,
  type Antworten,
  type Nutzlast,
  type RitualAntwort,
  type Schritt,
  type UmfrageInhalt,
  type VerhaltenProblem,
  type Ziel,
} from '../../lib/umfrage'
import EntwicklungSeite from './EntwicklungSeite'
import Fortschritt from './Fortschritt'
import Frontblatt from './Frontblatt'
import Kontext from './Kontext'
import { fokussiere, markiere, scrollArt } from './markiere'
import RitualSeite from './RitualSeite'
import VerhaltenSeite from './VerhaltenSeite'
import Zusammenfassung from './Zusammenfassung'

/** Länge des Platzhalter-Videos, solange bei einem Verhalten keine Video-URL hinterlegt ist. */
const PLATZHALTER_VIDEO_SEKUNDEN = 8

/** `aktiveSek`: die eigene aktive Zeit laut Server (null, wenn keine geprüfte Zeit vorliegt). */
type Ergebnis = { art: 'ok'; nutzlast: Nutzlast; aktiveSek: number | null } | { art: 'bereits'; nutzlast: Nutzlast; meldung: string }

function fehlertext(meldung: string): string {
  if (/fetch|network|load failed|verbindung/i.test(meldung)) {
    return 'Keine Verbindung zur Datenbank. Bitte Internetverbindung prüfen.'
  }
  return `Die Antworten konnten nicht gespeichert werden (${meldung}).`
}

/** Der ganze Weg durch die Monatsumfrage: Frontblatt → Entwicklung → Rituale → Verhalten → Zusammenfassung. */
export default function UmfrageAblauf({ monat, inhalt, person }: { monat: string; inhalt: UmfrageInhalt; person: Person }) {
  const schluessel = entwurfSchluessel(person.id, monat)

  // Zwischenstand aus dem Browser wiederherstellen (falls die Seite versehentlich geschlossen wurde)
  const [entwurf] = useState(() => {
    const roh = ladeEntwurf(schluessel)
    return roh ? bereinigeEntwurf(roh, inhalt) : null
  })
  const [wiederhergestellt, setWiederhergestellt] = useState(entwurf !== null && entwurf.schritt.art !== 'front')
  const [schritt, setSchritt] = useState<Schritt>(entwurf?.schritt ?? { art: 'front' })
  const [antworten, setAntworten] = useState<Antworten>(entwurf?.antworten ?? leereAntworten())
  const [gestartetAm, setGestartetAm] = useState<string | null>(entwurf?.gestartetAm ?? null)
  const [versucht, setVersucht] = useState(false)
  const [ritualFehler, setRitualFehler] = useState<number | null>(null)
  const [sendet, setSendet] = useState(false)
  const [sendeFehler, setSendeFehler] = useState<string | null>(null)
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null)
  const [neuFrage, setNeuFrage] = useState(false)

  // Der Schritt von jetzt, auch für verzögerte Aufrufe (nach „Locked In“ springt die Seite erst nach dem Speichern weiter)
  const schrittJetzt = useRef(schritt)
  schrittJetzt.current = schritt

  // Zeiterfassung (Migration 016): läuft vom Startklick (oder einem wiederhergestellten Zwischenstand) bis zum Absenden
  const zeit = useRef<Zeiterfassung | null>(null)
  const neuBegonnen = useRef(false) // „Neu beginnen“ wurde gedrückt: der nächste Start beendet die alte Sitzung
  const laeuft = gestartetAm !== null && !ergebnis
  const schrittRef = (s: Schritt): SchrittRef => ({ index: schrittNummer(s, inhalt), nr: s.art === 'verhalten' ? (inhalt.verhalten[s.index]?.nr ?? null) : null })

  const gesamt = gesamtSchritte(inhalt)
  const rituale = inhalt.rituale
  const verhalten = inhalt.verhalten

  // Zwischenstand sichern
  useEffect(() => {
    if (ergebnis || schritt.art === 'front' || !gestartetAm) return
    speichereEntwurf(schluessel, { v: 2, gestartetAm, schritt, antworten })
  }, [ergebnis, schritt, gestartetAm, antworten, schluessel])

  // Bei jedem Seitenwechsel nach oben
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: scrollArt() })
  }, [schritt, ergebnis])

  // Die Zeiterfassung beginnt und endet mit der Umfrage; beim Verlassen der Seite geht noch ein letzter Herzschlag raus
  useEffect(() => {
    if (!laeuft) return
    const z = new Zeiterfassung()
    zeit.current = z
    z.beginne(monat, schrittRef(schrittJetzt.current), neuBegonnen.current)
    neuBegonnen.current = false
    return () => {
      z.beende()
      if (zeit.current === z) zeit.current = null
    }
  }, [laeuft, monat])

  // Jeder Schrittwechsel: die Zeit wird dem Schritt zugerechnet, der gerade offen ist
  useEffect(() => {
    zeit.current?.wechsle(schrittRef(schritt))
  }, [schritt])

  const geheZu = (s: Schritt) => {
    setVersucht(false)
    setRitualFehler(null)
    setSendeFehler(null)
    setSchritt(s)
  }

  // ── Antworten ändern ────────────────────────────────────────────────────
  // Eine Bewertung wird nur mit „Locked In“ eingetragen und lässt sich danach nicht mehr ändern (bestaetige ignoriert Bestätigtes).
  const bewerte = (nr: number, ziel: Ziel, note: number, kommentar: string) => setAntworten((a) => bestaetige(a, nr, ziel, note, kommentar))
  const setVideoGesehen = (nr: number) => setAntworten((a) => (a.videoGesehen[nr] ? a : { ...a, videoGesehen: { ...a.videoGesehen, [nr]: true } }))
  const setRitual = (ritualId: string, frageNr: number, wert: RitualAntwort) =>
    setAntworten((a) => ({ ...a, rituale: { ...a.rituale, [ritualKey(ritualId, frageNr)]: wert } }))

  // ── Navigation ──────────────────────────────────────────────────────────
  const start = () => {
    if (!gestartetAm) setGestartetAm(new Date().toISOString()) // Uhr für die Ausfülldauer
    geheZu({ art: 'entwicklung' })
  }

  const nachEntwicklung = () => geheZu(rituale.length > 0 ? { art: 'ritual', index: 0 } : { art: 'verhalten', index: 0 })

  const zurueckVorVerhalten = () => geheZu(rituale.length > 0 ? { art: 'ritual', index: rituale.length - 1 } : { art: 'entwicklung' })

  function weiterRitual(index: number) {
    const problem = ritualProblem(rituale[index], antworten)
    if (problem !== null) {
      setRitualFehler(problem)
      markiere(`um-rit-${problem}`)
      return
    }
    geheZu(index < rituale.length - 1 ? { art: 'ritual', index: index + 1 } : { art: 'verhalten', index: 0 })
  }

  function markiereProblem(p: VerhaltenProblem) {
    switch (p.art) {
      case 'video':
        return markiere('um-video')
      case 'selbst':
        return markiere('um-sb-reihe')
      case 'selbstKommentar':
        return markiere('um-sb-reihe')
      case 'fremd':
      case 'fremdKommentar':
        return markiere(`um-fb-reihe-${p.kollegeId}`)
    }
  }

  function weiterVerhalten(index: number) {
    const problem = verhaltenProblem(verhalten[index], inhalt.kollegen, antworten)
    if (problem) {
      setVersucht(true)
      markiereProblem(problem)
      return
    }
    if (index < verhalten.length - 1) {
      geheZu({ art: 'verhalten', index: index + 1 })
      return
    }
    // Letzte Seite: abgesendet wird erst, wenn die ganze Umfrage vollständig ist
    if (umfrageLuecke(inhalt, antworten)) {
      markiere('um-luecke')
      document.getElementById('um-luecke')?.focus({ preventScroll: true })
      return
    }
    void absenden()
  }

  // Alle Felder einer Seite sind bestätigt (nach dem letzten „Locked In“): von selbst zur nächsten Seite.
  // Nach der allerletzten Bewertung wird nicht automatisch gesendet: Der Fokus geht auf „Absenden“.
  function seiteFertig(index: number) {
    const jetzt = schrittJetzt.current
    if (jetzt.art !== 'verhalten' || jetzt.index !== index) return // inzwischen woanders: nicht mehr springen
    if (index < verhalten.length - 1) geheZu({ art: 'verhalten', index: index + 1 })
    else fokussiere('um-absenden')
  }

  // Eine gehaltene Enter-Taste wiederholt sich und würde sonst Knopf für Knopf weiterklicken (Locked In, ganz am Ende sogar Absenden).
  // Wiederholungen von Enter auf Knöpfen werden verworfen: Jede Bestätigung braucht einen eigenen Tastendruck.
  const wiederholung = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.repeat && e.key === 'Enter' && e.target instanceof HTMLButtonElement) e.preventDefault()
  }

  async function absenden() {
    if (sendet) return
    if (umfrageLuecke(inhalt, antworten)) return // Vorher nicht: erst wenn alle Verhalten durchbewertet sind
    setSendet(true)
    setSendeFehler(null)
    let nutzlast: Nutzlast
    try {
      nutzlast = baueNutzlast({ monat, gestartetAm: gestartetAm ?? new Date().toISOString(), personId: person.id, inhalt, antworten })
    } catch (e) {
      setSendet(false)
      setSendeFehler(`Es fehlen noch Antworten (${e instanceof Error ? e.message : 'unbekannt'}).`)
      return
    }
    const r = await umfrageEinreichen(nutzlast, zeit.current?.abschluss() ?? undefined)
    setSendet(false)
    if (r.art === 'ok') {
      zeit.current?.beende(false) // die Sitzung ist mit der Abgabe geschlossen
      loescheEntwurf(schluessel)
      setErgebnis({ art: 'ok', nutzlast, aktiveSek: r.aktiveSek })
    } else if (r.art === 'bereits') {
      zeit.current?.beende(false)
      loescheEntwurf(schluessel)
      setErgebnis({ art: 'bereits', nutzlast, meldung: r.meldung })
    } else {
      setSendeFehler(fehlertext(r.meldung))
    }
  }

  function neuBeginnen() {
    neuBegonnen.current = true // die Zeiterfassung endet mit dem Zurücksetzen unten; der nächste Start legt eine neue Sitzung an
    loescheEntwurf(schluessel)
    setAntworten(leereAntworten())
    setGestartetAm(null)
    setWiederhergestellt(false)
    setNeuFrage(false)
    geheZu({ art: 'front' })
  }

  // ── Anzeige ─────────────────────────────────────────────────────────────
  if (ergebnis) {
    // Die eigene aktive Zeit laut Server (nicht die Uhrzeit-Differenz auf dem Gerät)
    const dauer = ergebnis.art === 'ok' && ergebnis.aktiveSek !== null ? Math.round(ergebnis.aktiveSek / 60) : 0
    return (
      <div className="um">
        <Fortschritt schritt={gesamt} gesamt={gesamt} fertig />
        <Zusammenfassung
          name={person.name}
          inhalt={inhalt}
          antworten={antworten}
          dauerMin={dauer >= 1 ? dauer : null}
          status={
            ergebnis.art === 'ok'
              ? { art: 'ok', text: 'Deine Antworten wurden sicher gespeichert.' }
              : { art: 'warn', text: `${ergebnis.meldung} Diese Antworten wurden nicht erneut gespeichert.` }
          }
        />
      </div>
    )
  }

  // Erst wenn alle Verhalten (und alles davor) ausgefüllt sind, lässt sich absenden
  const luecke = umfrageLuecke(inhalt, antworten)

  const kontextZaehler =
    schritt.art === 'entwicklung'
      ? `Schritt 1 von ${gesamt}`
      : schritt.art === 'ritual'
        ? `Ritual ${schritt.index + 1} von ${rituale.length}`
        : schritt.art === 'verhalten'
          ? `Verhalten ${schritt.index + 1} von ${verhalten.length}`
          : ''

  return (
    <div className="um" onKeyDownCapture={wiederholung}>
      <Fortschritt schritt={schrittNummer(schritt, inhalt)} gesamt={gesamt} />

      {wiederhergestellt && schritt.art !== 'front' && (
        <div className="um-status ok" role="status">
          Dein Zwischenstand wurde wiederhergestellt. Du machst dort weiter, wo du aufgehört hast.{' '}
          {neuFrage ? (
            <>
              <strong>Alle bestätigten Bewertungen gehen dabei verloren.</strong>{' '}
              <button type="button" className="btn btn-sekundaer btn-klein" onClick={neuBeginnen}>
                Ja, neu beginnen
              </button>{' '}
              <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => setNeuFrage(false)}>
                Abbrechen
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => setNeuFrage(true)}>
              Neu beginnen
            </button>
          )}
        </div>
      )}

      {schritt.art !== 'front' && <Kontext name={person.name} zaehler={kontextZaehler} />}

      {schritt.art === 'front' && <Frontblatt salon={person.salon?.name ?? SALON_NAME} monatsname={monatName(monat)} onStart={start} />}

      {schritt.art === 'entwicklung' && (
        <EntwicklungSeite
          kollegen={inhalt.kollegen}
          antworten={antworten}
          onWaehle={(id) => setAntworten((a) => ({ ...a, entwicklungPersonId: id }))}
          onBegruendung={(text) => setAntworten((a) => ({ ...a, entwicklungBegruendung: text }))}
          onZurueck={() => geheZu({ art: 'front' })}
          onWeiter={() => entwicklungFertig(antworten) && nachEntwicklung()}
        />
      )}

      {schritt.art === 'ritual' && (
        <RitualSeite
          key={rituale[schritt.index].id}
          ritual={rituale[schritt.index]}
          antworten={antworten}
          fehlerNr={ritualFehler}
          onAntwort={(frageNr, wert) => setRitual(rituale[schritt.index].id, frageNr, wert)}
          onZurueck={() => geheZu(schritt.index > 0 ? { art: 'ritual', index: schritt.index - 1 } : { art: 'entwicklung' })}
          onWeiter={() => weiterRitual(schritt.index)}
        />
      )}

      {schritt.art === 'verhalten' &&
        (() => {
          const index = schritt.index
          const v = verhalten[index]
          const gleiche = verhalten.filter((x) => `${x.grundpfeiler ?? ''}|${x.saeule ?? ''}` === `${v.grundpfeiler ?? ''}|${v.saeule ?? ''}`)
          return (
            <VerhaltenSeite
              key={v.nr}
              verhalten={v}
              segmentPosition={v.grundpfeiler || v.saeule ? { nr: gleiche.findIndex((x) => x.nr === v.nr) + 1, von: gleiche.length } : null}
              kollegen={inhalt.kollegen}
              antworten={antworten}
              platzhalterSekunden={PLATZHALTER_VIDEO_SEKUNDEN}
              versucht={versucht}
              sendet={sendet}
              sendeFehler={sendeFehler}
              istLetzte={index === verhalten.length - 1}
              alleFertig={luecke === null}
              luecke={luecke && !(luecke.schritt.art === 'verhalten' && luecke.schritt.index === index) ? { text: luecke.text, onGehe: () => geheZu(luecke.schritt) } : null}
              onVideoGesehen={() => setVideoGesehen(v.nr)}
              onBewerte={(ziel, note, kommentar) => bewerte(v.nr, ziel, note, kommentar)}
              onSeiteFertig={() => seiteFertig(index)}
              onZurueck={() => (index > 0 ? geheZu({ art: 'verhalten', index: index - 1 }) : zurueckVorVerhalten())}
              onWeiter={() => weiterVerhalten(index)}
            />
          )
        })()}
    </div>
  )
}
