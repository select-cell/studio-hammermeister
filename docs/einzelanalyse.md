# Monatsabschluss und Einzelanalyse (Erweiterung E)

Seite: **Leitung → Monatsabschluss** (`/app/leitung/abschluss/:monat`). Nur Verantwortliche und Admin; Mitarbeiter bekommen `42501`, haben keine Seite und keinen Download. Datenbank: Migration `019_monatsabschluss_analysen.sql`. KI: Edge Function `analyse-erstellen`.

## Ablauf

1. **Monat abschließen.** Auch möglich, wenn Abgaben fehlen; der Stand wird dann als „unvollständig (x von y)“ gekennzeichnet. Ein zweiter Klick aktualisiert nur die Zählung (wer abgeschlossen hat, bleibt stehen).
2. **Analyse erstellen** (je Person oder „Alle fehlenden“). **Alle Zahlen kommen aus SQL, die KI formuliert nur den Text.**
3. Die Leitung **liest den Entwurf**, kann den Text **bearbeiten** (es wird gespeichert, wer wann geändert hat) und **gibt ihn frei**.
4. Eine freigegebene Analyse erscheint im **Personenbericht als PDF**. Entwürfe nie.
5. „**Neu generieren**“ ist ein eigener Knopf (mit Rückfrage, wenn der Text bearbeitet oder freigegeben war). Danach ist die Analyse wieder ein Entwurf. Dasselbe gilt nach jeder Bearbeitung.

## Die Eingabe für die KI (`analyse_eingabe`)

Baut die Datenbank, nicht die Edge Function:

- Kennzahlen der Person: Selbstbild, Fremdbild, Differenz, Stufe und Einordnung nach den Schwellen des Salons, Vormonat; je Verhalten dasselbe plus Veränderung zum Vormonat.
- Kommentare der Kollegen **ohne Absender** und eigene Kommentare, dazu Kennzahlen zu den erhaltenen Kommentaren.
- **Keine Namen:** Die bewertete Person heißt „die bewertete Person“, alle anderen „Kollege A“, „Kollege B“ … (vollständiger Name, Vorname und Nachname, ohne Rücksicht auf Groß-/Kleinschreibung). Es gibt weder ein Absenderfeld noch Kennungen oder E-Mail-Adressen.
- Dazu ein Hash der Eingabe. Die Edge Function bildet daraus mit der Prompt-Version den `input_hash`.

## Faktencheck (in der Datenbank)

`analyse_faktencheck` vergleicht **jede Zahl im Text und in der strukturierten Ausgabe** mit den Zahlen der Eingabe. Schreibweisen wie 3,5, 3.5 und 3,50 sind gleich; Listennummern („1. “ am Zeilenanfang“) zählen nicht; erlaubt sind außerdem 1 bis 5 (die Bewertungsskala). Alles andere (erfundene, gerundete, abgeleitete Zahlen wie Prozentwerte) ist „unbekannt“.

- `analyse_speichern` und `analyse_bearbeiten` ermitteln **`geprueft` selbst**. Die Edge Function kann es nicht fälschen, und auch von Hand eingetragene falsche Zahlen werden erkannt.
- Bei einer Abweichung zeigt die Oberfläche „Faktencheck nicht bestanden: 4,71 steht nicht in den Daten“ und kennzeichnet die Analyse als „Entwurf, Zahlen nicht geprüft“. Freigeben bleibt möglich, die Leitung entscheidet.
- Bekannte Grenze: Eine erfundene Zahl, die zufällig mit einer Zahl der Eingabe übereinstimmt (etwa einer Verhaltensnummer), fällt nicht auf. Deshalb liest die Leitung jeden Entwurf, bevor er freigegeben wird.

## Edge Function `analyse-erstellen`

Aufruf `POST { person_id, monat, neu? }` mit der Anmeldung der Leitung (JWT-Pflicht). Alle Datenbank-Aufrufe laufen mit der Anmeldung der aufrufenden Person; **ein `service_role`-Schlüssel wird nicht gebraucht**. Die Rolle prüft die Datenbank.

1. `analyse_eingabe` (prüft die Rolle).
2. **Idempotenz:** gleiche Eingabe und gleiche Prompt-Version wie die gespeicherte Analyse → kein neuer KI-Aufruf, außer mit „Neu generieren“.
3. Anbieter formuliert den Text (JSON mit `staerken`, `entwicklungsfelder`, `auffaellige_differenzen`, `kommentar_themen`, `kommentar_qualitaet_hinweis`, `empfehlung`, `fokus_verhalten`); die Funktion prüft Form und Verhaltensnummern.
4. Faktencheck über `analyse_pruefen`. Bei Abweichungen bekommt die KI die unbekannten Zahlen zurück und erzeugt neu.
5. `analyse_speichern` legt den Entwurf ab.

**Fehlerbehandlung:** höchstens **3 Aufrufe** beim Anbieter (also zwei Wiederholungen), geteilt zwischen vorübergehenden Fehlern (Überlastung, Serverfehler, Zeitüberschreitung nach 60 s, ungültige Antwort) und nicht bestandenem Faktencheck. Nach dem letzten Aufruf kommt der Entwurf mit „geprüft: nein“. Fehler erscheinen als verständliche deutsche Meldung („Die KI ist noch nicht eingerichtet …“, „Der KI-Anbieter ist gerade überlastet …“).

### Anbieter umschalten (Secrets)

Supabase → Edge Functions → Secrets. Der Anbieter lässt sich ohne Code-Änderung wechseln:

| Secret | Bedeutung |
|---|---|
| `AI_PROVIDER` | `claude` oder `webhook` |
| `ANTHROPIC_API_KEY` | Schlüssel für `claude` |
| `ANTHROPIC_MODEL` | optional; Standard `claude-sonnet-5-5` |
| `AI_WEBHOOK_URL` | Adresse des bestehenden n8n-Webhooks für `webhook` (erwartet `{ message, context }`) |
| `AI_WEBHOOK_SECRET` | optional, wird als `Authorization: Bearer …` mitgeschickt |

Solange `AI_PROVIDER` fehlt, meldet die Seite „Die KI ist noch nicht eingerichtet“.

### Prompt

Liegt versioniert im Repo (`supabase/functions/analyse-erstellen/analyse.ts`, `PROMPT_VERSION = 'person-v1'`). Wer den Prompt ändert, erhöht die Version; sie wird mit jeder Analyse gespeichert und gehört zum `input_hash` (neue Version = die Eingabe gilt als neu).

## Rechte und Schalter

- Nur Verantwortliche und Admin des eigenen Salons (`analyse_zugriff`). Tabellen `monatsabschluesse` und `analysen` sind für Anmeldungen gesperrt.
- **`salons.eigene_analyse_nur_admin`** (Migration 018, Standard aus): Ist er an, kann ein Verantwortlicher die Analyse über sich selbst weder erstellen noch lesen (`42501`), und er taucht in der Übersicht nicht auf; der Admin sieht alles. Gilt auch für den PDF-Bericht (die Analyse fehlt dann darin).

## Datenschutz

Zur Auswertung werden Feedbacktexte an den eingestellten KI-Anbieter übertragen, **ohne Namen und ohne Absender**. Der Hinweis steht auf der Seite „Monatsabschluss“ und auf „Info und Datenschutz“.

## Tests

- **Datenbank** (PGlite, 93 Prüfungen): Rechte (Mitarbeiter, anon, fremder Login, gesperrte Tabellen und interne Hilfen); Abschluss unvollständig und nachträglich vollständig; Eingabe gegen die Auswertung (Kennzahlen, 17 Verhalten, Vormonat), **kein einziger Name** in der Eingabe, Platzhalter in den Kommentaren, kein Absender; Faktencheck (erlaubte Schreibweisen, erfundene Zahl 4,71, Verhalten 99, abgeleitete Zahlen, strukturierte Ausgabe); Speichern, Ersetzen, Freigeben, Bearbeiten (wer und wann, neu prüfen), Neu generieren setzt zurück; Übersicht; Schalter; Salon-Grenze.
- **Edge-Function-Logik** (Vitest, 21 Prüfungen): Prompt, Ausgabeprüfung, Markdown, beide Anbieter mit nachgebautem Netz, Wiederholungen und Faktencheck-Schleife (höchstens 3 Aufrufe), Fehlermeldungen, Hash.
- **Browser**: Abschließen (auch unvollständig), einzeln und „Alle fehlenden“ erstellen, Faktencheck-Warnung, Bearbeiten, Freigeben und Zurücknehmen, Neu generieren mit Rückfrage, Fehler der KI, PDF mit freigegebener (nicht mit Entwurfs-)Analyse, Mitarbeiter ohne Zugriff.
- Die **echte KI** wurde nicht aufgerufen (kein Schlüssel hinterlegt, die Sandbox erreicht Supabase und Anthropic nicht). Die Funktion ist eingespielt (`ACTIVE`); der erste echte Lauf geschieht, sobald die Secrets gesetzt sind.
