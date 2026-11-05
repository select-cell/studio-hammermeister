# PDF-Export (Erweiterung C)

Berichte als PDF gibt es **nur für Verantwortliche und Admin**. Mitarbeiter sehen keinen Knopf, haben keine PDF-Route, und die Datenfunktionen lehnen sie mit `42501` ab. Der Schutz liegt in der Datenbank (Migration `017_pdf_export.sql`); das Frontend rendert nur.

## Berichte

**Monatsbericht** (Knopf „Monatsbericht als PDF“ im Team-Dashboard, Ansicht „Team“): Beteiligung (wer hat abgegeben, pünktlich, verspätet, offen, überfällig), Kennzahlen Selbstbild, Fremdbild, Differenz mit Einordnung und Stufe nach den Schwellen des Salons, Ergebnis je Verhalten (nach Säulen gruppiert, mit Balken), Stärken und Entwicklungsfelder, Kommentar-Quote im Team (Pflicht- und freiwillige Kommentare getrennt) und die aktive Ausfüllzeit (Median). Keine Rangliste einzelner Personen.

**Personenbericht** (Knopf „Personenbericht als PDF“ in der Personenansicht des Dashboards und auf der Seite eines Mitglieds): Kennzahlen, Entwicklung zum Vormonat (Tabelle) und Verlauf (Diagramm), Selbst- und Fremdbild je Verhalten mit Fremdbild des Vormonats, **Kommentare der Kollegen ohne Absender**, eigene Kommentare, Entwicklung des Monats (Nennungen und Begründungen ohne Absender) sowie Platz für Entwicklungsfrage, Vereinbarungen und Unterschriften.

Dateiname: `<salon>_<YYYY-MM>_<monatsbericht|person-name>.pdf`, z. B. `mein-salon_2026-11_max-mustermann.pdf` (Umlaute werden zu ae, oe, ue, ss).

## Datenbank

| Objekt | Zweck |
|---|---|
| `pdf_monatsbericht(monat)` | Daten fürs Monats-PDF: `team_dashboard`, `abgabe_status`, Kommentar-Zahlen, Median der Zeit |
| `pdf_personenbericht(person, monat)` | Daten fürs Personen-PDF aus `auswertung_person(…, ohne Absender)` |
| `pdf_export_protokoll(limit)` | das Protokoll, nur Admin |
| `pdf_export_log` | Tabelle des Protokolls (gesperrt, nur über die Funktion lesbar) |

- Rolle: `ist_leitung()`, sonst `42501`. Salon-Grenze: Es zählt der Salon der anfragenden Person (der Admin wertet den Salon dieser Instanz aus). Eine Person eines anderen Salons oder eine unbekannte Person ergibt dieselbe Antwort `42501`, so lässt sich nichts erraten. Für einen Monat ohne Abgaben antwortet die Funktion mit `22023`.
- Die Zahlen kommen aus denselben Funktionen wie am Bildschirm; im PDF steht nichts, was die Leitung nicht auch in der Plattform sieht.
- **Protokoll:** Jeder erfolgreiche Abruf der Berichtsdaten schreibt einen Eintrag (Salon, Login, Name, Art, Person, Monat, Zeit). Abgelehnte Aufrufe schreiben nichts. Der Admin sieht das Protokoll unten auf „Info und Datenschutz“.

## Erzeugung im Browser

`src/pdf/` mit `@react-pdf/renderer`. Der Code wird erst beim Klick geladen (dynamischer Import in `PdfKnopf`), auch für Leitung nicht vorher; Mitarbeiter laden ihn nie.

- **Schriften** DM Sans (400, 500) und DM Serif Display werden mit der Plattform ausgeliefert (`@fontsource`, WOFF-Dateien, im PDF eingebettet). Kein CDN. Umlaute, ß, „ “, – und − sind im Latin-Paket enthalten.
- **Diagramme** sind Vektoren (SVG-Elemente von react-pdf): Balkenpaare und Linien, keine Screenshots.
- **Logo** (`src/assets/brand/…`, siehe README) kommt in den Seitenkopf. react-pdf zeigt kein SVG; deshalb wird die Datei im Browser vierfach vergrößert in ein PNG gezeichnet. Fehlt das Logo, steht der Salonname als Text da.
- Seitenkopf mit Logo, Fußzeile „Vertraulich – nur für Verantwortliche“, Erstellungsdatum und „Seite x von y“. A4 hochkant.
- Hinweis zu react-pdf: Ein `lineHeight` an Seite oder Inhalt wird vererbt und lässt die Fußzeile mit Seitenzahl verschwinden. Deshalb steht er nur an einzelnen Überschriften.

## Tests

- **Datenbank** (PGlite): Mitarbeiter, Login ohne Person und anon bekommen `42501` bzw. „gesperrt“; Protokoll-Tabelle nicht lesbar und nicht beschreibbar; Berichtsinhalt gleich den Bildschirm-Funktionen; Kommentar-Zahlen stimmen mit der Handrechnung; nirgends ein Absender; Vormonat; Salon-Grenze mit einem zweiten Salon; ein Protokoll-Eintrag je Abruf, keiner bei Ablehnung; Protokoll nur für den Admin.
- **Browser** (Playwright, Chromium): Die PDFs werden wirklich erzeugt und mit `pdfinfo`, `pdffonts`, `pdftotext` und `pdftoppm` geprüft: A4, Seitenzahl, eingebettete Schriften und keine Ersatzschrift, Umlaute, Minuszeichen, Fußzeile und Seitenzahl auf jeder Seite, alle Kommentare vorhanden, Dateiname. Dazu: Mitarbeiter ohne Knopf und ohne Aufruf, keine Anfragen an Fremdserver, Fehlerfall in der Oberfläche, Protokoll nur beim Admin.
