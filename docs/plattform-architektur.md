# Salon-Plattform Hammermeister – Strategie & Architektur

**Stand:** 20. Oktober 2026 · **Salon:** Hammermeister · **Zielgruppe dieses Dokuments:** Claude Code als Bauanleitung

> **Grundlage:** Die Architektur ist 1:1 die der Dawiid-Plattform (`strategie/plattform-architektur.md`). Hammermeister ist eine **eigene Instanz**: eigenes Supabase-Projekt, eigene Netlify-Seite, gleicher Code-Aufbau. Abweichungen gibt es nur bei Personen, Rollen und Umfrage-Inhalten. Sie sind in §1, §2.1, §5.1 und §9 beschrieben.

---

## 0. Kurzfassung

Wir bauen eine Web-Plattform, auf der

- **alle Teammitglieder** mit **eigenem Zugang** sich einloggen, monatlich die Verhaltens-Umfrage ausfüllen und ihre eigenen Ergebnisse sowie die Team-Ergebnisse sehen,
- der **Verantwortliche** (Michael Hammermeister, Chef des Salons, bei Hammermeister **gleichzeitig Teil des Teams**) alle Ergebnisse jedes Teammitglieds sieht und erinnert wird, wenn jemand mit der Umfrage überfällig ist,
- der **Admin** (Betreiber der Plattform) alles sieht und die Zugänge in Supabase anlegt.

**Grundsatz:** Alles fußt auf den Antworten in Supabase. Die Plattform speichert jede Einzelantwort und rechnet alle Auswertungen selbst daraus (Selbstbild, Fremdbild, Abweichungen, Verläufe).

**Technik:** React-App (Vite + TypeScript), gehostet auf Netlify. Backend komplett in Supabase: Datenbank, Auth mit E-Mail und Passwort, Row Level Security und Datenbank-Funktionen.

**Design:** Der Look der bestehenden Umfrage wird übernommen (siehe §7). Er ist bei Dawiid und Hammermeister identisch.

---

## 1. Ausgangslage

| Was | Stand |
|---|---|
| Monatsumfrage | Einzelne HTML-Seite `umfragen/hammermeister-umfrage.html` (Stand 20.10.2026). Personen, Verhalten und Bewertungskriterien stehen fest im `CONFIG`-Objekt. Die feedbackgebende Person wählt ihren Namen aus einer Liste. Vorher lief die Umfrage über Typeform. |
| Speicherung | **Neues, eigenes Supabase-Projekt** (noch anzulegen). Ausgangsstand wie bei Dawiid: `supabase/umfrage_schema.sql` + `supabase/ausfuelldauer.sql` mit den Tabellen `umfrage_abgaben`, `umfrage_rituale`, `umfrage_bewertungen`, RPC `umfrage_einreichen(payload)` und den Auswertungs-Views `v_*`. |
| Zugriffsschutz | Tabellen per RLS für `anon`/`authenticated` komplett gesperrt. Auswertung bis zur Plattform nur im Supabase-Dashboard. |
| Daten | Noch keine Abgaben im neuen Projekt. Die Typeform-Altdaten werden nicht übernommen. |
| Personen | 6 Personen, siehe §2.1. Alle nehmen an der Teamumfrage teil. |
| Inhalte | **17 Verhalten** aus der Typeform. Bewertungsstufen für alle 17 (15 aus der Toolbox, 2 nachgereicht; Stufen Bewusstsein → High Performer, Prozente wie bei Dawiid). **Keine Grundpfeiler/Säulen** und **keine Rituale** (Stand jetzt). |
| Altes Board | „Salon Performance Dashboard“ (einzelne HTML-Seite, Passwortschutz, Daten aus Google Sheets, Jarvis über n8n-Webhook). Dient nur als Vorlage für Funktionen und Darstellung, **die Altdaten werden nicht übernommen**. Liefert die Vorlage für die Auswertungen (§5.6). |

**Referenzdateien im Repo:**

- `referenz/dashboard-alt.html`: das alte Board. Vorlage für Auswertungs-Bausteine und Jarvis. Es wird nicht 1:1 übernommen: Google Sheets, Passwortschutz und Webhook-URL im Browser fallen weg.
- `referenz/umfrage-hammermeister.html`: die bestehende Hammermeister-Umfrage. Sie ist die fachliche und gestalterische Vorlage für die Umfrage in der Plattform:

- Ablauf und Schritte
- Video-Pflicht vor der Bewertung; der Titel des Verhaltens steht über dem Video (Anpassung vom 20.10.2026, vorher stand er über den Bewertungen)
- Bewertungsstufen 1–5 mit Prozentangaben (seit 23.10.2026 nicht mehr als Aufklapp-Liste, sondern im „Locked-In“-Popup, siehe §7.3)
- Kommentarpflicht ab Bewertung 4
- Entwicklung des Monats
- Rituale: Der Rahmen kann sie, Hammermeister hat aktuell keine
- Zusammenfassung

---

## 2. Rollen & Rechte

| Rolle | Wer | Nimmt an Teamumfrage teil | Sieht |
|---|---|---|---|
| `mitarbeiter` | Antonella, Jaroslaw, Behzad, Olena, Lena | Ja: Selbstbild und Fremdbild aller anderen Teilnehmer | Eigene Ergebnisse (Selbstbild, Fremdbild-Schnitt, Differenz und der eigene Kommentar; **ohne** die Kommentare der Kollegen, Migration 012, siehe §5.6) und Team-Ergebnisse (nur Schnitte, keine Einzelpersonen) |
| `verantwortlicher` | Michael Hammermeister (Chef des Salons) | **Ja**, er ist bei Hammermeister **zugleich Teil des Teams**: Er bewertet und wird bewertet | Alles, was ein Teammitglied sieht (eigene Umfrage, eigene Ergebnisse), **plus** alles im Salon: Team, jedes Teammitglied im Detail inkl. Einzelbewertungen, Abgabe-Status, Reminder, später Chef- und Gästeumfrage |
| `admin` | Plattformbetreiber | Nein | Alles (gleiche Sicht wie Verantwortlicher). Pflegt Personen und Inhalte in Supabase. |

**Regeln**

- Wer an der Teamumfrage teilnimmt, steuert ein eigenes Feld (`nimmt_an_teamumfrage`), nicht die Rolle. Bei Hammermeister ist das Feld bei allen 6 Personen `true`, auch bei Michael.
- **Freischaltung nach zwei unabhängigen Merkmalen:**
  - `nimmt_an_teamumfrage = true` schaltet die Teilnehmer-Bereiche frei: „Deine Umfrage“, eigene Ergebnisse, Team-Ergebnisse, Chefumfrage ausfüllen (außer dem Verantwortlichen selbst), Coaching.
  - `rolle in ('verantwortlicher','admin')` schaltet die Leitungs-Bereiche frei: Team-Dashboard, Mitglieder, Reminder, Chef- und Gästeumfrage-Ergebnisse.
  - Michael bekommt **beides**. Sein Begrüßungsbereich zeigt seine eigene Umfrage-Karte **und** die Leitungs-Kacheln samt Reminder.
- Teammitglieder lesen **niemals** Rohdaten-Tabellen. Sie bekommen Ergebnisse nur über Datenbank-Funktionen, die die Absender-Namen weglassen (§5.3).
- Die Sichtbarkeit für Teammitglieder ist bewusst in einer Stelle gebündelt (diese Funktionen). Wenn sich die Regel ändert, wird nur dort angepasst.

### 2.1 Personen & Zugänge (Hammermeister)

Jede Person bekommt einen **eigenen Zugang** mit E-Mail und Passwort (§4). Der Admin legt alle an.

| Name | Rolle | `nimmt_an_teamumfrage` | E-Mail |
|---|---|---|---|
| Michael Hammermeister | `verantwortlicher` | `true` | *folgt* |
| Antonella Stipic | `mitarbeiter` | `true` | *folgt* |
| Jaroslaw Schatalov | `mitarbeiter` | `true` | *folgt* |
| Behzad Pour Sakha | `mitarbeiter` | `true` | *folgt* |
| Olena Pankova | `mitarbeiter` | `true` | *folgt* |
| Lena Reifschneider | `mitarbeiter` | `true` | *folgt* |
| Plattformbetreiber | `admin` | `false` | *folgt* |

Was aus Michaels Doppelrolle folgt:
- Er taucht in allen Team-Auswertungen als Person auf: Rangliste, Heatmap, Team-Schnitte, Abgabe-Status und Reminder.
- Er füllt die **Chefumfrage nicht** aus, weil sie ihn selbst bewertet.
- Ob er bei seinen **eigenen** Fremdbildern die Absender sieht, ist offen (§9).

---

## 3. Seitenstruktur

```
/                         Startseite (öffentlich)
/login                    Login mit E-Mail und Passwort → Weiterleitung nach /app
/gaeste-umfrage           [Phase 5] Gästeumfrage, öffentlich ohne Login (Link / QR-Code im Salon)

/app                      Begrüßungsbereich (Inhalt je nach Rolle)

── Teilnehmer der Teamumfrage (alle 6, inkl. Michael) ───────
/app                      Willkommen, Name · Karte „Deine Umfrage für <Monat>“ (offen/erledigt, Frist)
                          · Kurzüberblick eigene Entwicklung · Kacheln zu den Bereichen
/app/umfrage/:monat       Monatsumfrage (Teamumfrage), monat = YYYY-MM
/app/ergebnisse           Eigene Auswertung: Kennzahl-Kacheln, Top/Flop 4, Detailtabelle
                          (Selbstbild | Fremdbild | Rituale, sortierbar), Verlauf, Kommentare
/app/team                 Team-Ergebnisse (Schnitte, ohne Einzelpersonen)
/app/passwort             Eigenes Passwort ändern (alle angemeldeten Personen, auch Admin)
/app/chefumfrage          [Phase 5 · Platzhalter] Chefumfrage ausfüllen, einmal im Quartal (nicht für Michael)
/app/coaching             [Phase 6 · Platzhalter] Jarvis

── Verantwortlicher (Michael) / Admin – zusätzlich ──────────
/app                      Willkommen · Reminder-Popup (§6) · Abgabe-Status des laufenden Monats
                          · Kacheln zu den Bereichen
/app/team                 Team-Dashboard: Ansicht-Umschalter Team ↔ Person, Kennzahl-Kacheln,
                          Rangliste, SB-vs.-FB-Diagramm, Differenz pro Person, Top/Flop 4,
                          Heatmap Verhalten × Person, Detailtabelle (Spalte je Person + Ø Team)
/app/mitglieder           Liste aller Teammitglieder (mit Ø FB, Differenz, Abgabe-Status)
/app/mitglieder/:id       Individuelle Auswertung eines Teammitglieds: Verlauf über alle Monate,
                          Monats-Tabs, Score + Kommentar je Verhalten, inkl. wer wie bewertet hat
/app/chefumfrage          [Phase 5 · Platzhalter] Ergebnisse Chefumfrage
/app/gaeste               [Phase 5 · Platzhalter] Ergebnisse Gästeumfrage
/app/meine-umfrage        [Phase 5 · Platzhalter] Individueller Link: Umfrage für den Verantwortlichen (Inhalt folgt)
/app/coaching             [Phase 6 · Platzhalter] Jarvis
```

**Abgleich mit dem Mural-Board** (Stand 3. Okt. 2026):

| Mural-Kachel | Rolle | Umsetzung |
|---|---|---|
| Startseite → Login | alle | `/`, `/login` (E-Mail und Passwort) |
| Individueller Begrüßungsbereich | beide | `/app`, Inhalt je nach Rolle |
| Team-Ergebnisse | Mitarbeiter | `/app/team` (nur Schnitte) |
| Individuelle Auswertungs-Ergebnisse | Mitarbeiter | `/app/ergebnisse` |
| Individueller Link zur monatlichen Umfrage | Mitarbeiter | `/app/umfrage/:monat` |
| Chefumfrage einmal im Quartal | Mitarbeiter | `/app/chefumfrage` (ausfüllen, Phase 5) |
| Eingebetteter Jarvis | Mitarbeiter | `/app/coaching`, nur eigene Daten (Phase 6) |
| Team-Ergebnisse | Verantwortlicher | `/app/team` (volles Team-Dashboard) |
| Individuelle Auswertungs-Ergebnisse von jedem Mitglied | Verantwortlicher | `/app/mitglieder`, `/app/mitglieder/:id` |
| Ergebnisse Chefumfrage | Verantwortlicher | `/app/chefumfrage` (Ergebnisse, Phase 5) |
| Ergebnisse Gästeumfrage | Verantwortlicher | `/app/gaeste` (Phase 5) |
| Reminder, wenn nicht jeder ausgefüllt hat | Verantwortlicher | Popup + Status-Karte in `/app` (§6, Phase 4) |
| Individueller Link Umfrage Verantwortlicher | Verantwortlicher | `/app/meine-umfrage` (Phase 5, Inhalt folgt) |
| Eingebetteter Jarvis | Verantwortlicher | `/app/coaching`, volles Team (Phase 6) |
| Umfragetypen: Team / Chef / Verantwortlicher / Gäste | – | Teamumfrage Phase 2, übrige Phase 5 |
| *(nicht im Board)* Admin | Admin | Sicht wie Verantwortlicher + Pflege in Supabase |

- Platzhalter-Seiten existieren ab Phase 1 als „Kommt bald“-Kacheln, damit die Navigation schon die volle Struktur zeigt.
- Routen werden nach den zwei Merkmalen aus §2 geschützt. Wer keine Leitungsrolle hat, landet bei `/app/mitglieder/*` auf `/app`.
- Für Michael gibt es **eine** Navigation, die beide Bereiche zusammenführt, und kein Umschalten zwischen Rollen. `/app/team` zeigt ihm das volle Team-Dashboard.
- Der Schutz im Frontend ist nur Komfort. Die eigentliche Sicherheit liegt in RLS und den Funktionen in Supabase.

---

## 4. Login & Zugänge

> **Änderung (20.10.2026, Wunsch des Auftraggebers):** Die Plattform meldet mit **E-Mail und Passwort** an, **nicht** per Magic Link. Dadurch entfallen Custom SMTP (Resend), Mail-Vorlagen und der Rücksprung `/auth/callback`. Der Abschnitt ersetzt die frühere Fassung.

### 4.1 Ablauf für den Admin: Person anlegen

1. In Supabase in der Tabelle `personen` eine Zeile anlegen: Name, E-Mail, Rolle, `nimmt_an_teamumfrage` (für Hammermeister siehe Tabelle §2.1).
2. In Supabase unter **Authentication → Users → Add user → Create new user** dieselbe E-Mail mit einem Start-Passwort anlegen, **„Auto Confirm User“ anhaken**.
3. Ein Datenbank-Trigger verknüpft den Auth-Nutzer automatisch über die E-Mail mit der Person (`personen.auth_user_id`). Verknüpft wird nur ein Login mit **bestätigter** E-Mail-Adresse (Migration 007). So kann sich niemand mit der Adresse eines Teammitglieds selbst registrieren und dessen Rechte erben.
4. Das Start-Passwort der Person mitteilen (nicht per E-Mail oder Chat im Klartext an Dritte). Sie ändert es unter **Passwort ändern** (`/app/passwort`).

Vergessenes Passwort: Es gibt keinen Zurücksetzen-Link per Mail. Der Admin setzt ein neues Passwort (README, „Passwort zurücksetzen“).

### 4.2 Login für alle

- Auf `/login` werden E-Mail und Passwort eingegeben. Aufgerufen wird `supabase.auth.signInWithPassword({ email, password })`.
- Neue Zugänge entstehen dabei nie. „Allow new users to sign up“ ist in Supabase **aus**; Personen und Logins legt nur der Admin an.
- Bei unbekannter Adresse und bei falschem Passwort erscheint dieselbe Meldung, damit niemand durchprobieren kann, wer einen Zugang hat.
- Nach der Anmeldung: Session aktiv → `/app`. Die Rolle wird aus `personen` geladen.
- Ist eine Person eingeloggt, aber nicht in `personen` oder `aktiv = false`, erscheint ein Hinweis plus Logout.
- Angemeldete ändern ihr Passwort selbst unter `/app/passwort` (das aktuelle Passwort wird vorher geprüft, mindestens 8 Zeichen).
- Tokens in der Adresszeile werden nicht ausgewertet (`detectSessionInUrl` aus).

### 4.3 Supabase-Einstellungen

- Authentication → Providers → Email: aktiv, **„Allow new users to sign up“ aus**. „Confirm email“ ist für die Plattform unerheblich, weil der Admin Logins mit „Auto Confirm User“ anlegt.
- Authentication → Rate Limits: die Voreinstellungen für Anmeldungen genügen für ein Team dieser Größe.
- Passwort-Regeln (Mindestlänge usw.) unter Authentication → Providers → Email → Password. Die Plattform verlangt im Formular mindestens 8 Zeichen.
- Es werden **keine E-Mails** verschickt. Custom SMTP, Mail-Vorlagen sowie Site URL und Redirect URLs sind für den Login nicht nötig. Eine Netlify-Adresse als Site URL einzutragen schadet nicht, wird aber nicht gebraucht.

---

## 5. Datenmodell (Supabase)

**Neues Supabase-Projekt:** Zuerst `supabase/umfrage_schema.sql` und danach `supabase/ausfuelldauer.sql` ausführen. Das ist der Ausgangsstand, identisch mit Dawiid. Diese Tabellen werden danach **erweitert**, nicht ersetzt. Alles weitere läuft als nummerierte Migrationen in `supabase/migrations/`.

### 5.1 Neue Tabellen

```sql
-- Salons (pro Instanz einer, aber von Anfang an mitgeführt)
salons (
  id            uuid pk default gen_random_uuid(),
  name          text not null,            -- 'Hammermeister'
  start_monat   date not null,            -- ab diesem Monat zählen Umfragen/Reminder (1. des Monats)
  erstellt_am   timestamptz default now()
)

-- Personen = die Brücke zwischen Login und Fachlichkeit
personen (
  id                    uuid pk default gen_random_uuid(),
  salon_id              uuid references salons,      -- null erlaubt nur bei rolle='admin'
  auth_user_id          uuid unique references auth.users on delete set null,
  name                  text not null,               -- Anzeigename, z. B. 'Antonella Stipic'
  email                 text not null unique,        -- lower-case
  rolle                 text not null check (rolle in ('mitarbeiter','verantwortlicher','admin')),
  nimmt_an_teamumfrage  boolean not null default false,
  aktiv                 boolean not null default true,
  aktiv_ab              date,                        -- erster Monat, für den die Person abgeben muss
  erstellt_am           timestamptz default now()
)
```

Inhalte der Umfrage wandern aus dem Code in die Datenbank, damit sie ohne Code-Änderung pflegbar sind:

```sql
verhalten (
  id            uuid pk, salon_id uuid references salons,
  nr            smallint not null,           -- Reihenfolge / verhalten_nr
  grundpfeiler  text, saeule text,
  titel         text not null,
  video_url     text,                        -- Vimeo-Player-URL oder .mp4, leer = Platzhalter
  aktiv         boolean default true,
  unique (salon_id, nr)
)

verhalten_kriterien (
  id            uuid pk, verhalten_id uuid references verhalten on delete cascade,
  stufe         smallint not null check (stufe between 1 and 5),
  bezeichnung   text,                        -- '1 – Bewusstsein'
  prozent       text,                        -- '0–25%'
  leitsatz      text,
  punkte        text[] not null default '{}',
  unique (verhalten_id, stufe)
)

rituale (
  id uuid pk, salon_id uuid references salons, nr smallint, titel text not null,
  video_url text, aktiv boolean default true
)

ritual_fragen (
  id uuid pk, ritual_id uuid references rituale on delete cascade,
  nr smallint not null,
  typ text not null check (typ in ('skala','auswahl','text')),
  frage text not null,
  optionen text[],        -- bei 'auswahl'
  labels text[],          -- optionale Skalen-Labels
  pflicht boolean default false
)
```

Die heutigen Inhalte aus `CONFIG.verhalten` und `CONFIG.rituale` der Referenzdatei werden per Seed-Migration (`seed_hammermeister_inhalte.sql`) eingespielt:
- **17 Verhalten** in der Reihenfolge der Referenzdatei
- **Bewertungsstufen** für alle 17 Verhalten
- `grundpfeiler` und `saeule` sind vorerst `null` (Zuordnung folgt, §9)
- **keine Rituale**

**Wichtig für das Frontend:** Alle Bausteine müssen mit fehlenden Inhalten umgehen können:
- **Ohne Säulen:** Gruppierungen und Säulen-Diagramme fallen auf „je Verhalten“ bzw. „Gesamt“ zurück.
- **Ohne Rituale:** Der Rituale-Tab, die Rituale-Linie im Verlauf und die Rituale-Kennzahlen werden ausgeblendet.
- **Ohne Kriterien:** Das Popup zeigt nur die Zahl und das Kommentarfeld; die Stufennamen unter den Zahlen fallen auf die Standardnamen zurück.

Sobald die Inhalte nachgereicht sind, erscheinen diese Teile automatisch. Dafür sind keine Code-Änderungen nötig.

### 5.2 Erweiterung der bestehenden Tabellen

```sql
alter table umfrage_abgaben
  add column salon_id          uuid references salons,
  add column feedbackgeber_id  uuid references personen;

-- Bereits vorhanden seit supabase/ausfuelldauer.sql (Okt 2026):
--   gestartet_am      timestamptz  – Start der Umfrage laut Gerät
--   ausfuelldauer_sek integer      – Dauer bis zum Absenden, 60–86400 s, sonst null
--   Ansichten v_abgabe_status (mit ausfuelldauer_min) und v_ausfuelldauer

alter table umfrage_bewertungen
  add column bewertende_person_id uuid references personen,
  add column bewertete_person_id  uuid references personen;
```

- Die Namens-Spalten (`salon`, `feedbackgeber`, `bewertete_person` …) bleiben als **Momentaufnahme** erhalten. Für Auswertungen zählen ab jetzt die IDs.
- Fragetexte und Verhaltenstexte werden wie bisher pro Abgabe mitgespeichert. Alte Auswertungen bleiben dadurch stimmig, auch wenn Texte später geändert werden.
- `rohdaten` bleibt als Sicherung.
- Eindeutigkeit: neu `unique (salon_id, monat, feedbackgeber_id)`.
- **Migration früher Abgaben:** Falls die HTML-Umfrage schon vor der Plattform ins neue Projekt speichert, setzt ein Backfill die IDs über den Namensabgleich mit `personen`. Testabgaben dürfen danach gelöscht werden.

### 5.3 Datenbank-Funktionen (die eigentliche Logik)

Alle mit `security definer`, `set search_path = public`. Jede prüft am Anfang die Rolle des Aufrufers über `auth.uid()` → `personen`.

| Funktion | Wer darf | Liefert |
|---|---|---|
| `ich()` | alle eingeloggten | eigene Zeile aus `personen` (id, name, rolle, salon) |
| `umfrage_inhalt()` | alle eingeloggten | aktive Verhalten inkl. Kriterien, Rituale inkl. Fragen, bewertbare Kollegen (alle aktiven Teamumfrage-Teilnehmer außer mir) |
| `meine_offenen_monate()` | Teilnehmer | Monate ab `max(start_monat, aktiv_ab)` bis einschließlich laufendem Monat ohne Abgabe, jeweils mit Frist |
| `umfrage_einreichen_v2(payload)` | Teilnehmer | speichert eine Abgabe (siehe unten), gibt `abgabe_id` zurück |
| `meine_ergebnisse(von, bis)` | Teilnehmer | pro Monat × Verhalten: Selbstbild, Fremdbild-Schnitt, Anzahl Fremdbilder, Abweichung; Säulen- und Grundpfeiler-Schnitte. **Kommentare zum Fremdbild nur für Verantwortliche und Admin** (Absender nach `absender_sichtbar_fuer`); bei Mitarbeitern leer, mit `ohne_fremdkommentare = true` |
| `team_ergebnisse(von, bis)` | alle eingeloggten | pro Monat × Verhalten/Säule: Team-Schnitt Selbstbild, Team-Schnitt Fremdbild, Rituale-Schnitte, Entwicklung des Monats (nur Anzahl Nennungen pro Person) |
| `person_ergebnisse(person_id, von, bis)` | verantwortlicher, admin | wie `meine_ergebnisse`, aber **mit** Absender je Fremdbild und Kommentar |
| `abgabe_status(monat)` | verantwortlicher, admin | pro Teilnehmer: abgegeben ja/nein, Zeitpunkt |
| `ueberfaellige_abgaben()` | verantwortlicher, admin | Reminder-Liste (§6) |

**`umfrage_einreichen_v2` – Regeln:**

- Der Feedbackgeber kommt aus `auth.uid()`, **nie** aus dem Payload. Dadurch kann niemand im Namen einer anderen Person abgeben.
- `monat` muss in `meine_offenen_monate()` enthalten sein. Keine Zukunft, kein doppeltes Abgeben.
- Bewertete Personen müssen genau die aktiven Teamumfrage-Teilnehmer sein, über ihre IDs. Dazu kommt das eigene Selbstbild.
- Die bestehenden Prüfungen bleiben: Bewertung 1–5, Kommentarpflicht ab Bewertung 4, Entwicklung des Monats nicht an sich selbst.
- Alles in einer Transaktion, wie bisher.

**Grant:** `execute` nur an `authenticated`.

**Alte Funktion:** Die alte `umfrage_einreichen` verliert das `anon`-Recht, sobald die Umfrage in der Plattform live ist (Ende Phase 2). Bis dahin läuft die alte HTML-Umfrage parallel weiter.

> **Umgesetzt mit Migration 005 (20.10.2026):** Die Rechte sind für `anon` **und** `authenticated` entzogen. Die alte Funktion nimmt Namen aus dem Payload; solange Eingeloggte sie aufrufen könnten, ließe sich damit im Namen anderer abgeben und die Regeln von `umfrage_einreichen_v2` umgehen. Die alte HTML-Umfrage war nie mit diesem Projekt verbunden (`CONFIG.supabase` leer), es gibt also nichts, was parallel weiterlaufen müsste.

### 5.4 Row Level Security

- `personen`: Lesen der eigenen Zeile für alle. Lesen aller Zeilen des eigenen Salons für Verantwortlicher und Admin. Schreiben nur im Supabase-Dashboard.
- `verhalten`, `verhalten_kriterien`, `rituale`, `ritual_fragen`: Lesen für eingeloggte Nutzer des Salons.
- `umfrage_abgaben`, `umfrage_rituale`, `umfrage_bewertungen`: **kein direkter Zugriff** für `authenticated`. Alles läuft über die Funktionen aus §5.3.
- Bestehende Views `v_*` bleiben für die Auswertung im Supabase-Dashboard.

### 5.5 Kennzahlen (Version 1, wird verfeinert)

Rechenbasis für alle Auswertungen. Die Feinheiten zu Selbst- und Fremdbild folgen, sobald alle Daten da sind. Die Berechnungen deshalb an **einer** Stelle halten, also in SQL-Funktionen und nicht im Frontend.

- **Selbstbild** = eigene Bewertung je Verhalten und Monat
- **Fremdbild** = Durchschnitt der Bewertungen der Kollegen je Verhalten und Monat
- **Abweichung** = Selbstbild − Fremdbild
  - positiv = man schätzt sich besser ein, als andere einen sehen
  - negativ = man unterschätzt sich
- **Verdichtung** je Säule, Grundpfeiler und gesamt (Durchschnitt der Verhalten)
- **Verlauf** = Veränderung zum Vormonat und Zeitreihe über alle Monate
- **Team-Schnitt** = Durchschnitt über alle Teilnehmer
- **Rituale** = Skalen-Schnitte, häufigste „am wenigsten stabile Phase“
- **Entwicklung des Monats** = Nennungen pro Person
- **Differenz-Einordnung** (aus dem alten Board):
  - |SB − FB| ≤ 0,3 → „Ausgewogen“ (grün)
  - SB − FB > 0,3 → „Selbstüberschätzung“, in der Team-Sicht „SB > FB“ (rot)
  - SB − FB < −0,3 → „Selbstunterschätzung“, in der Team-Sicht „FB > SB“ (rot)
- **Score-Niveau** für Farben in Tabellen und Heatmap: hoch ≥ 3,5 · mittel 2,5–3,5 · niedrig < 2,5
- **Ausfülldauer** = `ausfuelldauer_sek` in Minuten; Team-Ø = Durchschnitt der Personen
- Alle Schwellen (0,3 / 2,5 / 3,5) als Einstellungen in `salons` ablegen, nicht fest im Code.

### 5.6 Auswertungs-Bausteine (übernommen aus dem alten Board)

Alle Bausteine beziehen sich auf einen **gewählten Monat** (Monatsauswahl oben auf jeder Auswertungsseite, Standard: letzter abgeschlossener Monat). Der Verlauf zeigt alle Monate.

| Baustein | Inhalt | Teammitglied (`/app/ergebnisse`, `/app/team`) | Verantwortlicher / Admin |
|---|---|---|---|
| **Ansicht-Umschalter** | Tabs „Team“ + je Person; alle Bausteine darunter passen sich an | – | ✓ |
| **Kennzahl-Kacheln** | Ø Selbstbild · Ø Fremdbild · Differenz mit Einordnung · Ø Ausfülldauer | ✓ eigene Werte; Team-Kacheln nur mit Schnitten | ✓ Team oder Person |
| **Rangliste** | Teammitglieder nach Ø Fremdbild, Platz 1–3 hervorgehoben, gewählte Person markiert | – | ✓ |
| **Selbstbild vs. Fremdbild** | Gruppiertes Balkendiagramm (Kupfer = SB, Blau = FB); Team-Sicht: je Person, Personen-Sicht: je Säule | ✓ eigene, je Säule | ✓ |
| **Differenz pro Person** | Balken SB − FB je Person, grün/rot nach Einordnung | – | ✓ (Team-Sicht) |
| **Top 4 / Flop 4 Verhalten** | Höchste und niedrigste Verhalten nach Ø Fremdbild, mit Säule | ✓ eigene + Team | ✓ Team oder Person |
| **Heatmap (Segmentanalyse)** | Matrix Verhalten × Person im Fremdbild, Farbe nach Score-Niveau, Zeilen nach Säule gruppiert | – | ✓ |
| **Detailtabelle** | Tabs Selbstbild / Fremdbild / Rituale. Team-Sicht: Spalte je Person + Ø Team. Personen-Sicht: SB · FB · Differenz. Sortierung „Standard“ (nach Säulen gruppiert) / „Höchste“ / „Niedrigste“ (ohne Gruppierung) | ✓ Personen-Sicht (eigene) | ✓ beide Sichten |
| **Verlauf** | Liniendiagramm Ø SB, Ø FB, Ø Rituale über alle Monate | ✓ eigener | ✓ je Person und Team |
| **Monats-Detail** | Monats-Tabs; je Verhalten Score + Kommentar(e) | ✓ ohne die Kommentare der Kollegen (nur der eigene Kommentar) | ✓ mit den Kommentaren der Kollegen und Absender nach Regel |

**Mitarbeiter sehen die Kommentare der Kollegen nicht** (Anpassung vom 20.10.2026, Migration 012): In „Meine Ergebnisse“ bleibt alles wie bisher; nur die Fremdbild-Kommentare der einzelnen Kollegen fehlen, es steht der eigene Kommentar. Das setzt die Datenbank durch (`meine_ergebnisse` leert für Mitarbeiter `kommentare` und `fremdbilder`), nicht das Frontend. Verantwortliche und Admin sehen die Kommentare, auch bei sich selbst. Die Team-Seite bleibt unverändert.

Datenbasis: Die Funktionen aus §5.3 liefern die Zahlen. Ergänzend:

- `team_dashboard(monat)` (verantwortlicher, admin): je Person Ø SB, Ø FB, Differenz, Ausfülldauer, Rang sowie die Matrix Verhalten × Person (für Heatmap und Detailtabelle) in **einem** Aufruf
- `meine_ergebnisse` und `person_ergebnisse` liefern zusätzlich die Ausfülldauer und die Monatsliste für den Verlauf

Diagramme mit Recharts, Farben wie im alten Board: SB `#C4845A`, FB `#4A7FA5`, Rituale `#4CAF50`.

---

## 6. Abgabefrist & Reminder

- Die Umfrage für Monat **M** bewertet Monat M und ist **bis zum letzten Tag von M** auszufüllen (Europe/Berlin).
- Nach der Frist kann weiterhin nachträglich für M abgegeben werden. Die Abgabe gilt dann als verspätet.
- **Überfällig** heißt: Für einen aktiven Teilnehmer fehlt die Abgabe für M, und heute ist mindestens 3 Tage nach Fristende.
  - Beispiel: Frist Oktober = 31.10. → Reminder ab **4. November**.
  - Die 3 Tage stehen als Einstellung (`reminder_tage_nach_frist`, Standard 3) in `salons`.
- `ueberfaellige_abgaben()` liefert je Teilnehmer und offenem Monat: Name, Monat, Tage überfällig. Berechnet wird live beim Abruf, ein täglicher Job ist nicht nötig.
- **Anzeige:** Beim Öffnen von `/app` erscheint für Verantwortliche und Admin ein **Popup**, wenn die Liste nicht leer ist. Zum Beispiel: „Olena Pankova hat die Umfrage für Oktober noch nicht abgegeben (5 Tage überfällig).“
  - Das Popup lässt sich wegklicken und kommt beim nächsten Besuch wieder, solange noch etwas offen ist.
  - Zusätzlich gibt es eine dauerhafte Status-Karte im Dashboard.
- **Alle Teilnehmer** (auch Michael) sehen im eigenen Begrüßungsbereich die offene Umfrage mit Frist. Ist sie überfällig, ist sie farblich hervorgehoben.
> **Umgesetzt mit Migration 008 (20.10.2026):** Das Beispiel „Frist 31.10. → ab 4. November“ ist maßgeblich. Die Karenztage zählen ab dem Tag nach dem Fristende: `tage_ueberfaellig = heute − Fristende`, erinnert wird bei `tage_ueberfaellig > reminder_tage_nach_frist`. `abgabe_status(monat, heute)` und `ueberfaellige_abgaben(heute)` haben den optionalen Parameter `heute` für den Test mit simuliertem Datum (nur Verantwortliche und Admin, nur lesend); in der App geht das mit `/app?heute=2026-11-04`. Das Popup (natives `<dialog>`) merkt sich das Wegklicken je Sitzung (`sessionStorage`) und erscheint früher wieder, wenn sich die Menge der offenen Fälle ändert.

- **Später optional:** tägliche E-Mail an den Verantwortlichen über `pg_cron` + Edge Function + Resend. Nicht Teil der ersten Version.

---

## 7. Frontend

### 7.1 Technik

- **Vite + React + TypeScript**, React Router, `@supabase/supabase-js`
- Charts: Recharts
- Kein UI-Framework. Eigenes, schlankes CSS mit den Design-Tokens aus der Referenzdatei.
- Konfiguration über `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Niemals den `service_role`-Key ins Frontend.
- Datenzugriff gebündelt in `src/lib/api.ts`, als dünne Wrapper um `supabase.rpc(...)`.

### 7.2 Design (aus der bestehenden Umfrage übernehmen)

```css
--cream:#FAF8F3; --cream-mid:#F0EBE0; --cream-deep:#E2D9C8;
--accent:#C4845A; --accent-h:#A86840;
--text:#1A1208; --text2:#6B5B45; --muted:#9B8E7E;
--green:#3B6D11; --gbg:#EAF3DE; --red:#A32D2D; --rbg:#FCEBEB;
--yel:#854F0B; --ybg:#FAEEDA; --fb:#4A7FA5;
Schriften: DM Serif Display (Überschriften), DM Sans (Text)
Radien 8/12/16/20px, weicher Schatten, Karten auf Creme-Hintergrund
```

- Farbcode Selbstbild = Akzent (Kupfer), Fremdbild = Blau (`--fb`), wie in der Umfrage.
- **Nachtmodus** (Wunsch des Auftraggebers, 20.10.2026): dunkle Palette in `tokens.css` unter `data-theme="dark"`; Umschalter Automatisch / Dunkel / Hell im Kopf der Seite, Wahl je Browser. Farben stehen nur in den Tokens.
- Mobil zuerst: Das Team nutzt die Plattform vor allem am Handy.

### 7.3 Umfrage in der Plattform

Fachlich 1:1 wie die Referenzdatei. Unterschiede:

- **Keine Namensauswahl** mehr. Feedbackgeber ist die eingeloggte Person.
- Inhalte kommen aus `umfrage_inhalt()` statt aus `CONFIG`.
- Monat kommt aus der Route und wird angezeigt („Umfrage Oktober 2026“).
- Einreichen über `umfrage_einreichen_v2`.
- **Ausfülldauer:** Beim Öffnen der Umfrage wird der Startzeitpunkt festgehalten und mitgeschickt (`gestartet_am`). Die Funktion berechnet daraus `ausfuelldauer_sek`. Unplausible Werte (unter 1 Minute oder über 24 Stunden, z. B. Umfrage über Nacht offen) werden als `null` gespeichert und fließen nicht in die Schnitte ein.
- Zwischenstand in `localStorage` sichern, damit beim versehentlichen Schließen nichts verloren geht. Er enthält nur bestätigte Bewertungen (Format Version 2; ältere Zwischenstände werden verworfen).
- **„Locked In“ (Anpassung vom 23.10.2026, Vorlage `locked-in-uebertragung.md`):** Jede einzelne Bewertung wird bestätigt, bevor sie zählt. Der Ablauf im Browser:
  1. Ein Klick auf eine Zahl öffnet ein Popup mit der vollständigen Beschreibung genau dieser Stufe (Überschrift „Bewertung 4 · Profi · 75–100%“, Leitsatz, alle Stichpunkte) und dem Kommentarfeld. Ab Bewertung 4 ist der Kommentar Pflicht, solange er leer ist, bleibt „Locked In“ gesperrt. Darunter ist er freiwillig. Es gibt keine Wartezeit.
  2. Abbrechen, Esc und ein Klick neben das Popup verwerfen die Wahl, es wird nichts gespeichert.
  3. „Locked In“ sperrt die Bewertung: Zahlen deaktiviert, gewählte Zahl hervorgehoben, Kennzeichen „Locked In“, Kommentar als Text. Das gilt auch nach „Zurück“ und nach dem Neuladen.
  4. Danach springt die Seite zur ersten noch offenen Person (zuerst man selbst, dann die Kollegen in fester Reihenfolge), nach der letzten Person der Seite automatisch zum nächsten Verhalten. Nach der allerletzten Bewertung wird **nicht** automatisch gesendet: Der Fokus steht auf „Absenden“.
  5. **Absenden geht erst, wenn alle Verhalten durchbewertet sind** (außerdem Entwicklung des Monats und Pflicht-Fragen der Rituale). Steht an früherer Stelle noch etwas offen, nennt ein Hinweis die Stelle und führt dorthin. Zusätzlich prüft der Server wie bisher Vollständigkeit und Kommentarpflicht.
  - Unter den Zahlen stehen die Stufennamen (Bewusstsein, Aufbau, Stabilität, Profi, High Performer). In der ganzen Oberfläche heißt es „Bewertung“, nicht „Note“.
  - Die Sperre gilt nur in der Oberfläche; Datenbank, Server und Absende-Format sind unverändert (die Spalte heißt weiter `note`). „Neu beginnen“ im Zwischenstand-Hinweis bleibt, fragt aber nach, weil dabei alle bestätigten Bewertungen verloren gehen.

### 7.4 Ordnerstruktur

```
/
├─ referenz/
│  ├─ umfrage-hammermeister.html     bestehende Umfrage (Vorlage)
│  └─ dashboard-alt.html             altes Board (Vorlage Auswertungen + Jarvis)
├─ supabase/
│  ├─ umfrage_schema.sql             bestehend (Ausgangsstand)
│  ├─ ausfuelldauer.sql              Ergänzung Ausfülldauer (nach umfrage_schema.sql ausführen)
│  └─ migrations/                    001_salons_personen.sql, 002_inhalte.sql, …
├─ src/
│  ├─ lib/ (supabase.ts, api.ts, monat.ts)
│  ├─ auth/ (AuthProvider, RequireRole)
│  ├─ pages/ (Start, Login, app/…)
│  ├─ components/ (Layout, Karte, Popup, Charts, Umfrage/…)
│  └─ styles/ (tokens.css, base.css)
├─ public/_redirects                 „/*  /index.html  200“ für Netlify (SPA-Routing)
└─ README.md                         Setup, Deploy, Person anlegen
```

### 7.5 Deploy (Netlify)

- **Weg A, wie bisher:** lokal `npm run build`, dann den Ordner `dist/` per Drag & Drop auf Netlify hochladen. Die `.env` wird dabei beim Bauen eingebacken.
- **Weg B, empfohlen für später:** Git-Repo mit Netlify verbinden. Dann wird bei jedem Push automatisch gebaut, und die Env-Variablen stehen in den Netlify-Einstellungen.
- Für den Login muss die Netlify-Domain nirgends in Supabase eingetragen werden (Passwort-Login, §4.3).

---

## 8. Bauphasen

Jede Phase ist für sich nutzbar und wird vor der nächsten getestet.

### Phase 1 – Fundament
- Neues Supabase-Projekt anlegen, `umfrage_schema.sql` + `ausfuelldauer.sql` ausführen (falls noch nicht geschehen)
- Vite-Projekt, Design-Tokens, Layout, Startseite
- Migration: `salons`, `personen`, Trigger zur Verknüpfung mit `auth.users`, RLS, `ich()`
- Login mit E-Mail und Passwort, Passwort ändern, Rollen-Routing, geschützte Routen
- Begrüßungsbereiche mit Kacheln nach den zwei Merkmalen aus §2, alle Zielseiten zunächst als Platzhalter
- **Fertig, wenn:**
  - Der Admin legt alle 6 Personen aus §2.1 an. Jede loggt sich mit eigener E-Mail und eigenem Passwort ein und landet im passenden Bereich.
  - Michael sieht dabei Teilnehmer- **und** Leitungs-Kacheln.

### Phase 2 – Monatsumfrage in der Plattform
- Migration: Inhalts-Tabellen + Seed aus der Referenzdatei (§5.1); Erweiterung der Abgabe-Tabellen um IDs; ggf. Backfill
- Funktionen `umfrage_inhalt()`, `meine_offenen_monate()`, `umfrage_einreichen_v2()`
- Umfrage-Seite als Port der Referenzdatei
- Karte „Deine Umfrage für <Monat>“ für alle Teilnehmer, auch bei Michael
- Danach: `anon`-Recht auf alter Funktion entziehen, alte HTML-Umfrage abschalten
- **Fertig, wenn:**
  - Ein Teammitglied und Michael füllen eingeloggt die Umfrage aus. Jeder bewertet die 5 anderen, alles landet mit IDs in der Datenbank.
  - Eine zweite Abgabe für denselben Monat wird abgelehnt.

### Phase 3 – Auswertungen
- Funktionen `meine_ergebnisse`, `team_ergebnisse`, `person_ergebnisse`, `team_dashboard`
- Seiten `/app/ergebnisse`, `/app/team`, `/app/mitglieder`, `/app/mitglieder/:id`
- Alle Bausteine aus §5.6, in dieser Reihenfolge bauen:
  1. Monatsauswahl, Kennzahl-Kacheln, Detailtabelle mit Tabs und Sortierung
  2. SB-vs.-FB-Diagramm, Differenz pro Person, Top/Flop 4
  3. Rangliste, Heatmap, Ansicht-Umschalter Team ↔ Person
  4. Verlauf und Monats-Detail mit Kommentaren
- **Fertig, wenn:**
  - Ein Teammitglied sieht seine Ergebnisse ohne Absender-Namen und ohne die Kommentare der Kollegen, und das Team nur als Schnitt.
  - Michael sieht alles im Detail, inklusive sich selbst als Teammitglied.
  - Alle Seiten funktionieren ohne Säulen und ohne Rituale.
  - Die Zahlen stimmen mit den Views `v_selbst_vs_fremdbild` und `v_person_saeule` überein.

### Phase 4 – Abgabe-Status & Reminder
- `abgabe_status()`, `ueberfaellige_abgaben()`, Einstellung `reminder_tage_nach_frist`
- Popup und Status-Karte im Verantwortlichen-Dashboard
- **Fertig, wenn:** Bei fehlender Abgabe erscheint ab Tag 3 nach Fristende das Popup. Testen mit simuliertem Datum über einen Parameter in der Funktion.

### Phase 5 – Weitere Umfragetypen (Inhalte folgen)
- **Chefumfrage:** Die Teammitglieder (ohne Michael) bewerten den Verantwortlichen einmal im Quartal. Die Ergebnisse sieht nur der Verantwortliche bzw. der Admin.
- **Gästeumfrage:** öffentlicher Link oder QR-Code ohne Login, Spam-Schutz über eine Rate-Limit-Funktion. Ergebnisse nur für Verantwortlichen und Admin.
- **Umfrage für den Verantwortlichen:** Inhalt wird nachgereicht.
- Datenmodell: Tabellen nach demselben Muster (Abgabe → Antworten) mit Spalte `umfrage_typ` und `zeitraum` (Monat oder Quartal). Die Details werden geplant, sobald die Fragen feststehen.

### Phase 6 – Jarvis (die Kirsche auf der Torte)
Vorbild ist der Jarvis aus dem alten Board, aber sicher umgebaut.

**Oberfläche** (wie im alten Board):
- schwebender Button unten rechts, öffnet ein Chatfenster
- Status „Bereit“ / „Denkt nach…“, Tipp-Animation
- Badge bei neuer Antwort, während das Fenster geschlossen ist
- Chatverlauf innerhalb der Sitzung

**Ablauf:**
- Frontend → Supabase Edge Function `jarvis` → n8n-Webhook → Antwort zurück.
- Die **Webhook-URL** liegt als Secret in der Edge Function. Sie steht nicht mehr im Browser und ist nicht mehr per Zahnrad einstellbar.
- Die Edge Function baut den **Kontext** serverseitig aus den Ergebnis-Funktionen, mit der Session des Nutzers. Jarvis bekommt dadurch ausschließlich, was die Person ohnehin sehen darf:
  - **Teammitglied (auch Michael für sich selbst):** nur eigene Ergebnisse (SB, FB, Differenz, Top/Flop 5, Verlauf, eigener Kommentar, Ausfülldauer; die Kommentare der Kollegen nur bei Rolle Verantwortlicher/Admin, so liefert es `meine_ergebnisse`) plus Team-Schnitte
  - **Verantwortlicher / Admin:** der volle Kontext wie im alten Board, mit `meta` (Skala, Datenstart, Verhaltens-Liste), `overview` (Monat, Rangliste, Team-Schnitte, Ausfülldauern), `personSummaries` (je Person SB/FB/Differenz, alle Verhalten, Top/Flop 5) und `personDetail` (je Monat Schnitt, Einzelwerte, Kommentare)
  - zusätzlich die aktuelle Ansicht (welche Seite, welche Person, welcher Monat), damit Jarvis weiß, worüber gerade gesprochen wird
- Format an n8n wie bisher: `{ message, context }`. Antwort aus `output` / `message` / `text`. Der bestehende n8n-Workflow kann so weiterverwendet werden.

---

## 9. Offene Punkte

| # | Punkt | Wann zu klären |
|---|---|---|
| 1 | **Grundpfeiler/Säulen-Zuordnung** der 17 Verhalten. Im Toolbox-Teil mit den Hammermeister-Verhalten gibt es keine Überschriften. | vor Phase 3 |
| 2 | ~~Schreibweise: „Behzad Pour Sakha“ oder „Pour Shaka“?~~ **Geklärt (20.10.2026):** „Behzad Pour Sakha“ ist korrekt. | erledigt |
| 3 | ~~Leerlauf-Titel: Typeform- oder Toolbox-Wortlaut?~~ **Geklärt (20.10.2026):** Es gilt die Umfrage aus `referenz/umfrage-hammermeister.html` („… sinnvoll (z. B. Aufräumen, Vorbereiten).“). | erledigt |
| 4 | **Michaels eigene Fremdbilder:** Sieht er als Verantwortlicher auch bei Bewertungen **über sich selbst**, wer was gegeben hat? *Vorschlag:* Für sich selbst sieht er sie wie ein Teammitglied, also ohne Absender. Sonst sinkt die Ehrlichkeit des Teams. | vor Phase 3 |
| 5 | E-Mail-Adressen aller 6 Personen + Admin (§2.1) | vor Phase 1 |
| 6 | Feinheiten der Selbst-/Fremdbild-Auswertung (Gewichtung, Schwellen, Hervorhebungen) | vor Phase 3 |
| 7 | ~~Fragetext „Entwicklung des Monats“: „im letzten Monat“?~~ **Geklärt (20.10.2026):** Der Text lautet „in diesem Monat“. Die Umfrage für Monat M bewertet M und ist bis zum Monatsende abzugeben. | erledigt |
| 8 | ~~Ab welchem Monat zählt die Plattform (`salons.start_monat`)?~~ **Geklärt (20.10.2026):** Oktober 2026. | erledigt |
| 9 | Rituale für Hammermeister: aktuell keine, Rahmen und Datenmodell sind vorbereitet | jederzeit |
| 10 | Sichtbarkeit für Teammitglieder ggf. anpassen (z. B. Absender sichtbar oder nicht) | jederzeit, betrifft nur die Funktionen aus §5.3 |
| 11 | Inhalte Chefumfrage, Gästeumfrage, Umfrage für den Verantwortlichen | vor Phase 5 |
| 12 | Tägliche E-Mail zusätzlich zum Popup? | optional, nach Phase 4 |
| 13 | Sieht ein Teammitglied seinen eigenen Rang in der Rangliste? Aktuell nein, die Rangliste ist nur für Verantwortlichen und Admin. | jederzeit |
| 14 | Den bestehenden n8n-Workflow für Jarvis prüfen: Erwartet er das Kontext-Format des alten Boards? | vor Phase 6 |

---

## 10. Arbeitsweise mit Claude Code

### 10.1 Vorbereitung (Checkliste vor Phase 1)

- [ ] Projektordner / Repo mit:
  - `docs/plattform-architektur.md` (dieses Dokument)
  - `referenz/umfrage-hammermeister.html` (aktuelle Umfrage inkl. Ausfülldauer)
  - `referenz/dashboard-alt.html` (altes Board)
  - `supabase/umfrage_schema.sql` und `supabase/ausfuelldauer.sql`
- [ ] **Neues** Supabase-Projekt angelegt, `umfrage_schema.sql` + `ausfuelldauer.sql` ausgeführt
- [ ] Supabase-URL und anon-Key des neuen Projekts bereit (für `.env`). Den **service_role-Key nie** an Claude Code geben oder ins Frontend schreiben.
- [ ] E-Mail-Adressen aller Personen: 6 Teammitglieder (inkl. Michael) und Admin
- [ ] Eigene Netlify-Seite für Hammermeister
- [ ] Node.js (LTS) lokal installiert, damit `npm run build` läuft

### 10.2 Ablauf

1. Repo wie in 10.1 vorbereiten.
2. Claude Code phasenweise beauftragen, z. B.: „Setze Phase 1 aus docs/plattform-architektur.md um.“
3. SQL-Migrationen im Supabase SQL-Editor ausführen (in Reihenfolge) und im Repo versionieren.
4. Nach jeder Phase die „Fertig, wenn“-Kriterien durchtesten, dann deployen.
