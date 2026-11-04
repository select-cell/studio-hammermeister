# Zeiterfassung der Monatsumfrage

Gebaut als Erweiterung B (Migration `016_zeiterfassung.sql`). Gemessen wird die **aktive Zeit**, in der jemand die Umfrage wirklich bearbeitet, nicht die Uhrzeit-Differenz zwischen Start und Absenden auf dem Gerät. Pausen, andere Tabs, ein gesperrter Bildschirm und eine verstellte Geräteuhr verfälschen das Ergebnis nicht.

## Grundsätze

- **Nichts wird verworfen.** Rohwerte bleiben stehen. Auffällige Sitzungen werden nur gekennzeichnet; sie zählen dann nicht in Median und Spanne, bleiben aber in der Personenliste sichtbar.
- **Die Serveruhr zählt.** Start, Herzschläge und Abgabe stempelt die Datenbank. Das Gerät liefert nur Zählerstände (aus `performance.now()`, nie aus `Date`), die der Server auf die echte Zeit deckelt.
- **Sicherheit in der Datenbank.** Die Tabellen sind für Anmeldungen gesperrt (wie alle `umfrage_*`-Tabellen); gelesen und geschrieben wird nur über Funktionen mit Rollenprüfung. Die eigene Zeit sieht jeder in der Antwort auf seine Abgabe, die Leitung über `zeit_auswertung()`.

## Was „aktiv“ heißt (Browser)

`src/lib/zeitmesser.ts` (reine Logik, Uhr wird übergeben) und `src/lib/zeiterfassung.ts` (Verbindung zu Seite und Server).

Aktiv ist die Zeit, in der **die Seite sichtbar ist und in den letzten 45 Sekunden eine Eingabe stattfand** (`LEERLAUF_MS`).

- Als Eingabe gelten Tippen, Klicken, Tippen auf dem Handy, Mausbewegung und Scrollen (die letzten drei höchstens alle 0,5 s) sowie ein laufendes Video (`meldeAktivitaet()` aus `VideoBox`; ein eingebetteter Vimeo-Player meldet sich über seine Zeit-Ereignisse, weil die Seite Klicks im Player nicht sieht).
- Verborgener Tab, Bildschirm aus oder Seite im Hintergrund: nichts wird gezählt. Die **Rückkehr in den Tab ist keine Eingabe**: Wer zurückkommt, muss erst etwas tun.
- Die Zeit wird dem Schritt gutgeschrieben, der gerade offen ist (Frontblatt 0, Entwicklung 1, Rituale, dann jedes Verhalten). Schrittzeiten werden abgerundet, damit sie zusammen nie mehr ergeben als die Gesamtzeit.
- Laufende Zeit wird bei `visibilitychange`, `pagehide`, `blur` und jedem Schrittwechsel gebucht.
- **Herzschlag:** alle 30 s und bei jedem Schrittwechsel geht der kumulierte Stand an `umfrage_heartbeat`. Beim Ausblenden oder Schließen der Seite geht er sofort mit `fetch(…, { keepalive: true })` raus. (`sendBeacon` fällt aus: es kann keine Anmeldung mitschicken.) Geht auch das schief, fehlen höchstens die letzten Sekunden.
- **Ohne Verbindung** zählt der Browser weiter und holt die Sitzung beim nächsten Takt nach; die Umfrage selbst hängt nie an der Zeiterfassung.
- Läuft vom Klick auf „Umfrage starten“ (oder einem wiederhergestellten Zwischenstand) bis zum Absenden.

## Datenbank

| Objekt | Zweck |
|---|---|
| `umfrage_sitzungen` | ein Ausfüllversuch: `gestartet_server`, `letzter_heartbeat`, `abgegeben_server`, `aktive_sek`, `gesamt_sek`, `abgabe_id`, `flags`, `dauer_gueltig` |
| `umfrage_schrittzeiten` | aktive Sekunden je Schritt (`schritt_index`, `verhalten_nr`, `verhalten_id`) |
| `umfrage_starten(monat, neu)` | beginnt eine Sitzung oder nimmt die offene wieder auf (Kennzeichen `wiederaufgenommen`); `neu` beendet die offene als `neu_begonnen` und startet eine neue |
| `umfrage_heartbeat(sitzung, aktive_sek, schritte)` | meldet den Stand; gedeckelt (siehe unten). Bei geschlossener Sitzung `{offen:false}`, kein Fehler |
| `umfrage_einreichen_v3(payload, sitzung, aktive_sek, schritte)` | speichert die Abgabe (über `umfrage_einreichen_v2`, alle bisherigen Prüfungen) und schließt die Sitzung ab. Antwort `{ id, aktive_sek }` |
| `zeit_auswertung(monat)` | nur Verantwortliche und Admin (sonst `42501`): Median/Spanne, Personenliste mit Kennzeichen, Zeit je Verhalten |
| `sitzung_buchen()` | interne Hilfe (nicht aufrufbar): Deckelung und Buchung |
| `salons.zeit_*` | Schwellen (siehe Kennzeichen) |

### Deckelung eines Herzschlags

Der gemeldete Stand ist ein **kumulierter** Wert. Der Server nimmt davon höchstens so viel an, wie

- nie weniger als bisher (ein niedrigerer Wert senkt nichts),
- höchstens die echte Serverzeit seit dem letzten Herzschlag plus `zeit_toleranz_sek` (10 s, für Netzwerk-Schwankungen) mehr als bisher,
- insgesamt höchstens die Zeit seit dem Start.

Die Schrittzeiten dürfen zusammen nie mehr wachsen als die aktive Zeit; der freigegebene Zuwachs wird in Schrittreihenfolge verteilt. Ein aufgeblähter Wert wird also gekappt, nicht geglaubt. Bei der Abgabe gilt `aktive_sek <= gesamt_sek`.

### Kennzeichen

| Kennzeichen | Wann | Wirkung |
|---|---|---|
| `zu_schnell` | aktive Zeit < Anzahl Verhalten × `zeit_min_sek_pro_verhalten` (5 s) | `dauer_gueltig = false` |
| `sehr_lang` | Gesamtdauer > `zeit_sehr_lang_sek` (4 Stunden) | `dauer_gueltig = false` |
| `viele_pausen` | aktiv / gesamt < `zeit_pausen_quote` (0,30) | nur Hinweis |
| `wiederaufgenommen` | Sitzung nach Neuladen oder auf anderem Gerät fortgesetzt | nur Hinweis |
| `heartbeat_luecke` | länger als `zeit_heartbeat_luecke_sek` (3 min) ohne Herzschlag | nur Hinweis |
| `neu_begonnen` | der Versuch wurde mit „Neu beginnen“ abgebrochen | die Sitzung ist beendet; die Leitung sieht die Zahl der Neustarts |
| `ohne_sitzung` | abgegeben ohne gestartete Sitzung (z. B. Netz weg beim Start) | keine geprüfte Zeit; die Geräteuhr wird bewusst nicht übernommen |

Die Schwellen stehen in `salons` und lassen sich im Supabase-Dashboard ändern, ohne Code.

**Zwei Folgen, die man kennen sollte:** Wer die Umfrage über mehrere Stunden verteilt ausfüllt, bekommt `sehr_lang` und `viele_pausen`, auch wenn die aktive Zeit stimmt: Die Rohzeit bleibt sichtbar, zählt aber nicht in den Schnitten. Und wer beim Einspielen der Plattform mitten in der Umfrage ist, bekommt eine Sitzung ab dem Moment des nächsten Aufrufs; die vorher gearbeitete Zeit fehlt, und `zu_schnell` kann einmalig fälschlich auftreten.

### Altes Feld und alte Auswertungen

`umfrage_abgaben.ausfuelldauer_sek` (Grundlage von `dauer_min` in den Auswertungen 006/011/012) wird jetzt mit der **aktiven Zeit** gefüllt, wenn `dauer_gueltig` gilt und sie zwischen 60 und 86 400 s liegt; `gestartet_am` ist der Serverstart. Ohne gültige Zeit bleibt das Feld leer. Die Ansicht `v_ausfuelldauer` liest aus den Sitzungen und hat neue Spalten `gesamt_min`, `flags`, `dauer_gueltig`. Die Rohdaten der Abgabe (`rohdaten`, `zeitpunkt_client`) bleiben unverändert.

`umfrage_einreichen_v2` bleibt vorerst aufrufbar, damit die bisher ausgelieferte Plattform weiter abgibt. **Sobald die neue Version online ist, wird v2 für Anmeldungen gesperrt** (eigene Migration), sonst ließe sich die Zeiterfassung umgehen.

## Anzeige

- **Mitarbeiter:** nur die eigene aktive Zeit auf der Abschlussseite („ausgefüllt in X Min“), aus der Antwort der Abgabe. Kennzeichen sehen sie nicht.
- **Leitung** (Team-Dashboard, Abschnitt „Ausfüllzeit“): Median und Spanne der gültigen Abgaben, Personenliste mit aktiver Zeit, Gesamtdauer und Kennzeichen (mit Erklärung im Tooltip), Zeit je Verhalten als Balken (Median) und als aufklappbare Heatmap Verhalten × Person.
- Hinweis für alle auf „Info und Datenschutz“.

## Tests

- **Datenbank** (PGlite, 109 Prüfungen): Rechte, Starten und Fortsetzen (auch zwei Tabs gleichzeitig), Deckelung (aufgeblähter Wert, niedrigerer Wert, lange Pause, Müll in den Schritten), Abgabe mit und ohne Herzschlag, Fehler (alles zurückgerollt), Doppelabgabe, fremde und falsche Sitzungen, alle Kennzeichen, „Neu beginnen“, Abgabe ohne Sitzung, alte Version v2, Auswertung und Rollen, Ansicht, Wartungsfunktion.
- **Zeitmesser** (Vitest, 15 Prüfungen): 120 s aktiv = 120 s, verborgen zählt nicht, 90 s ohne Eingabe = 45 s, Rückkehr ist keine Eingabe, Schritte, Stand vom Server übernehmen, Datumssprung ohne Wirkung.
- **Browser** (Playwright mit gesteuerter Uhr `page.clock`, die auch `performance.now()` ersetzt): 120 s aktiv → 120 ± 2 s; 60 s verborgen zählen nicht; 90 s ohne Eingabe → 45 s; Neuladen mitten in der Umfrage → dieselbe Sitzung, die Zeit läuft weiter; Geräteuhr +2 h ändert nichts; Ausfall beim Start → die Sitzung wird nachgeholt; Leitungsansicht in Hell, Dunkel und bei 360 px.
