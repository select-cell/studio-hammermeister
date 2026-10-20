-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 002 · Phase 2 · Inhalte der Umfrage (Verhalten, Stufen, Rituale)
-- ═══════════════════════════════════════════════════════════════════════════
--  Im Supabase SQL-Editor ausführen (nach 001). Kann gefahrlos mehrfach ausgeführt werden.
--
--  Die Inhalte der Umfrage wandern aus dem Code in die Datenbank, damit sie ohne
--  Code-Änderung pflegbar sind (docs/plattform-architektur.md §5.1):
--
--    verhalten             die zu bewertenden Verhalten (Reihenfolge = nr)
--    verhalten_kriterien   Bewertungsstufen 1–5 je Verhalten (ausklappbar in der Umfrage)
--    rituale               optionale Ritual-Seiten (Hammermeister hat aktuell keine)
--    ritual_fragen         Fragen je Ritual (Skala, Auswahl, Text)
--
--  Gegenüber §5.1 ergänzt, weil die Umfrage in referenz/ es kennt:
--    rituale.untertitel, rituale.einleitung (Absätze), ritual_fragen.hinweis
--
--  Lesen dürfen eingeloggte Nutzer des Salons, Schreiben nur das Dashboard (service_role).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Verhalten und Bewertungsstufen ──────────────────────────────────────────

create table if not exists public.verhalten (
  id            uuid primary key default gen_random_uuid(),
  salon_id      uuid        not null references public.salons(id),
  nr            smallint    not null,            -- Reihenfolge und verhalten_nr in den Bewertungen
  grundpfeiler  text,                            -- optional, z. B. 'Grundpfeiler 1: Philosophie'
  saeule        text,                            -- optional, z. B. 'Säule 1: Umgangsformen und Respekt'
  titel         text        not null,
  video_url     text,                            -- Vimeo-Player-URL oder .mp4; leer = Platzhalter-Video
  aktiv         boolean     not null default true,

  constraint verhalten_nr_je_salon unique (salon_id, nr)
);

comment on table  public.verhalten is 'Die zu bewertenden Verhalten der Monatsumfrage, pro Salon.';
comment on column public.verhalten.video_url is 'Vimeo-Player-URL oder .mp4-URL. Leer = Platzhalter-Video mit Timer.';

create table if not exists public.verhalten_kriterien (
  id            uuid primary key default gen_random_uuid(),
  verhalten_id  uuid        not null references public.verhalten(id) on delete cascade,
  stufe         smallint    not null check (stufe between 1 and 5),
  bezeichnung   text,                            -- '1 – Bewusstsein'
  prozent       text,                            -- '0–25%'
  leitsatz      text,
  punkte        text[]      not null default '{}',

  constraint kriterien_stufe_je_verhalten unique (verhalten_id, stufe)
);

comment on table public.verhalten_kriterien is 'Bewertungsstufen 1–5 je Verhalten (Bezeichnung, Prozent, Leitsatz, Stichpunkte).';


-- 2. Rituale ─────────────────────────────────────────────────────────────────

create table if not exists public.rituale (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid        not null references public.salons(id),
  nr           smallint    not null,
  titel        text        not null,
  untertitel   text,
  einleitung   text[]      not null default '{}',  -- Absätze des Einleitungstexts
  video_url    text,
  aktiv        boolean     not null default true,

  constraint rituale_nr_je_salon unique (salon_id, nr)
);

comment on table public.rituale is 'Optionale Ritual-Seiten der Umfrage (vor den Verhalten). Hammermeister hat aktuell keine.';

create table if not exists public.ritual_fragen (
  id          uuid primary key default gen_random_uuid(),
  ritual_id   uuid        not null references public.rituale(id) on delete cascade,
  nr          smallint    not null,
  typ         text        not null check (typ in ('skala', 'auswahl', 'text')),
  frage       text        not null,
  hinweis     text,                                -- kleiner Hinweistext unter der Frage
  optionen    text[],                              -- bei 'auswahl'
  labels      text[],                              -- optionale Skalen-Beschriftungen (1–5)
  pflicht     boolean     not null default false,

  constraint ritual_fragen_nr_je_ritual unique (ritual_id, nr)
);

comment on table public.ritual_fragen is 'Fragen eines Rituals: Skala (1–5), Auswahl oder Freitext.';

create index if not exists idx_kriterien_verhalten on public.verhalten_kriterien (verhalten_id);
create index if not exists idx_ritual_fragen_ritual on public.ritual_fragen (ritual_id);


-- 3. Zugriff: Lesen für eingeloggte Nutzer des Salons ────────────────────────

alter table public.verhalten           enable row level security;
alter table public.verhalten_kriterien enable row level security;
alter table public.rituale             enable row level security;
alter table public.ritual_fragen       enable row level security;

revoke all on public.verhalten, public.verhalten_kriterien, public.rituale, public.ritual_fragen from anon, authenticated;
grant select on public.verhalten, public.verhalten_kriterien, public.rituale, public.ritual_fragen to authenticated;

-- Policies ohne DROP anlegen (siehe Migration 001). Stufen und Fragen sind sichtbar, wenn ihr Elternteil sichtbar ist.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'verhalten' and policyname = 'verhalten_lesen') then
    create policy verhalten_lesen on public.verhalten
      for select to authenticated
      using (salon_id = public.mein_salon_id() or public.ist_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'verhalten_kriterien' and policyname = 'kriterien_lesen') then
    create policy kriterien_lesen on public.verhalten_kriterien
      for select to authenticated
      using (exists (select 1 from public.verhalten v where v.id = verhalten_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rituale' and policyname = 'rituale_lesen') then
    create policy rituale_lesen on public.rituale
      for select to authenticated
      using (salon_id = public.mein_salon_id() or public.ist_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ritual_fragen' and policyname = 'ritual_fragen_lesen') then
    create policy ritual_fragen_lesen on public.ritual_fragen
      for select to authenticated
      using (exists (select 1 from public.rituale r where r.id = ritual_id));
  end if;
end $$;
