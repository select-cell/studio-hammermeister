-- ═══════════════════════════════════════════════════════════════════════════
--  Salon-Plattform · Ergänzung: Ausfülldauer der Monatsumfrage
-- ═══════════════════════════════════════════════════════════════════════════
--  Einmal komplett im Supabase SQL-Editor ausführen (nach umfrage_schema.sql).
--  Kann gefahrlos mehrfach ausgeführt werden.
--
--  Was passiert:
--    1. Zwei neue Spalten in umfrage_abgaben:
--         gestartet_am       – wann die Umfrage begonnen wurde (laut Gerät)
--         ausfuelldauer_sek  – Dauer bis zum Absenden in Sekunden
--    2. umfrage_einreichen() speichert beides mit.
--       Die Dauer wird aus Start und Absende-Zeitpunkt DESSELBEN Geräts
--       berechnet, damit falsch gehende Uhren keine Rolle spielen.
--       Unplausible Werte (unter 1 Minute oder über 24 Stunden, z. B. wenn
--       die Umfrage über Nacht offen war) werden als leer gespeichert.
--    3. v_abgabe_status zeigt die Dauer in Minuten,
--       neue Ansicht v_ausfuelldauer mit Schnitten pro Person und Team.
--
--  Bisherige Abgaben (ohne Startzeit) behalten eine leere Dauer.
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Spalten ─────────────────────────────────────────────────────────────────

alter table public.umfrage_abgaben
  add column if not exists gestartet_am      timestamptz,
  add column if not exists ausfuelldauer_sek integer;

comment on column public.umfrage_abgaben.gestartet_am      is 'Start der Umfrage laut Gerät (Feedbackgeber gewählt, erste Frage).';
comment on column public.umfrage_abgaben.ausfuelldauer_sek is 'Dauer vom Start bis zum Absenden in Sekunden; leer, wenn unbekannt oder unplausibel.';

alter table public.umfrage_abgaben drop constraint if exists abgaben_dauer_plausibel;
alter table public.umfrage_abgaben
  add constraint abgaben_dauer_plausibel
  check (ausfuelldauer_sek is null or ausfuelldauer_sek between 60 and 86400);


-- 2. Einreichen-Funktion (ersetzt die bisherige, alles andere bleibt gleich) ─

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
  v_start  timestamptz;
  v_dauer  integer;
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

  -- Ausfülldauer: Start und Absenden stammen beide vom Gerät → Differenz ist verlässlich
  begin
    v_start := nullif(payload->>'gestartet_am', '')::timestamptz;
  exception when others then
    v_start := null;                       -- unlesbarer Wert → Abgabe trotzdem speichern
  end;
  if v_start is not null and payload ? 'zeitpunkt' then
    v_dauer := extract(epoch from (v_zeit - v_start))::integer;
    if v_dauer not between 60 and 86400 then v_dauer := null; end if;
  end if;

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
     zeitpunkt_client, gestartet_am, ausfuelldauer_sek, umfrage_version, rohdaten)
  values
    (v_salon, v_monat, v_geber,
     nullif(btrim(payload->'entwicklung'->>'person'), ''),
     nullif(btrim(payload->'entwicklung'->>'begruendung'), ''),
     v_zeit,
     v_start,
     v_dauer,
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
    raise;
end;
$$;

comment on function public.umfrage_einreichen(jsonb) is
  'Speichert eine komplette Umfrage-Abgabe (Kopf inkl. Ausfülldauer, Rituale, Bewertungen) in einer Transaktion.';

revoke all on function public.umfrage_einreichen(jsonb) from public;
grant execute on function public.umfrage_einreichen(jsonb) to anon, authenticated;


-- 3. Auswertung ──────────────────────────────────────────────────────────────

-- 3a) Abgabe-Status, jetzt mit Ausfülldauer (neue Spalte am Ende)
create or replace view public.v_abgabe_status
with (security_invoker = true) as
select salon, monat, feedbackgeber, abgeschickt_am,
       round(ausfuelldauer_sek / 60.0, 1) as ausfuelldauer_min
from public.umfrage_abgaben
order by salon, monat desc, feedbackgeber;

-- 3b) Ausfülldauer pro Person und Monat + Team-Schnitt des Monats
create or replace view public.v_ausfuelldauer
with (security_invoker = true) as
select
  salon,
  monat,
  feedbackgeber                                   as person,
  round(ausfuelldauer_sek / 60.0, 1)              as dauer_min,
  round(avg(ausfuelldauer_sek) over (partition by salon, monat) / 60.0, 1) as team_schnitt_min
from public.umfrage_abgaben
order by salon, monat desc, feedbackgeber;

revoke all on public.v_abgabe_status, public.v_ausfuelldauer from anon, authenticated;
