# Salon-Plattform Hammermeister

Web-Plattform für das Team von Studio Hammermeister: Alle Teammitglieder loggen sich mit eigenem Zugang ein, füllen monatlich die Verhaltens-Umfrage aus und sehen ihre Ergebnisse. Der Verantwortliche (Michael Hammermeister, zugleich Teil des Teams) sieht alle Auswertungen und wird erinnert, wenn jemand überfällig ist.

- **Frontend:** React (Vite + TypeScript), gehostet auf Netlify
- **Backend:** Supabase (Datenbank, Magic-Link-Login, Row Level Security, Funktionen)
- **Bauanleitung:** [`docs/plattform-architektur.md`](docs/plattform-architektur.md)

## Stand der Bauphasen

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Fundament: Login per Magic Link, Rollen, Begrüßungsbereiche, Platzhalter | Frontend und Datenbank gebaut, getestet und eingespielt. Offen: Auth-Einstellungen, E-Mail-Versand, Personen (siehe „Fertig, wenn“) |
| 2 | Monatsumfrage in der Plattform | offen |
| 3 | Auswertungen | offen |
| 4 | Abgabe-Status & Reminder | offen |
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

Die Datenbank liegt im Projekt **„select-cell's Project“** (Ref `obsakxdjfpaoajwsteiv`, `https://obsakxdjfpaoajwsteiv.supabase.co`). Eingespielt sind `umfrage_schema.sql`, `ausfuelldauer.sql` und `001_salons_personen.sql` (dort in drei Teilen als `001a`–`001c`; der Inhalt ist identisch mit der Datei). Der Salon Hammermeister existiert, es gibt noch keine Personen.

Gut zu wissen:
- Das Projekt war vorher ein CRM-Projekt. Übrig sind die beiden Funktionen `set_updated_at` und `log_stage_change`; die Plattform braucht sie nicht.
- Die Auth-Einstellungen (Sign-ups, Site URL, SMTP, Vorlagen) gelten für das ganze Projekt. Im Projekt existiert bereits ein Login. Er ist keiner Person zugeordnet und kommt in der Plattform nicht über „Dein Zugang ist noch nicht freigeschaltet“ hinaus, solange er nicht als Person angelegt wird.
- Das Projekt „Plattform Salon Dawiid“ ist eine andere Instanz und wird nicht angefasst.

## Supabase einrichten (neues Projekt, Schritt für Schritt)

1. Im SQL-Editor nacheinander ausführen:
   1. `supabase/umfrage_schema.sql`
   2. `supabase/ausfuelldauer.sql`
   3. `supabase/migrations/001_salons_personen.sql`
   
   Weitere Migrationen folgen nummeriert in `supabase/migrations/`.
2. **Authentication → URL Configuration**
   - Site URL: die Netlify-Adresse der Plattform
   - Redirect URLs: `https://<netlify-adresse>/**` und `http://localhost:5173/**` (der Magic Link springt auf `/auth/callback`, das muss in der Liste erlaubt sein)
3. **Authentication → Providers → Email:** aktiv, „Allow new users to sign up“ **aus**.
4. **Eigener E-Mail-Versand (Pflicht):** Der eingebaute Versand ist nur zum Testen gedacht (nur Mitglieder des Supabase-Teams, ca. 2 Mails pro Stunde). Empfohlen: Resend (kostenloser Tarif). Absenderdomain verifizieren, dann unter Authentication → Emails → SMTP Settings eintragen und das Rate Limit unter Authentication → Rate Limits passend erhöhen.
5. **E-Mail-Vorlagen** (Authentication → Emails → Templates) auf Deutsch anpassen. Empfehlung: Der Link zeigt direkt auf die Plattform und wird dort bestätigt. So können Mail-Programme, die Links vorab aufrufen, den Link nicht „verbrauchen“.

   Vorlage „Magic Link“:

   ```html
   <h2>Dein Anmelde-Link</h2>
   <p>Mit diesem Link meldest du dich bei der Team-Plattform an:</p>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Jetzt anmelden</a></p>
   <p>Der Link ist nur kurz gültig und funktioniert nur einmal. Wenn du ihn nicht angefordert hast, kannst du diese Mail ignorieren.</p>
   ```

   Vorlage „Invite user“:

   ```html
   <h2>Willkommen auf der Team-Plattform</h2>
   <p>Du wurdest eingeladen. Mit diesem Link meldest du dich zum ersten Mal an:</p>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite">Jetzt anmelden</a></p>
   <p>Danach meldest du dich immer über die Startseite mit deiner E-Mail-Adresse an.</p>
   ```

## Person anlegen (Admin)

1. Zeile in der Tabelle `personen` anlegen: Name, E-Mail, Rolle, `nimmt_an_teamumfrage`. Eine Vorlage für alle sechs Teammitglieder und den Admin liegt in `supabase/personen_anlegen.sql`.
2. In Supabase unter **Authentication → Users → Invite user** dieselbe E-Mail einladen.
3. Ein Datenbank-Trigger verknüpft Login und Person automatisch über die E-Mail (`personen.auth_user_id`), auch in umgekehrter Reihenfolge.

| Merkmal | Schaltet frei |
|---|---|
| `nimmt_an_teamumfrage = true` | Teilnehmer-Bereiche: Umfrage, eigene Ergebnisse, Team-Ergebnisse, Chefumfrage ausfüllen, Coaching |
| `rolle` = `verantwortlicher` oder `admin` | Leitungs-Bereiche: Team-Dashboard, Mitglieder, Reminder, Chef- und Gästeumfrage-Ergebnisse |

Michael Hammermeister bekommt beides.

**Aktueller Stand der Personen:** Die sechs Teammitglieder sind mit Platzhalter-Adressen `…@platzhalter.invalid` angelegt (diese Endung kann keine Mails empfangen). Der Admin ist mit `select@voidos.de` angelegt und bereits mit seinem Login verknüpft. Eine echte Adresse nachtragen, danach im Dashboard einladen:

```sql
update public.personen
   set email = 'echte@adresse.de'
 where email = 'lena.reifschneider@platzhalter.invalid';
```

## Deploy (Netlify)

- **Weg A:** lokal `npm run build`, dann den Ordner `dist/` per Drag & Drop auf Netlify hochladen. Die `.env` wird dabei beim Bauen eingebacken.
- **Weg B (empfohlen):** Git-Repo mit Netlify verbinden. Gebaut wird bei jedem Push automatisch (`netlify.toml`), die Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` stehen in den Netlify-Einstellungen.

In beiden Fällen die Netlify-Adresse in Supabase als Site URL und Redirect URL eintragen. Die Datei `public/_redirects` sorgt dafür, dass alle Pfade der App (SPA) funktionieren.

## Fertig, wenn (Phase 1)

- Der Admin legt alle 6 Personen aus §2.1 an. Jede loggt sich mit eigenem Magic Link ein und landet im passenden Bereich.
- Michael sieht dabei Teilnehmer- **und** Leitungs-Kacheln.

## Projektstruktur

```
docs/                 Bauanleitung (Strategie & Architektur)
referenz/             Vorlagen: bestehende Umfrage, altes Board
supabase/             SQL: Ausgangsstand, migrations/, Vorlagen
public/_redirects     SPA-Routing für Netlify
src/
  lib/                supabase.ts, api.ts, monat.ts, rechte.ts, bereiche.ts
  auth/               AuthProvider, RequireRole (Schutz der Routen)
  components/         Layout, Kacheln, Karten
  pages/              Start, Login, Callback, app/…
  styles/             tokens.css, base.css
```
