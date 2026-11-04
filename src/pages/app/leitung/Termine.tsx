import { useState, type FormEvent } from 'react'
import Abschnitt from '../../../components/auswertung/Abschnitt'
import LadeFehler from '../../../components/auswertung/LadeFehler'
import Seitenkopf from '../../../components/auswertung/Seitenkopf'
import { entferneTermin, ladeTermine, speichereTermin, speichereTerminSerie, type TerminEingabe } from '../../../lib/api'
import { mailZustand, parseZahlenliste, RHYTHMUS_TEXT, terminText, terminVorschlag, vorlaufText, zahlenText, type MailArt, type Rhythmus, type Termin } from '../../../lib/agenda'
import { laufenderMonat, monatName } from '../../../lib/monat'
import { useLaden } from '../../../lib/useLaden'

type Meldung = { art: 'ok' | 'fehler'; text: string } | null

const heuteBerlin = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/** Monate für die Auswahl des Bezugsmonats: die letzten zwölf bis zum laufenden Monat. */
function bezugsmonate(): string[] {
  const [j, m] = laufenderMonat().split('-').map(Number)
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(j, m - 1 - i, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

function TerminFormular({ start, beschaeftigt, onSpeichern, onAbbrechen }: { start?: Termin; beschaeftigt: boolean; onSpeichern: (e: TerminEingabe) => void; onAbbrechen?: () => void }) {
  const [lokal, setLokal] = useState(start?.startet_lokal ?? terminVorschlag(heuteBerlin()))
  const [titel, setTitel] = useState(start?.titel ?? 'Teammeeting')
  const [bezug, setBezug] = useState(start?.bezugsmonat ?? '')
  const [tage, setTage] = useState(zahlenText(start?.vorlauf_tage ?? [2]))
  const [stunden, setStunden] = useState(zahlenText(start?.vorlauf_stunden ?? [1]))
  const [cc, setCc] = useState(start?.cc_admin ?? false)
  const [fehler, setFehler] = useState<string | null>(null)
  const id = start?.id ?? 'neu'

  function senden(e: FormEvent) {
    e.preventDefault()
    const t = parseZahlenliste(tage, 0, 30, true)
    const h = parseZahlenliste(stunden, 0, 72, false)
    if (!lokal) return setFehler('Bitte gib Datum und Uhrzeit des Termins an.')
    if (!titel.trim()) return setFehler('Bitte gib dem Termin einen Titel.')
    if (!t) return setFehler('Vorlauf in Tagen: ganze Zahlen von 0 bis 30, getrennt durch Semikolon oder Leerzeichen (höchstens fünf).')
    if (!h) return setFehler('Vorlauf in Stunden: Zahlen von 0 bis 72, getrennt durch Semikolon oder Leerzeichen (höchstens fünf).')
    setFehler(null)
    onSpeichern({ startetLokal: lokal, titel: titel.trim(), bezugsmonat: bezug, vorlaufTage: t, vorlaufStunden: h, ccAdmin: cc, aktiv: start?.aktiv ?? true })
  }

  return (
    <form className="lt-form" onSubmit={senden} noValidate>
      <div className="lt-form-raster">
        <div>
          <label className="lt-label" htmlFor={`t-start-${id}`}>
            Beginn (Berliner Zeit)
          </label>
          <input id={`t-start-${id}`} className="lt-feld" type="datetime-local" value={lokal} onChange={(e) => setLokal(e.target.value)} required />
        </div>
        <div>
          <label className="lt-label" htmlFor={`t-titel-${id}`}>
            Titel
          </label>
          <input id={`t-titel-${id}`} className="lt-feld" type="text" maxLength={120} value={titel} onChange={(e) => setTitel(e.target.value)} required />
        </div>
        <div>
          <label className="lt-label" htmlFor={`t-bezug-${id}`}>
            Agenda zu Monat
          </label>
          <select id={`t-bezug-${id}`} className="lt-feld" value={bezug} onChange={(e) => setBezug(e.target.value)}>
            <option value="">Standard: Monat vor dem Termin</option>
            {bezugsmonate().map((m) => (
              <option key={m} value={m}>
                {monatName(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lt-label" htmlFor={`t-tage-${id}`}>
            Agenda-Mail … Tage vorher
          </label>
          <input id={`t-tage-${id}`} className="lt-feld" type="text" inputMode="numeric" value={tage} onChange={(e) => setTage(e.target.value)} />
        </div>
        <div>
          <label className="lt-label" htmlFor={`t-stunden-${id}`}>
            Erinnerung … Stunden vorher
          </label>
          <input id={`t-stunden-${id}`} className="lt-feld" type="text" inputMode="decimal" value={stunden} onChange={(e) => setStunden(e.target.value)} />
        </div>
      </div>
      <label className="lt-haken">
        <input type="checkbox" checked={cc} onChange={(e) => setCc(e.target.checked)} /> Der Admin bekommt die Mails ebenfalls
      </label>
      <p className="text-gedimmt text-klein">Mehrere Werte (z. B. „3; 1“) sind erlaubt; der größte Wert löst die Mail aus. Ein Komma ist das Dezimalzeichen („0,5“ = eine halbe Stunde). Die Mails gehen an die Verantwortlichen des Salons.</p>
      {fehler && (
        <p className="hinweis hinweis-fehler" role="alert">
          {fehler}
        </p>
      )}
      <div className="knopfreihe">
        <button type="submit" className="btn btn-primaer btn-klein" disabled={beschaeftigt}>
          {start ? 'Speichern' : 'Termin anlegen'}
        </button>
        {onAbbrechen && (
          <button type="button" className="btn btn-sekundaer btn-klein" onClick={onAbbrechen}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  )
}

function SerienFormular({ beschaeftigt, onSpeichern }: { beschaeftigt: boolean; onSpeichern: (start: string, titel: string, rhythmus: Rhythmus, anzahl: number, cc: boolean) => void }) {
  const [lokal, setLokal] = useState(terminVorschlag(heuteBerlin()))
  const [titel, setTitel] = useState('Teammeeting')
  const [rhythmus, setRhythmus] = useState<Rhythmus>('monatlich')
  const [anzahl, setAnzahl] = useState('6')
  const [cc, setCc] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  return (
    <form
      className="lt-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const n = Number(anzahl)
        if (!lokal || !titel.trim()) return setFehler('Bitte gib Beginn und Titel an.')
        if (!Number.isInteger(n) || n < 1 || n > 60) return setFehler('Die Zahl der Termine muss zwischen 1 und 60 liegen.')
        setFehler(null)
        onSpeichern(lokal, titel.trim(), rhythmus, n, cc)
      }}
    >
      <div className="lt-form-raster">
        <div>
          <label className="lt-label" htmlFor="s-start">
            Erster Termin (Berliner Zeit)
          </label>
          <input id="s-start" className="lt-feld" type="datetime-local" value={lokal} onChange={(e) => setLokal(e.target.value)} required />
        </div>
        <div>
          <label className="lt-label" htmlFor="s-titel">
            Titel
          </label>
          <input id="s-titel" className="lt-feld" type="text" maxLength={120} value={titel} onChange={(e) => setTitel(e.target.value)} required />
        </div>
        <div>
          <label className="lt-label" htmlFor="s-rhythmus">
            Rhythmus
          </label>
          <select id="s-rhythmus" className="lt-feld" value={rhythmus} onChange={(e) => setRhythmus(e.target.value as Rhythmus)}>
            {(Object.keys(RHYTHMUS_TEXT) as Rhythmus[]).map((r) => (
              <option key={r} value={r}>
                {RHYTHMUS_TEXT[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lt-label" htmlFor="s-anzahl">
            Anzahl der Termine
          </label>
          <input id="s-anzahl" className="lt-feld" type="number" min={1} max={60} value={anzahl} onChange={(e) => setAnzahl(e.target.value)} />
        </div>
      </div>
      <label className="lt-haken">
        <input type="checkbox" checked={cc} onChange={(e) => setCc(e.target.checked)} /> Der Admin bekommt die Mails ebenfalls
      </label>
      <p className="text-gedimmt text-klein">Die Uhrzeit bleibt in Berliner Zeit gleich, auch wenn zwischen den Terminen die Uhr umgestellt wird. Vorlauf: Agenda 2 Tage vorher, Erinnerung 1 Stunde vorher; das lässt sich je Termin ändern.</p>
      {fehler && (
        <p className="hinweis hinweis-fehler" role="alert">
          {fehler}
        </p>
      )}
      <div className="knopfreihe">
        <button type="submit" className="btn btn-primaer btn-klein" disabled={beschaeftigt}>
          Termine anlegen
        </button>
      </div>
    </form>
  )
}

function MailZeile({ art, t }: { art: MailArt; t: Termin }) {
  const z = mailZustand(t.mails.find((m) => m.art === art), art, t)
  const m = t.mails.find((x) => x.art === art)
  return (
    <li className={`lt-mail lt-mail-${z.ton}`}>
      {z.text}
      {m?.fehler && <span className="text-klein"> – {m.fehler}</span>}
    </li>
  )
}

function TerminKarte({ t, beschaeftigt, bearbeiten, onBearbeiten, onSpeichern, onPausieren, onEntfernen }: {
  t: Termin
  beschaeftigt: boolean
  bearbeiten: boolean
  onBearbeiten: (an: boolean) => void
  onSpeichern: (e: TerminEingabe) => void
  onPausieren: () => void
  onEntfernen: () => void
}) {
  return (
    <li className="lt-person">
      <div className="lt-person-kopf">
        <strong>{t.titel}</strong>
        <span>{terminText(t.startet_lokal)}</span>
        {!t.aktiv && <span className="lt-chip warn">pausiert</span>}
      </div>
      {bearbeiten ? (
        <TerminFormular start={t} beschaeftigt={beschaeftigt} onSpeichern={onSpeichern} onAbbrechen={() => onBearbeiten(false)} />
      ) : (
        <>
          <p className="text-gedimmt text-klein">
            Agenda zu {monatName(t.bezugsmonat_effektiv)}
            {t.bezugsmonat ? '' : ' (Monat vor dem Termin)'} · {vorlaufText(t.vorlauf_tage, t.vorlauf_stunden)}
          </p>
          <p className="text-gedimmt text-klein">
            Empfänger: {t.empfaenger.length === 0 ? 'keine (es fehlt ein aktiver Verantwortlicher mit E-Mail-Adresse)' : t.empfaenger.join(', ')}
            {t.cc_admin ? ' · Admin in Kopie' : ''}
          </p>
          <ul className="lt-mails">
            <MailZeile art="vorab" t={t} />
            <MailZeile art="kurz" t={t} />
          </ul>
          <div className="knopfreihe">
            {!t.vergangen && (
              <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => onBearbeiten(true)}>
                Bearbeiten
              </button>
            )}
            {!t.vergangen && (
              <button type="button" className="btn btn-sekundaer btn-klein" disabled={beschaeftigt} onClick={onPausieren}>
                {t.aktiv ? 'Mails pausieren' : 'Mails wieder aktivieren'}
              </button>
            )}
            <button type="button" className="btn btn-sekundaer btn-klein" disabled={beschaeftigt} onClick={onEntfernen}>
              Entfernen
            </button>
          </div>
        </>
      )}
    </li>
  )
}

/** /app/leitung/termine – nur Admin: Termine der Teammeetings anlegen, ändern, pausieren, entfernen und den Mail-Stand sehen. */
export default function Termine() {
  const l = useLaden(ladeTermine, 'termine')
  const [arbeitet, setArbeitet] = useState(false)
  const [meldung, setMeldung] = useState<Meldung>(null)
  const [bearbeiten, setBearbeiten] = useState<string | null>(null)
  const [zeigeVergangene, setZeigeVergangene] = useState(false)
  const d = l.daten
  if (!d) return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Termine werden geladen …" />

  async function tu(aktion: () => Promise<string>) {
    setArbeitet(true)
    setMeldung(null)
    try {
      setMeldung({ art: 'ok', text: await aktion() })
    } catch {
      setMeldung({ art: 'fehler', text: 'Das hat nicht geklappt. Bitte prüfe deine Eingaben und versuche es noch einmal.' })
    } finally {
      setArbeitet(false)
      l.neuLaden()
    }
  }

  const kommende = [...d.filter((t) => !t.vergangen)].sort((a, b) => (a.startet_am < b.startet_am ? -1 : 1))
  const vergangene = d.filter((t) => t.vergangen)
  const fehlgeschlagen = d.filter((t) => t.mails.some((m) => m.endgueltig_fehlgeschlagen))

  return (
    <>
      <Seitenkopf titel="Termine" text="Wann findet das Teammeeting statt? Zu jedem Termin gehen die Agenda und eine Erinnerung per Mail an die Verantwortlichen." />
      {l.fehler && <p className="hinweis hinweis-fehler">Die Termine konnten nicht aktualisiert werden.</p>}
      {meldung && (
        <p className={meldung.art === 'ok' ? 'hinweis' : 'hinweis hinweis-fehler'} role={meldung.art === 'ok' ? 'status' : 'alert'}>
          {meldung.text}
        </p>
      )}
      {fehlgeschlagen.length > 0 && (
        <p className="hinweis hinweis-fehler" role="alert">
          Bei {fehlgeschlagen.length === 1 ? 'einem Termin' : `${fehlgeschlagen.length} Terminen`} ist der Mail-Versand nach drei Versuchen fehlgeschlagen ({fehlgeschlagen.map((t) => terminText(t.startet_lokal)).join('; ')}). Prüfe die Einrichtung des Versands (Resend-Schlüssel, Absender-Domain).
        </p>
      )}

      <Abschnitt titel={`Kommende Termine (${kommende.length})`} hinweis="Die Mails prüft der Versand-Job alle 15 Minuten. Er ist erst aktiv, wenn der Admin ihn eingerichtet hat (siehe docs/agenda-termine.md).">
        {kommende.length === 0 ? (
          <p className="text-gedimmt">Es ist kein Termin eingetragen.</p>
        ) : (
          <ul className="lt-personen">
            {kommende.map((t) => (
              <TerminKarte
                key={t.id}
                t={t}
                beschaeftigt={arbeitet}
                bearbeiten={bearbeiten === t.id}
                onBearbeiten={(an) => setBearbeiten(an ? t.id : null)}
                onSpeichern={(e) => void tu(async () => { await speichereTermin(t.id, e); setBearbeiten(null); return 'Termin gespeichert.' })}
                onPausieren={() =>
                  void tu(async () => {
                    await speichereTermin(t.id, { startetLokal: t.startet_lokal, titel: t.titel, bezugsmonat: t.bezugsmonat ?? '', vorlaufTage: t.vorlauf_tage, vorlaufStunden: t.vorlauf_stunden, ccAdmin: t.cc_admin, aktiv: !t.aktiv })
                    return t.aktiv ? 'Die Mails zu diesem Termin sind pausiert.' : 'Die Mails zu diesem Termin sind wieder aktiv.'
                  })
                }
                onEntfernen={() => { if (window.confirm(`„${t.titel}“ am ${terminText(t.startet_lokal)} entfernen? Es werden keine Mails mehr dazu gesendet.`)) void tu(async () => { await entferneTermin(t.id); return 'Termin entfernt.' }) }}
              />
            ))}
          </ul>
        )}
      </Abschnitt>

      <Abschnitt titel="Neuen Termin anlegen">
        <TerminFormular key={`neu-${d.length}`} beschaeftigt={arbeitet} onSpeichern={(e) => void tu(async () => { await speichereTermin(null, e); return 'Termin angelegt.' })} />
      </Abschnitt>

      <Abschnitt titel="Serie anlegen" hinweis="Zum Beispiel das Teammeeting jeden Monat zur selben Uhrzeit.">
        <SerienFormular beschaeftigt={arbeitet} onSpeichern={(start, titel, rhythmus, anzahl, cc) => void tu(async () => { const n = await speichereTerminSerie(start, titel, rhythmus, anzahl, cc); return `${n} Termine angelegt.` })} />
      </Abschnitt>

      {vergangene.length > 0 && (
        <Abschnitt titel={`Vergangene Termine (${vergangene.length})`}>
          <div className="knopfreihe">
            <button type="button" className="btn btn-sekundaer btn-klein" aria-expanded={zeigeVergangene} onClick={() => setZeigeVergangene((z) => !z)}>
              {zeigeVergangene ? 'Ausblenden' : 'Anzeigen'}
            </button>
          </div>
          {zeigeVergangene && (
            <ul className="lt-personen">
              {vergangene.map((t) => (
                <TerminKarte key={t.id} t={t} beschaeftigt={arbeitet} bearbeiten={false} onBearbeiten={() => {}} onSpeichern={() => {}} onPausieren={() => {}} onEntfernen={() => { if (window.confirm(`„${t.titel}“ am ${terminText(t.startet_lokal)} aus der Liste entfernen?`)) void tu(async () => { await entferneTermin(t.id); return 'Termin entfernt.' }) }} />
              ))}
            </ul>
          )}
        </Abschnitt>
      )}
    </>
  )
}
