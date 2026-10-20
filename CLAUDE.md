# Salon-Plattform Hammermeister

Bauanleitung: `docs/plattform-architektur.md` (maßgeblich für Rollen, Datenmodell, Seiten, Bauphasen). Gebaut wird phasenweise (§8); jede Phase wird gegen ihr „Fertig, wenn“ getestet, bevor die nächste beginnt.

## Befehle

- `npm run dev` · `npm run build` (Typprüfung + Build) · `npm run typecheck` · `npm test`

## Regeln

- Sprache der Oberfläche, Kommentare und Commit-Texte: Deutsch (Du-Form, Salon-Ton). Bezeichner im Code folgen dem vorhandenen deutschen Stil (`istLeitung`, `personStatus`).
- Sicherheit liegt in RLS und Datenbank-Funktionen, nicht im Frontend. Rohdaten-Tabellen (`umfrage_*`) lesen Teammitglieder nie direkt. Der `service_role`-Key kommt nie ins Frontend, in die `.env` oder ins Repo.
- Berechnungen (Selbstbild, Fremdbild, Schwellen) stehen an einer Stelle: in SQL-Funktionen, nicht im Frontend. Schwellen kommen aus `salons`, nicht aus dem Code.
- Zwei unabhängige Merkmale steuern die Sicht: `nimmt_an_teamumfrage` (Teilnehmer) und `rolle in ('verantwortlicher','admin')` (Leitung). Michael hat beides. Alle Bereiche stehen in `src/lib/bereiche.ts`.
- Bausteine müssen mit fehlenden Inhalten umgehen (ohne Säulen, ohne Rituale, ohne Kriterien), siehe §5.1.
- Datenbankänderungen nur als nummerierte Migration in `supabase/migrations/`, idempotent, und im Repo versioniert. Das ursprüngliche `umfrage_schema.sql` und `ausfuelldauer.sql` werden nicht verändert.
- Datenzugriff gebündelt in `src/lib/api.ts` (dünne Wrapper um `supabase.rpc`).
- Design-Tokens in `src/styles/tokens.css`; kein UI-Framework. Mobil zuerst.
