# Version 1.2: alle Änderungen (zum Übertragen auf andere Plattformen)

Diese Datei beschreibt, was die Salon-Plattform von Hammermeister mit Version 1.2 dazubekommen hat, so geschrieben, dass sich jede Erweiterung auf eine andere Plattform mit gleichem Grundgerüst übertragen lässt. Sie ist kein Änderungsprotokoll im Code-Sinn, sondern ein **Bauauftrag rückwärts**: Ziel, Regeln, Daten, Rechte, Oberfläche, Abnahme.

**Geltungsbereich:** Version 1.2 sind die Erweiterungen **A bis F** aus dem Bauauftrag „Plattform-Erweiterungen“ (Migrationen 016 bis 020). Die Teamvorstellung mit Profilen und Fotos (Abschnitt 2 des Bauauftrags) wurde auf Wunsch **nicht gebaut**; ihre Spuren (Migrationen 014 und 015) sind stillgelegt und für andere Plattformen nicht zu übernehmen.

Ausführliche Einzeldokumente liegen im Repo: [`zeiterfassung.md`](zeiterfassung.md), [`pdf-export.md`](pdf-export.md), [`kommentar-auswertung.md`](kommentar-auswertung.md), [`einzelanalyse.md`](einzelanalyse.md), [`agenda-termine.md`](agenda-termine.md). Hier steht die Gesamtsicht.

---

## 1. Überblick

| | Erweiterung | Kurz | Migration | Edge Function | Sichtbar für |
|---|---|---|---|---|---|
| A | Marke, Schriften, Info-Seite | Logo und Farben an einer Stelle, Schriften selbst gehostet, Seite „Info und Datenschutz“ | – | – | alle |
| B | Zeiterfassung | aktive Ausfüllzeit der Umfrage, Kennzeichen, Auswertung | 016 | – | Mitarbeiter: eigene Zeit; Leitung: Auswertung |
| C | PDF-Export | Monats- und Personenbericht, Export-Protokoll | 017 | – | Leitung |
| D | Kommentar-Auswertung | wer schreibt Kommentare, wie ausführlich, wer keine | 018 | – | Leitung |
| E | Monatsabschluss und Einzelanalyse | Monat abschließen, KI-Analyse je Person mit Faktencheck | 019 | `analyse-erstellen` | Leitung |
| F | Fokus, Agenda, Termine, Mailversand | Agenda fürs Teammeeting, Termine, Mails an Verantwortliche | 020 | `agenda-versand` | Leitung; Termine nur Admin |

Dazu kommen kleine Querschnittsänderungen: ein neuer Menüpunkt **Leitung** mit Unter-Navigation, die Migration `010` räumt jetzt auch Zeit-Sitzungen ab, und alle Texte kommen **ohne Gendern** aus (Wunsch des Auftraggebers).

### Reihenfolge und Abhängigkeiten

```
A (Marke)  ──►  C (PDF braucht das Logo)
B (Zeit)   ──►  C (Monatsbericht zeigt die Ausfüllzeit)
D (Kommentare) ─► C (Monatsbericht zeigt „Kommentare je Person“)
E (Abschluss, Analyse) ◄── D (Schalter eigene_analyse_nur_admin) ; E ─► C (freigegebene Analyse im Personenbericht)
F (Agenda) ◄── E (Abschluss und Analysen fließen in den Hinweis „Stand unvollständig“) ; F ─► C (freigegebene Agenda im Monatsbericht)
```

Empfohlene Reihenfolge beim Übertragen: **A, B, C, D, E, F**. Jede Phase hat eigene Prüfungen; die nächste beginnt erst, wenn die vorige besteht.

---

## 2. Voraussetzungen in der Zielplattform

Die Erweiterungen setzen ein Grundgerüst voraus. Fehlt etwas davon, muss es zuerst gebaut oder in den Migrationen umbenannt werden.

**Technik:** React 18, Vite 5, TypeScript, Supabase (Postgres, Auth, Edge Functions), Netlify. Bibliotheken: `@react-pdf/renderer` (PDF im Browser), `recharts` (Diagramme), `@fontsource/dm-sans` und `@fontsource/dm-serif-display`.

**Rollenmodell:** Tabelle `personen` mit `rolle` (`mitarbeiter`, `verantwortlicher`, `admin`) und `nimmt_an_teamumfrage` (zwei unabhängige Merkmale: Teilnehmer und Leitung). Tabelle `salons` (Mandant) mit Schwellen (`schwelle_ausgewogen`, `schwelle_niedrig`, `schwelle_hoch`), `start_monat`, `reminder_tage_nach_frist`.

**Funktionen, auf die die Migrationen zugreifen** (Namen bei Bedarf anpassen):

| Funktion | Zweck |
|---|---|
| `ist_leitung()`, `ist_admin()` | Rolle der anfragenden Person aus `auth.uid()` |
| `auswertung_salon_id()` | Salon der Anfrage (Admin: erster Salon der Instanz) |
| `team_dashboard(monat)`, `abgabe_status(monat)`, `auswertung_person(person, von, bis, mit_absender)` | Zahlen der Auswertungen; die neuen Funktionen **verwenden dieselben Quellen** wie die Bildschirme |
| `umfrage_einreichen_v2(payload)` | Abgabe der Umfrage (Zeiterfassung baut `v3` darum herum) |
| Tabellen `umfrage_abgaben`, `umfrage_bewertungen`, `verhalten`, `umfrage_rituale` | Rohdaten und Inhalte; **für Anmeldungen gesperrt** |

**Grundregeln des Projekts** (gelten für alles Neue, bitte übernehmen):

1. **Sicherheit liegt in der Datenbank**, nicht im Frontend. Rohdaten-Tabellen sind für `anon` und `authenticated` gesperrt (`revoke all`, RLS an, keine Policy). Zugriff nur über `security definer`-Funktionen mit Rollenprüfung und `set search_path = public`. Nicht berechtigt: Fehlercode `42501`; ungültige Eingabe: `22023`.
2. **Berechnungen stehen in SQL**, nicht im Frontend. Schwellen und Grenzwerte kommen aus `salons`, nicht aus dem Code.
3. **Migrationen sind nummeriert, idempotent und ohne `DROP` und ohne `DELETE`** (`create or replace`, `if not exists`). Das Supabase-Werkzeug (MCP) wartet bei `DROP` und `DELETE` auf eine Bestätigung und läuft in ein Zeitlimit.
4. **Salon-Grenze:** Jede Funktion rechnet nur mit dem Salon der anfragenden Person. Eine fremde oder unbekannte Person bekommt dieselbe Antwort (`42501`), so lässt sich nichts erraten.
5. **Daten werden nicht verworfen**, wenn sie auffällig sind: Sie werden gekennzeichnet (Zeiterfassung), gezählt oder als Entwurf gespeichert.
6. **Keine festen Farben in Komponenten** (Design-Tokens in `tokens.css`, Nachtmodus wechselt mit). Ausnahmen nur für Dinge, die in beiden Darstellungen gleich bleiben (PDF, Mail).
7. Sprache der Oberfläche, Kommentare und Commit-Texte: Deutsch, Du-Form, **ohne Gendern**.

---

## 3. Erweiterung A: Marke, Schriften, Info-Seite

**Ziel:** Das Logo an genau einer Stelle austauschbar, keine Anfragen an Fremdserver, ein fester Ort für Datenschutz-Hinweise.

- **Marke zentral:** `src/config/brand.ts` (Name, Logo-Dateien, Farben) und die Komponente `BrandLogo`. Die Dateien liegen in `src/assets/brand/<salon-slug>/`: `logo.svg` (hell, Pflicht), `logo-dark.svg` (Nachtmodus, optional; fehlt sie, gilt die helle), `favicon.svg`. Auch `.png` und `.webp` sind erlaubt. Austausch = Dateien ersetzen und neu bauen, **keine Code-Änderung**. Höhe fest (Kopfzeile 28 px, Anmeldeseite 40 px), Breite folgt dem Seitenverhältnis, nichts springt. Die Kopfzeile bleibt auch mit breitem Logo einzeilig.
- **Feste Farbwerte fürs PDF** stehen ebenfalls in `brand.ts` (`pdfFarben`), weil das PDF keine CSS-Variablen kennt. Es sind dieselben Werte wie die helle Palette in `tokens.css`.
- **Schriften selbst gehostet:** DM Sans (400, 500) und DM Serif Display über `@fontsource`. Keine Anfragen an Google Fonts oder ein CDN.
- **Info-Seite** `/app/info` (Link in der Fußzeile): „Anmeldung“, „Kommentare in der Umfrage“, „Auswertung mit KI“, „Agenda und Mails“, „Ausfüllzeit der Umfrage“; der Admin sieht zusätzlich das Export-Protokoll. **Jede Erweiterung, die Daten anders nutzt, ergänzt hier einen Absatz.**

**Anpassen für eine andere Plattform:** `SALON_SLUG` und `SALON_NAME` in `brand.ts`, Logo-Dateien, `pdfFarben`, ggf. Schriften (dann auch in `src/pdf/schriften.ts`).

**Abnahme:** Logo-Datei tauschen, neu bauen: Kopfzeile, Anmeldeseite, Fehlerseiten und PDF zeigen das neue Logo. Im Netzwerk-Tab keine Anfrage an `fonts.googleapis.com`.

---

## 4. Erweiterung B: Zeiterfassung der Umfrage (Migration 016)

**Ziel:** Messen, wie lange jemand die Umfrage wirklich bearbeitet, ohne dass Pausen, andere Tabs, ein gesperrter Bildschirm oder eine verstellte Geräteuhr das Ergebnis verfälschen.

**Regeln**

- **Aktiv** heißt: Seite sichtbar **und** in den letzten 45 Sekunden eine Eingabe (Tippen, Klicken, Mausbewegung, Scrollen, laufendes Video). Die Rückkehr in den Tab ist keine Eingabe.
- **Die Serveruhr zählt.** Start, Herzschläge und Abgabe stempelt die Datenbank. Das Gerät liefert nur Zählerstände aus `performance.now()` (nie aus `Date`), die der Server deckelt.
- **Deckelung eines Herzschlags:** nie weniger als bisher; höchstens die echte Serverzeit seit dem letzten Herzschlag plus 10 s Toleranz mehr; insgesamt höchstens die Zeit seit dem Start. Schrittzeiten wachsen zusammen nie mehr als die aktive Zeit.
- **Herzschlag** alle 30 s und bei jedem Schrittwechsel; beim Ausblenden oder Schließen sofort per `fetch(..., { keepalive: true })`. (`sendBeacon` geht nicht: es kann keine Anmeldung mitschicken.) Ohne Verbindung zählt der Browser weiter und holt die Sitzung nach; die Umfrage hängt nie an der Zeiterfassung.
- **Nichts wird verworfen.** Auffällige Sitzungen bekommen Kennzeichen und zählen dann nicht in Median und Spanne, bleiben aber sichtbar.

**Kennzeichen** (Schwellen in `salons.zeit_*`, ohne Code änderbar)

| Kennzeichen | Wann | Wirkung |
|---|---|---|
| `zu_schnell` | aktive Zeit < Zahl der Verhalten × 5 s | zählt nicht |
| `sehr_lang` | Gesamtdauer > 4 Stunden | zählt nicht |
| `viele_pausen` | aktiv ÷ gesamt < 0,30 | Hinweis |
| `wiederaufgenommen` | nach Neuladen oder auf anderem Gerät fortgesetzt | Hinweis |
| `heartbeat_luecke` | über 3 Minuten ohne Herzschlag | Hinweis |
| `neu_begonnen` | mit „Neu beginnen“ abgebrochen | Sitzung beendet |
| `ohne_sitzung` | abgegeben ohne gestartete Sitzung | keine geprüfte Zeit (Geräteuhr wird bewusst nicht übernommen) |

**Datenbank:** Tabellen `umfrage_sitzungen`, `umfrage_schrittzeiten` (gesperrt); Funktionen `umfrage_starten(monat, neu)`, `umfrage_heartbeat(sitzung, aktive_sek, schritte)`, `umfrage_einreichen_v3(payload, sitzung, aktive_sek, schritte)` (ruft `v2` und schließt die Sitzung), `zeit_auswertung(monat)` (nur Leitung), interne Hilfe `sitzung_buchen()`; Spalten `salons.zeit_*`. Das alte Feld `ausfuelldauer_sek` wird mit der aktiven Zeit gefüllt, wenn sie gültig ist.

**Oberfläche:** Mitarbeiter sehen nur die **eigene** aktive Zeit am Ende („ausgefüllt in X Min“), keine Kennzeichen. Die Leitung sieht im Team-Dashboard den Abschnitt „Ausfüllzeit“: Median und Spanne, Personenliste mit Kennzeichen, Zeit je Verhalten als Balken und aufklappbare Heatmap. Hinweis für alle auf „Info und Datenschutz“.

**Dateien:** `src/lib/zeitmesser.ts` (reine Logik, Uhr wird übergeben), `src/lib/zeiterfassung.ts` (Seite und Server), `src/lib/zeit.ts`, `src/components/auswertung/ZeitAbschnitt.tsx`.

**Beim Einspielen beachten:** `umfrage_einreichen_v2` bleibt zunächst aufrufbar, damit die alte Plattform weiter abgibt. **Sobald die neue Version online ist, `v2` für Anmeldungen sperren** (eigene Migration), sonst lässt sich die Zeiterfassung umgehen. Wer bei der Umstellung mitten in der Umfrage ist, kann einmalig `zu_schnell` bekommen.

**Abnahme:** 120 s aktiv = 120 ± 2 s; 60 s verborgen zählen nicht; 90 s ohne Eingabe = 45 s; Neuladen setzt dieselbe Sitzung fort; Geräteuhr +2 h ändert nichts; aufgeblähter Herzschlag wird gekappt.

---

## 5. Erweiterung C: PDF-Export (Migration 017)

**Ziel:** Monats- und Personenbericht als PDF, **nur für Verantwortliche und Admin**.

- **Monatsbericht:** Beteiligung, Kennzahlen (Selbstbild, Fremdbild, Differenz, Stufe nach den Schwellen), Ergebnis je Verhalten (nach Säulen gruppiert, mit Balken), Stärken und Entwicklungsfelder, Kommentar-Quote und Ausfüllzeit (Median). **Keine Rangliste einzelner Personen.** Danach, wenn vorhanden: Abschnitt „Kommentare je Person“ (D) und die **freigegebene** Agenda (F).
- **Personenbericht:** Kennzahlen, Entwicklung zum Vormonat und Verlauf, Selbst- und Fremdbild je Verhalten, **Kommentare der Kollegen ohne Absender**, eigene Kommentare, Entwicklung des Monats (ohne Absender), Platz für Vereinbarungen und Unterschriften; dazu die **freigegebene** Einzelanalyse (E).
- Dateiname: `<salon>_<YYYY-MM>_<monatsbericht|person-name>.pdf` (Umlaute werden ae, oe, ue, ss).
- **Datenbank:** `pdf_monatsbericht(monat)`, `pdf_personenbericht(person, monat)`, `pdf_export_protokoll(limit)` (nur Admin), Tabelle `pdf_export_log` (gesperrt). Die Zahlen kommen aus denselben Funktionen wie am Bildschirm. Ein Monat ohne Abgaben ergibt `22023`. **Jeder erfolgreiche Abruf schreibt einen Protokolleintrag**, abgelehnte nichts; der Admin sieht das Protokoll unten auf „Info und Datenschutz“.
- **Erzeugung im Browser** (`src/pdf/`, `@react-pdf/renderer`), der Code wird erst beim Klick geladen (dynamischer Import in `PdfKnopf`). Schriften eingebettet, Diagramme als Vektoren, Logo aus A (react-pdf zeigt kein SVG: die Datei wird im Browser vierfach vergrößert in ein PNG gezeichnet). Kopf mit Logo, Fuß „Vertraulich – nur für Verantwortliche“, Datum, „Seite x von y“. A4 hochkant.

**Stolperstein:** Ein `lineHeight` an Seite oder Inhalt wird vererbt und lässt die Fußzeile mit Seitenzahl verschwinden. `lineHeight` nur an einzelne Überschriften setzen.

**Abnahme:** PDFs wirklich erzeugen und mit `pdfinfo`, `pdffonts`, `pdftotext`, `pdftoppm` prüfen (A4, Seitenzahl, eingebettete Schriften, Umlaute, Minuszeichen, Fußzeile auf jeder Seite, alle Kommentare, Dateiname). Mitarbeiter: kein Knopf, kein Aufruf, `42501`.

---

## 6. Erweiterung D: Kommentar-Auswertung (Migration 018)

**Ziel:** Der Leitung zeigen, **wer** Kommentare schreibt, **wie ausführlich** und **wer keine** schreibt.

- Seite **Leitung → Kommentare**. Kennzahlen je Absender und Monat, alle in SQL (Ansicht `v_kommentar_metriken`, gesperrt; Funktion `kommentar_auswertung(monat)`):

| Kennzahl | Bedeutung |
|---|---|
| Kommentare, Quote | Kommentare ÷ Bewertungen in % |
| Pflicht | Bewertung 4 oder 5 (Kommentar vorgeschrieben); „erfüllt“ = davon mit Kommentar |
| Freiwillig, freiwillige Quote | Kommentare zu Bewertungen 1 bis 3 ÷ Bewertungen 1 bis 3 (nur sie sagt, wie gern jemand schreibt) |
| Ø Wörter | Länge der Kommentare |
| Kurz | Anteil der Kommentare unter 5 Wörtern |
| Doppelt | Wiederholungen desselben Textes (Groß-/Kleinschreibung und Leerzeichen egal) |
| Verhalten ohne Kommentar | Verhalten ohne jeden Kommentar des Absenders |

- Teamzahlen sind **gewichtet** (Summe ÷ Summe), nicht Mittel der Mittel. „Nicht abgegeben“ zählt nur, wer für den Monat erwartet wird.
- **Datenschutz:** Kennzahlen **je Person als Absender**, aber **nie ein Kommentartext**. Das Team wird auf „Info und Datenschutz“ und im Frontblatt der Umfrage darauf hingewiesen.
- **Schalter `salons.eigene_analyse_nur_admin`** (Standard aus): ist er an, sieht ein Verantwortlicher seine eigenen Werte nicht, der Admin alles; Team-Summen bleiben vollständig. Derselbe Schalter steuert die Einzelanalyse (E).
- Der Monatsbericht-PDF enthält den Abschnitt „Kommentare je Person“ (ohne Texte).

**Abnahme:** Jede Kennzahl jeder Person gegen eine unabhängige Handrechnung prüfen (Testpersonen mit festen Schreibprofilen: gemischt, nur Pflicht, keine Kommentare, sehr lang, Textbaustein, sehr kurz).

---

## 7. Erweiterung E: Monatsabschluss und Einzelanalyse (Migration 019)

**Ziel:** Einen Monat abschließen und für jede Person eine KI-Analyse als Gesprächsgrundlage erzeugen. **Alle Zahlen kommen aus SQL, die KI formuliert nur den Text.**

**Ablauf:** Monat abschließen (auch unvollständig: „x von y Abgaben“) → Analyse erstellen (einzeln oder „Alle fehlenden“) → Leitung liest den Entwurf, bearbeitet ihn und **gibt ihn frei** → nur eine freigegebene Analyse kommt in den Personenbericht. „Neu generieren“ ist ein eigener Knopf (mit Rückfrage, wenn bearbeitet oder freigegeben). Jede Bearbeitung macht die Analyse wieder zum Entwurf.

**Die Eingabe baut die Datenbank** (`analyse_eingabe`): Kennzahlen und Stufen nach den Schwellen, Vormonat und Veränderung, Kommentare der Kollegen **ohne Absender**, eigene Kommentare. **Keine Namen:** die bewertete Person heißt „die bewertete Person“, alle anderen „Kollege A, B …“ (voller Name, Vorname, Nachname, ohne Groß-/Kleinschreibung). Weder Absenderfeld noch Kennungen noch E-Mail-Adressen.

**Faktencheck in der Datenbank** (`analyse_faktencheck`): Jede Zahl im Text und in der strukturierten Ausgabe muss in der Eingabe vorkommen (Schreibweisen 3,5 = 3.5 = 3,50 gleich; Listennummern zählen nicht; 1 bis 5 sind immer erlaubt). `analyse_speichern` und `analyse_bearbeiten` ermitteln `geprueft` **selbst**: die Edge Function kann es nicht fälschen. Bei Abweichung: „Faktencheck nicht bestanden: 4,71 steht nicht in den Daten“, Freigabe bleibt möglich. **Bekannte Grenze:** Eine erfundene Zahl, die zufällig einer Zahl der Eingabe gleicht (z. B. einer Verhaltensnummer), fällt nicht auf; deshalb liest die Leitung jeden Entwurf.

**Datenbank:** Tabellen `monatsabschluesse`, `analysen` (Typ `person`, später `team_agenda`; je Salon, Monat, Typ und Person eine Zeile über einen Index mit `coalesce`), Funktionen `monat_abschliessen`, `abschluss_uebersicht`, `analyse_eingabe`, `analyse_pruefen`, `analyse_speichern`, `analyse_lesen`, `analyse_bearbeiten`, `analyse_freigeben`, interne Hilfen `analyse_zugriff`, `analyse_anonymisieren`, `analyse_zahlen`, `analyse_faktencheck`, `analyse_zeile`.

**Edge Function `analyse-erstellen`** (Anmeldung der Leitung, `verify_jwt` an, **kein `service_role`-Schlüssel**): Eingabe holen → gleiche Eingabe und Prompt-Version wie gespeichert = kein neuer KI-Aufruf → Anbieter formuliert (JSON) → Faktencheck über `analyse_pruefen` → bei Abweichung bis zu zwei Wiederholungen (**höchstens 3 Aufrufe** insgesamt) → Entwurf speichern. Fehler erscheinen als verständliche deutsche Meldung.

| Secret | Bedeutung |
|---|---|
| `AI_PROVIDER` | `claude` oder `webhook` (ohne: „Die KI ist noch nicht eingerichtet“) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | für `claude` |
| `AI_WEBHOOK_URL`, `AI_WEBHOOK_SECRET` | für `webhook` (z. B. n8n; erwartet `{ message, context }`) |

Der Prompt liegt versioniert im Repo (`PROMPT_VERSION`); wer ihn ändert, erhöht die Version, dann gilt die Eingabe als neu.

**Datenschutz:** Feedbacktexte gehen **ohne Namen und ohne Absender** an den KI-Anbieter. Der Hinweis steht auf „Monatsabschluss“ und auf „Info und Datenschutz“. Mitarbeiter bekommen keine Analysen.

**Abnahme:** keine Namen in der Eingabe (Test über alle Namensteile), erfundene Zahl wird erkannt, von Hand eingetragene falsche Zahl auch, Idempotenz (kein zweiter KI-Aufruf), Mitarbeiter `42501`, Salon-Grenze.

---

## 8. Erweiterung F: Fokus, Agenda, Termine, Mailversand (Migration 020)

**Ziel:** Aus den Ergebnissen eines Monats entsteht eine Agenda für das Teammeeting (15 bis 20 Minuten); Verantwortliche bekommen sie vor dem Termin per Mail.

### 8.1 Fokus-Verhalten

Die Leitung markiert Verhalten, die gerade besonders wichtig sind (Begründung, optional befristet). Tabelle `fokus_verhalten` (gesperrt; Zeitraum `gueltig_ab` bis `gueltig_bis`, leer = bis auf Weiteres, einschließlich dieses Tages). „Aus dem Fokus nehmen“ beendet den Eintrag gestern; die Geschichte bleibt, „wieder an“ legt einen neuen Eintrag an. Funktionen `fokus_liste()`, `fokus_umschalten(...)`; Verhalten eines anderen Salons: `42501`; Ende vor Beginn: `22023` und Constraint.

### 8.2 Agenda

Entsteht **aus den Daten ohne KI** (feste Vorlage `agenda-vorlage-v1`, alle Zahlen aus SQL). Fünf Blöcke in fester Reihenfolge, das **Zeitbudget prüft die Datenbank** (`agenda_validieren`, sonst `22023`):

| Block | Minuten (Vorlage) | Inhalt |
|---|---|---|
| Einstieg und Beteiligung | 2 | Danke, wie viele haben abgegeben |
| Team-Kennzahlen des Monats | 3 | Selbstbild, Fremdbild, Differenz, Stufe, Vormonat |
| Fokus-Verhalten | 6 bis 8 (7) | Priorität: 1. Fokus-Verhalten, 2. größte Teamdifferenzen, 3. größte Veränderungen zum Vormonat (höchstens drei) |
| Entwicklungsfelder und Differenzen | 3 bis 4 (4) | die drei niedrigsten Fremdbilder ohne Wiederholung aus dem Fokus-Block |
| Vereinbarungen | 2 bis 3 (2) | Leitfragen |

Summe 15 bis 20 (Vorlage 18). **Hinweis „Stand unvollständig“** oben, wenn der Monat nicht abgeschlossen ist, Einzelanalysen oder Abgaben fehlen (Stand zum Zeitpunkt des Erzeugens). **Nur Teamebene:** keine Rangliste, keine Absender. Zu den Fokus-Verhalten stehen auf der **Plattform** bis zu zwei **anonymisierte Kommentar-Beispiele**, **nie in Mails und nie im PDF**.

Gespeichert als `analysen` vom Typ `team_agenda`. Funktionen `agenda_erzeugen`, `agenda_lesen`, `agenda_bearbeiten`, `agenda_freigeben` (Entwurf/freigegeben wie bei E; jede Bearbeitung macht wieder zum Entwurf). Die freigegebene Agenda steht am Ende des Monatsberichts als PDF.

### 8.3 Termine (nur Admin)

Tabelle `meeting_termine` (gesperrt): `startet_am` als `timestamptz`, eingegeben und angezeigt wird **Berliner Zeit** (das Formular schickt „2026-10-26T10:00“ ohne Zeitzone, die Datenbank rechnet Sommer-/Winterzeit). Einzeln oder als **Serie** (wöchentlich, zweiwöchentlich, monatlich, bis 60), die Uhrzeit bleibt über die Zeitumstellung gleich. Bezugsmonat der Agenda: Standard der Monat vor dem Termin, auf Wunsch fest. Vorlauf: Agenda-Mail N Tage vorher (Standard 2), Erinnerung N Stunden vorher (Standard 1); mehrere Werte erlaubt, der größte löst aus. **Empfänger:** aktive Verantwortliche des Salons mit E-Mail, auf Wunsch zusätzlich der Admin in Kopie; **Mitarbeiter nie**. Termine werden nicht gelöscht, sondern als „entfernt“ gekennzeichnet; „Mails pausieren“ stoppt nur den Versand. Funktionen `termine_liste`, `termin_speichern`, `termine_serie`, `termin_entfernen` (alle `42501` für Nicht-Admin, auch für Verantwortliche).

### 8.4 Der Versand

Edge Function `agenda-versand` (Zeitplan alle 15 Minuten). Die Datenbank entscheidet, nicht der Kalender:

1. **`versand_faellig`**: Agenda-Mail ab „Termin minus größter Vorlauf in Tagen“ **in Berliner Uhrzeit** (Mo 26.10. 10:00 minus 2 Tage = Sa 24.10. 10:00 Berliner Zeit = 08:00 UTC, nicht 48 Stunden); Erinnerung ab „minus Stunden“. **Nach Terminbeginn nichts mehr.** Eine verpasste Agenda-Mail wird bis dahin nachgeholt.
2. **`versand_beanspruchen`**: `UNIQUE (termin_id, art)` in `mail_log` entscheidet, welcher Lauf sendet; ein zweiter bekommt `null`. **Höchstens 3 Versuche**; ein seit über 10 Minuten „in Arbeit“ hängender Lauf wird übernommen.
3. **`agenda_fuer_versand`**: die gespeicherte Agenda, sonst wird die Vorlage erzeugt; **Zeilen mit Kommentar-Beispielen entfernt**.
4. Senden über **Resend** mit Idempotenz-Schlüssel `<termin>-<art>`.
5. **`versand_abschliessen`**: gesendet oder Fehler (höchstens 500 Zeichen).

Mails: *vorab* (alle Blöcke mit Minuten, Hinweis, Link zur Agenda) und *kurz* (die drei wichtigsten Punkte, Link). Ist die Agenda noch nicht freigegeben, steht „Stand: Entwurf“ drin. Ohne Daten steht ein Hinweis statt einer leeren Agenda. Alle Inhalte maskiert; Farben in der Mail fest (Mailprogramme kennen keine Tokens).

Die Versand-Funktionen der Datenbank sind **nur für `service_role`** aufrufbar. Die Function läuft ohne JWT-Prüfung (`verify_jwt` aus), weil der Zeitplan keinen JWT hat; sie prüft stattdessen den Header `x-cron-secret` **in gleicher Zeit** (gegen Zeitangriffe). Fehlt ein Secret, antwortet sie `503` und fasst die Datenbank nicht an: **eine fehlende Einrichtung verbraucht keinen der drei Versuche.** `{"trocken": true}` zeigt nur, was fällig wäre.

| Secret | Bedeutung |
|---|---|
| `CRON_SECRET` | langer Zufallswert, derselbe wie im Zeitplan |
| `RESEND_API_KEY` | Schlüssel von Resend |
| `MAIL_ABSENDER` | z. B. `Salon X <plattform@domain.de>` (Domain bei Resend bestätigt) |
| `PLATTFORM_URL` | Adresse der Plattform (Link in der Mail) |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase der Function selbst bereit; der Schlüssel steht nie im Frontend, in der `.env` oder im Repo.

**Zeitplan von Hand:** `supabase/versand_einrichten.sql` (keine nummerierte Migration): legt das `CRON_SECRET` im **Vault** ab und plant `agenda-versand` per `pg_cron` und `pg_net` alle 15 Minuten ein. Erst ausführen, wenn Resend, Secrets, Erweiterungen und Termine bereit sind. Anhalten: `select cron.unschedule('agenda-versand');`.

### 8.5 Oberfläche

Drei neue Seiten unter **Leitung**: *Fokus* (`/app/leitung/fokus`), *Agenda* (`/app/leitung/agenda/:monat?`, auch der Link aus der Mail mit `?monat=YYYY-MM`), *Termine* (`/app/leitung/termine`, Route und Menüpunkt nur für den Admin). Termine zeigen Mail-Zustand je Termin („geplant“, „gesendet“, „Fehler, Versuch 2 von 3“, „nach 3 Versuchen fehlgeschlagen“ mit Grund) und eine Warnung oben bei endgültigem Fehler. Eingaben werden vor dem Absenden geprüft; Vorlauf-Listen werden mit `;` oder Leerzeichen getrennt, **ein Komma ist das Dezimalzeichen** („0,5“).

**Abnahme:** Fälligkeit über die Zeitumstellung (25.10.2026: „vorab“ ab 08:00 UTC, nicht 07:59 und nicht erst 09:00; 28./29.03.); kein Versand nach Terminbeginn; kein Doppelversand; höchstens drei Versuche; hängender Lauf; Empfänger mit und ohne Admin-Kopie, nie Mitarbeiter; **kein Name und kein Kommentar in der Mail**; Verantwortlicher auf `/termine` wird auf `/app` umgeleitet.

---

## 9. Querschnitt

**Navigation:** ein einziger Menüpunkt **Leitung** (`/app/leitung`) mit Unter-Navigation *Kommentare, Monatsabschluss, Fokus, Agenda* und, nur für den Admin, *Termine*. Grund: Die Kopfzeile bleibt einzeilig (auch bei 1200 px und schmaler). Die Pfade `/verantwortlicher/...` aus dem alten Bauauftrag heißen deshalb `/app/leitung/...`. Neue Bedingung `admin` in `rechte.ts` (`RequireZugriff bedingung="admin"`).

**Rechte-Übersicht**

| | Mitarbeiter | Verantwortlicher | Admin | `service_role` |
|---|---|---|---|---|
| eigene Ausfüllzeit sehen | ja | ja | ja | – |
| Zeit-Auswertung, Kommentar-Auswertung | `42501` | ja | ja | – |
| PDF-Berichte | `42501` | ja | ja | – |
| Abschluss, Einzelanalyse | `42501` | ja (Schalter: nicht über sich selbst) | ja | – |
| Fokus, Agenda | `42501` | ja | ja | – |
| Termine | `42501` | `42501` | ja | – |
| Export-Protokoll | `42501` | `42501` | ja | – |
| Versandfunktionen | gesperrt | gesperrt | gesperrt | ja |

Alle neuen Tabellen sind für alle Anmeldungen gesperrt, auch für den Admin; gelesen wird nur über die Funktionen. Interne Hilfen sind nicht aufrufbar.

**Neue Migrationen (in dieser Reihenfolge)**

| Nr. | Datei | Inhalt |
|---|---|---|
| 016 | `016_zeiterfassung.sql` | Sitzungen, Herzschlag, Kennzeichen, Auswertung |
| 017 | `017_pdf_export.sql` | Berichtsdaten und Export-Protokoll |
| 018 | `018_kommentar_auswertung.sql` | Kennzahlen und Schalter `eigene_analyse_nur_admin` |
| 019 | `019_monatsabschluss_analysen.sql` | Abschluss, Analysen, Faktencheck |
| 020 | `020_fokus_agenda_termine.sql` | Fokus, Agenda, Termine, Versandfunktionen |
| (010) | `010_testdaten_entfernen.sql` | erweitert: räumt auch Zeit-Sitzungen ab; **muss der Auftraggeber im SQL-Editor ausführen** (Supabase-Werkzeug führt `delete` nicht aus) |

---

## 10. Einrichtungs-Checkliste (nach dem Einspielen)

1. Alle Migrationen einspielen, Funktionen per Fingerabdruck mit dem lokalen Lauf vergleichen (siehe 11).
2. Edge Functions veröffentlichen: `analyse-erstellen` (JWT an), `agenda-versand` (JWT aus).
3. Secrets setzen: KI (`AI_PROVIDER` und Schlüssel oder Webhook) und Versand (`RESEND_API_KEY`, `MAIL_ABSENDER`, `CRON_SECRET`, `PLATTFORM_URL`).
4. Bei Resend die Absender-Domain bestätigen.
5. `pg_cron` und `pg_net` einschalten, Termine eintragen, dann `versand_einrichten.sql` ausführen (erst mit `{"trocken": true}` probieren).
6. Frontend bauen (`npm run build`, mit der echten `.env`) und `dist` auf Netlify hochladen.
7. Wenn die neue Version online ist: `umfrage_einreichen_v2` für Anmeldungen sperren.
8. Schalter prüfen: `salons.eigene_analyse_nur_admin` (Standard aus), Zeit-Schwellen `salons.zeit_*`.
9. Logo, Farben und Texte der Plattform anpassen (A) und Datenschutz-Hinweise auf „Info und Datenschutz“ gegen die tatsächliche Nutzung (Mail-Dienst, KI-Anbieter) prüfen.

---

## 11. Wie getestet wurde (Vorgehen zum Wiederverwenden)

- **Datenbank lokal mit PGlite** (Postgres im Speicher, Stub für `auth` und Rollen): alle Migrationen **zweimal** laufen lassen (Idempotenz), Rechte je Rolle und für `anon`, Handrechnung gegen jede Kennzahl, Salon-Grenze mit einem zweiten Salon, Zeitumstellung mit festgesetztem „jetzt“ (`p_jetzt`-Parameter). Für Version 1.2: 516 Datenbankprüfungen (B 109, C 55, D 41, E 93, F 218), dazu 191 Unit-Tests (Vitest, alle Projektteile) und die Browser-Suiten je Erweiterung.
- **Fingerabdruck gegen die echte Datenbank:** `md5(pg_get_functiondef(...))` je Funktion plus Rechte, Spalten, Constraints und Indizes, zusammengefasst mit `string_agg(... order by obj collate "C")`; lokal und in Supabase vergleichen. Bei Abweichung zeilenweise vergleichen.
- **Test in der echten Datenbank mit Rollback:** ein `do $$ ... raise exception ... $$`-Block legt Testdaten an, prüft Rechte und Abläufe unter `set local role authenticated` bzw. `service_role` und wirft am Ende absichtlich einen Fehler mit dem Ergebnis: alles wird zurückgerollt. Danach zählen, dass nichts übrig ist.
- **Logik der Edge Functions mit Vitest:** reines TypeScript ohne Deno-Bezug, Netz und Anbieter nachgebaut.
- **Browser mit Playwright (Chromium):** Supabase-Antworten per `route` simuliert, Zeit mit `page.clock` gesteuert (ersetzt auch `performance.now()`); PDFs wirklich erzeugt und mit `poppler` geprüft; Handy-Breite (375 px), Hell und Dunkel, keine Konsolenfehler, kein waagerechter Überlauf.
- **Nicht testbar in der Sandbox:** die echte KI, der echte Versand über Resend und der Zeitplan (kein Zugriff auf Supabase und die Dienste). Diese laufen erstmals nach der Einrichtung.

---

## 12. Stolpersteine (aus der Umsetzung)

- **Supabase-Werkzeug:** wartet bei `DROP` und `DELETE` (auch `drop policy if exists`) auf eine Bestätigung und läuft in ein Zeitlimit; Migrationen ohne beides schreiben. Das Werkzeug trennt gelegentlich die Verbindung: Werkzeuge neu laden und den Zustand prüfen, bevor man wiederholt.
- **Fingerabdruck und Kommentare:** `pg_get_functiondef` enthält Kommentare **im Funktionsrumpf**. Wer beim Einspielen Kommentare weglässt, bekommt einen anderen Fingerabdruck. Kommentare vor die Funktion setzen.
- **Fingerabdruck und NOT-NULL:** In neueren Postgres-Versionen erscheinen `NOT NULL`-Constraints in `pg_constraint`; beim Vergleich `contype <> 'n'` ausschließen.
- **`text[] || 'Text'`** ist mehrdeutig (Literal wird als Array gelesen): `array_append(arr, 'Text'::text)` verwenden.
- **`on conflict` mit Ausdrucksindex** (`coalesce(person_id, ...)`): funktioniert, wenn der Ausdruck im `on conflict` genauso geschrieben wird.
- **Zeitumstellung:** „N Tage vorher“ in Berliner Wanduhrzeit rechnen (`(startet_am at time zone 'Europe/Berlin') - make_interval(days => n)` und zurück), nicht als `n × 24 Stunden`.
- **`sendBeacon`** kann keine Anmeldung mitschicken; für den letzten Herzschlag `fetch` mit `keepalive: true`.
- **react-pdf:** `lineHeight` nicht an Seite oder Container (siehe C); `SVG` wird nicht gezeigt, Logo als PNG zeichnen.
- **Edge Function ohne JWT:** Wer `verify_jwt` ausschaltet, muss in der Function selbst prüfen (Secret im Header, Vergleich in gleicher Zeit) und bei fehlender Konfiguration **vor** jedem Datenbankzugriff abbrechen.
- **Edge Function veröffentlichen:** Alle Dateien vollständig übergeben. Ein Platzhalter statt des Inhalts wird beim Veröffentlichen **nicht** bemerkt (das Linken passiert erst beim Start); danach den Typcheck und die Tests lokal laufen lassen.
- **Eingaben mit Komma:** Ein Komma ist zugleich Trenner und Dezimalzeichen. Festlegen: Trenner sind `;`, Leerzeichen oder „Komma + Leerzeichen“, ein Komma zwischen Ziffern ist dezimal; ein Test fängt das ab.
- **Oberflächen-Zustand nach dem Neuladen:** Eine Meldung („gespeichert“) geht verloren, wenn die Ansicht nach dem Neuladen neu aufgebaut wird (Schlüssel an der Komponente). Meldungen in die übergeordnete Komponente legen.
- **Browser-Tests:** Mock-Antworten werden beim Start einer Sitzung kopiert; später überschreiben wirkt nicht (Objekt vorher halten). Nach einer Aktion auf die **geänderte Anzeige** warten, nicht auf die Meldung, denn die erscheint vor dem Neuladen.
- **Dev-Befehle in der Sandbox:** `pkill -f` kann die eigene Shell treffen; Server mit eigener PID-Datei beenden.

---

## 13. Bekannte Grenzen und offene Punkte

- Die **Agenda ist eine Vorlage**, keine KI-Formulierung (bewusst: jede Zahl nachprüfbar, nichts an externe Anbieter). Eine KI-Fassung wäre eine spätere Erweiterung (dann mit demselben Faktencheck wie in E).
- Der Hinweis „Stand unvollständig“ gilt zum Zeitpunkt des Erzeugens.
- Die Mail geht als **eine** Mail an alle Empfänger (sie sehen sich gegenseitig; es sind nur Leitung und Admin).
- Ein KI-Hinweis zur Qualität einzelner Kommentare (Feld `kommentar_qualitaet_hinweis` existiert in der Analyse-Ausgabe) ist nicht als eigene Oberfläche gebaut.
- Der **echte Versand, der Zeitplan und die echte KI** sind nicht live getestet (siehe 11).
- `umfrage_einreichen_v2` ist noch nicht gesperrt (siehe 4 und 10).
- Migration `010_testdaten_entfernen.sql` ist noch nicht ausgeführt.
- Michael Hammermeister steht in der Datenbank noch als `mitarbeiter`; die Leitungsfunktionen sehen ihn erst als Verantwortlichen, wenn die Rolle angepasst ist.

---

## 14. Dateien, die dazugekommen sind

```
src/config/brand.ts, src/components/BrandLogo.tsx, src/assets/brand/<slug>/        A
src/pages/app/Info.tsx                                                             A, erweitert in B bis F
src/lib/zeitmesser.ts, zeiterfassung.ts, zeit.ts                                   B
src/components/auswertung/ZeitAbschnitt.tsx                                        B
src/lib/pdf.ts, src/components/auswertung/PdfKnopf.tsx                             C
src/pdf/ (erzeuge, Monatsbericht, Personenbericht, bausteine, schriften, logo,
          KommentarAbschnitt, AnalyseAbschnitt, AgendaAbschnitt)                   C bis F
src/lib/kommentare.ts, src/pages/app/leitung/Kommentare.tsx                        D
src/lib/abschluss.ts, src/pages/app/leitung/Abschluss.tsx,
src/components/leitung/Markdown.tsx                                                E
supabase/functions/analyse-erstellen/ (index.ts, analyse.ts, analyse.test.ts)      E
src/lib/agenda.ts, agenda.test.ts, src/pages/app/leitung/{Fokus,Agenda,Termine}.tsx F
supabase/functions/agenda-versand/ (index.ts, versand.ts, versand.test.ts)         F
supabase/versand_einrichten.sql                                                    F
src/pages/app/leitung/Leitung.tsx, src/styles/leitung.css                          D bis F
supabase/migrations/016 bis 020                                                    B bis F
docs/zeiterfassung.md, pdf-export.md, kommentar-auswertung.md,
     einzelanalyse.md, agenda-termine.md, version-1.2-aenderungen.md (diese Datei)
```
