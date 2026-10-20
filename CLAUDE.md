# Salon-Plattform Hammermeister

Bauanleitung: `docs/plattform-architektur.md` (maßgeblich für Rollen, Datenmodell, Seiten, Bauphasen). Gebaut wird phasenweise (§8); jede Phase wird gegen ihr „Fertig, wenn“ getestet, bevor die nächste beginnt.

## Befehle

- `npm run dev` · `npm run build` (Typprüfung + Build) · `npm run typecheck` · `npm test`

## Supabase

- **Die Datenbank dieser Plattform** ist das Projekt „select-cell's Project“, Ref `obsakxdjfpaoajwsteiv`. Das Projekt „Plattform Salon Dawiid“ (`hgtvlcucxzksvmvgvbgo`) ist eine andere Instanz und wird nie angefasst.
- Das Supabase-Werkzeug (MCP) wartet bei `DROP …`-Anweisungen (auch `drop trigger/policy if exists`) auf eine Bestätigung und läuft dann nach 60 s in ein Zeitlimit. Migrationen deshalb ohne `DROP` schreiben: `create or replace`, `if not exists`, Policies über `alter policy` oder ein `do`-Block mit `pg_policies`-Prüfung. Zeitlimit heißt nicht „kaputt“: erst den Zustand prüfen, dann in kleineren Teilen wiederholen.
- Diese Sandbox erreicht `*.supabase.co` nicht (Netzwerkregel, 403). Datenbank-Prüfungen laufen deshalb über das Werkzeug. Für Tests mit Daten am Ende einer Anweisung `raise exception` auslösen: das rollt alles zurück.
- Rohdaten-Tabellen (`umfrage_*`) und Ansichten (`v_*`) sind für `anon` und `authenticated` gesperrt.

## Regeln

- Sprache der Oberfläche, Kommentare und Commit-Texte: Deutsch (Du-Form, Salon-Ton). Bezeichner im Code folgen dem vorhandenen deutschen Stil (`istLeitung`, `personStatus`).
- Sicherheit liegt in RLS und Datenbank-Funktionen, nicht im Frontend. Rohdaten-Tabellen (`umfrage_*`) lesen Teammitglieder nie direkt. Der `service_role`-Key kommt nie ins Frontend, in die `.env` oder ins Repo.
- Berechnungen (Selbstbild, Fremdbild, Schwellen) stehen an einer Stelle: in SQL-Funktionen, nicht im Frontend. Schwellen kommen aus `salons`, nicht aus dem Code.
- Zwei unabhängige Merkmale steuern die Sicht: `nimmt_an_teamumfrage` (Teilnehmer) und `rolle in ('verantwortlicher','admin')` (Leitung). Michael hat beides. Alle Bereiche stehen in `src/lib/bereiche.ts`.
- Bausteine müssen mit fehlenden Inhalten umgehen (ohne Säulen, ohne Rituale, ohne Kriterien), siehe §5.1.
- Datenbankänderungen nur als nummerierte Migration in `supabase/migrations/`, idempotent, und im Repo versioniert. Das ursprüngliche `umfrage_schema.sql` und `ausfuelldauer.sql` werden nicht verändert.
- Datenzugriff gebündelt in `src/lib/api.ts` (dünne Wrapper um `supabase.rpc`).
- Design-Tokens in `src/styles/tokens.css`; kein UI-Framework. Mobil zuerst.
