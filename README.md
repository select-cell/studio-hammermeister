# Salon-Plattform Hammermeister

Web-Plattform für das Team von Studio Hammermeister: Alle Teammitglieder loggen sich mit eigener E-Mail-Adresse und eigenem Passwort ein, füllen monatlich die Verhaltens-Umfrage aus und sehen ihre Ergebnisse. Der Verantwortliche (Michael Hammermeister, zugleich Teil des Teams) sieht alle Auswertungen und wird erinnert, wenn jemand überfällig ist.

- **Frontend:** React (Vite + TypeScript), gehostet auf Netlify
- **Backend:** Supabase (Datenbank, Login mit E-Mail und Passwort, Row Level Security, Funktionen)
- **Bauanleitung:** [`docs/plattform-architektur.md`](docs/plattform-architektur.md)

## Stand der Bauphasen

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Fundament: Login mit E-Mail und Passwort, Rollen, Begrüßungsbereiche, Platzhalter | Frontend und Datenbank gebaut, getestet und eingespielt. Offen: Logins der Teammitglieder anlegen (siehe „Person anlegen“) |
| 2 | Monatsumfrage in der Plattform | gebaut, getestet und eingespielt. Offen: Durchspielen mit echten Logins (siehe „Fertig, wenn“ Phase 2) |
| 3 | Auswertungen | gebaut, getestet und eingespielt (Datenbank `006`, Seiten Ergebnisse, Team, Mitglieder). Offen: Durchspielen mit echten Logins und echten Daten (siehe „Fertig, wenn“ Phase 3) |
| 4 | Abgabe-Status & Reminder | gebaut, getestet und eingespielt (Datenbank `008`, Status-Karte und Popup auf `/app`). Offen: Durchspielen mit echten Abgaben (siehe „Fertig, wenn“ Phase 4) |
| 5 | Chef-, Gäste- und Verantwortlichen-Umfrage | offen |
| 6 | Jarvis | offen |

## Lokal starten

Voraussetzung: Node.js (LTS, mindestens 20).

```bash
npm install
cp .env.example .env     # Werte aus Supabase eintragen (siehe unten)
npm run dev              # http://localhost:5173
```

Weitere Befehle: `npm run build` (Typprüfung + Produktions-Build nach `dist/`), `npm run typecheck`, `npm test`.

**`.env`:** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` aus Supabase → Project Settings → API. Der `service_role`-Key gehört **nie** ins Frontend, in die `.env` oder in dieses Repo.

## Supabase-Projekt

Die Datenbank liegt im Projekt **„select-cell's Project“** (Ref `obsakxdjfpaoajwsteiv`, `https://obsakxdjfpaoajwsteiv.supabase.co`). Eingespielt sind `umfrage_schema.sql`, `ausfuelldauer.sql` und die Migrationen `001` bis `009` sowie `011`. Das Supabase-Werkzeug hat 001 in drei Teilen (`001a`–`001c`), 005 in zwei Teilen (`005a`, `005b`), 006 in zwei Teilen (`006a`, `006b`) und 008 mit einer Nachbesserung (`008b`) eingespielt; der Inhalt ist identisch mit den Dateien (per Fingerabdruck geprüft). **`010` ist noch nicht eingespielt:** Das Werkzeug wartet bei Anweisungen mit `delete` auf eine Bestätigung und bricht dann ab. Die Datei einmal im SQL-Editor ausführen (siehe „Testzugang und Testdaten“). Der Salon Hammermeister, die 17 Verhalten mit 85 Bewertungsstufen, die sechs Teammitglieder (mit Platzhalter-Adressen) und der Admin sind angelegt.

Gut zu wissen:
- Das Projekt war vorher ein CRM-Projekt. Übrig sind die beiden Funktionen `set_updated_at` und `log_stage_change`; die Plattform braucht sie nicht.
- Die Auth-Einstellungen (Sign-ups, Passwort-Regeln) gelten für das ganze Projekt. Ein Login kommt in der Plattform nicht über „Dein Zugang ist noch nicht freigeschaltet“ hinaus, solange er keiner Person in `personen` zugeordnet ist.
- Das Projekt „Plattform Salon Dawiid“ ist eine andere Instanz und wird nicht angefasst.

## Supabase einrichten (neues Projekt, Schritt für Schritt)

1. Im SQL-Editor nacheinander ausführen:
   1. `supabase/umfrage_schema.sql`
   2. `supabase/ausfuelldauer.sql`
   3. `supabase/migrations/001_salons_personen.sql`
   4. `supabase/migrations/002_inhalte.sql`
   5. `supabase/migrations/003_seed_hammermeister_inhalte.sql` (erzeugt aus `referenz/umfrage-hammermeister.html` mit `node scripts/erzeuge-seed-inhalte.mjs`)
   6. `supabase/migrations/004_abgaben_ids.sql`
   7. `supabase/migrations/005_umfrage_funktionen.sql`
   8. `supabase/migrations/006_auswertungen.sql`
   9. `supabase/migrations/007_login_nur_bestaetigt.sql`
   10. `supabase/migrations/008_abgabe_status.sql`
   11. `supabase/migrations/009_teilnehmer_haben_salon.sql`
   12. `supabase/migrations/010_testdaten_entfernen.sql`
   13. `supabase/migrations/011_ergebnisse_nur_selbstbild.sql`
   
   Weitere Migrationen folgen nummeriert in `supabase/migrations/`.
2. **Authentication → Providers → Email:** aktiv, **„Allow new users to sign up“ aus**. Nur der Admin legt Logins an.
3. Optional: unter Authentication → Providers → Email die Passwort-Regeln (Mindestlänge) verschärfen. Das Formular der Plattform verlangt mindestens 8 Zeichen.

Die Plattform meldet mit E-Mail und Passwort an und verschickt **keine E-Mails**. Es braucht deshalb weder eigenen E-Mail-Versand (SMTP) noch Mail-Vorlagen noch Site URL oder Redirect URLs.

## Person anlegen (Admin)

1. Zeile in der Tabelle `personen` anlegen: Name, E-Mail, Rolle, `nimmt_an_teamumfrage`. Eine Vorlage für alle sechs Teammitglieder und den Admin liegt in `supabase/personen_anlegen.sql`.
2. In Supabase unter **Authentication → Users → Add user → Create new user** dieselbe E-Mail mit einem Start-Passwort anlegen und **„Auto Confirm User“ anhaken**.
3. Ein Datenbank-Trigger verknüpft Login und Person automatisch über die E-Mail (`personen.auth_user_id`), auch in umgekehrter Reihenfolge. Verknüpft wird nur ein Login mit **bestätigter** Adresse (Migration 007). Ohne „Auto Confirm User“ bleibt der Login unverknüpft und die Anmeldung wird abgewiesen („noch nicht freigeschaltet“).
4. Der Person das Start-Passwort sagen. Sie ändert es selbst: **Passwort ändern** neben ihrem Namen in der Navigation.

Die Platzhalter-Adressen `…@platzhalter.invalid` sollten für den Login taugen, weil nie eine E-Mail verschickt wird. Das ist noch nicht ausprobiert: Lehnt Supabase die Endung ab („Email address … is invalid“), vorher die echte Adresse in `personen` eintragen. Wer später auf eine echte Adresse umsteigt, tauscht den Zugang aus (die Person und alle ihre Abgaben bleiben erhalten, weil sie an `personen.id` hängen):

1. Authentication → Users: den Zugang mit der alten Adresse löschen (die Verknüpfung in `personen` löst sich dabei).
2. `update public.personen set email = 'echte@adresse.de' where email = 'alte@platzhalter.invalid';`
3. Neuen Zugang mit der echten Adresse anlegen („Auto Confirm User“), der Trigger verknüpft ihn wieder.

### Passwort zurücksetzen

Es gibt keinen Zurücksetzen-Link per Mail. Wer sein Passwort vergessen hat, bekommt vom Admin ein neues (SQL-Editor in Supabase):

```sql
update auth.users
   set encrypted_password = extensions.crypt('NEUES-START-PASSWORT', extensions.gen_salt('bf')),
       updated_at = now()
 where email = 'adresse@der-person.de';
```

Das Passwort steht danach im Verlauf des SQL-Editors. Die Person ändert es deshalb direkt nach der Anmeldung selbst. Das SQL beendet keine bestehenden Anmeldungen auf anderen Geräten. Soll ein Gerät sofort ausgesperrt werden, genügt `update public.personen set aktiv = false where email = '…';` (alle Datenfunktionen prüfen `aktiv`) oder das Löschen des Zugangs unter Authentication → Users.

| Merkmal | Schaltet frei |
|---|---|
| `nimmt_an_teamumfrage = true` | Teilnehmer-Bereiche: Umfrage, eigene Ergebnisse, Team-Ergebnisse, Chefumfrage ausfüllen, Coaching |
| `rolle` = `verantwortlicher` oder `admin` | Leitungs-Bereiche: Team-Dashboard, Mitglieder, Reminder, Chef- und Gästeumfrage-Ergebnisse |

Michael Hammermeister bekommt beides.

**Wichtig für Michael:** Welche Leitungs-Bereiche und welche Absender er sieht, hängt allein an der `rolle`, die ihm in `personen` zugeteilt ist. Als `mitarbeiter` sieht er weder das Team-Dashboard noch die Mitglieder noch Absender, als `verantwortlicher` alles davon (Absender bei sich selbst nur mit dem Schalter, siehe „Auswertungen“).

**Aktueller Stand der Personen:** Die sechs Teammitglieder sind mit Platzhalter-Adressen `…@platzhalter.invalid` angelegt (diese Endung kann keine Mails empfangen). Der Admin ist mit `select@voidos.de` angelegt und bereits mit seinem Login verknüpft. Michael Hammermeister steht derzeit mit der Rolle `mitarbeiter` in der Tabelle (Teilnehmer, aber ohne Leitungs-Bereiche und ohne Absender). Mit `rolle = 'verantwortlicher'` bekommt er Team-Dashboard, Mitglieder und die Absender der Ergebnisse anderer. Die Rolle ändert allein der Admin:

```sql
update public.personen set rolle = 'verantwortlicher' where name = 'Michael Hammermeister';
```

Für die Logins der Teammitglieder siehe „Person anlegen“.

## Auswertungen (Phase 3)

Alle Zahlen rechnet die Datenbank (Migration `006_auswertungen.sql`); das Frontend formatiert, sortiert und zeichnet nur. Die Schwellen (0,3 / 2,5 / 3,5) stehen in `salons`.

| Seite | Wer | Inhalt |
|---|---|---|
| `/app/ergebnisse` | Mitarbeiter | nur die eigenen Antworten: Selbstbild je Säule/Verhalten, Top/Flop nach Selbstbild, Detailtabelle, Verlauf, Monats-Detail mit eigenen Kommentaren |
| `/app/ergebnisse` | Verantwortlicher, Admin | eigene Kennzahlen mit Selbst- und Fremdbild, Differenz, Top/Flop, Detailtabelle, Verlauf, Monats-Detail |
| `/app/team` | Teilnehmer | Team nur als Durchschnitt, ohne einzelne Personen |
| `/app/team` | Verantwortlicher, Admin | Team-Dashboard: Ansicht-Umschalter Team ↔ Person, Rangliste, Differenz pro Person, Heatmap, Detailtabelle mit Spalte je Person |
| `/app/mitglieder`, `/app/mitglieder/:id` | Verantwortlicher, Admin | Liste und individuelle Auswertung je Person |

Die Monatsauswahl steht oben auf jeder Seite. Voreingestellt ist der **neueste Monat mit Abgaben** (die Umfrage für M bewertet M, deshalb ist M schon im laufenden Monat auswertbar). Ohne Säulen gruppiert die Plattform „je Verhalten“; ohne Rituale fehlen Tab und Linie.

**Mitarbeiter sehen nur ihre eigenen Antworten (Migration 011).** Wie die Kolleg:innen sie bewertet haben (Fremdbild, Differenz, Kommentare, Einzelnoten), steht in „Meine Ergebnisse“ nur für Verantwortliche und Admin, auch bei ihnen selbst. Das entscheidet die Datenbank: `meine_ergebnisse()` liefert Mitarbeitern die Auswertung aus `auswertung_selbstbild()`, die nur Zeilen mit `art = 'selbstbild'` liest. Die Antwort trägt `nur_selbstbild: true`, die Oberfläche zeigt dann nur Selbstbild und Ausfülldauer. Wer zum Verantwortlichen wird, sieht ab dem nächsten Laden alles, wer zurückgestuft wird, nur noch das Selbstbild. Die Seite „Team“ zeigt weiter nur Team-Schnitte (Ø Selbstbild und Ø Fremdbild des ganzen Teams, keine einzelne Person).

**Wer sieht die Absender der Kommentare und Einzelnoten?** Das entscheidet nur die Datenbank (`absender_sichtbar_fuer()`), das Frontend zeigt Namen nur, wenn die Antwort sie enthält:

| Rolle | Absender |
|---|---|
| Mitarbeiter | nie, auch nicht bei den eigenen Ergebnissen |
| Verantwortlicher | bei den Ergebnissen anderer: ja. Bei den Ergebnissen über sich selbst: nur mit dem Schalter unten |
| Admin | immer |

```sql
-- Verantwortlicher sieht auch bei sich selbst, wer was geschrieben hat (Standard: aus)
update public.salons set verantwortlicher_sieht_eigene_absender = true;
```

## Umfrage-Inhalte pflegen

Verhalten, Bewertungsstufen und Rituale stehen in der Datenbank und lassen sich ohne Code-Änderung ändern (Supabase SQL-Editor oder Table Editor):

```sql
-- Video zu einem Verhalten (Vimeo-Player-URL oder .mp4). Ohne Video läuft ein 8-Sekunden-Platzhalter.
update public.verhalten set video_url = 'https://player.vimeo.com/video/123456789' where nr = 1;

-- Grundpfeiler und Säule zuordnen (offener Punkt §9.1). Die Umfrage zeigt sie dann über dem Verhalten.
update public.verhalten
   set grundpfeiler = 'Grundpfeiler 1: Philosophie', saeule = 'Säule 1: Umgangsformen und Respekt'
 where nr in (1, 2, 3);

-- Ein Verhalten ausblenden (gilt nur für künftige Abgaben)
update public.verhalten set aktiv = false where nr = 17;
```

Beim Absenden werden die Texte jeder Abgabe als Momentaufnahme mitgespeichert. Spätere Textänderungen verfälschen deshalb keine alten Auswertungen. Ändert sich ein Verhalten oder das Team mitten im Monat, müssen alle, die noch nicht abgegeben haben, die neue Fassung ausfüllen; wer schon abgegeben hat, bleibt unverändert.

## Fristen der Umfrage

Die Umfrage für Monat M bewertet M und ist bis zum letzten Tag von M abzugeben (Berliner Zeit). Danach kann nachträglich abgegeben werden, die Karte „Deine Umfrage“ ist dann rot hervorgehoben. Eine Person muss ab `max(salons.start_monat, personen.aktiv_ab)` abgeben.

## Abgabe-Status und Reminder (Phase 4)

Verantwortliche und Admin sehen auf `/app` die Karte **Abgabe-Status** (wer hat für den Monat abgegeben, mit Zeitpunkt; Überfällige stehen oben, rot) und bekommen beim Öffnen ein **Popup**, solange jemand überfällig ist. Auch Michael steht als Teilnehmer in der Liste; fehlt seine eigene Abgabe, steht dort „Du hast …“.

**Wann ist jemand überfällig?** Die Frist für Monat M ist der letzte Tag von M. Die Tage danach zählen als „überfällig“: Am 5.11. fehlt der Oktober seit 5 Tagen. Erinnert wird, sobald diese Zahl **größer** ist als `salons.reminder_tage_nach_frist` (Standard 3). Die 3 Tage sind also Karenztage: Frist 31.10. → Reminder ab **4. November** (das Beispiel aus §6 der Bauanleitung). Berechnet wird live beim Abruf, es gibt keinen täglichen Job.

```sql
-- Erinnerung früher oder später beginnen lassen (Karenztage)
update public.salons set reminder_tage_nach_frist = 5;
```

**Popup:** Es lässt sich wegklicken (Schließen, Esc, Klick daneben) und kommt beim nächsten Besuch (neuer Tab oder neue Sitzung) wieder, solange etwas offen ist. Ändert sich die Menge der offenen Fälle, erscheint es auch im selben Tab sofort wieder.

**Zum Testen mit simuliertem Datum:** Als Verantwortlicher oder Admin `/app?heute=2026-11-04` aufrufen. Beide Funktionen (`abgabe_status`, `ueberfaellige_abgaben`) rechnen dann mit diesem Tag; ein gelber Hinweis zeigt die Testansicht an, es wird nichts verändert. Ungültige Angaben werden ignoriert, für Teammitglieder hat der Parameter keine Wirkung. Der 3.11. zeigt noch kein Popup, der 4.11. zeigt es.

## Testzugang und Testdaten

**Admin als Teilnehmer.** Setzt man beim Admin `nimmt_an_teamumfrage` auf `true` (Table Editor), bekommt er automatisch den Salon (Migration 009; ein Teilnehmer ohne Salon ist nicht mehr möglich). Seine Umfrage ist dann offen („Deine Umfrage für Oktober“ mit „Umfrage starten“), im Abgabe-Status steht er als „noch offen“ und wird nach der Frist wie alle anderen erinnert. Vorher meldete die Karte fälschlich „Erledigt“. Die anderen Teilnehmer bewerten den Admin dann mit, und seine Werte fließen in Teamschnitt und Rangliste ein.

**Testzugang.** Aktuell angelegt: `tobischw546@gmail.com` als „Testaccount“ (Mitarbeiter, nimmt an der Umfrage teil). So geht es für einen weiteren Testzugang:

1. Zeile in `personen`: `insert into public.personen (name, email, rolle, nimmt_an_teamumfrage) values ('Testaccount 2', 'adresse@beispiel.de', 'mitarbeiter', true);` (der Salon wird automatisch gesetzt)
2. Authentication → Users → Add user → Create new user mit Passwort, „Auto Confirm User“ anhaken. Die Verknüpfung entsteht automatisch.

**Testdaten wieder entfernen.** Testwerte würden sonst in Teamschnitten und Ranglisten stehen bleiben. Die Wartungsfunktion aus Migration 010 entfernt sie restlos und ist nur im SQL-Editor aufrufbar (nicht über die Plattform). Einmalig die Datei `supabase/migrations/010_testdaten_entfernen.sql` im SQL-Editor ausführen, danach:

```sql
-- Mitarbeiter-Testzugang: Daten UND Person entfernen
select public.testdaten_entfernen('tobischw546@gmail.com');

-- Admin: nur die Testdaten entfernen, die Person bleibt
select public.testdaten_entfernen('select@voidos.de', false);
-- und die Teilnahme wieder ausschalten, wenn gewünscht
update public.personen set nimmt_an_teamumfrage = false where rolle = 'admin';
```

Entfernt werden die Abgaben der Person samt Bewertungen, alle Bewertungen, die andere über sie abgegeben haben, und ihre Nennungen als „Entwicklung des Monats“. Die Antwort zeigt die Anzahl. Den Login des Testzugangs danach unter Authentication → Users löschen. Verantwortliche und Admin werden nie gelöscht.

## Nachtmodus

Neben „Passwort ändern“ im Kopf der Seite (am Handy im Menü) schaltet ein Symbol zwischen **Automatisch** (folgt dem Gerät), **Dunkel** und **Hell** um. Die Wahl gilt nur für diesen Browser. Technisch setzt `index.html` schon vor dem ersten Bild `data-theme` am `<html>` (kein Aufblitzen in Hell), `src/styles/tokens.css` enthält die dunkle Palette. **Farben stehen nur in `tokens.css`**, nicht fest in Komponenten, damit der Nachtmodus überall mitwechselt.

## Deploy (Netlify)

- **Weg A:** lokal `npm run build`, dann den Ordner `dist/` per Drag & Drop auf Netlify hochladen. Die `.env` wird dabei beim Bauen eingebacken.
- **Weg B (empfohlen):** Git-Repo mit Netlify verbinden. Gebaut wird bei jedem Push automatisch (`netlify.toml`), die Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` stehen in den Netlify-Einstellungen.

Für den Login muss die Netlify-Adresse nirgends in Supabase eingetragen werden. Die Datei `public/_redirects` sorgt dafür, dass alle Pfade der App (SPA) funktionieren.

## Fertig, wenn (Phase 1)

- Der Admin legt alle 6 Personen aus §2.1 an. Jede loggt sich mit eigener E-Mail und eigenem Passwort ein und landet im passenden Bereich.
- Michael sieht dabei Teilnehmer- **und** Leitungs-Kacheln.

## Fertig, wenn (Phase 2)

- Ein Teammitglied und Michael füllen eingeloggt die Umfrage aus. Jeder bewertet die 5 anderen, alles landet mit IDs in der Datenbank.
- Eine zweite Abgabe für denselben Monat wird abgelehnt.

Beides ist gegen die echte Datenbank und im Browser geprüft (mit simuliertem Login). Offen ist das Durchspielen mit echten Logins, sobald die E-Mail-Adressen da sind.

## Fertig, wenn (Phase 3)

- Ein Teammitglied sieht seine Ergebnisse ohne Absender-Namen und das Team nur als Schnitt.
- Michael sieht alles im Detail, inklusive sich selbst als Teammitglied (als Verantwortlicher).
- Alle Seiten funktionieren ohne Säulen und ohne Rituale.
- Die Zahlen stimmen mit den Views `v_selbst_vs_fremdbild` und `v_person_saeule` überein.

Geprüft: Datenbank lokal (PGlite, 100 Prüfungen inkl. Vergleich mit den Views) und in der echten Datenbank (Funktionen per Fingerabdruck identisch, Rechte-Szenarien als zurückgerollte Transaktionen); Oberfläche im Browser gegen Antworten der echten SQL-Funktionen (alle Seiten, alle Rollen, mit und ohne Säulen/Rituale, ohne Daten, Fehlerfälle, Handy-Breite). Offen: Durchspielen mit echten Logins und echten Daten.

## Fertig, wenn (Phase 4)

- Bei fehlender Abgabe erscheint ab Tag 3 nach Fristende (bei Frist 31.10. also ab dem 4.11.) das Popup. Geprüft mit simuliertem Datum.

Geprüft: Datenbank lokal (PGlite, 68 Prüfungen: Schwelle, Zeitzonen, mehrere Monate, Salon-Trennung, Rechte) und in der echten Datenbank (zurückgerollte Transaktion); Oberfläche im Browser gegen Antworten der echten SQL-Funktionen (Popup, Status-Karte, Testdatum, alle Rollen, Fehlerfälle, Handy-Breite). Offen: Durchspielen mit echten Abgaben.

## Projektstruktur

```
docs/                 Bauanleitung (Strategie & Architektur)
referenz/             Vorlagen: bestehende Umfrage, altes Board
supabase/             SQL: Ausgangsstand, migrations/, Vorlagen
public/_redirects     SPA-Routing für Netlify
src/
  lib/                supabase.ts, api.ts, monat.ts, rechte.ts, bereiche.ts, auswertung.ts, abgabe.ts, passwort.ts, darstellung.ts, useLaden.ts
  auth/               AuthProvider, RequireRole (Schutz der Routen)
  components/         Layout, Kacheln, Karten, StatusKarte und ReminderPopup (Abgabe-Status), DarstellungSchalter
  components/umfrage/ Ablauf, Seiten und Bausteine der Monatsumfrage
  components/auswertung/ Bausteine der Auswertungen (Kacheln, Diagramme, Rangliste, Heatmap, Tabellen)
  pages/              Start, Login, app/… (Passwort ändern, Umfrage, Auswertungen)
  styles/             tokens.css, base.css, umfrage.css, auswertung.css, abgabe.css
scripts/              erzeuge-seed-inhalte.mjs (Seed aus der Umfrage-Datei)
```
