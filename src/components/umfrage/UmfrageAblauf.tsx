import { useEffect, useState } from 'react'
import { umfrageEinreichen } from '../../lib/api'
import { SALON_NAME } from '../../config'
import { monatName } from '../../lib/monat'
import type { Person } from '../../lib/types'
import {
  baueNutzlast,
  bereinigeEntwurf,
  entwicklungFertig,
  entwurfSchluessel,
  gesamtSchritte,
  ladeEntwurf,
  leereAntworten,
  loescheEntwurf,
  ritualKey,
  ritualProblem,
  schrittNummer,
  selbstVon,
  fremdVon,
  speichereEntwurf,
  verhaltenProblem,
  type Antworten,
  type Bewertung,
  type Nutzlast,
  type RitualAntwort,
  type Schritt,
  type UmfrageInhalt,
  type VerhaltenProblem,
} from '../../lib/umfrage'
import EntwicklungSeite from './EntwicklungSeite'
import Fortschritt from './Fortschritt'
import Frontblatt from './Frontblatt'
import Kontext from './Kontext'
import { fokussiere, markiere } from './markiere'
import RitualSeite from './RitualSeite'
import VerhaltenSeite from './VerhaltenSeite'
import Zusammenfassung from './Zusammenfassung'

/** Länge des Platzhalter-Videos, solange bei einem Verhalten keine Video-URL hinterlegt ist. */
const PLATZHALTER_VIDEO_SEKUNDEN = 8

type Ergebnis = { art: 'ok'; nutzlast: Nutzlast } | { art: 'bereits'; nutzlast: Nutzlast; meldung: string }

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

  const gesamt = gesamtSchritte(inhalt)
  const rituale = inhalt.rituale
  const verhalten = inhalt.verhalten

  // Zwischenstand sichern
  useEffect(() => {
    if (ergebnis || schritt.art === 'front' || !gestartetAm) return
    speichereEntwurf(schluessel, { v: 1, gestartetAm, schritt, antworten })
  }, [ergebnis, schritt, gestartetAm, antworten, schluessel])

  // Bei jedem Seitenwechsel nach oben
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [schritt, ergebnis])

  const geheZu = (s: Schritt) => {
    setVersucht(false)
    setRitualFehler(null)
    setSendeFehler(null)
    setSchritt(s)
  }

  // ── Antworten ändern ────────────────────────────────────────────────────
  const setSelbst = (nr: number, patch: Partial<Bewertung>) =>
    setAntworten((a) => ({ ...a, selbst: { ...a.selbst, [nr]: { ...selbstVon(a, nr), ...patch } } }))
  const setFremd = (nr: number, kollegeId: string, patch: Partial<Bewertung>) =>
    setAntworten((a) => ({ ...a, fremd: { ...a.fremd, [`${nr}:${kollegeId}`]: { ...fremdVon(a, nr, kollegeId), ...patch } } }))
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
        return fokussiere('um-sb-ta')
      case 'fremd':
        return markiere('um-fb-bereich')
      case 'fremdKommentar':
        return fokussiere(`um-fb-ta-${p.kollegeId}`)
    }
  }

  function weiterVerhalten(index: number) {
    const problem = verhaltenProblem(verhalten[index], inhalt.kollegen, antworten)
    if (problem) {
      setVersucht(true)
      markiereProblem(problem)
      return
    }
    if (index < verhalten.length - 1) geheZu({ art: 'verhalten', index: index + 1 })
    else void absenden()
  }

  async function absenden() {
    if (sendet) return
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
    const r = await umfrageEinreichen(nutzlast)
    setSendet(false)
    if (r.art === 'ok') {
      loescheEntwurf(schluessel)
      setErgebnis({ art: 'ok', nutzlast })
    } else if (r.art === 'bereits') {
      loescheEntwurf(schluessel)
      setErgebnis({ art: 'bereits', nutzlast, meldung: r.meldung })
    } else {
      setSendeFehler(fehlertext(r.meldung))
    }
  }

  function neuBeginnen() {
    loescheEntwurf(schluessel)
    setAntworten(leereAntworten())
    setGestartetAm(null)
    setWiederhergestellt(false)
    geheZu({ art: 'front' })
  }

  // ── Anzeige ─────────────────────────────────────────────────────────────
  if (ergebnis) {
    const dauer = Math.round((new Date(ergebnis.nutzlast.zeitpunkt).getTime() - new Date(ergebnis.nutzlast.gestartet_am).getTime()) / 60000)
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

  const kontextZaehler =
    schritt.art === 'entwicklung'
      ? `Schritt 1 von ${gesamt}`
      : schritt.art === 'ritual'
        ? `Ritual ${schritt.index + 1} von ${rituale.length}`
        : schritt.art === 'verhalten'
          ? `Verhalten ${schritt.index + 1} von ${verhalten.length}`
          : ''

  return (
    <div className="um">
      <Fortschritt schritt={schrittNummer(schritt, inhalt)} gesamt={gesamt} />

      {wiederhergestellt && schritt.art !== 'front' && (
        <div className="um-status ok" role="status">
          Dein Zwischenstand wurde wiederhergestellt. Du machst dort weiter, wo du aufgehört hast.{' '}
          <button type="button" className="btn btn-sekundaer btn-klein" onClick={neuBeginnen}>
            Neu beginnen
          </button>
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
              onVideoGesehen={() => setVideoGesehen(v.nr)}
              onSelbst={(patch) => setSelbst(v.nr, patch)}
              onFremd={(kollegeId, patch) => setFremd(v.nr, kollegeId, patch)}
              onZurueck={() => (index > 0 ? geheZu({ art: 'verhalten', index: index - 1 }) : zurueckVorVerhalten())}
              onWeiter={() => weiterVerhalten(index)}
            />
          )
        })()}
    </div>
  )
}
