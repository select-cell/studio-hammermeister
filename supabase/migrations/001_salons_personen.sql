-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 001 · Phase 1 · Salons, Personen, Verknüpfung mit dem Login
-- ═══════════════════════════════════════════════════════════════════════════
--  Im Supabase SQL-Editor ausführen (nach umfrage_schema.sql und ausfuelldauer.sql).
--  Kann gefahrlos mehrfach ausgeführt werden.
--
--  Was passiert:
--    1. salons    – ein Salon pro Instanz, samt Einstellungen (Schwellen, Reminder-Tage)
--    2. personen  – Brücke zwischen Login (auth.users) und Fachlichkeit
--    3. Trigger   – verknüpfen Login und Person automatisch über die E-Mail,
--                   egal ob zuerst die Person oder zuerst die Einladung angelegt wird
--    4. Rechte    – Hilfsfunktionen und Row Level Security
--    5. ich()     – liefert dem Frontend die eigene Person samt Salon
--    6. Salon Hammermeister wird angelegt
--
--  Schreiben in salons/personen geht nur im Supabase-Dashboard (service_role).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Salons ──────────────────────────────────────────────────────────────────

create table if not exists public.salons (
  id                        uuid primary key default gen_random_uuid(),
  name                      text        not null,
  start_monat               date        not null,       -- ab diesem Monat zählen Umfragen/Reminder (1. des Monats)
  -- Einstellungen: Schwellen der Auswertung (§5.5) und Reminder (§6)
  schwelle_ausgewogen       numeric(3,1) not null default 0.3,  -- |Selbstbild − Fremdbild| bis hier = „Ausgewogen“
  schwelle_niedrig          numeric(3,1) not null default 2.5,  -- Score unter diesem Wert = niedrig
  schwelle_hoch             numeric(3,1) not null default 3.5,  -- Score ab diesem Wert = hoch
  reminder_tage_nach_frist  smallint    not null default 3,     -- Reminder ab so vielen Tagen nach Fristende
  erstellt_am               timestamptz not null default now(),

  constraint salons_start_monat_erster check (start_monat = date_trunc('month', start_monat)::date),
  constraint salons_schwellen_sinnvoll check (schwelle_niedrig < schwelle_hoch),
  constraint salons_reminder_tage_positiv check (reminder_tage_nach_frist >= 0)
);

comment on table  public.salons is 'Ein Salon pro Instanz, von Anfang an mitgeführt.';
comment on column public.salons.start_monat is 'Erster Monat, für den Umfragen und Reminder zählen (immer der 1. des Monats).';


-- 2. Personen ────────────────────────────────────────────────────────────────

create table if not exists public.personen (
  id                    uuid primary key default gen_random_uuid(),
  salon_id              uuid references public.salons(id),   -- null nur bei rolle = 'admin'
  auth_user_id          uuid unique references auth.users(id) on delete set null,
  name                  text        not null,                -- Anzeigename, z. B. 'Antonella Stipic'
  email                 text        not null unique,         -- immer klein geschrieben
  rolle                 text        not null check (rolle in ('mitarbeiter', 'verantwortlicher', 'admin')),
  nimmt_an_teamumfrage  boolean     not null default false,
  aktiv                 boolean     not null default true,
  aktiv_ab              date,                                -- erster Monat, für den die Person abgeben muss
  erstellt_am           timestamptz not null default now(),

  constraint personen_email_klein check (email = lower(btrim(email))),
  constraint personen_salon_pflicht check (rolle = 'admin' or salon_id is not null),
  constraint personen_aktiv_ab_erster check (aktiv_ab is null or aktiv_ab = date_trunc('month', aktiv_ab)::date)
);

comment on table  public.personen is 'Brücke zwischen Login (auth.users) und Fachlichkeit: Rolle, Salon, Teilnahme an der Teamumfrage.';
comment on column public.personen.nimmt_an_teamumfrage is 'Schaltet die Teilnehmer-Bereiche frei, unabhängig von der Rolle.';
comment on column public.personen.aktiv_ab is 'Erster Monat, für den die Person abgeben muss; leer = ab salons.start_monat.';

create index if not exists idx_personen_salon on public.personen (salon_id);


-- 3. Trigger: Login und Person über die E-Mail verknüpfen ───────────────────

-- 3a) Person anlegen/ändern: E-Mail vereinheitlichen; gibt es den Login schon (Einladung zuerst), sofort verknüpfen
create or replace function public.personen_vorbereiten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email := lower(btrim(new.email));
  new.name  := btrim(new.name);

  if new.auth_user_id is null then
    select u.id into new.auth_user_id
    from auth.users u
    where lower(u.email) = new.email
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists personen_vorbereiten on public.personen;
create trigger personen_vorbereiten
  before insert or update of email, name, auth_user_id on public.personen
  for each row execute function public.personen_vorbereiten();

-- 3b) Login angelegt/geändert (Invite user): passende Person verknüpfen
create or replace function public.auth_nutzer_verknuepfen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.personen
     set auth_user_id = new.id
   where email = lower(btrim(new.email))
     and auth_user_id is null;
  return new;
end;
$$;

drop trigger if exists auth_nutzer_verknuepfen on auth.users;
create trigger auth_nutzer_verknuepfen
  after insert or update of email on auth.users
  for each row execute function public.auth_nutzer_verknuepfen();

-- Trigger-Funktionen sind nicht zum direkten Aufruf gedacht
revoke all on function public.personen_vorbereiten()     from public, anon, authenticated;
revoke all on function public.auth_nutzer_verknuepfen()  from public, anon, authenticated;


-- 4. Rechte-Hilfen und Row Level Security ────────────────────────────────────
--    Die Hilfsfunktionen laufen als Besitzer (security definer) und umgehen so die
--    RLS auf `personen`, damit die Policies sich nicht selbst abfragen müssen.

create or replace function public.mein_salon_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select salon_id from public.personen where auth_user_id = (select auth.uid()) and aktiv
$$;

create or replace function public.ist_leitung()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rolle in ('verantwortlicher', 'admin')
       from public.personen
      where auth_user_id = (select auth.uid()) and aktiv),
    false)
$$;

create or replace function public.ist_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rolle = 'admin'
       from public.personen
      where auth_user_id = (select auth.uid()) and aktiv),
    false)
$$;

revoke all on function public.mein_salon_id(), public.ist_leitung(), public.ist_admin() from public, anon;
grant execute on function public.mein_salon_id(), public.ist_leitung(), public.ist_admin() to authenticated;

alter table public.salons   enable row level security;
alter table public.personen enable row level security;

-- Keine Schreibrechte für Nutzer: Personen und Salons pflegt der Admin im Dashboard.
revoke all on public.salons, public.personen from anon, authenticated;
grant select on public.salons, public.personen to authenticated;

-- salons: den eigenen Salon lesen (Admin: alle)
drop policy if exists salons_lesen on public.salons;
create policy salons_lesen on public.salons
  for select to authenticated
  using (id = public.mein_salon_id() or public.ist_admin());

-- personen: die eigene Zeile lesen
drop policy if exists personen_eigene_lesen on public.personen;
create policy personen_eigene_lesen on public.personen
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

-- personen: Verantwortliche und Admin lesen alle Personen des eigenen Salons (Admin: alle)
drop policy if exists personen_salon_lesen on public.personen;
create policy personen_salon_lesen on public.personen
  for select to authenticated
  using (public.ist_admin() or (public.ist_leitung() and salon_id = public.mein_salon_id()));


-- 5. ich(): die eigene Person fürs Frontend ──────────────────────────────────
--    Liefert null, wenn der Login keiner Person zugeordnet ist. Auch deaktivierte
--    Personen werden geliefert (aktiv = false), damit die App einen Hinweis zeigen kann.

create or replace function public.ich()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',                   p.id,
    'name',                 p.name,
    'email',                p.email,
    'rolle',                p.rolle,
    'nimmt_an_teamumfrage', p.nimmt_an_teamumfrage,
    'aktiv',                p.aktiv,
    'aktiv_ab',             p.aktiv_ab,
    'salon', case when s.id is null then null else jsonb_build_object(
      'id',                       s.id,
      'name',                     s.name,
      'start_monat',              s.start_monat,
      'schwelle_ausgewogen',      s.schwelle_ausgewogen,
      'schwelle_niedrig',         s.schwelle_niedrig,
      'schwelle_hoch',            s.schwelle_hoch,
      'reminder_tage_nach_frist', s.reminder_tage_nach_frist
    ) end
  )
  from public.personen p
  left join public.salons s on s.id = p.salon_id
  where p.auth_user_id = (select auth.uid())
$$;

comment on function public.ich() is 'Eigene Person samt Salon für das Frontend; null, wenn der Login keiner Person zugeordnet ist.';

revoke all on function public.ich() from public, anon;
grant execute on function public.ich() to authenticated;


-- 6. Salon Hammermeister ─────────────────────────────────────────────────────
--    start_monat ist vorläufig der Oktober 2026 (offener Punkt §9.8) und lässt sich
--    jederzeit ändern:  update public.salons set start_monat = '2026-11-01' where name = 'Hammermeister';

insert into public.salons (name, start_monat)
select 'Hammermeister', date '2026-10-01'
where not exists (select 1 from public.salons where name = 'Hammermeister');
