# Salon-Plattform Hammermeister

Bauanleitung: `docs/plattform-architektur.md` (maßgeblich für Rollen, Datenmodell, Seiten, Bauphasen). Gebaut wird phasenweise (§8); jede Phase wird gegen ihr „Fertig, wenn“ getestet, bevor die nächste beginnt.

## Befehle

- `npm run dev` · `npm run build` (Typprüfung + Build) · `npm run typecheck` · `npm test`

## Supabase

- **Die Datenbank dieser Plattform** ist das Projekt „select-cell's Project“, Ref `obsakxdjfpaoajwsteiv`. Das Projekt „Plattform Salon Dawiid“ (`hgtvlcucxzksvmvgvbgo`) ist eine andere Instanz und wird nie angefasst.
- Das Supabase-Werkzeug (MCP) wartet bei `DROP …`-Anweisungen (auch `drop trigger/policy if exists`) auf eine Bestätigung und läuft dann nach 60 s in ein Zeitlimit. Migrationen deshalb ohne `DROP` schreiben: `create or replace`, `if not exists`, Policies über `alter policy` oder ein `do`-Block mit `pg_policies`-Prüfung. Zeitlimit heißt nicht „kaputt“: erst den Zustand prüfen, dann in kleineren Teilen wiederholen.
- Diese Sandbox erreicht `*.supabase.co` nicht (Netzwerkregel, 403). Datenbank-Prüfungen laufen deshalb über das Werkzeug. Für Tests mit Daten am Ende einer Anweisung `raise exception` auslösen: das rollt alles zurück.
- Login ist **E-Mail und Passwort, kein Magic Link** (Wunsch des Auftraggebers). Es werden keine E-Mails verschickt; Logins legt nur der Admin in Supabase an („Auto Confirm User“), Sign-ups bleiben aus. Verknüpft mit einer Person wird nur ein Login mit bestätigter E-Mail (Migration 007). Tokens in der Adresszeile werden nicht ausgewertet.
- Rohdaten-Tabellen (`umfrage_*`) und Ansichten (`v_*`) sind für `anon` und `authenticated` gesperrt.
- Die alte `umfrage_einreichen()` ist für alle Nutzer gesperrt (sie nähme Namen aus dem Payload). Abgegeben wird nur über `umfrage_einreichen_v2()`; wer abgibt, kommt aus `auth.uid()`.
- Seed der Umfrage-Inhalte: `003_seed_hammermeister_inhalte.sql` wird mit `node scripts/erzeuge-seed-inhalte.mjs` aus `referenz/umfrage-hammermeister.html` erzeugt und nicht von Hand bearbeitet. Wer Migrationen über das Werkzeug einspielt, vergleicht danach Fingerabdrücke (md5 über `pg_get_functiondef`, Spalten, Constraints, Seed) gegen einen lokalen Lauf der Dateien.
- Auswertungen (Migration 006): Wer Absender sieht, entscheidet nur `absender_sichtbar_fuer()` (Mitarbeiter nie; Verantwortlicher bei anderen ja, bei sich nur mit `salons.verantwortlicher_sieht_eigene_absender`; Admin immer). Das Frontend zeigt `von` nur, wenn die Antwort es enthält, und filtert nie selbst.
- Reminder (Migration 008): überfällig heißt `heute − Fristende > salons.reminder_tage_nach_frist` (Frist 31.10., Standard 3 → ab 4.11.). `abgabe_status()` und `ueberfaellige_abgaben()` nehmen `p_heute` zum Testen; im Frontend simuliert `/app?heute=YYYY-MM-DD` das Datum (nur Leitung, mit Hinweis). Das weggeklickte Popup merkt sich nur `sessionStorage`.
- Teilnehmer gehören immer zu einem Salon (Migration 009: Trigger setzt ihn, Constraint `personen_teilnehmer_hat_salon`). Das gilt auch für den Admin, wenn er `nimmt_an_teamumfrage` bekommt; sonst meldete die Plattform „Erledigt“ statt „offen“. Testdaten räumt `testdaten_entfernen()` (010) ab; das Supabase-Werkzeug führt Anweisungen mit `delete` nicht aus (wartet auf Bestätigung), solche Migrationen läuft der Auftraggeber im SQL-Editor.
- Diagramme mit Recharts (`isAnimationActive={false}`), Farben aus `src/components/auswertung/farben.ts`; Stile der Auswertungen mit Präfix `au-` in `src/styles/auswertung.css`.
## Regeln

- Sprache der Oberfläche, Kommentare und Commit-Texte: Deutsch (Du-Form, Salon-Ton). Bezeichner im Code folgen dem vorhandenen deutschen Stil (`istLeitung`, `personStatus`).
- Sicherheit liegt in RLS und Datenbank-Funktionen, nicht im Frontend. Rohdaten-Tabellen (`umfrage_*`) lesen Teammitglieder nie direkt. Der `service_role`-Key kommt nie ins Frontend, in die `.env` oder ins Repo.
- Berechnungen (Selbstbild, Fremdbild, Schwellen) stehen an einer Stelle: in SQL-Funktionen, nicht im Frontend. Schwellen kommen aus `salons`, nicht aus dem Code.
- Zwei unabhängige Merkmale steuern die Sicht: `nimmt_an_teamumfrage` (Teilnehmer) und `rolle in ('verantwortlicher','admin')` (Leitung). Michael hat beides. Alle Bereiche stehen in `src/lib/bereiche.ts`.
- Bausteine müssen mit fehlenden Inhalten umgehen (ohne Säulen, ohne Rituale, ohne Kriterien), siehe §5.1.
- Datenbankänderungen nur als nummerierte Migration in `supabase/migrations/`, idempotent, und im Repo versioniert. Das ursprüngliche `umfrage_schema.sql` und `ausfuelldauer.sql` werden nicht verändert.
- Datenzugriff gebündelt in `src/lib/api.ts` (dünne Wrapper um `supabase.rpc`).
- Design-Tokens in `src/styles/tokens.css`; kein UI-Framework. Mobil zuerst. **Keine festen Farben in Komponenten oder Stilen** (Hex/rgba nur für Dinge, die in beiden Darstellungen gleich bleiben, z. B. dunkle Video-Felder): Es gibt einen Nachtmodus (`data-theme="dark"` am `<html>`, `src/lib/darstellung.ts`), der nur über die Tokens mitwechselt.
