-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 017 · Erweiterung C: PDF-Export (nur Verantwortliche und Admin)
-- ═══════════════════════════════════════════════════════════════════════════
--  Das PDF entsteht im Browser; die Daten dafür liefern ausschließlich diese Funktionen. Sie prüfen die Rolle
--  in der Datenbank (Mitarbeiter und Anmeldungen ohne Person: 42501), bleiben im eigenen Salon und schreiben
--  bei jedem Abruf einen Eintrag ins Export-Protokoll.
--
--  Neu:
--    pdf_monatsbericht(monat)            Team-Bericht eines Monats (Beteiligung, Kennzahlen, Verhalten, Kommentar-Quote, Zeit)
--    pdf_personenbericht(person, monat)  Bericht über eine Person: Kennzahlen, Verhalten, Vormonat, Kommentare OHNE Absender
--    pdf_export_protokoll(limit)         das Protokoll, nur für den Admin
--    pdf_export_log                      Tabelle des Protokolls (gesperrt, nur über die Funktion lesbar)
--
--  Regeln:
--    - Die Zahlen kommen aus denselben Funktionen wie am Bildschirm (team_dashboard, abgabe_status, auswertung_person);
--      im PDF steht nichts, was die Leitung nicht auch in der Plattform sieht.
--    - Kommentare erscheinen nie mit Absender (auswertung_person mit p_mit_absender = false).
--    - Protokolliert wird der Abruf der Berichtsdaten (ein Eintrag je Bericht). Weitere Abrufe für denselben
--      Bericht (Kommentar-Auswertung, Analyse, Agenda) protokollieren nicht.
--
--  Idempotent, ohne DROP (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Export-Protokoll ────────────────────────────────────────────────────────

create table if not exists public.pdf_export_log (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid        not null references public.salons(id),
  user_id     uuid        not null,                                   -- der Login (auth.uid()) der exportierenden Person
  user_name   text        not null,                                   -- Name zum Zeitpunkt des Exports
  art         text        not null check (art in ('monatsbericht', 'personenbericht')),
  person_id   uuid        references public.personen(id) on delete set null,
  monat       date        not null,
  erstellt_am timestamptz not null default now(),

  constraint pdf_export_log_monat_erster check (monat = date_trunc('month', monat)::date)
);

comment on table public.pdf_export_log is 'Protokoll der PDF-Exporte (Abruf der Berichtsdaten). Nur über pdf_export_protokoll() lesbar, nur für den Admin.';

create index if not exists idx_pdf_export_log_salon on public.pdf_export_log (salon_id, erstellt_am desc);

alter table public.pdf_export_log enable row level security;
revoke all on public.pdf_export_log from public, anon, authenticated;


-- 2. pdf_monatsbericht() ─────────────────────────────────────────────────────

create or replace function public.pdf_monatsbericht(p_monat date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon  uuid;
  v_z      public.salons;
  v_ich    public.personen;
  v_dash   jsonb;
  v_monat  date;
  v_komm   jsonb;
  v_zeit   jsonb;
begin
  if not public.ist_leitung() then
    raise exception 'Nur für Verantwortliche und Admin' using errcode = '42501';
  end if;
  v_salon := public.auswertung_salon_id();
  select * into v_z from public.salons where id = v_salon;
  if v_z.id is null then
    raise exception 'Kein Salon' using errcode = '42501';
  end if;
  select * into v_ich from public.personen where auth_user_id = (select auth.uid()) and aktiv;

  v_dash := public.team_dashboard(p_monat);
  if v_dash->>'monat' is null or coalesce((v_dash->'team'->>'abgaben')::integer, 0) = 0 then
    raise exception 'Für diesen Monat liegt noch keine Auswertung vor' using errcode = '22023';
  end if;
  v_monat := ((v_dash->>'monat') || '-01')::date;

  -- Kommentare auf Teamebene (alle Bewertungen des Monats, Selbstbild und Fremdbild)
  select jsonb_build_object(
           'bewertungen', count(*),
           'kommentare',  count(*) filter (where b.kommentar is not null),
           'pflicht',     count(*) filter (where b.note >= 4),
           'pflicht_mit_kommentar', count(*) filter (where b.note >= 4 and b.kommentar is not null),
           'freiwillig',  count(*) filter (where b.note < 4 and b.kommentar is not null),
           'quote',       round(100.0 * count(*) filter (where b.kommentar is not null) / nullif(count(*), 0), 1))
    into v_komm
    from public.umfrage_bewertungen b
    join public.umfrage_abgaben a on a.id = b.abgabe_id
   where a.salon_id = v_salon and b.monat = v_monat;

  -- Aktive Ausfüllzeit (Median der gültigen Sitzungen, Migration 016)
  select jsonb_build_object(
           'median_aktiv_min', round((percentile_cont(0.5) within group (order by s.aktive_sek))::numeric / 60.0, 1),
           'abgaben', count(*))
    into v_zeit
    from public.umfrage_sitzungen s
   where s.salon_id = v_salon and s.monat = v_monat and s.abgegeben_server is not null
     and s.dauer_gueltig is not false and 'ohne_sitzung' <> all (s.flags);

  insert into public.pdf_export_log (salon_id, user_id, user_name, art, monat)
  values (v_salon, (select auth.uid()), coalesce(v_ich.name, 'Unbekannt'), 'monatsbericht', v_monat);

  return jsonb_build_object(
    'salon',       jsonb_build_object('id', v_z.id, 'name', v_z.name),
    'schwellen',   jsonb_build_object('ausgewogen', v_z.schwelle_ausgewogen, 'niedrig', v_z.schwelle_niedrig, 'hoch', v_z.schwelle_hoch),
    'monat',       to_char(v_monat, 'YYYY-MM'),
    'erstellt_am', to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM-DD'),
    'dashboard',   v_dash,
    'beteiligung', public.abgabe_status(v_monat),
    'kommentare',  v_komm,
    'zeit',        v_zeit);
end;
$$;

comment on function public.pdf_monatsbericht(date) is
  'Daten für das Monats-PDF (nur Verantwortliche und Admin, eigener Salon). Protokolliert den Abruf.';

revoke all on function public.pdf_monatsbericht(date) from public, anon;
grant execute on function public.pdf_monatsbericht(date) to authenticated;


-- 3. pdf_personenbericht() ───────────────────────────────────────────────────

create or replace function public.pdf_personenbericht(p_person uuid, p_monat date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon   uuid;
  v_z       public.salons;
  v_ich     public.personen;
  v_p       public.personen;
  v_aus     jsonb;
  v_monat   date;
  v_vor     text;
  v_mtext   text;
  v_begr    jsonb;
  v_nenn    integer;
begin
  if not public.ist_leitung() then
    raise exception 'Nur für Verantwortliche und Admin' using errcode = '42501';
  end if;
  v_salon := public.auswertung_salon_id();
  select * into v_z from public.salons where id = v_salon;
  if v_z.id is null then
    raise exception 'Kein Salon' using errcode = '42501';
  end if;
  select * into v_ich from public.personen where auth_user_id = (select auth.uid()) and aktiv;

  -- Nur Personen des eigenen Salons; wer fremd oder unbekannt ist, bekommt dieselbe Antwort
  select * into v_p from public.personen where id = p_person and salon_id = v_salon and nimmt_an_teamumfrage;
  if v_p.id is null then
    raise exception 'Person nicht gefunden' using errcode = '42501';
  end if;

  v_aus := public.auswertung_person(v_p.id, null, null, false);   -- ohne Absender
  v_mtext := coalesce(to_char(date_trunc('month', p_monat)::date, 'YYYY-MM'),
                      (select max(m) from jsonb_array_elements_text(v_aus->'monate') m));
  if v_mtext is null or coalesce(jsonb_typeof(v_aus->'detail'->v_mtext->'gesamt'), 'null') = 'null' then
    raise exception 'Für diesen Monat liegt keine Auswertung vor' using errcode = '22023';
  end if;
  v_monat := (v_mtext || '-01')::date;

  select max(m) into v_vor
    from jsonb_array_elements_text(v_aus->'monate') m
   where m < v_mtext and coalesce(jsonb_typeof(v_aus->'detail'->m->'gesamt'), 'null') <> 'null';

  -- Entwicklung des Monats: Nennungen und Begründungen der Kollegen, ohne Absender
  select count(*), coalesce(jsonb_agg(a.entwicklung_begruendung order by md5(a.entwicklung_begruendung)) filter (where a.entwicklung_begruendung is not null), '[]'::jsonb)
    into v_nenn, v_begr
    from public.umfrage_abgaben a
   where a.salon_id = v_salon and a.monat = v_monat and a.entwicklung_person = v_p.name;

  insert into public.pdf_export_log (salon_id, user_id, user_name, art, person_id, monat)
  values (v_salon, (select auth.uid()), coalesce(v_ich.name, 'Unbekannt'), 'personenbericht', v_p.id, v_monat);

  return jsonb_build_object(
    'salon',       jsonb_build_object('id', v_z.id, 'name', v_z.name),
    'schwellen',   jsonb_build_object('ausgewogen', v_z.schwelle_ausgewogen, 'niedrig', v_z.schwelle_niedrig, 'hoch', v_z.schwelle_hoch),
    'person',      jsonb_build_object('id', v_p.id, 'name', v_p.name),
    'monat',       v_mtext,
    'vormonat',    v_vor,
    'erstellt_am', to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM-DD'),
    'verlauf',     v_aus->'verlauf',
    'aktuell',     v_aus->'detail'->v_mtext,
    'vorher',      case when v_vor is null then null else v_aus->'detail'->v_vor end,
    'entwicklung', jsonb_build_object('nennungen', v_nenn, 'begruendungen', v_begr));
end;
$$;

comment on function public.pdf_personenbericht(uuid, date) is
  'Daten für das Personen-PDF (nur Verantwortliche und Admin, eigener Salon, Kommentare ohne Absender). Protokolliert den Abruf.';

revoke all on function public.pdf_personenbericht(uuid, date) from public, anon;
grant execute on function public.pdf_personenbericht(uuid, date) to authenticated;


-- 4. pdf_export_protokoll() · nur Admin ──────────────────────────────────────

create or replace function public.pdf_export_protokoll(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
begin
  if not public.ist_admin() then
    raise exception 'Nur für den Admin' using errcode = '42501';
  end if;
  v_salon := public.auswertung_salon_id();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'erstellt_am', l.erstellt_am,
             'von',         l.user_name,
             'art',         l.art,
             'person',      (select p.name from public.personen p where p.id = l.person_id),
             'monat',       to_char(l.monat, 'YYYY-MM')) order by l.erstellt_am desc)
      from (select * from public.pdf_export_log
             where salon_id = v_salon
             order by erstellt_am desc
             limit greatest(least(coalesce(p_limit, 100), 500), 1)) l), '[]'::jsonb);
end;
$$;

comment on function public.pdf_export_protokoll(integer) is 'Export-Protokoll des Salons, nur für den Admin.';

revoke all on function public.pdf_export_protokoll(integer) from public, anon;
grant execute on function public.pdf_export_protokoll(integer) to authenticated;
