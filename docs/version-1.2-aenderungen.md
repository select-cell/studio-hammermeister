# Version 1.2: Plattform-Erweiterungen für jede Salon-Plattform

Diese Datei beschreibt Version 1.2 der Salon-Plattform so, dass sie auf **jede** Salon-Plattform übertragen werden kann. Jede Plattform ist eine eigene Instanz: eigenes Supabase-Projekt, eigenes Netlify-Projekt, eigene Marke, eigene Verantwortliche. Nichts in Version 1.2 ist an einen bestimmten Salon gebunden: Die Migrationen enthalten keinen Salon-Namen und keine festen Kennungen, die Edge Functions bekommen alles über Secrets, und alles Salon-Spezifische steht in **Abschnitt 3 (Salon-Parameter)**.

Die Datei ist ein **Bauauftrag rückwärts**: Ziel, Regeln, Daten, Rechte, Oberfläche und Abnahme jeder Erweiterung. Abschnitt 2 ist die Schritt-für-Schritt-Anleitung für die Übernahme, Abschnitt 17 ein Auftragstext zum Einfügen.

> **Version 1.3 (KI-Funktionen) baut darauf auf:** Einzelanalyse und Sammellauf, Gesamtauswertung (Monatsauswertung), Agenda mit KI, Salon-Kontext und Schalter „nur Admin“ (Migration 021, Edge Function `analyse-erstellen` neu, Weg ausschließlich über n8n) stehen in [`ki-funktionen.md`](ki-funktionen.md). Wo dieses Dokument den früheren KI-Weg beschreibt (Secrets `AI_PROVIDER` und Schlüssel, Agenda ohne KI, Referenz-Fingerabdruck 240), gilt dort die Beschreibung der Version 1.3. Das Fingerabdruck-Skript heißt jetzt `supabase/fingerabdruck_version_1_3.sql` und deckt die Migrationen 016 bis 021 ab.

**Geltungsbereich:** Version 1.2 sind die Erweiterungen **A bis F** (Migrationen 016 bis 020). Die Teamvorstellung mit Profilen und Fotos gehört **nicht** dazu und wurde nicht gebaut; die Migrationen 014 und 015 (Profile, stillgelegt) werden **nicht** übernommen.

Ausführliche Einzeldokumente (liegen im Repo und werden mitkopiert): [`zeiterfassung.md`](zeiterfassung.md), [`pdf-export.md`](pdf-export.md), [`kommentar-auswertung.md`](kommentar-auswertung.md), [`einzelanalyse.md`](einzelanalyse.md), [`agenda-termine.md`](agenda-termine.md). Zwei Skripte helfen bei der Übernahme: [`supabase/vorpruefung_version_1_2.sql`](../supabase/vorpruefung_version_1_2.sql) und [`supabase/fingerabdruck_version_1_3.sql`](../supabase/fingerabdruck_version_1_3.sql) (seit Version 1.3; früher `fingerabdruck_version_1_2.sql`).

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

Dazu kommen: ein neuer Menüpunkt **Leitung** mit Unter-Navigation, und die Migration `010` räumt jetzt auch Zeit-Sitzungen ab.

### Abhängigkeiten

```
A (Marke)      ──►  C (das PDF braucht das Logo)
B (Zeit)       ──►  C (Monatsbericht zeigt die Ausfüllzeit)
D (Kommentare) ──►  C (Monatsbericht zeigt „Kommentare je Person“)
E (Analyse)    ◄──  D (Schalter eigene_analyse_nur_admin);  E ──► C (freigegebene Analyse im Personenbericht)
F (Agenda)     ◄──  E (Abschluss und Analysen fließen in „Stand unvollständig“);  F ──► C (freigegebene Agenda im Monatsbericht)
```

Reihenfolge beim Übertragen: **A, B, C, D, E, F**. Jede Phase hat eigene Prüfungen; die nächste beginnt, wenn die vorige besteht.

---

## 2. Version 1.2 auf eine neue Salon-Plattform übertragen

Zehn Schritte. Jeder lässt sich einzeln prüfen; ändere nichts an einer **anderen** Instanz als der, die Du gerade einrichtest.

1. **Vorprüfung.** `supabase/vorpruefung_version_1_2.sql` im SQL-Editor der Ziel-Plattform ausführen (nur Lesen). „Alle Voraussetzungen sind da.“ heißt: weiter. Sonst zuerst die Grundplattform nachziehen (Migrationen 001 bis 013 und die Ausgangsdateien `umfrage_schema.sql`, `ausfuelldauer.sql`). Die zweite Abfrage zeigt, ob Teile von 1.2 schon eingespielt sind.
2. **Dateien übernehmen** (Liste in Abschnitt 16): Migrationen 016 bis 020, Edge Functions, Quelltext, Skripte, Dokumente. Beim Übernehmen **nicht** kopieren: die Logo-Dateien des alten Salons (`src/assets/brand/<alter-slug>/`), `.env`, Testdaten und Fixtures mit echten Namen.
3. **Marke und Parameter** setzen (Abschnitt 3): `src/config/brand.ts` (Slug, Name), Logo-Dateien, Farben, `index.html` (Seitentitel), `.env` mit der Adresse und dem **anon**-Schlüssel der neuen Instanz (nie der `service_role`-Schlüssel).
4. **Migrationen einspielen:** 016, 017, 018, 019, 020 in dieser Reihenfolge, jede für sich (Supabase-Werkzeug oder SQL-Editor). Alle sind idempotent und ohne `DROP` und `DELETE`; ein Zeitlimit heißt nicht „kaputt“, erst den Zustand prüfen und dann in kleineren Teilen wiederholen. Danach `supabase/fingerabdruck_version_1_3.sql` ausführen und mit dem **Referenzwert** vergleichen (Abschnitt 13). Wer nur 1.2 einspielt (016 bis 020), hatte den Wert **240 Objekte, `5f4e4158a303c943ce0740ad1b2efee2`**; mit Migration 021 (Version 1.3) gilt **267 Objekte, `9d184733f4ac9726d34c3c1b26839663`**.
5. **Personen und Rollen prüfen.** Wer Leitung sein soll, braucht `rolle = 'verantwortlicher'` (sonst sieht die Person keine Leitungsfunktionen). Die Verantwortlichen brauchen eine **E-Mail-Adresse** (sie sind die Mail-Empfänger), der Admin eine Zeile mit `rolle = 'admin'`. Testdaten vor dem Start mit `010_testdaten_entfernen.sql` im SQL-Editor entfernen (das Supabase-Werkzeug führt `delete` nicht aus).
6. **Edge Functions veröffentlichen:** `analyse-erstellen` (JWT-Prüfung **an**) und `agenda-versand` (JWT-Prüfung **aus**, die Function prüft das Cron-Secret selbst). Alle Dateien vollständig übergeben (`index.ts` und die Logik-Datei).
7. **Secrets setzen** (Supabase → Edge Functions → Secrets): KI (seit Version 1.3 nur `AI_WEBHOOK_URL`, Adresse des n8n-Webhooks; Einrichtung in [`../n8n/README.md`](../n8n/README.md)) und Versand (`RESEND_API_KEY`, `MAIL_ABSENDER`, `CRON_SECRET`, `PLATTFORM_URL`); bei Resend die Absender-Domain bestätigen. Ohne diese Secrets laufen die Plattform und alles Übrige trotzdem; nur KI-Analysen und Mails melden „noch nicht eingerichtet“.
8. **Bauen und veröffentlichen:** `npm run build` mit der echten `.env`, `dist` auf Netlify hochladen. Sobald die neue Version online ist: `umfrage_einreichen_v2` für Anmeldungen sperren (eigene Migration), sonst lässt sich die Zeiterfassung umgehen.
9. **Versand einrichten** (erst wenn Resend, Secrets und Termine bereit sind): `pg_cron` und `pg_net` einschalten, Termine unter Leitung → Termine eintragen, dann `supabase/versand_einrichten.sql` ausführen (CRON_SECRET und Projekt-Referenz im Skript eintragen; beides ist abgesichert, mit Platzhalter bricht das Skript ab).
10. **Abnahme** (Abschnitt 12), danach die Info-Seite gegen die tatsächliche Nutzung prüfen (welcher Mail-Dienst, Station n8n bei der KI).

---

## 3. Salon-Parameter (einmal je Plattform festlegen)

Alles, was sich von Salon zu Salon unterscheidet. **Nichts davon steckt in den Migrationen 016 bis 020.**

| Parameter | Wo | Hinweis |
|---|---|---|
| Slug und Name des Salons | `src/config/brand.ts` (`SALON_SLUG`, `SALON_NAME`) | Der Slug bestimmt den Logo-Ordner und den Präfix des Entwurfsschlüssels im Browser (`<slug>-umfrage:`) |
| Logo hell, Logo dunkel, Favicon | `src/assets/brand/<slug>/logo.svg`, `logo-dark.svg` (optional), `favicon.svg` | `.png` und `.webp` gehen auch; Austausch ohne Code-Änderung |
| Farben | `src/styles/tokens.css`; für das PDF zusätzlich `pdfFarben` in `brand.ts` | im Code keine festen Farben (Nachtmodus) |
| Seitentitel | `index.html` (`<title>`), kosmetisch `package.json` (`name`) | |
| Supabase-Adresse und anon-Schlüssel | `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) | nie `service_role` |
| Projekt-Referenz der Instanz | in `supabase/versand_einrichten.sql` einzutragen | Project Settings → General → Reference ID |
| Plattform-Adresse (für den Link in Mails) | Secret `PLATTFORM_URL` | |
| Absender der Mails | Secret `MAIL_ABSENDER`, Domain bei Resend bestätigt | |
| KI (Version 1.3) | Secret `AI_WEBHOOK_URL` (n8n-Webhook); der Anthropic-Schlüssel steht nur in n8n. Dazu `salons.ki_nur_admin` (Standard an) und `salons.ki_kontext` | ohne Secret: „Die KI ist noch nicht eingerichtet“; `AI_PROVIDER` und `ANTHROPIC_*` werden nicht mehr gelesen |
| Stufen und Fristen | Tabelle `salons`: `schwelle_hoch`, `schwelle_niedrig`, `schwelle_ausgewogen`, `start_monat`, `reminder_tage_nach_frist` | die Auswertungen und die Agenda lesen sie von dort |
| Schwellen der Zeiterfassung | `salons.zeit_*` (z. B. `zeit_min_sek_pro_verhalten` 5, `zeit_sehr_lang_sek` 4 Stunden, `zeit_pausen_quote` 0,30, `zeit_heartbeat_luecke_sek` 3 min, `zeit_toleranz_sek` 10) | im Supabase-Dashboard änderbar |
| Datenschutz-Schalter | `salons.eigene_analyse_nur_admin` (Standard aus) | an: Verantwortliche sehen ihre eigenen Werte und Analysen nicht |
| Wer ist Leitung, wer Teilnehmer | `personen.rolle`, `nimmt_an_teamumfrage`, `aktiv`, `aktiv_ab`, `email` | die E-Mail-Adressen der Verantwortlichen sind die Mail-Empfänger |
| Inhalte der Umfrage | `verhalten` (Nummer, Titel, optional Grundpfeiler und Säule), `rituale` | **Version 1.2 hängt nicht an der Zahl der Verhalten** und kommt ohne Säulen und ohne Rituale aus |
| Rhythmus der Teammeetings | Termine (Admin), keine Code-Änderung | einzeln oder als Serie |
| **Zeitzone** | `Europe/Berlin`, fest in den SQL-Funktionen (Bezugsmonat, Fälligkeit, Termine) und im Quelltext (`src/lib/monat.ts`, `src/lib/abgabe.ts` und die Seiten Info, Abschluss, Agenda, Termine) | für einen Salon in einer anderen Zeitzone: überall ersetzen (Suche nach „Europe/Berlin“); Österreich und die Schweiz haben dieselbe Ortszeit |
| **Sprache** | Deutsch, fest in Oberfläche, Datenbank-Meldungen, Mails und dem Prompt der KI | |
| **Branche im KI-Prompt** | `SYSTEM_PROMPT` in `supabase/functions/analyse-erstellen/analyse.ts` beginnt mit „… für die Salonleitung eines Friseursalons …“ | Für einen anderen Salontyp den Satz anpassen und `PROMPT_VERSION` erhöhen; danach die Function neu veröffentlichen (noch keine Analysen gespeichert = keine Folgen) |
| Mehrere Salons in einer Instanz | die Funktionen sind mandantenfähig (Salon-Grenze); der Admin wertet den **ersten** Salon der Instanz aus | üblich ist ein Salon je Instanz |

**Was nie angepasst werden muss:** die Migrationen 016 bis 020 und die beiden Edge Functions.

---

## 4. Voraussetzungen der Zielplattform

Die Erweiterungen setzen das Grundgerüst der Salon-Plattform voraus (getestet wurde die Kette: Ausgangsdateien, Migrationen 001 bis 013, dann 016 bis 020). `supabase/vorpruefung_version_1_2.sql` prüft das.

**Technik:** React 18, Vite 5, TypeScript, Supabase (Postgres, Auth, Edge Functions), Netlify. Bibliotheken: `@react-pdf/renderer`, `recharts`, `@fontsource/dm-sans`, `@fontsource/dm-serif-display`.

**Rollenmodell:** Tabelle `personen` mit `rolle` (`mitarbeiter`, `verantwortlicher`, `admin`) und `nimmt_an_teamumfrage` (zwei unabhängige Merkmale: Teilnehmer und Leitung). Tabelle `salons` (Mandant) mit den Schwellen und Fristen aus Abschnitt 3.

**Funktionen, auf die die Migrationen zugreifen:**

| Funktion | Zweck |
|---|---|
| `ist_leitung()`, `ist_admin()` | Rolle der anfragenden Person aus `auth.uid()` |
| `auswertung_salon_id()` | Salon der Anfrage (Admin: erster Salon der Instanz) |
| `team_dashboard(monat)`, `abgabe_status(monat)`, `auswertung_person(person, von, bis, mit_absender)` | Zahlen der Auswertungen; die neuen Funktionen verwenden **dieselben Quellen** wie die Bildschirme |
| `umfrage_einreichen_v2(payload)` | Abgabe der Umfrage (die Zeiterfassung baut `v3` darum herum) |
| Tabellen `umfrage_abgaben`, `umfrage_bewertungen`, `verhalten` | Rohdaten und Inhalte; **für Anmeldungen gesperrt** |

**Grundregeln** (gelten für alles Neue):

1. **Sicherheit liegt in der Datenbank**, nicht im Frontend. Rohdaten-Tabellen sind für `anon` und `authenticated` gesperrt (`revoke all`, RLS an, keine Policy). Zugriff nur über `security definer`-Funktionen mit Rollenprüfung und `set search_path = public`. Nicht berechtigt: `42501`; ungültige Eingabe: `22023`.
2. **Berechnungen stehen in SQL.** Schwellen und Grenzwerte kommen aus `salons`, nicht aus dem Code.
3. **Migrationen sind nummeriert, idempotent und ohne `DROP` und ohne `DELETE`** (`create or replace`, `if not exists`). Das Supabase-Werkzeug (MCP) wartet bei `DROP` und `DELETE` auf eine Bestätigung und läuft in ein Zeitlimit.
4. **Salon-Grenze:** Jede Funktion rechnet nur mit dem Salon der anfragenden Person. Eine fremde oder unbekannte Person bekommt dieselbe Antwort (`42501`), so lässt sich nichts erraten.
5. **Daten werden nicht verworfen**, wenn sie auffällig sind: Sie werden gekennzeichnet, gezählt oder als Entwurf gespeichert.
6. **Keine festen Farben in Komponenten** (Design-Tokens in `tokens.css`, der Nachtmodus wechselt mit). Ausnahmen nur für Dinge, die in beiden Darstellungen gleich bleiben (PDF, Mail).
7. **Der `service_role`-Schlüssel kommt nie** ins Frontend, in die `.env` oder ins Repo.

---

## 5. Erweiterung A: Marke, Schriften, Info-Seite

**Ziel:** Das Logo an genau einer Stelle austauschbar, keine Anfragen an Fremdserver, ein fester Ort für Datenschutz-Hinweise.

- **Marke zentral:** `src/config/brand.ts` (Name, Logo-Dateien, Farben) und die Komponente `BrandLogo`. Die Dateien liegen in `src/assets/brand/<slug>/`: `logo.svg` (hell, Pflicht), `logo-dark.svg` (Nachtmodus, optional; fehlt sie, gilt die helle), `favicon.svg`. Austausch = Dateien ersetzen und neu bauen, **keine Code-Änderung**. Höhe fest (Kopfzeile 28 px, Anmeldeseite 40 px), Breite folgt dem Seitenverhältnis, nichts springt; die Kopfzeile bleibt auch mit breitem Logo einzeilig.
- **Feste Farbwerte fürs PDF** stehen in `brand.ts` (`pdfFarben`), weil das PDF keine CSS-Variablen kennt; es sind dieselben Werte wie die helle Palette in `tokens.css`.
- **Schriften selbst gehostet:** DM Sans und DM Serif Display über `@fontsource`. Keine Anfragen an Google Fonts oder ein CDN.
- **Info-Seite** `/app/info` (Link in der Fußzeile): „Anmeldung“, „Kommentare in der Umfrage“, „Auswertung mit KI“, „Agenda und Mails“, „Ausfüllzeit der Umfrage“; der Admin sieht zusätzlich das Export-Protokoll. **Jede Erweiterung, die Daten anders nutzt, ergänzt hier einen Absatz.**

**Abnahme:** Logo-Datei tauschen, neu bauen: Kopfzeile, Anmeldeseite, Fehlerseiten und PDF zeigen das neue Logo. Im Netzwerk-Tab keine Anfrage an `fonts.googleapis.com`.

---

## 6. Erweiterung B: Zeiterfassung der Umfrage (Migration 016)

**Ziel:** Messen, wie lange jemand die Umfrage wirklich bearbeitet, ohne dass Pausen, andere Tabs, ein gesperrter Bildschirm oder eine verstellte Geräteuhr das Ergebnis verfälschen.

**Regeln**

- **Aktiv** heißt: Seite sichtbar **und** in den letzten 45 Sekunden eine Eingabe (Tippen, Klicken, Mausbewegung, Scrollen, laufendes Video). Die Rückkehr in den Tab ist keine Eingabe.
- **Die Serveruhr zählt.** Start, Herzschläge und Abgabe stempelt die Datenbank. Das Gerät liefert nur Zählerstände aus `performance.now()` (nie aus `Date`), die der Server deckelt.
- **Deckelung eines Herzschlags:** nie weniger als bisher; höchstens die echte Serverzeit seit dem letzten Herzschlag plus 10 s Toleranz mehr; insgesamt höchstens die Zeit seit dem Start. Schrittzeiten wachsen zusammen nie mehr als die aktive Zeit.
- **Herzschlag** alle 30 s und bei jedem Schrittwechsel; beim Ausblenden oder Schließen sofort per `fetch(..., { keepalive: true })`. Ohne Verbindung zählt der Browser weiter und holt die Sitzung nach; die Umfrage hängt nie an der Zeiterfassung.
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
| `ohne_sitzung` | abgegeben ohne gestartete Sitzung | keine geprüfte Zeit (die Geräteuhr wird bewusst nicht übernommen) |

**Datenbank:** Tabellen `umfrage_sitzungen`, `umfrage_schrittzeiten` (gesperrt); Funktionen `umfrage_starten(monat, neu)`, `umfrage_heartbeat(sitzung, aktive_sek, schritte)`, `umfrage_einreichen_v3(payload, sitzung, aktive_sek, schritte)` (ruft `v2` und schließt die Sitzung), `zeit_auswertung(monat)` (nur Leitung), interne Hilfe `sitzung_buchen()`; Spalten `salons.zeit_*`. Das alte Feld `ausfuelldauer_sek` wird mit der aktiven Zeit gefüllt, wenn sie gültig ist.

**Oberfläche:** Mitarbeiter sehen nur die **eigene** aktive Zeit am Ende („ausgefüllt in X Min“), keine Kennzeichen. Die Leitung sieht im Team-Dashboard den Abschnitt „Ausfüllzeit“: Median und Spanne, Personenliste mit Kennzeichen, Zeit je Verhalten als Balken und aufklappbare Heatmap. Hinweis für alle auf „Info und Datenschutz“.

**Dateien:** `src/lib/zeitmesser.ts` (reine Logik, die Uhr wird übergeben), `src/lib/zeiterfassung.ts` (Seite und Server), `src/lib/zeit.ts`, `src/components/auswertung/ZeitAbschnitt.tsx`.

**Beim Einspielen beachten:** `umfrage_einreichen_v2` bleibt zunächst aufrufbar, damit die bisherige Plattform weiter abgibt; **sobald die neue Version online ist, `v2` für Anmeldungen sperren**. Wer bei der Umstellung mitten in der Umfrage ist, kann einmalig `zu_schnell` bekommen.

**Abnahme:** 120 s aktiv = 120 ± 2 s; 60 s verborgen zählen nicht; 90 s ohne Eingabe = 45 s; Neuladen setzt dieselbe Sitzung fort; Geräteuhr +2 h ändert nichts; ein aufgeblähter Herzschlag wird gekappt.

---

## 7. Erweiterung C: PDF-Export (Migration 017)

**Ziel:** Monats- und Personenbericht als PDF, **nur für Verantwortliche und Admin**.

- **Monatsbericht:** Beteiligung, Kennzahlen (Selbstbild, Fremdbild, Differenz, Stufe nach den Schwellen), Ergebnis je Verhalten (nach Säulen gruppiert, mit Balken), Stärken und Entwicklungsfelder, Kommentar-Quote und Ausfüllzeit (Median). **Keine Rangliste einzelner Personen.** Danach, wenn vorhanden: „Kommentare je Person“ (D) und die **freigegebene** Agenda (F).
- **Personenbericht:** Kennzahlen, Entwicklung zum Vormonat und Verlauf, Selbst- und Fremdbild je Verhalten, **Kommentare der Kollegen ohne Absender**, eigene Kommentare, Entwicklung des Monats (ohne Absender), Platz für Vereinbarungen und Unterschriften; dazu die **freigegebene** Einzelanalyse (E).
- Dateiname: `<salon>_<YYYY-MM>_<monatsbericht|person-name>.pdf` (Umlaute werden ae, oe, ue, ss).
- **Datenbank:** `pdf_monatsbericht(monat)`, `pdf_personenbericht(person, monat)`, `pdf_export_protokoll(limit)` (nur Admin), Tabelle `pdf_export_log` (gesperrt). Die Zahlen kommen aus denselben Funktionen wie am Bildschirm. Ein Monat ohne Abgaben ergibt `22023`. **Jeder erfolgreiche Abruf schreibt einen Protokolleintrag**, abgelehnte nichts; der Admin sieht das Protokoll unten auf „Info und Datenschutz“.
- **Erzeugung im Browser** (`src/pdf/`, `@react-pdf/renderer`); der Code wird erst beim Klick geladen (dynamischer Import in `PdfKnopf`). Schriften eingebettet, Diagramme als Vektoren, Logo aus A (react-pdf zeigt kein SVG: die Datei wird im Browser vierfach vergrößert in ein PNG gezeichnet). Kopf mit Logo, Fuß „Vertraulich – nur für Verantwortliche“, Datum, „Seite x von y“. A4 hochkant.

**Stolperstein:** Ein `lineHeight` an Seite oder Inhalt wird vererbt und lässt die Fußzeile mit Seitenzahl verschwinden. `lineHeight` nur an einzelne Überschriften setzen.

**Abnahme:** PDFs wirklich erzeugen und mit `pdfinfo`, `pdffonts`, `pdftotext`, `pdftoppm` prüfen (A4, Seitenzahl, eingebettete Schriften, Umlaute, Minuszeichen, Fußzeile auf jeder Seite, alle Kommentare, Dateiname). Mitarbeiter: kein Knopf, kein Aufruf, `42501`.

---

## 8. Erweiterung D: Kommentar-Auswertung (Migration 018)

**Ziel:** Der Leitung zeigen, **wer** Kommentare schreibt, **wie ausführlich** und **wer keine** schreibt.

- Seite **Leitung → Kommentare**. Kennzahlen je Absender und Monat, alle in SQL (Ansicht `v_kommentar_metriken`, gesperrt; Funktion `kommentar_auswertung(monat)`):

| Kennzahl | Bedeutung |
|---|---|
| Kommentare, Quote | Kommentare ÷ Bewertungen in % |
| Pflicht | Bewertung 4 oder 5 (Kommentar vorgeschrieben); „erfüllt“ = davon mit Kommentar |
| Freiwillig, freiwillige Quote | Kommentare zu Bewertungen 1 bis 3 ÷ Bewertungen 1 bis 3 (nur diese Quote sagt, wie gern jemand schreibt) |
| Ø Wörter | Länge der Kommentare |
| Kurz | Anteil der Kommentare unter 5 Wörtern |
| Doppelt | Wiederholungen desselben Textes (Groß-/Kleinschreibung und Leerzeichen egal) |
| Verhalten ohne Kommentar | Verhalten ohne jeden Kommentar des Absenders |

- Teamzahlen sind **gewichtet** (Summe ÷ Summe), nicht Mittel der Mittel. „Nicht abgegeben“ zählt nur, wer für den Monat erwartet wird (`aktiv_ab` und Start des Salons zählen).
- **Datenschutz:** Kennzahlen **je Person als Absender**, aber **nie ein Kommentartext**. Das Team wird auf „Info und Datenschutz“ und im Frontblatt der Umfrage darauf hingewiesen.
- **Schalter `salons.eigene_analyse_nur_admin`** (Standard aus): ist er an, sieht ein Verantwortlicher seine eigenen Werte nicht, der Admin alles; Team-Summen bleiben vollständig. Derselbe Schalter steuert die Einzelanalyse (E).
- Der Monatsbericht-PDF enthält den Abschnitt „Kommentare je Person“ (ohne Texte).

**Abnahme:** Jede Kennzahl jeder Person gegen eine unabhängige Handrechnung prüfen (Testpersonen mit festen Schreibprofilen: gemischt, nur Pflicht, keine Kommentare, sehr lang, Textbaustein, sehr kurz).

---

## 9. Erweiterung E: Monatsabschluss und Einzelanalyse (Migration 019)

**Ziel:** Einen Monat abschließen und für jede Person eine KI-Analyse als Gesprächsgrundlage erzeugen. **Alle Zahlen kommen aus SQL, die KI formuliert nur den Text.**

**Ablauf:** Monat abschließen (auch unvollständig: „x von y Abgaben“) → Analyse erstellen (einzeln oder „Alle fehlenden“) → die Leitung liest den Entwurf, bearbeitet ihn und **gibt ihn frei** → nur eine freigegebene Analyse kommt in den Personenbericht. „Neu generieren“ ist ein eigener Knopf (mit Rückfrage, wenn bearbeitet oder freigegeben). Jede Bearbeitung macht die Analyse wieder zum Entwurf.

**Die Eingabe baut die Datenbank** (`analyse_eingabe`): Kennzahlen und Stufen nach den Schwellen, Vormonat und Veränderung, Kommentare der Kollegen **ohne Absender**, eigene Kommentare. **Keine Namen:** die bewertete Person heißt „die bewertete Person“, alle anderen „Kollege A, B …“ (voller Name, Vorname und Nachname, ohne Rücksicht auf Groß-/Kleinschreibung). Weder Absenderfeld noch Kennungen noch E-Mail-Adressen.

**Faktencheck in der Datenbank** (`analyse_faktencheck`): Jede Zahl im Text und in der strukturierten Ausgabe muss in der Eingabe vorkommen (3,5 = 3.5 = 3,50; Listennummern zählen nicht; 1 bis 5 sind immer erlaubt). `analyse_speichern` und `analyse_bearbeiten` ermitteln `geprueft` **selbst**: Die Edge Function kann es nicht fälschen. Bei Abweichung: „Faktencheck nicht bestanden: 4,71 steht nicht in den Daten“; die Freigabe bleibt möglich. **Bekannte Grenze:** Eine erfundene Zahl, die zufällig einer Zahl der Eingabe gleicht (etwa einer Verhaltensnummer), fällt nicht auf; deshalb liest die Leitung jeden Entwurf.

**Datenbank:** Tabellen `monatsabschluesse`, `analysen` (Typ `person`, später `team_agenda`; je Salon, Monat, Typ und Person eine Zeile über einen Index mit `coalesce`), Funktionen `monat_abschliessen`, `abschluss_uebersicht`, `analyse_eingabe`, `analyse_pruefen`, `analyse_speichern`, `analyse_lesen`, `analyse_bearbeiten`, `analyse_freigeben`, interne Hilfen `analyse_zugriff`, `analyse_anonymisieren`, `analyse_zahlen`, `analyse_erlaubte_zahlen`, `analyse_faktencheck`, `analyse_zeile`.

**Edge Function `analyse-erstellen`** (Anmeldung der Person, `verify_jwt` an, **kein `service_role`-Schlüssel**): Eingabe holen → gleiche Eingabe und Prompt-Version wie gespeichert = kein neuer KI-Aufruf → der **n8n-Webhook** fragt Anthropic (JSON) → Faktencheck über die Datenbank → bei Abweichung bis zu zwei Wiederholungen (**höchstens 3 Aufrufe** insgesamt) → Entwurf speichern. Seit Version 1.3 mit Sammellauf, Gesamtauswertung und Agenda; Beschreibung in [`ki-funktionen.md`](ki-funktionen.md). Der Prompt liegt versioniert im Repo (`PROMPT_VERSIONEN`); wer ihn ändert, erhöht die Version, dann gilt die Eingabe als neu.

**Datenschutz:** Feedbacktexte gehen **ohne Namen und ohne Absender** über n8n an Anthropic. Der Hinweis steht auf „Monatsabschluss“ und auf „Info und Datenschutz“. Mitarbeiter bekommen keine Analysen.

**Abnahme:** keine Namen in der Eingabe (Test über alle Namensteile), erfundene Zahl wird erkannt, von Hand eingetragene falsche Zahl auch, Idempotenz (kein zweiter KI-Aufruf), Mitarbeiter `42501`, Salon-Grenze.

---

## 10. Erweiterung F: Fokus, Agenda, Termine, Mailversand (Migration 020)

**Ziel:** Aus den Ergebnissen eines Monats entsteht eine Agenda für das Teammeeting (15 bis 20 Minuten); Verantwortliche bekommen sie vor dem Termin per Mail.

### 10.1 Fokus-Verhalten

Die Leitung markiert Verhalten, die gerade besonders wichtig sind (Begründung, optional befristet). Tabelle `fokus_verhalten` (gesperrt; Zeitraum `gueltig_ab` bis `gueltig_bis`, leer = bis auf Weiteres, einschließlich dieses Tages). „Aus dem Fokus nehmen“ beendet den Eintrag gestern; die Geschichte bleibt, „wieder an“ legt einen neuen Eintrag an. Funktionen `fokus_liste()`, `fokus_umschalten(...)`; ein Verhalten eines anderen Salons: `42501`; Ende vor Beginn: `22023` und Constraint.

### 10.2 Agenda

Entsteht **aus den Daten ohne KI** (feste Vorlage `agenda-vorlage-v1`, alle Zahlen aus SQL). Fünf Blöcke in fester Reihenfolge; das **Zeitbudget prüft die Datenbank** (`agenda_validieren`, sonst `22023`):

| Block | Minuten (Vorlage) | Inhalt |
|---|---|---|
| Einstieg und Beteiligung | 2 | Danke, wie viele haben abgegeben |
| Team-Kennzahlen des Monats | 3 | Selbstbild, Fremdbild, Differenz, Stufe, Vormonat |
| Fokus-Verhalten | 6 bis 8 (7) | Priorität: 1. Fokus-Verhalten, 2. größte Teamdifferenzen, 3. größte Veränderungen zum Vormonat (höchstens drei) |
| Entwicklungsfelder und Differenzen | 3 bis 4 (4) | die drei niedrigsten Fremdbilder ohne Wiederholung aus dem Fokus-Block |
| Vereinbarungen | 2 bis 3 (2) | Leitfragen |

Summe 15 bis 20 (Vorlage 18). **Hinweis „Stand unvollständig“** oben, wenn der Monat nicht abgeschlossen ist oder Einzelanalysen oder Abgaben fehlen (Stand zum Zeitpunkt des Erzeugens). **Nur Teamebene:** keine Rangliste, keine Absender. Zu den Fokus-Verhalten stehen auf der **Plattform** bis zu zwei **anonymisierte Kommentar-Beispiele**, **nie in Mails und nie im PDF**.

Gespeichert als `analysen` vom Typ `team_agenda`. Funktionen `agenda_erzeugen`, `agenda_lesen`, `agenda_bearbeiten`, `agenda_freigeben` (Entwurf und freigegeben wie bei E; jede Bearbeitung macht wieder zum Entwurf). Die freigegebene Agenda steht am Ende des Monatsberichts als PDF.

### 10.3 Termine (nur Admin)

Tabelle `meeting_termine` (gesperrt): `startet_am` als `timestamptz`; eingegeben und angezeigt wird die **Ortszeit** (das Formular schickt „2026-10-26T10:00“ ohne Zeitzone, die Datenbank rechnet Sommer- und Winterzeit). Einzeln oder als **Serie** (wöchentlich, zweiwöchentlich, monatlich, bis 60); die Uhrzeit bleibt über die Zeitumstellung gleich. Bezugsmonat der Agenda: Standard ist der Monat vor dem Termin, auf Wunsch fest. Vorlauf: Agenda-Mail N Tage vorher (Standard 2), Erinnerung N Stunden vorher (Standard 1); mehrere Werte sind erlaubt, der größte löst aus. **Empfänger:** aktive Verantwortliche des Salons mit E-Mail, auf Wunsch zusätzlich der Admin in Kopie; **Mitarbeiter nie**. Termine werden nicht gelöscht, sondern als „entfernt“ gekennzeichnet; „Mails pausieren“ stoppt nur den Versand. Funktionen `termine_liste`, `termin_speichern`, `termine_serie`, `termin_entfernen` (alle `42501` für Nicht-Admin, auch für Verantwortliche).

### 10.4 Der Versand

Edge Function `agenda-versand` (Zeitplan alle 15 Minuten). Die Datenbank entscheidet, nicht der Kalender:

1. **`versand_faellig`:** Agenda-Mail ab „Termin minus größter Vorlauf in Tagen“ **in Ortszeit** (Mo 26.10. 10:00 minus 2 Tage = Sa 24.10. 10:00 Ortszeit, nicht 48 Stunden); Erinnerung ab „minus Stunden“. **Nach Terminbeginn nichts mehr.** Eine verpasste Agenda-Mail wird bis dahin nachgeholt.
2. **`versand_beanspruchen`:** `UNIQUE (termin_id, art)` in `mail_log` entscheidet, welcher Lauf sendet; ein zweiter bekommt `null`. **Höchstens 3 Versuche**; ein seit über 10 Minuten „in Arbeit“ hängender Lauf wird übernommen.
3. **`agenda_fuer_versand`:** die gespeicherte Agenda, sonst wird die Vorlage erzeugt; **Zeilen mit Kommentar-Beispielen sind entfernt**.
4. Senden über **Resend** mit Idempotenz-Schlüssel `<termin>-<art>`.
5. **`versand_abschliessen`:** gesendet oder Fehler (höchstens 500 Zeichen).

Mails: *vorab* (alle Blöcke mit Minuten, Hinweis, Link zur Agenda) und *kurz* (die drei wichtigsten Punkte, Link). Ist die Agenda noch nicht freigegeben, steht „Stand: Entwurf“ drin. Ohne Daten steht ein Hinweis statt einer leeren Agenda. Alle Inhalte sind maskiert; die Farben der Mail stehen fest (Mailprogramme kennen keine Tokens).

Die Versand-Funktionen der Datenbank sind **nur für `service_role`** aufrufbar. Die Edge Function läuft ohne JWT-Prüfung (`verify_jwt` aus), weil der Zeitplan keinen JWT hat; sie prüft stattdessen den Header `x-cron-secret` **in gleicher Zeit** (gegen Zeitangriffe). Fehlt ein Secret, antwortet sie `503` und fasst die Datenbank nicht an: **eine fehlende Einrichtung verbraucht keinen der drei Versuche.** `{"trocken": true}` zeigt nur, was fällig wäre.

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase der Function selbst bereit; der Schlüssel steht nie im Frontend, in der `.env` oder im Repo.

**Zeitplan von Hand:** `supabase/versand_einrichten.sql` (keine nummerierte Migration): legt das `CRON_SECRET` im **Vault** ab und plant `agenda-versand` per `pg_cron` und `pg_net` alle 15 Minuten ein. CRON_SECRET und Projekt-Referenz werden im Skript eingetragen (mit Platzhalter oder ungültigem Wert bricht es ab). Anhalten: `select cron.unschedule('agenda-versand');`.

### 10.5 Oberfläche

Drei neue Seiten unter **Leitung**: *Fokus* (`/app/leitung/fokus`), *Agenda* (`/app/leitung/agenda/:monat?`, auch der Link aus der Mail mit `?monat=YYYY-MM`), *Termine* (`/app/leitung/termine`, Route und Menüpunkt nur für den Admin). Die Terminliste zeigt den Mail-Zustand je Termin („geplant“, „gesendet“, „Fehler, Versuch 2 von 3“, „nach 3 Versuchen fehlgeschlagen“ mit Grund) und eine Warnung oben bei endgültigem Fehler. Eingaben werden vor dem Absenden geprüft; Vorlauf-Listen werden mit `;` oder Leerzeichen getrennt, **ein Komma ist das Dezimalzeichen** („0,5“).

**Abnahme:** Fälligkeit über die Zeitumstellung (25.10.2026: „vorab“ ab 08:00 UTC, nicht 07:59 und nicht erst 09:00; 28./29.03.); kein Versand nach Terminbeginn; kein Doppelversand; höchstens drei Versuche; hängender Lauf; Empfänger mit und ohne Admin-Kopie, nie Mitarbeiter; **kein Name und kein Kommentar in der Mail**; ein Verantwortlicher auf `/termine` wird nach `/app` umgeleitet.

---

## 11. Querschnitt

**Navigation:** ein einziger Menüpunkt **Leitung** (`/app/leitung`) mit der Unter-Navigation *Kommentare, Monatsabschluss, Fokus, Agenda* und, nur für den Admin, *Termine*. Grund: Die Kopfzeile bleibt einzeilig (auch bei 1200 px und schmaler). Neue Bedingung `admin` in `rechte.ts` (`RequireZugriff bedingung="admin"`).

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

**Migrationen**

| Nr. | Datei | Inhalt |
|---|---|---|
| 016 | `016_zeiterfassung.sql` | Sitzungen, Herzschlag, Kennzeichen, Auswertung |
| 017 | `017_pdf_export.sql` | Berichtsdaten und Export-Protokoll |
| 018 | `018_kommentar_auswertung.sql` | Kennzahlen und Schalter `eigene_analyse_nur_admin` |
| 019 | `019_monatsabschluss_analysen.sql` | Abschluss, Analysen, Faktencheck |
| 020 | `020_fokus_agenda_termine.sql` | Fokus, Agenda, Termine, Versandfunktionen |
| (010) | `010_testdaten_entfernen.sql` | erweitert: räumt auch Zeit-Sitzungen ab; im SQL-Editor ausführen (das Supabase-Werkzeug führt `delete` nicht aus) |

---

## 12. Abnahme in der neuen Plattform (Rauchtest)

Mit je einem Login pro Rolle. Alles hier lässt sich ohne Resend und ohne KI prüfen, außer den Punkten, die ausdrücklich eine Einrichtung brauchen.

**Mitarbeiter**
- Kein Menüpunkt „Leitung“; `/app/leitung/fokus`, `/app/leitung/agenda`, `/app/leitung/termine` leiten auf `/app` um.
- Umfrage ausfüllen und abgeben: am Ende steht die eigene aktive Zeit; keine Kennzahlen anderer.
- „Info und Datenschutz“ zeigt die Absätze zu Kommentaren, KI, Agenda und Mails und zur Ausfüllzeit.

**Verantwortlicher**
- Team-Dashboard: Abschnitt „Ausfüllzeit“; „Monatsbericht als PDF“ lädt ein PDF (Logo, Schrift, Fußzeile mit Seitenzahl).
- Leitung → Kommentare: Kennzahlen je Person, keine Kommentartexte.
- Leitung → Monatsabschluss: Monat abschließen; „Analyse erstellen“ liefert einen Entwurf, oder (ohne KI-Einrichtung) die Meldung „Die KI ist noch nicht eingerichtet“.
- Leitung → Fokus: ein Verhalten zum Fokus machen. Leitung → Agenda: erzeugen, bearbeiten, freigeben; das nächste Monatsbericht-PDF enthält sie.
- Kein Menüpunkt „Termine“.

**Admin**
- Leitung → Termine: einen Termin und eine Serie anlegen, ändern, pausieren, entfernen.
- „Info und Datenschutz“: Export-Protokoll mit den PDF-Abrufen.
- Versand-Probelauf (zeigt, was fällig wäre, ohne etwas zu senden):
  `curl -X POST https://<REFERENZ>.supabase.co/functions/v1/agenda-versand -H "x-cron-secret: <CRON_SECRET>" -H "content-type: application/json" -d '{"trocken": true}'`
  Erwartet: `200` mit `{"trocken":true,"faellig":[...]}`; ohne oder mit falschem Secret `401`; solange Secrets fehlen `503` mit der Liste der fehlenden.

**Datenbank**
- `supabase/fingerabdruck_version_1_3.sql` zeigt den Referenzwert aus Abschnitt 13.

---

## 13. Referenz-Fingerabdruck und Tests

**Referenzwert** (Referenz-Plattform, Stand Version 1.2; PostgreSQL von Supabase):

```
anzahl        = 240
fingerabdruck = 5f4e4158a303c943ce0740ad1b2efee2
```

Gleicher Wert nach dem Einspielen von 016 bis 020 = dieselbe Version 1.2. **Seit Version 1.3 (mit den Migrationen 021 und 022) gilt: 268 Objekte, Fingerabdruck `fa98e5a7992d020f501c3de08fb214a8`** (Skript `fingerabdruck_version_1_3.sql`); der Wert 240 lässt sich mit diesem Skript nicht mehr erzeugen, weil 021 einige Funktionen der Version 1.2 neu fasst. Bei Abweichung die Spalte `objekte` mit einem Referenz-Lauf zeilenweise vergleichen. Bekannte Ursachen: Kommentare im Funktionsrumpf, die beim Einspielen fehlten; eine andere Postgres-Hauptversion; Änderungen am Grundgerüst, die `v_ausfuelldauer` betreffen.

**Wie getestet wurde** (Vorgehen zum Wiederverwenden)

- **Datenbank lokal mit PGlite** (Postgres im Speicher, Stub für `auth` und Rollen): alle Migrationen **zweimal** laufen lassen (Idempotenz), Rechte je Rolle und für `anon`, Handrechnung gegen jede Kennzahl, Salon-Grenze mit einem zweiten Salon, Zeitumstellung mit festgesetztem „jetzt“ (`p_jetzt`-Parameter). Für Version 1.2: 516 Datenbankprüfungen (B 109, C 55, D 41, E 93, F 218), dazu 191 Unit-Tests (Vitest, alle Projektteile) und die Browser-Suiten je Erweiterung.
- **Fingerabdruck gegen die echte Datenbank:** `md5(pg_get_functiondef(...))` je Funktion plus Rechte, Spalten, Constraints und Indizes; lokal und in Supabase vergleichen (als Skript `fingerabdruck_version_1_3.sql`).
- **Test in der echten Datenbank mit Rollback:** ein `do $$ ... raise exception ... $$`-Block legt Testdaten an, prüft Rechte und Abläufe unter `set local role authenticated` und `service_role` und wirft am Ende absichtlich einen Fehler mit dem Ergebnis: alles wird zurückgerollt. Danach zählen, dass nichts übrig ist.
- **Logik der Edge Functions mit Vitest:** reines TypeScript ohne Deno-Bezug, Netz und Webhook nachgebaut.
- **Browser mit Playwright (Chromium):** Supabase-Antworten per `route` simuliert, Zeit mit `page.clock` gesteuert (ersetzt auch `performance.now()`); PDFs wirklich erzeugt und mit `poppler` geprüft; Handy-Breite (375 px), Hell und Dunkel, keine Konsolenfehler, kein waagerechter Überlauf.
- **Nicht testbar in der Sandbox:** die echte KI, der echte Versand über Resend und der Zeitplan. Diese laufen erstmals nach der Einrichtung.

---

## 14. Stolpersteine (aus der Umsetzung)

- **Supabase-Werkzeug:** wartet bei `DROP` und `DELETE` (auch `drop policy if exists`) auf eine Bestätigung und läuft in ein Zeitlimit; Migrationen ohne beides schreiben. Das Werkzeug trennt gelegentlich die Verbindung: Werkzeuge neu laden und den Zustand prüfen, bevor man wiederholt.
- **Fingerabdruck und Kommentare:** `pg_get_functiondef` enthält Kommentare **im Funktionsrumpf**. Wer beim Einspielen Kommentare weglässt, bekommt einen anderen Fingerabdruck. Kommentare vor die Funktion setzen.
- **Fingerabdruck und NOT-NULL:** In neueren Postgres-Versionen erscheinen `NOT NULL`-Constraints in `pg_constraint`; beim Vergleich `contype <> 'n'` ausschließen (das Skript tut es).
- **`text[] || 'Text'`** ist mehrdeutig (das Literal wird als Array gelesen): `array_append(arr, 'Text'::text)` verwenden.
- **`on conflict` mit Ausdrucksindex** (`coalesce(person_id, ...)`): funktioniert, wenn der Ausdruck im `on conflict` genauso geschrieben wird.
- **Zeitumstellung:** „N Tage vorher“ in der Wanduhrzeit des Ortes rechnen (`(startet_am at time zone 'Europe/Berlin') - make_interval(days => n)` und zurück), nicht als `n × 24 Stunden`.
- **`sendBeacon`** kann keine Anmeldung mitschicken; für den letzten Herzschlag `fetch` mit `keepalive: true`.
- **react-pdf:** `lineHeight` nicht an Seite oder Container (siehe C); SVG wird nicht gezeigt, das Logo als PNG zeichnen.
- **Edge Function ohne JWT:** Wer `verify_jwt` ausschaltet, muss in der Function selbst prüfen (Secret im Header, Vergleich in gleicher Zeit) und bei fehlender Konfiguration **vor** jedem Datenbankzugriff abbrechen.
- **Edge Function veröffentlichen:** Alle Dateien vollständig übergeben. Ein Platzhalter statt des Inhalts wird beim Veröffentlichen **nicht** bemerkt (das Linken passiert erst beim Start); danach Typcheck und Tests lokal laufen lassen.
- **Eingaben mit Komma:** Ein Komma ist zugleich Trenner und Dezimalzeichen. Festlegen: Trenner sind `;`, Leerzeichen oder „Komma + Leerzeichen“, ein Komma zwischen Ziffern ist dezimal; ein Test fängt das ab.
- **Oberflächen-Zustand nach dem Neuladen:** Eine Meldung („gespeichert“) geht verloren, wenn die Ansicht nach dem Neuladen neu aufgebaut wird (Schlüssel an der Komponente). Meldungen in die übergeordnete Komponente legen.
- **Browser-Tests:** Mock-Antworten werden beim Start einer Sitzung kopiert; spätere Änderungen wirken nicht (das Objekt vorher halten). Nach einer Aktion auf die **geänderte Anzeige** warten, nicht auf die Meldung, denn die erscheint vor dem Neuladen.
- **Sandbox:** `pkill -f` kann die eigene Shell treffen; Server mit eigener PID-Datei beenden.

---

## 15. Bekannte Grenzen

- Die **Agenda** entsteht in Version 1.2 aus einer Vorlage ohne KI. Die KI-Fassung gibt es seit Version 1.3 (Admin, derselbe Faktencheck, siehe `ki-funktionen.md`); die Vorlage bleibt daneben bestehen.
- Der Hinweis „Stand unvollständig“ gilt zum Zeitpunkt des Erzeugens.
- Die Mail geht als **eine** Mail an alle Empfänger (sie sehen sich gegenseitig; es sind nur Leitung und Admin).
- Der Hinweis zur Qualität einzelner Kommentare (Feld `kommentar_qualitaet_hinweis` in der Analyse-Ausgabe) ist nicht als eigene Oberfläche gebaut.
- Zeitzone und Sprache sind fest (siehe Abschnitt 3).
- Der **echte Versand, der Zeitplan und die echte KI** sind in der Entwicklung nicht live getestet (siehe Abschnitt 13).

---

## 16. Dateien, die dazugekommen sind

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
supabase/functions/analyse-erstellen/ (index.ts, analyse.ts, analyse.test.ts)      E, neu gefasst in 1.3 (nur n8n)
src/lib/agenda.ts, agenda.test.ts, src/pages/app/leitung/{Fokus,Agenda,Termine}.tsx F
supabase/functions/agenda-versand/ (index.ts, versand.ts, versand.test.ts)         F
supabase/versand_einrichten.sql                                                    F
supabase/vorpruefung_version_1_2.sql, supabase/fingerabdruck_version_1_3.sql       Übernahme
src/pages/app/leitung/Leitung.tsx, src/styles/leitung.css                          D bis F
src/lib/api.ts, src/lib/rechte.ts, src/App.tsx, src/lib/umfrage.ts                 geändert (Wrapper, Bedingung „admin“, Routen, Entwurfsschlüssel aus der Marke)
supabase/migrations/016 bis 020                                                    B bis F
docs/zeiterfassung.md, pdf-export.md, kommentar-auswertung.md,
     einzelanalyse.md, agenda-termine.md, ki-funktionen.md, version-1.2-aenderungen.md (diese Datei)
n8n/README.md, n8n/knoten/*.js                                                     1.3 (Workflow-Anleitung und Code-Knoten)
supabase/migrations/021_ki_funktionen.sql, 022_ki_agenda_nur_admin.sql           1.3
```

Die geänderten Dateien (`api.ts`, `rechte.ts`, `App.tsx`, `umfrage.ts`, `Info.tsx`, `pdf/*`) enthalten kleine Ergänzungen an bestehendem Code; beim Übernehmen in eine Plattform mit abweichendem Stand die Änderungen mit einem Vergleich (`diff`) einfügen, statt die Dateien zu überschreiben.

---

## 17. Auftragstext zum Einfügen

Zum Start einer Übernahme in einer neuen Sitzung (Platzhalter in `<...>` ersetzen):

```
Setze Version 1.2 der Salon-Plattform auf dieser Plattform um. Grundlage ist docs/version-1.2-aenderungen.md;
lies zuerst Abschnitt 2 (Übertragen) und Abschnitt 3 (Salon-Parameter).

Salon: <Name>, Slug: <slug>
Supabase-Projekt: <Referenz> (nur dieses Projekt anfassen, keine andere Instanz)
Plattform-Adresse: <https://...>, Absender der Mails: <Name <adresse@domain>>
Logo-Dateien: <Pfad oder „später“>, Akzentfarbe: <Wert oder „unverändert“>
Zeitzone und Sprache: Europe/Berlin, Deutsch (Du-Form)

Vorgehen: Vorprüfung ausführen, dann die Phasen A bis F nacheinander. Je Phase: Migration idempotent und ohne
DROP und DELETE, Tests gegen die Abnahme im Dokument, kurze Doku, dann die nächste Phase. Nicht bauen:
Teamvorstellung, Profile, Fotos (Migrationen 014 und 015 nicht übernehmen).
Am Ende: Fingerabdruck gegen den Referenzwert prüfen, dist bauen, Bericht auf Deutsch mit allem, was ich noch
selbst tun muss (Secrets, Resend, Zeitplan, v2 sperren, Testdaten entfernen).
```
