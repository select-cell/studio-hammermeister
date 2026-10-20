-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 004 · Phase 2 · Abgaben mit Personen-IDs
-- ═══════════════════════════════════════════════════════════════════════════
--  Im Supabase SQL-Editor ausführen (nach 003). Kann gefahrlos mehrfach ausgeführt werden.
--
--  Die Abgabe-Tabellen bekommen Verweise auf Salon und Personen (docs §5.2).
--  Die Namens-Spalten (salon, feedbackgeber, bewertete_person …) bleiben als
--  Momentaufnahme erhalten. Für Auswertungen zählen ab jetzt die IDs.
--
--  Eindeutigkeit: pro Salon, Monat und Person genau eine Abgabe.
--  Backfill: frühere Abgaben (z. B. Testabgaben der alten HTML-Umfrage) bekommen
--  die IDs über den Namensabgleich mit `personen`. Passt kein Name, bleiben sie leer.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.umfrage_abgaben
  add column if not exists salon_id          uuid references public.salons(id),
  add column if not exists feedbackgeber_id  uuid references public.personen(id);

alter table public.umfrage_bewertungen
  add column if not exists bewertende_person_id uuid references public.personen(id),
  add column if not exists bewertete_person_id  uuid references public.personen(id);

comment on column public.umfrage_abgaben.salon_id         is 'Salon der Abgabe. Die Spalte salon bleibt als Namens-Momentaufnahme.';
comment on column public.umfrage_abgaben.feedbackgeber_id is 'Die abgebende Person (kommt aus dem Login, nie aus dem Payload).';
comment on column public.umfrage_bewertungen.bewertende_person_id is 'Wer bewertet hat.';
comment on column public.umfrage_bewertungen.bewertete_person_id  is 'Wer bewertet wurde (bei Selbstbild gleich der bewertenden Person).';

-- Eine Abgabe pro Salon, Monat und Person (die alte Namens-Eindeutigkeit bleibt zusätzlich bestehen)
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'abgaben_einmal_pro_monat_person' and conrelid = 'public.umfrage_abgaben'::regclass
  ) then
    alter table public.umfrage_abgaben
      add constraint abgaben_einmal_pro_monat_person unique (salon_id, monat, feedbackgeber_id);
  end if;
end $$;

create index if not exists idx_abgaben_person_monat   on public.umfrage_abgaben     (feedbackgeber_id, monat);
create index if not exists idx_bewertungen_bewertete  on public.umfrage_bewertungen (bewertete_person_id, monat);

-- Backfill über den Namensabgleich
update public.umfrage_abgaben a
   set salon_id = s.id,
       feedbackgeber_id = p.id
  from public.salons s
  join public.personen p on p.salon_id = s.id
 where a.salon_id is null
   and a.feedbackgeber_id is null
   and s.name = a.salon
   and p.name = a.feedbackgeber;

update public.umfrage_bewertungen b
   set bewertende_person_id = a.feedbackgeber_id,
       bewertete_person_id  = q.id
  from public.umfrage_abgaben a
  join public.personen q on q.salon_id = a.salon_id
 where b.abgabe_id = a.id
   and b.bewertende_person_id is null
   and b.bewertete_person_id is null
   and a.feedbackgeber_id is not null
   and q.name = b.bewertete_person;
