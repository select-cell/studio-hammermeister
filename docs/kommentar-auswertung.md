# Kommentar-Auswertung (Erweiterung D)

Zeigt der Leitung, **wer** Kommentare schreibt, **wie ausführlich** und **wer keine** schreibt. Nur Verantwortliche und Admin (Migration `018_kommentar_auswertung.sql`); Mitarbeiter bekommen `42501`. Seite: **Leitung → Kommentare** (`/app/leitung/kommentare`).

## Datenschutz

- Die Auswertung zeigt Kennzahlen **je Person als Absender**, aber **nie einen Kommentartext**: weder mit noch ohne Absender. In den Team-Ansichten bleiben Kommentare anonym.
- Für das Team steht der Hinweis auf „Info und Datenschutz“ und auf dem Frontblatt der Umfrage: „Die Verantwortlichen sehen, wie häufig und ausführlich Feedback-Kommentare geschrieben werden.“
- **Schalter `salons.eigene_analyse_nur_admin`** (Standard: aus): Ist er an, sieht ein Verantwortlicher seine eigenen Werte nicht (Zeile, Verlauf und Listen); der Admin sieht alles. Die Team-Summen bleiben vollständig. Umstellen im Supabase-Dashboard: `update salons set eigene_analyse_nur_admin = true;`. Derselbe Schalter steuert später die Einzelanalyse.

## Kennzahlen (alle in SQL, Ansicht `v_kommentar_metriken`)

Je Absender und Monat:

| Kennzahl | Bedeutung |
|---|---|
| Kommentare, Quote | Kommentare ÷ Bewertungen in %, eine Nachkommastelle |
| Pflicht | Bewertung 4 oder 5, Kommentar vorgeschrieben; „erfüllt“ = davon mit Kommentar |
| Freiwillig, freiwillige Quote | Kommentare zu Bewertungen 1 bis 3 ÷ Bewertungen 1 bis 3. Nur diese Quote sagt, wie gern jemand schreibt; die Pflichtkommentare würden die Gesamtquote verzerren |
| Ø Wörter | Länge der Kommentare (auch getrennt für freiwillige) |
| Kurz | Anteil der Kommentare mit weniger als 5 Wörtern |
| Doppelt | Zahl der Wiederholungen desselben Textes (Groß-/Kleinschreibung und Leerzeichen zählen nicht) |
| Verhalten ohne Kommentar | Verhalten, zu denen der Absender nirgends etwas geschrieben hat |

Die Teamzahlen sind gewichtet (Summe der Wörter ÷ Summe der Kommentare), nicht Mittel der Mittel. Wer für den Monat nicht abgegeben hat, steht mit Hinweis in der Tabelle und in der Liste „Nicht abgegeben“ (nur, wenn die Person für den Monat überhaupt erwartet wird: `aktiv_ab` und Salonstart zählen). Wer abgegeben, aber nichts kommentiert hat, steht in „Ohne einen Kommentar“.

## Oberfläche

Kacheln (Quote, freiwillige Quote, Länge, Pflicht erfüllt), Tabelle je Person, Listen „Keine Kommentare im Monat“, Verlauf der Quote je Person und Monat. Der **Monatsbericht als PDF** enthält den Abschnitt „Kommentare je Person“ mit denselben Kennzahlen (ohne Texte).

Die Seite hängt unter dem neuen Menüpunkt **Leitung**, der auch die späteren Werkzeuge (Monatsabschluss, Fokus-Verhalten, Agenda, Termine) aufnimmt, damit die Kopfzeile nicht überläuft. Die Pfade `/verantwortlicher/kommentare` usw. aus der Bauanleitung heißen deshalb `/app/leitung/…`.

## Tests

- **Datenbank** (PGlite, 41 Prüfungen): sechs Personen mit festen Schreibprofilen (gemischt, nur Pflichtkommentare, keine Kommentare, sehr lange Kommentare, Textbaustein in wechselnder Schreibweise, sehr kurze Kommentare). Jede Kennzahl jeder Person wird gegen eine unabhängige Handrechnung in JavaScript geprüft, ebenso die Teamzahlen. Dazu: Rollen und gesperrte Ansicht, Monat ohne Abgabe, Verlauf, keine Kommentartexte in der Antwort, Schalter (an: 6 statt 7 Zeilen für Michael, Admin unverändert), Salon-Grenze.
- **Browser**: Menüpunkt und Weiterleitung, Kacheln und Tabelle gegen die Datenbank-Antwort, Listen, Verlauf, Schalter-Hinweis, Monatswechsel, Admin ja, Mitarbeiter nein (keine Seite, kein Aufruf), Hinweistexte; im PDF der neue Abschnitt ohne Kommentartexte.
