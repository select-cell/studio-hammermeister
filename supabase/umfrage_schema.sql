-- ═══════════════════════════════════════════════════════════════════════════
--  Salon-Plattform · Monatliche Verhaltens-Umfrage · Supabase-Schema
-- ═══════════════════════════════════════════════════════════════════════════
--  Einmal komplett im Supabase SQL-Editor ausführen.
--
--  Aufbau (eine Zeile pro einzelner Antwort, nichts geht verloren):
--
--    umfrage_abgaben      1 Zeile pro ausgefüllter Umfrage
--                         (wer, welcher Salon, welcher Monat, Entwicklung des
--                          Monats + kompletter Rohdatensatz als Sicherung)
--      ├─ umfrage_rituale     1 Zeile pro Ritual-Frage
--      │                      (Empfangs- / Verabschiedungsritual, Skalen,
--      │                       Phase, Anmerkungen, „bewusster leben“)
--      └─ umfrage_bewertungen 1 Zeile pro Verhalten × bewertete Person
--                             (Selbstbild + jedes Fremdbild, mit Note,
--                              Kommentar, Grundpfeiler und Säule)
--
--  Sicherheit:
--    - Die Umfrage-Seite darf NUR über die Funktion umfrage_einreichen()
--      schreiben. Direktes Lesen oder Ändern der Tabellen mit dem
--      öffentlichen (anon) Schlüssel ist gesperrt (Row Level Security).
--    - Auswerten könnt ihr im Supabase-Dashboard (dort seid ihr Admin)
--      oder später über eingeloggte Admin-Zugänge.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. Tabellen
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.umfrage_abgaben (
  id                        uuid primary key default gen_random_uuid(),
  salon                     text        not null,
  monat                     date        not null,                -- immer der 1. des bewerteten Monats
  feedbackgeber             text        not null,
  entwicklung_person        text,
  entwicklung_begruendung   text,
  abgeschickt_am            timestamptz not null default now(), -- Zeitpunkt laut Server
  zeitpunkt_client          timestamptz,                         -- Zeitpunkt laut Gerät
  umfrage_version           text,
  rohdaten                  jsonb       not null,                -- kompletter Datensatz zur Sicherheit

  constraint abgaben_monat_erster check (monat = date_trunc('month', monat)::date),
  constraint abgaben_entwicklung_nicht_selbst
    check (entwicklung_person is null or entwicklung_person <> feedbackgeber),
  -- Jede Person gibt pro Salon und Monat genau eine Umfrage ab
  constraint abgaben_einmal_pro_monat unique (salon, monat, feedbackgeber)
);

comment on table  public.umfrage_abgaben is 'Eine Zeile pro abgeschickter Umfrage.';
comment on column public.umfrage_abgaben.monat is 'Bewerteter Monat (1. des Monats). Standard: Vormonat der Abgabe.';
comment on column public.umfrage_abgaben.rohdaten is 'Unveränderter Datensatz aus der Umfrage – Sicherung, falls später Felder ergänzt werden.';


create table if not exists public.umfrage_rituale (
  id              bigint generated always as identity primary key,
  abgabe_id       uuid     not null references public.umfrage_abgaben(id) on delete cascade,
  ritual          text     not null,                 -- z. B. 'Empfangsritual'
  frage_nr        smallint not null,
  frage           text     not null,                 -- Fragetext zum Zeitpunkt der Abgabe
  typ             text     not null check (typ in ('skala','auswahl','text')),
  antwort_zahl    smallint check (antwort_zahl between 1 and 5),  -- bei Skalen
  antwort_text    text,                                            -- bei Auswahl / Freitext

  constraint rituale_eindeutig unique (abgabe_id, ritual, frage_nr),
  constraint rituale_typ_passt check (
    (typ = 'skala' and antwort_text is null) or
    (typ <> 'skala' and antwort_zahl is null)
  )
);

comment on table public.umfrage_rituale is 'Eine Zeile pro beantworteter Ritual-Frage.';


create table if not exists public.umfrage_bewertungen (
  id                 bigint generated always as identity primary key,
  abgabe_id          uuid     not null references public.umfrage_abgaben(id) on delete cascade,

  -- Kopie aus der Abgabe, damit Auswertungen ohne Join schnell gehen
  salon              text     not null,
  monat              date     not null,
  bewertende_person  text     not null,

  -- Was wurde bewertet
  verhalten_nr       smallint not null,
  grundpfeiler       text,
  saeule             text,
  verhalten          text     not null,             -- Verhaltenstext zum Zeitpunkt der Abgabe

  -- Wer wurde wie bewertet
  art                text     not null check (art in ('selbstbild','fremdbild')),
  bewertete_person   text     not null,
  note               smallint not null check (note between 1 and 5),
  kommentar          text,

  constraint bewertungen_eindeutig unique (abgabe_id, verhalten_nr, bewertete_person),
  constraint bewertungen_art_passt check (
    (art = 'selbstbild' and bewertete_person =  bewertende_person) or
    (art = 'fremdbild'  and bewertete_person <> bewertende_person)
  ),
  -- Ab Note 4 ist ein Kommentar Pflicht (wie in der Umfrage)
  constraint bewertungen_kommentar_ab_4 check (note < 4 or coalesce(btrim(kommentar),'') <> '')
);

comment on table public.umfrage_bewertungen is 'Eine Zeile pro Verhalten × bewertete Person (Selbst- und Fremdbild).';

-- Indizes für typische Auswertungen
create index if not exists idx_abgaben_salon_monat     on public.umfrage_abgaben     (salon, monat);
create index if not exists idx_rituale_abgabe          on public.umfrage_rituale     (abgabe_id);
create index if not exists idx_bewertungen_abgabe      on public.umfrage_bewertungen (abgabe_id);
create index if not exists idx_bewertungen_person      on public.umfrage_bewertungen (salon, monat, bewertete_person);
create index if not exists idx_bewertungen_verhalten   on public.umfrage_bewertungen (salon, monat, verhalten_nr);


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Zugriffsschutz (Row Level Security)
--    Keine Policies = mit dem öffentlichen Schlüssel kein Lesen/Schreiben.
--    Das Dashboard (service_role) ist davon nicht betroffen.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.umfrage_abgaben     enable row level security;
alter table public.umfrage_rituale     enable row level security;
alter table public.umfrage_bewertungen enable row level security;

revoke all on public.umfrage_abgaben, public.umfrage_rituale, public.umfrage_bewertungen from anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. Einreichen: eine Funktion, alles in einem Rutsch
--    Die Umfrage ruft am Ende auf:
--      supabase.rpc('umfrage_einreichen', { payload: SURVEY_RESULT })
--    Entweder wird ALLES gespeichert oder gar nichts (eine Transaktion).
--    Rückgabe: die ID der Abgabe.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.umfrage_einreichen(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_salon  text := nullif(btrim(payload->>'salon'), '');
  v_geber  text := nullif(btrim(payload->>'feedbackgeber'), '');
  v_zeit   timestamptz;
  v_monat  date;
  v_anz_bew int;
  v_constraint text;
begin
  -- Pflichtangaben prüfen
  if v_salon is null then raise exception 'Salon fehlt' using errcode = '22023'; end if;
  if v_geber is null then raise exception 'Feedbackgeber fehlt' using errcode = '22023'; end if;
  if jsonb_typeof(payload->'bewertungen') is distinct from 'array'
     or jsonb_array_length(payload->'bewertungen') = 0 then
    raise exception 'Keine Bewertungen enthalten' using errcode = '22023';
  end if;

  v_zeit := coalesce((payload->>'zeitpunkt')::timestamptz, now());

  -- Bewerteter Monat: aus der Umfrage („monat“: 'YYYY-MM') oder
  -- standardmäßig der Vormonat, weil alle Fragen sich auf den letzten Monat beziehen
  v_monat := case
    when payload ? 'monat' and nullif(payload->>'monat','') is not null
      then date_trunc('month', (left(payload->>'monat', 7) || '-01')::date)::date
    else date_trunc('month', (now() at time zone 'Europe/Berlin') - interval '1 month')::date
  end;

  -- Kopf
  insert into public.umfrage_abgaben
    (salon, monat, feedbackgeber, entwicklung_person, entwicklung_begruendung,
     zeitpunkt_client, umfrage_version, rohdaten)
  values
    (v_salon, v_monat, v_geber,
     nullif(btrim(payload->'entwicklung'->>'person'), ''),
     nullif(btrim(payload->'entwicklung'->>'begruendung'), ''),
     v_zeit,
     payload->>'version',
     payload)
  returning id into v_id;

  -- Rituale
  insert into public.umfrage_rituale
    (abgabe_id, ritual, frage_nr, frage, typ, antwort_zahl, antwort_text)
  select
    v_id,
    r->>'ritual',
    (r->>'frage_nr')::smallint,
    r->>'frage',
    r->>'typ',
    case when r->>'typ' = 'skala' then (r->>'antwort')::smallint end,
    case when r->>'typ' <> 'skala' then nullif(btrim(r->>'antwort'), '') end
  from jsonb_array_elements(coalesce(payload->'rituale', '[]'::jsonb)) as r;

  -- Bewertungen (Selbstbild + Fremdbild)
  insert into public.umfrage_bewertungen
    (abgabe_id, salon, monat, bewertende_person, verhalten_nr, grundpfeiler, saeule,
     verhalten, art, bewertete_person, note, kommentar)
  select
    v_id, v_salon, v_monat, v_geber,
    (b->>'verhalten_nr')::smallint,
    nullif(b->>'grundpfeiler', ''),
    nullif(b->>'saeule', ''),
    b->>'verhalten',
    b->>'art',
    b->>'bewertete_person',
    (b->>'note')::smallint,
    nullif(btrim(b->>'kommentar'), '')
  from jsonb_array_elements(payload->'bewertungen') as b;

  get diagnostics v_anz_bew = row_count;
  if v_anz_bew <> jsonb_array_length(payload->'bewertungen') then
    raise exception 'Nicht alle Bewertungen konnten gespeichert werden' using errcode = '22023';
  end if;

  return v_id;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'abgaben_einmal_pro_monat' then
      raise exception 'Für % wurde die Umfrage für diesen Monat bereits abgegeben.', v_geber
        using errcode = '23505';
    end if;
    raise;   -- doppelte Einträge innerhalb einer Abgabe: Originalfehler weitergeben
end;
$$;

comment on function public.umfrage_einreichen(jsonb) is
  'Speichert eine komplette Umfrage-Abgabe (Kopf, Rituale, Bewertungen) in einer Transaktion.';

revoke all on function public.umfrage_einreichen(jsonb) from public;
grant execute on function public.umfrage_einreichen(jsonb) to anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. Auswertungs-Ansichten (lesen nur mit Admin-Rechten, z. B. im Dashboard)
-- ───────────────────────────────────────────────────────────────────────────

-- 4a) Selbstbild vs. Fremdbild pro Person, Verhalten und Monat
create or replace view public.v_selbst_vs_fremdbild
with (security_invoker = true) as
select
  salon,
  monat,
  bewertete_person                                                  as person,
  verhalten_nr,
  grundpfeiler,
  saeule,
  verhalten,
  max(note) filter (where art = 'selbstbild')                       as selbstbild,
  round(avg(note) filter (where art = 'fremdbild'), 2)              as fremdbild_schnitt,
  count(*)     filter (where art = 'fremdbild')                     as anzahl_fremdbilder,
  round(max(note) filter (where art = 'selbstbild')
        - avg(note) filter (where art = 'fremdbild'), 2)            as abweichung_selbst_minus_fremd
from public.umfrage_bewertungen
group by salon, monat, bewertete_person, verhalten_nr, grundpfeiler, saeule, verhalten;

-- 4b) Schnitt pro Person und Säule (für Monatsverläufe)
create or replace view public.v_person_saeule
with (security_invoker = true) as
select
  salon, monat, bewertete_person as person, grundpfeiler, saeule,
  round(avg(note) filter (where art = 'selbstbild'), 2) as selbstbild_schnitt,
  round(avg(note) filter (where art = 'fremdbild'), 2)  as fremdbild_schnitt,
  count(*) filter (where art = 'fremdbild')             as anzahl_fremdbewertungen
from public.umfrage_bewertungen
group by salon, monat, bewertete_person, grundpfeiler, saeule;

-- 4c) Entwicklung des Monats: wer wurde wie oft genannt
create or replace view public.v_entwicklung_des_monats
with (security_invoker = true) as
select
  salon, monat, entwicklung_person as person,
  count(*)                                    as nennungen,
  array_agg(feedbackgeber order by feedbackgeber) as genannt_von
from public.umfrage_abgaben
where entwicklung_person is not null
group by salon, monat, entwicklung_person;

-- 4d) Rituale: Skalenwerte pro Monat
create or replace view public.v_rituale_skalen
with (security_invoker = true) as
select
  a.salon, a.monat, r.ritual, r.frage_nr, r.frage,
  round(avg(r.antwort_zahl), 2) as schnitt,
  count(*)                      as anzahl
from public.umfrage_rituale r
join public.umfrage_abgaben a on a.id = r.abgabe_id
where r.typ = 'skala'
group by a.salon, a.monat, r.ritual, r.frage_nr, r.frage;

-- 4e) Rituale: welche Phase am häufigsten als „am wenigsten stabil“ genannt wurde
create or replace view public.v_rituale_phasen
with (security_invoker = true) as
select
  a.salon, a.monat, r.ritual, r.antwort_text as phase,
  count(*) as nennungen
from public.umfrage_rituale r
join public.umfrage_abgaben a on a.id = r.abgabe_id
where r.typ = 'auswahl'
group by a.salon, a.monat, r.ritual, r.antwort_text;

-- 4f) Abgabe-Status: wer hat für welchen Monat schon abgegeben
create or replace view public.v_abgabe_status
with (security_invoker = true) as
select salon, monat, feedbackgeber, abgeschickt_am
from public.umfrage_abgaben
order by salon, monat desc, feedbackgeber;

revoke all on public.v_selbst_vs_fremdbild, public.v_person_saeule, public.v_entwicklung_des_monats,
              public.v_rituale_skalen, public.v_rituale_phasen, public.v_abgabe_status
  from anon, authenticated;
