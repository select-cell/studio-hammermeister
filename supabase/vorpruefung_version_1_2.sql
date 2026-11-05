-- ═══════════════════════════════════════════════════════════════════════════
--  Vorprüfung für Version 1.2 (nur Lesen, ändert nichts)
-- ═══════════════════════════════════════════════════════════════════════════
--  Im SQL-Editor der Ziel-Plattform ausführen, BEVOR die Migrationen 016 bis 020 eingespielt werden. Die Abfrage listet auf, was die
--  Version 1.2 voraussetzt und in dieser Datenbank fehlt (Tabellen, Spalten, Funktionen der Grundplattform bis Phase 4).
--  Ergebnis „Alle Voraussetzungen sind da.“ heißt: Die Migrationen 016 bis 020 können eingespielt werden.
--  Steht dort etwas, zuerst die Grundplattform nachziehen (Migrationen 001 bis 013 und die beiden Ausgangsdateien) und erneut prüfen.
--  Zusätzlich zeigt die zweite Abfrage, ob Teile von Version 1.2 schon eingespielt sind (Teil-Installation erkennen).
-- ═══════════════════════════════════════════════════════════════════════════

with erwartet(art, objekt) as (
  values
    ('Tabelle', 'salons'), ('Tabelle', 'personen'), ('Tabelle', 'verhalten'), ('Tabelle', 'umfrage_abgaben'), ('Tabelle', 'umfrage_bewertungen'),
    ('Funktion', 'ist_leitung'), ('Funktion', 'ist_admin'), ('Funktion', 'auswertung_salon_id'), ('Funktion', 'team_dashboard'),
    ('Funktion', 'abgabe_status'), ('Funktion', 'auswertung_person'), ('Funktion', 'umfrage_einreichen_v2'),
    ('Spalte', 'salons.id'), ('Spalte', 'salons.name'), ('Spalte', 'salons.start_monat'), ('Spalte', 'salons.reminder_tage_nach_frist'),
    ('Spalte', 'salons.schwelle_ausgewogen'), ('Spalte', 'salons.schwelle_niedrig'), ('Spalte', 'salons.schwelle_hoch'),
    ('Spalte', 'personen.id'), ('Spalte', 'personen.salon_id'), ('Spalte', 'personen.name'), ('Spalte', 'personen.email'), ('Spalte', 'personen.rolle'),
    ('Spalte', 'personen.nimmt_an_teamumfrage'), ('Spalte', 'personen.aktiv'), ('Spalte', 'personen.aktiv_ab'), ('Spalte', 'personen.auth_user_id'),
    ('Spalte', 'verhalten.id'), ('Spalte', 'verhalten.salon_id'), ('Spalte', 'verhalten.nr'), ('Spalte', 'verhalten.titel'), ('Spalte', 'verhalten.aktiv'),
    ('Spalte', 'umfrage_abgaben.id'), ('Spalte', 'umfrage_abgaben.salon_id'), ('Spalte', 'umfrage_abgaben.monat'), ('Spalte', 'umfrage_abgaben.feedbackgeber_id'),
    ('Spalte', 'umfrage_abgaben.entwicklung_person'), ('Spalte', 'umfrage_abgaben.entwicklung_begruendung'), ('Spalte', 'umfrage_abgaben.abgeschickt_am'),
    ('Spalte', 'umfrage_bewertungen.abgabe_id'), ('Spalte', 'umfrage_bewertungen.monat'), ('Spalte', 'umfrage_bewertungen.verhalten_nr'),
    ('Spalte', 'umfrage_bewertungen.art'), ('Spalte', 'umfrage_bewertungen.note'), ('Spalte', 'umfrage_bewertungen.kommentar'),
    ('Spalte', 'umfrage_bewertungen.bewertete_person_id'), ('Spalte', 'umfrage_bewertungen.bewertende_person_id'), ('Spalte', 'umfrage_bewertungen.verhalten')
),
fehlt as (
  select e.art, e.objekt
    from erwartet e
   where case e.art
           when 'Tabelle'  then to_regclass('public.' || e.objekt) is null
           when 'Funktion' then not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = e.objekt)
           when 'Spalte'   then not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = split_part(e.objekt, '.', 1) and c.column_name = split_part(e.objekt, '.', 2))
         end
)
select coalesce((select string_agg(art || ' ' || objekt, E'\n' order by art, objekt) from fehlt), 'Alle Voraussetzungen sind da.') as fehlende_voraussetzungen;

-- Teil-Installation erkennen: Was von Version 1.2 gibt es schon?
select string_agg(t.migration || ': ' || t.objekt, E'\n' order by t.migration) as schon_vorhanden
  from (values
    ('016', 'umfrage_sitzungen'), ('017', 'pdf_export_log'), ('018', 'v_kommentar_metriken'),
    ('019', 'analysen'), ('019', 'monatsabschluesse'), ('020', 'fokus_verhalten'), ('020', 'meeting_termine'), ('020', 'mail_log')
  ) as t(migration, objekt)
 where to_regclass('public.' || t.objekt) is not null;
