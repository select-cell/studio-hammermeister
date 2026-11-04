import { useState } from 'react'
import Abschnitt, { Leer } from '../../../components/auswertung/Abschnitt'
import LadeFehler from '../../../components/auswertung/LadeFehler'
import MonatsAuswahl from '../../../components/auswertung/MonatsAuswahl'
import Seitenkopf from '../../../components/auswertung/Seitenkopf'
import { ladeKommentarAuswertung } from '../../../lib/api'
import { fmt, vornameVon } from '../../../lib/auswertung'
import { prozent, woerterText, type KommentarAuswertung } from '../../../lib/kommentare'
import { monatName } from '../../../lib/monat'
import { useLaden } from '../../../lib/useLaden'

function Kachel({ label, wert, sub }: { label: string; wert: string; sub?: string }) {
  return (
    <div className="au-kachel">
      <span className="au-kachel-label">{label}</span>
      <span className="au-kachel-wert">{wert}</span>
      {sub && <span className="au-kachel-sub">{sub}</span>}
    </div>
  )
}

function Namen({ namen }: { namen: string[] }) {
  return (
    <ul className="lt-liste">
      {namen.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  )
}

function Tabelle({ d }: { d: KommentarAuswertung }) {
  return (
    <div className="au-tabelle-wrap">
      <table className="au-tabelle">
        <thead>
          <tr>
            <th scope="col" className="au-erste">
              Person
            </th>
            <th scope="col" className="au-zahl">
              Kommentare
            </th>
            <th scope="col" className="au-zahl">
              Quote
            </th>
            <th scope="col" className="au-zahl" title="Bewertung 4 oder 5: Kommentar ist Pflicht">
              Pflicht
            </th>
            <th scope="col" className="au-zahl" title="Bewertung 1 bis 3: Kommentar ist freiwillig">
              Freiwillig
            </th>
            <th scope="col" className="au-zahl" title="Freiwillige Kommentare ÷ Bewertungen 1 bis 3">
              Freiw.-Quote
            </th>
            <th scope="col" className="au-zahl" title="Durchschnittliche Länge eines Kommentars in Wörtern">
              Ø Wörter
            </th>
            <th scope="col" className="au-zahl" title="Anteil der Kommentare mit weniger als 5 Wörtern">
              Kurz
            </th>
            <th scope="col" className="au-zahl" title="Gleicher Text mehrfach geschrieben (Wiederholungen)">
              Doppelt
            </th>
            <th scope="col" className="au-zahl" title="Verhalten, bei denen nirgends ein Kommentar steht">
              Ohne Komm.
            </th>
          </tr>
        </thead>
        <tbody>
          {d.personen.map((p) => (
            <tr key={p.person_id} className={p.abgegeben ? undefined : 'lt-zeile-leer'}>
              <th scope="row" className="au-erste">
                {p.name}
              </th>
              {p.abgegeben ? (
                <>
                  <td className="au-zahl">
                    {p.kommentare} von {p.bewertungen}
                  </td>
                  <td className="au-zahl lt-zelle" style={{ ['--anteil' as string]: Math.round(((p.quote ?? 0) / 100) * 60) }}>
                    {prozent(p.quote)}
                  </td>
                  <td className="au-zahl">
                    {p.pflicht_mit_kommentar} von {p.pflicht}
                  </td>
                  <td className="au-zahl">
                    {p.freiwillig} von {p.freiwillig_moeglich}
                  </td>
                  <td className="au-zahl lt-zelle" style={{ ['--anteil' as string]: Math.round(((p.freiwillig_quote ?? 0) / 100) * 60) }}>
                    {prozent(p.freiwillig_quote)}
                  </td>
                  <td className="au-zahl">{woerterText(p.woerter_schnitt)}</td>
                  <td className="au-zahl">{prozent(p.kurz_anteil)}</td>
                  <td className="au-zahl">{p.duplikate}</td>
                  <td className="au-zahl">
                    {p.verhalten_ohne_kommentar} von {p.verhalten_gesamt}
                  </td>
                </>
              ) : (
                <td colSpan={9} className="text-gedimmt">
                  hat für diesen Monat nicht abgegeben
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Verlauf({ d }: { d: KommentarAuswertung }) {
  const personen = d.personen.filter((p) => p.verlauf.length > 0)
  if (d.monate.length < 2 || personen.length === 0) return <Leer text="Für einen Verlauf braucht es mindestens zwei Monate mit Abgaben." />
  return (
    <div className="au-tabelle-wrap">
      <table className="au-tabelle">
        <thead>
          <tr>
            <th scope="col" className="au-erste">
              Kommentar-Quote
            </th>
            {d.monate.map((m) => (
              <th key={m} scope="col" className="au-zahl">
                {monatName(m).replace(' 20', ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {personen.map((p) => (
            <tr key={p.person_id}>
              <th scope="row" className="au-erste" title={p.name}>
                {vornameVon(p.name)}
              </th>
              {d.monate.map((m) => {
                const v = p.verlauf.find((x) => x.monat === m)
                return (
                  <td key={m} className="au-zahl lt-zelle" style={{ ['--anteil' as string]: v?.quote == null ? 0 : Math.round((v.quote / 100) * 60) }}>
                    {v ? prozent(v.quote) : '–'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** /app/leitung/kommentare – wer schreibt Kommentare, wie ausführlich, und wer keine (nur Verantwortliche und Admin). */
export default function Kommentare() {
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const l = useLaden(() => ladeKommentarAuswertung(auswahl ?? undefined), auswahl ?? 'neuester')
  const d = l.daten
  if (!d) return <LadeFehler laedt={l.laedt} fehler={l.fehler} neuLaden={l.neuLaden} text="Kommentar-Auswertung wird geladen …" />
  const t = d.team

  return (
    <>
      <Seitenkopf
        titel="Kommentare"
        text={d.monat ? `Wer schreibt wie viel und wie ausführlich, im ${monatName(d.monat)}. Kommentartexte zeigt diese Seite nie.` : 'Hier erscheint die Auswertung, sobald die erste Umfrage abgegeben ist.'}
      >
        <MonatsAuswahl monate={d.monate} monat={d.monat} onWahl={setAuswahl} />
      </Seitenkopf>

      {d.konfig.eigene_werte_verborgen && (
        <p className="hinweis" role="note">
          Deine eigenen Werte sind ausgeblendet (Einstellung „eigene_analyse_nur_admin“). Der Plattformbetreiber sieht sie.
        </p>
      )}

      {l.fehler && (
        <p className="hinweis hinweis-fehler">
          Der Monat konnte nicht geladen werden.{' '}
          <button type="button" className="btn btn-sekundaer btn-klein" onClick={l.neuLaden}>
            Erneut versuchen
          </button>
        </p>
      )}

      {d.monate.length === 0 || !t ? (
        <Abschnitt titel="Noch keine Auswertung">
          <p className="text-gedimmt">Sobald die ersten Umfragen abgegeben sind, erscheinen hier die Kennzahlen zu den Kommentaren.</p>
        </Abschnitt>
      ) : (
        <div className={l.laedt ? 'au-laedt' : undefined} aria-busy={l.laedt}>
          <div className="au-kacheln">
            <Kachel label="Kommentar-Quote im Team" wert={prozent(t.quote)} sub={`${t.kommentare} Kommentare zu ${t.bewertungen} Bewertungen`} />
            <Kachel label="Freiwillige Quote" wert={prozent(t.freiwillig_quote)} sub={`${t.freiwillig} von ${t.freiwillig_moeglich} Bewertungen 1 bis 3`} />
            <Kachel label="Ø Länge" wert={`${woerterText(t.woerter_schnitt)} Wörter`} sub={`${prozent(t.kurz_anteil)} unter 5 Wörtern`} />
            <Kachel label="Pflicht erfüllt" wert={`${t.pflicht_mit_kommentar} von ${t.pflicht}`} sub={t.duplikate > 0 ? `${t.duplikate} Wiederholungen` : 'keine Wiederholungen'} />
          </div>

          <Abschnitt
            titel="Je Person"
            hinweis="Pflichtkommentare (Bewertung 4 oder 5) und freiwillige (Bewertung 1 bis 3) werden getrennt gezählt. Nur die freiwillige Quote sagt, wie gern jemand schreibt: Pflichtkommentare verzerren die Gesamtquote."
          >
            <Tabelle d={d} />
          </Abschnitt>

          <Abschnitt titel="Keine Kommentare im Monat" hinweis="Wer abgegeben, aber keinen einzigen Kommentar geschrieben hat, und wer gar nicht abgegeben hat.">
            {d.ohne_kommentare.length === 0 && d.nicht_abgegeben.length === 0 ? (
              <Leer text="Alle, die abgegeben haben, haben auch kommentiert." />
            ) : (
              <>
                {d.ohne_kommentare.length > 0 && (
                  <>
                    <h3 className="lt-unter">Ohne einen Kommentar</h3>
                    <Namen namen={d.ohne_kommentare} />
                  </>
                )}
                {d.nicht_abgegeben.length > 0 && (
                  <>
                    <h3 className="lt-unter">Nicht abgegeben</h3>
                    <Namen namen={d.nicht_abgegeben} />
                  </>
                )}
              </>
            )}
          </Abschnitt>

          <Abschnitt titel="Verlauf" hinweis={`Kommentar-Quote je Monat (Ø ${fmt(t.quote, 1)} % im gewählten Monat).`}>
            <Verlauf d={d} />
          </Abschnitt>
        </div>
      )}
    </>
  )
}
