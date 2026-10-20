-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 009 · Teilnehmer der Teamumfrage gehören immer zu einem Salon
-- ═══════════════════════════════════════════════════════════════════════════
--  Hintergrund: Der Admin hat keinen Salon (001: salon_id ist nur bei rolle = 'admin' leer).
--  Setzt man ihn auf nimmt_an_teamumfrage = true, findet die Plattform für ihn keine offenen
--  Monate: Die Karte „Deine Umfrage“ meldete „Erledigt – du hast alles abgegeben“, obwohl nichts
--  abgegeben wurde, und im Abgabe-Status fehlte er. Die Umfrage selbst ließ sich nicht ausfüllen.
--
--  Jetzt gilt:
--    1. Wer Teilnehmer ist, bekommt automatisch den Salon: den eigenen, sonst den ersten Salon
--       dieser Instanz (wie auswertung_salon_id() es für den Admin schon tut).
--    2. Bestehende Teilnehmer ohne Salon (der Admin, falls schon auf true) werden jetzt zugeordnet.
--    3. Ein Teilnehmer ohne Salon ist danach nicht mehr möglich (Constraint).
--
--  Idempotent, ohne DROP (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Salon automatisch zuordnen ──────────────────────────────────────────────

create or replace function public.personen_vorbereiten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email := lower(btrim(new.email));
  new.name  := btrim(new.name);

  -- Teilnehmer gehören zu einem Salon (der Admin hat sonst keinen)
  if new.nimmt_an_teamumfrage and new.salon_id is null then
    select s.id into new.salon_id from public.salons s order by s.erstellt_am, s.id limit 1;
  end if;

  if new.auth_user_id is null then
    select u.id into new.auth_user_id
    from auth.users u
    where lower(u.email) = new.email
      and u.email_confirmed_at is not null
    limit 1;
  end if;

  return new;
end;
$$;

create or replace trigger personen_vorbereiten
  before insert or update of email, name, auth_user_id, nimmt_an_teamumfrage, salon_id on public.personen
  for each row execute function public.personen_vorbereiten();

revoke all on function public.personen_vorbereiten() from public, anon, authenticated;


-- 2. Bestehende Teilnehmer ohne Salon zuordnen ───────────────────────────────

update public.personen
   set salon_id = (select s.id from public.salons s order by s.erstellt_am, s.id limit 1)
 where nimmt_an_teamumfrage and salon_id is null;


-- 3. Ein Teilnehmer ohne Salon ist nicht mehr möglich ────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'personen_teilnehmer_hat_salon' and conrelid = 'public.personen'::regclass
  ) then
    alter table public.personen
      add constraint personen_teilnehmer_hat_salon
      check (not nimmt_an_teamumfrage or salon_id is not null);
  end if;
end;
$$;
