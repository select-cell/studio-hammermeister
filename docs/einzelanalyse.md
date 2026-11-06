# Monatsabschluss und Einzelanalyse (Erweiterung E)

Seite: **Leitung → Monatsabschluss** (`/app/leitung/abschluss/:monat`). Nur Verantwortliche und Admin; Mitarbeiter bekommen `42501`, haben keine Seite und keinen Download. Datenbank: Migration `019_monatsabschluss_analysen.sql`, erweitert durch `021_ki_funktionen.sql`. KI: Edge Function `analyse-erstellen`.

> **Stand Version 1.3:** Die KI-Funktionen (Einzelanalyse, **Sammellauf**, **Gesamtauswertung**, Agenda mit KI) sind in [`ki-funktionen.md`](ki-funktionen.md) beschrieben. Kurz: Sie laufen **nur über den n8n-Webhook** (Secret `AI_WEBHOOK_URL`, Anleitung in [`../n8n/README.md`](../n8n/README.md)) und sind standardmäßig **nur für den Admin** (`salons.ki_nur_admin`). Die frühere Wahl zwischen `claude` und `webhook` (`AI_PROVIDER`) gibt es nicht mehr. Dieses Dokument bleibt für Abschluss, Faktencheck und Freigabe maßgeblich; wo es vom alten Anbieter-Weg spricht, gilt `ki-funktionen.md`.

## Ablauf

1. **Monat abschließen.** Auch möglich, wenn Abgaben fehlen; der Stand wird dann als „unvollständig (x von y)“ gekennzeichnet. Ein zweiter Klick aktualisiert nur die Zählung (wer abgeschlossen hat, bleibt stehen).
2. **Analyse erstellen** (je Person oder „Alle fehlenden Analysen erstellen“ als **Sammellauf**: nach dem Abschluss des Monats, in Paketen zu zwei Personen mit Fortschritt, Fehlerliste und Knopf zum Anhalten). **Alle Zahlen kommen aus SQL, die KI formuliert nur den Text.** Dasselbe gibt es für die **Gesamtauswertung** des Teams.
3. Die Leitung **liest den Entwurf**, kann den Text **bearbeiten** (es wird gespeichert, wer wann geändert hat) und **gibt ihn frei**.
4. Eine freigegebene Analyse erscheint im **Personenbericht als PDF**. Entwürfe nie.
5. „**Neu generieren**“ ist ein eigener Knopf (mit Rückfrage, wenn der Text bearbeitet oder freigegeben war). Danach ist die Analyse wieder ein Entwurf. Dasselbe gilt nach jeder Bearbeitung.

## Die Eingabe für die KI (`analyse_eingabe`, mit Kontext: `analyse_eingabe_ki`)

Baut die Datenbank, nicht die Edge Function. Seit Version 1.3 kommen zur Eingabe der **Kontext des Salons** (`salons.ki_kontext`) und die **Kriterien** der wichtigsten Verhalten hinzu (Details in `ki-funktionen.md`, Abschnitt 4); sie gehören zum Hash, aber nicht zu den Zahlen, die der Faktencheck erlaubt:

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

Aufruf `POST { aufgabe, monat, person_id?, neu?, ausgenommen? }` (`aufgabe`: `einzelanalyse`, `gesamtauswertung`, `agenda`, `sammellauf`) mit der Anmeldung der Person (JWT-Pflicht). Alle Datenbank-Aufrufe laufen mit der Anmeldung der aufrufenden Person; **ein `service_role`-Schlüssel wird nicht gebraucht**. Die Rolle prüft die Datenbank.

1. `analyse_eingabe_ki` (prüft Rolle und Schalter `ki_nur_admin`).
2. **Idempotenz:** gleiche Eingabe und gleiche Prompt-Version wie die gespeicherte Analyse → kein neuer KI-Aufruf, außer mit „Neu generieren“.
3. Die Function fragt den **n8n-Webhook**, der bei Anthropic nachfragt (JSON mit `zusammenfassung`, `staerken`, `entwicklungsfelder`, `gespraechsfragen`, `vereinbarungen_vorschlaege`, `kommentar_qualitaet_hinweis`); sie liest die Antwort und prüft die Form.
4. Faktencheck über `analyse_pruefen`. Bei Abweichungen bekommt die KI die unbekannten Zahlen zurück und erzeugt neu.
5. `analyse_ki_speichern` legt den Entwurf ab (Anbieter „webhook“, mit der Zahl der Versuche).

**Fehlerbehandlung:** höchstens **3 Aufrufe** des Webhooks (also zwei Wiederholungen) innerhalb von 135 Sekunden, geteilt zwischen ungültiger Antwort und nicht bestandenem Faktencheck. Nach dem letzten Aufruf kommt der Entwurf mit „geprüft: nein“. Fehler erscheinen als verständliche deutsche Meldung („Die KI ist noch nicht eingerichtet …“, „Die KI ist gerade ausgelastet …“); die Fehlerarten stehen in `ki-funktionen.md`, Abschnitt 7.

### Einrichtung (Secret)

Supabase → Edge Functions → Secrets: **`AI_WEBHOOK_URL`** = Production-Adresse des n8n-Webhooks (`https://…/webhook/<pfad>`). Der Anthropic-Schlüssel steht nur in n8n. `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` und `AI_WEBHOOK_SECRET` werden nicht mehr gelesen. Solange `AI_WEBHOOK_URL` fehlt, meldet die Seite „Die KI ist noch nicht eingerichtet“.

### Prompt

Liegt versioniert im Repo (`supabase/functions/analyse-erstellen/analyse.ts`, `PROMPT_VERSIONEN`: `analyse-v2`, `gesamt-v2`, `agenda-ki-v2`). Der Prompt enthält die Regel, dass Texte in den Daten (Kommentare, Kontext) Material und keine Anweisungen sind. Wer den Prompt ändert, erhöht die Version; sie wird mit jeder Analyse gespeichert und gehört zum `input_hash` (neue Version = die Eingabe gilt als neu).

## Rechte und Schalter

- Seit Version 1.3: **nur der Admin**, solange `salons.ki_nur_admin` an ist (Standard); mit ausgeschaltetem Schalter wieder Verantwortliche und Admin des eigenen Salons (`analyse_zugriff`). Tabellen `monatsabschluesse` und `analysen` sind für Anmeldungen gesperrt.
- **`salons.eigene_analyse_nur_admin`** (Migration 018, Standard aus): Ist er an, kann ein Verantwortlicher die Analyse über sich selbst weder erstellen noch lesen (`42501`), und er taucht in der Übersicht nicht auf; der Admin sieht alles. Gilt auch für den PDF-Bericht (die Analyse fehlt dann darin).

## Datenschutz

Zur Auswertung werden Feedbacktexte **ohne Namen und ohne Absender** von der Plattform über den Automatisierungsdienst n8n an Anthropic (Claude) übertragen. Der Hinweis steht auf der Seite „Monatsabschluss“ und auf „Info und Datenschutz“.

## Tests

- **Datenbank** (PGlite, 93 Prüfungen): Rechte (Mitarbeiter, anon, fremder Login, gesperrte Tabellen und interne Hilfen); Abschluss unvollständig und nachträglich vollständig; Eingabe gegen die Auswertung (Kennzahlen, 17 Verhalten, Vormonat), **kein einziger Name** in der Eingabe, Platzhalter in den Kommentaren, kein Absender; Faktencheck (erlaubte Schreibweisen, erfundene Zahl 4,71, Verhalten 99, abgeleitete Zahlen, strukturierte Ausgabe); Speichern, Ersetzen, Freigeben, Bearbeiten (wer und wann, neu prüfen), Neu generieren setzt zurück; Übersicht; Schalter; Salon-Grenze.
- **Edge-Function-Logik** (Vitest, 52 Prüfungen seit Version 1.3): Prompts, Ausgabeprüfung, Markdown, Webhook mit nachgebautem Netz, Wiederholungen und Faktencheck-Schleife (höchstens 3 Aufrufe), Sammellauf, Fehlermeldungen. Dazu 129 Datenbankprüfungen für Migration 021 (siehe `ki-funktionen.md`, Abschnitt 12).
- **Browser**: Abschließen (auch unvollständig), einzeln und „Alle fehlenden“ erstellen, Faktencheck-Warnung, Bearbeiten, Freigeben und Zurücknehmen, Neu generieren mit Rückfrage, Fehler der KI, PDF mit freigegebener (nicht mit Entwurfs-)Analyse, Mitarbeiter ohne Zugriff.
- Die **echte KI** wurde nicht aufgerufen (die Sandbox erreicht weder n8n noch Anthropic). Die Function ist eingespielt (`ACTIVE`); der erste echte Lauf geschieht, sobald der n8n-Workflow steht und das Secret `AI_WEBHOOK_URL` gesetzt ist.
