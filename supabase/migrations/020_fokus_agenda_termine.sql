-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 020 · Erweiterung F: Fokus-Verhalten, Team-Agenda, Meeting-Termine, Mailversand
-- ═══════════════════════════════════════════════════════════════════════════
--  Aus den Ergebnissen eines Monats entsteht eine Agenda für das Teammeeting (15 bis 20 Minuten); Verantwortliche bekommen sie
--  vor dem Termin per Mail. Alles Berechnen und Prüfen geschieht in der Datenbank.
--
--  Neu:
--    fokus_verhalten           Tabelle: welche Verhalten gerade besonders wichtig sind (gesperrt)
--    meeting_termine           Tabelle: Termine der Teammeetings (gesperrt, Verwaltung nur durch den Admin)
--    mail_log                  Tabelle: welche Mail zu welchem Termin gesendet wurde; UNIQUE (termin_id, art) verhindert Doppelversand
--    fokus_liste(), fokus_umschalten()                    Leitung: Fokus-Verhalten ansehen und setzen
--    agenda_erzeugen(), agenda_lesen(), agenda_bearbeiten(), agenda_freigeben()   Leitung: Agenda
--    termine_liste(), termin_speichern(), termine_serie(), termin_entfernen()     nur Admin: Termine
--    versand_faellig(), versand_beanspruchen(), versand_abschliessen(), agenda_fuer_versand()   nur für den Versand-Job (service_role)
--
--  Regeln:
--    - Fokus und Agenda: nur Verantwortliche und Admin (42501 für alle anderen). Termine: nur der Admin.
--    - Die Agenda enthält nur Teamebene: keine Rangliste einzelner Personen und keine Kommentare mit Absender oder Namen.
--      Kommentar-Beispiele zu den Fokus-Verhalten stehen anonymisiert (Namen durch Platzhalter) in der Agenda auf der Plattform,
--      aber NIE in den Mails.
--    - Zeitbudget (serverseitig geprüft): Einstieg 2, Kennzahlen 3, Fokus 6 bis 8, Entwicklung 3 bis 4, Vereinbarungen 2 bis 3 Minuten;
--      die Summe liegt zwischen 15 und 20. Eine Agenda außerhalb wird abgelehnt (22023).
--    - Ist der Monat nicht abgeschlossen oder fehlen Einzelanalysen, trägt die Agenda den Hinweis „Stand unvollständig: x von y“.
--    - Versand: „vorab“ (Tage vor dem Termin, in Berliner Uhrzeit, Sommer-/Winterzeit-fest) und „kurz“ (Stunden davor).
--      Je Termin und Art höchstens eine Mail. Ein Fehler wird protokolliert und höchstens dreimal wiederholt.
--    - Die Funktionen für den Versand-Job sind nur für service_role aufrufbar.
--
--  Idempotent, ohne DROP und ohne DELETE (siehe CLAUDE.md): Termine werden „entfernt“ (Kennzeichen), nicht gelöscht.
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Tabellen ────────────────────────────────────────────────────────────────

create table if not exists public.fokus_verhalten (
  id                 uuid primary key default gen_random_uuid(),
  salon_id           uuid        not null references public.salons(id),
  verhalten_id       uuid        not null references public.verhalten(id) on delete cascade,
  gueltig_ab         date        not null default current_date,
  gueltig_bis        date,                                      -- leer = bis auf Weiteres; einschließlich dieses Tages
  begruendung        text,                                      -- „warum wichtig“
  erstellt_von_name  text,
  erstellt_am        timestamptz not null default now(),

  -- gueltig_bis = gueltig_ab - 1 ist ein beendeter (leerer) Zeitraum
  constraint fokus_zeitraum check (gueltig_bis is null or gueltig_bis >= gueltig_ab - 1)
);

comment on table public.fokus_verhalten is 'Verhalten, die gerade besonders wichtig sind (Agenda priorisiert sie). Nur über Funktionen les- und schreibbar.';
create index if not exists idx_fokus_salon on public.fokus_verhalten (salon_id, verhalten_id);

create table if not exists public.meeting_termine (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid        not null references public.salons(id),
  startet_am       timestamptz not null,
  titel            text        not null default 'Teammeeting',
  bezugsmonat      date,                                         -- leer = der Monat vor dem Termin (Berliner Zeit)
  vorlauf_tage     integer[]   not null default '{2}',
  vorlauf_stunden  numeric[]   not null default '{1}',
  cc_admin         boolean     not null default false,
  aktiv            boolean     not null default true,
  entfernt         boolean     not null default false,
  erstellt_am      timestamptz not null default now(),

  constraint termine_titel_nicht_leer   check (btrim(titel) <> ''),
  constraint termine_bezugsmonat_erster check (bezugsmonat is null or bezugsmonat = date_trunc('month', bezugsmonat)::date),
  constraint termine_vorlauf_tage       check (cardinality(vorlauf_tage) between 1 and 5),
  constraint termine_vorlauf_stunden    check (cardinality(vorlauf_stunden) between 1 and 5)
);

comment on table public.meeting_termine is 'Termine der Teammeetings (Zeitpunkt als timestamptz, angezeigt in Europe/Berlin). Verwaltung nur durch den Admin.';
create index if not exists idx_termine_salon_start on public.meeting_termine (salon_id, startet_am);

create table if not exists public.mail_log (
  id                uuid primary key default gen_random_uuid(),
  termin_id         uuid        not null references public.meeting_termine(id) on delete cascade,
  art               text        not null check (art in ('vorab', 'kurz')),
  gesendet_am       timestamptz not null default now(),
  empfaenger        text[]      not null,
  status            text        not null check (status in ('in_arbeit', 'gesendet', 'fehler')),
  versuche          integer     not null default 1,
  fehler            text,
  aktualisiert_am   timestamptz not null default now(),

  constraint mail_log_einmal unique (termin_id, art)
);

comment on table public.mail_log is 'Gesendete Mails je Termin und Art. UNIQUE (termin_id, art) garantiert, dass nie doppelt gesendet wird, auch bei parallelen Läufen.';

alter table public.fokus_verhalten enable row level security;
alter table public.meeting_termine enable row level security;
alter table public.mail_log        enable row level security;
revoke all on public.fokus_verhalten, public.meeting_termine, public.mail_log from public, anon, authenticated;


-- 2. Kleine Hilfen (intern, nicht aufrufbar) ─────────────────────────────────

-- 3,14 mit Komma, zwei Stellen; null bleibt null
create or replace function public.agenda_zahl(p_zahl numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_zahl is null then null else replace(to_char(round(p_zahl, 2), 'FM990.00'), '.', ',') end
$$;

-- +0,25 / −0,04 / 0,00
create or replace function public.agenda_diff(p_zahl numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_zahl is null then null
              when round(p_zahl, 2) > 0 then '+' || public.agenda_zahl(p_zahl)
              when round(p_zahl, 2) < 0 then '−' || public.agenda_zahl(abs(p_zahl))
              else public.agenda_zahl(0) end
$$;

create or replace function public.agenda_monatsname(p_monat date)
returns text
language sql
immutable
set search_path = public
as $$
  select (array['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'])[extract(month from p_monat)::integer]
         || ' ' || extract(year from p_monat)::integer
$$;

-- Der Monat vor dem Termin in Berliner Zeit (Standard für den Bezugsmonat)
create or replace function public.agenda_bezugsmonat(p_zeit timestamptz)
returns date
language sql
immutable
set search_path = public
as $$
  select (date_trunc('month', p_zeit at time zone 'Europe/Berlin') - interval '1 month')::date
$$;

revoke all on function public.agenda_zahl(numeric), public.agenda_diff(numeric), public.agenda_monatsname(date), public.agenda_bezugsmonat(timestamptz) from public, anon, authenticated;


-- 3. Fokus-Verhalten ─────────────────────────────────────────────────────────

-- Welche Verhalten sind an einem Tag Fokus? (intern)
create or replace function public.fokus_am(p_salon uuid, p_datum date)
returns table (verhalten_id uuid, nr smallint, titel text, begruendung text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (v.id) v.id, v.nr, v.titel, f.begruendung
    from public.fokus_verhalten f
    join public.verhalten v on v.id = f.verhalten_id
   where f.salon_id = p_salon and f.gueltig_ab <= p_datum and (f.gueltig_bis is null or f.gueltig_bis >= p_datum)
   order by v.id, f.gueltig_ab desc, f.erstellt_am desc
$$;

revoke all on function public.fokus_am(uuid, date) from public, anon, authenticated;

-- fokus_liste(): alle Verhalten mit dem heutigen Stand
--  Antwort: { heute, verhalten: [ { verhalten_id, nr, titel, grundpfeiler, saeule, aktiv, begruendung, seit, bis } ] }
create or replace function public.fokus_liste()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  v_salon := public.analyse_zugriff();
  return jsonb_build_object(
    'heute', v_heute,
    'verhalten', coalesce((
      select jsonb_agg(jsonb_build_object(
               'verhalten_id', v.id, 'nr', v.nr, 'titel', v.titel, 'grundpfeiler', v.grundpfeiler, 'saeule', v.saeule,
               'aktiv', f.verhalten_id is not null, 'begruendung', f.begruendung,
               'seit', (select min(x.gueltig_ab) from public.fokus_verhalten x where x.salon_id = v_salon and x.verhalten_id = v.id and x.gueltig_ab <= v_heute and (x.gueltig_bis is null or x.gueltig_bis >= v_heute)),
               'bis',  (select x.gueltig_bis from public.fokus_verhalten x where x.salon_id = v_salon and x.verhalten_id = v.id and x.gueltig_ab <= v_heute and (x.gueltig_bis is null or x.gueltig_bis >= v_heute) order by x.gueltig_ab desc limit 1))
             order by v.nr)
        from public.verhalten v
        left join public.fokus_am(v_salon, v_heute) f on f.verhalten_id = v.id
       where v.salon_id = v_salon and v.aktiv), '[]'::jsonb));
end;
$$;

revoke all on function public.fokus_liste() from public, anon;
grant execute on function public.fokus_liste() to authenticated;

-- fokus_umschalten(): Fokus an (mit Begründung, optional befristet) oder aus
--  An: Ist das Verhalten heute schon Fokus, werden Begründung und Ende aktualisiert; sonst entsteht ein Eintrag ab heute (oder ab p_ab).
--  Aus: Laufende Einträge enden gestern (die Geschichte bleibt erhalten).
create or replace function public.fokus_umschalten(
  p_verhalten uuid, p_an boolean, p_begruendung text default null, p_ab date default null, p_bis date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
  v_ich   public.personen;
  v_ab    date;
  v_alt   uuid;
begin
  v_salon := public.analyse_zugriff();
  if not exists (select 1 from public.verhalten v where v.id = p_verhalten and v.salon_id = v_salon) then
    raise exception 'Verhalten nicht gefunden' using errcode = '42501';
  end if;
  select * into v_ich from public.personen where auth_user_id = (select auth.uid()) and aktiv;

  if coalesce(p_an, false) then
    v_ab := coalesce(p_ab, v_heute);
    if p_bis is not null and p_bis < v_ab then
      raise exception 'Das Ende liegt vor dem Beginn' using errcode = '22023';
    end if;
    select f.id into v_alt from public.fokus_verhalten f
     where f.salon_id = v_salon and f.verhalten_id = p_verhalten and f.gueltig_ab <= v_heute and (f.gueltig_bis is null or f.gueltig_bis >= v_heute)
     order by f.gueltig_ab desc, f.erstellt_am desc limit 1;
    if v_alt is not null then
      update public.fokus_verhalten set begruendung = nullif(btrim(p_begruendung), ''), gueltig_bis = p_bis where id = v_alt;
    else
      insert into public.fokus_verhalten (salon_id, verhalten_id, gueltig_ab, gueltig_bis, begruendung, erstellt_von_name)
      values (v_salon, p_verhalten, v_ab, p_bis, nullif(btrim(p_begruendung), ''), coalesce(v_ich.name, 'Unbekannt'));
    end if;
  else
    update public.fokus_verhalten f
       set gueltig_bis = greatest(v_heute - 1, f.gueltig_ab - 1)
     where f.salon_id = v_salon and f.verhalten_id = p_verhalten and (f.gueltig_bis is null or f.gueltig_bis >= v_heute);
  end if;
  return public.fokus_liste();
end;
$$;

revoke all on function public.fokus_umschalten(uuid, boolean, text, date, date) from public, anon;
grant execute on function public.fokus_umschalten(uuid, boolean, text, date, date) to authenticated;


-- 4. Agenda ──────────────────────────────────────────────────────────────────

-- Prüft eine Agenda auf Aufbau und Zeitbudget. Wirft 22023 mit einer verständlichen Meldung.
create or replace function public.agenda_validieren(p_inhalt jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_ids   text[] := array['einstieg', 'kennzahlen', 'fokus', 'entwicklung', 'vereinbarungen'];
  v_min   integer[] := array[2, 3, 6, 3, 2];
  v_max   integer[] := array[2, 3, 8, 4, 3];
  b       jsonb;
  i       integer;
  v_summe integer := 0;
  v_m     numeric;
begin
  if p_inhalt is null or jsonb_typeof(p_inhalt->'bloecke') is distinct from 'array' or jsonb_array_length(p_inhalt->'bloecke') <> 5 then
    raise exception 'Die Agenda braucht genau fünf Blöcke' using errcode = '22023';
  end if;
  for i in 1..5 loop
    b := p_inhalt->'bloecke'->(i - 1);
    if b->>'id' is distinct from v_ids[i] then
      raise exception 'Block % muss „%“ sein', i, v_ids[i] using errcode = '22023';
    end if;
    if jsonb_typeof(b->'minuten') is distinct from 'number' then
      raise exception 'Block „%“ hat keine Minuten', v_ids[i] using errcode = '22023';
    end if;
    v_m := (b->>'minuten')::numeric;
    if v_m <> trunc(v_m) or v_m < v_min[i] or v_m > v_max[i] then
      raise exception 'Block „%“ darf % bis % Minuten dauern, nicht %', v_ids[i], v_min[i], v_max[i], v_m using errcode = '22023';
    end if;
    if jsonb_typeof(b->'punkte') is distinct from 'array' or jsonb_array_length(b->'punkte') = 0 then
      raise exception 'Block „%“ hat keine Punkte', v_ids[i] using errcode = '22023';
    end if;
    v_summe := v_summe + v_m::integer;
  end loop;
  if v_summe < 15 or v_summe > 20 then
    raise exception 'Die Agenda dauert % Minuten, erlaubt sind 15 bis 20', v_summe using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.agenda_validieren(jsonb) from public, anon, authenticated;

-- Die Daten für eine Agenda (nur Teamebene), alle Zahlen aus SQL.
--  Aufbau (die Kommentare stehen hier, damit der Funktionsrumpf in der Datenbank unverändert bleibt):
--    Fokus-Verhalten mit Ergebnis und anonymisierten Kommentar-Beispielen (nur für die Plattform, nie für Mails)
create or replace function public.agenda_daten(p_salon uuid, p_monat date, p_datum date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_z      public.salons;
  v_vor    date := (p_monat - interval '1 month')::date;
  v_erw    integer;
  v_abg    integer;
  v_ges    jsonb;
  v_ges_alt jsonb;
  v_vh     jsonb;
  v_fokus  jsonb;
  v_gesamt integer;
  v_fertig integer;
  v_frei   integer;
  v_abschluss boolean;
begin
  select * into v_z from public.salons where id = p_salon;

  select count(*) into v_erw from public.personen p
   where p.salon_id = p_salon and p.aktiv and p.nimmt_an_teamumfrage
     and greatest(date_trunc('month', v_z.start_monat)::date, coalesce(p.aktiv_ab, v_z.start_monat)) <= p_monat;
  select count(distinct a.feedbackgeber_id) into v_abg from public.umfrage_abgaben a where a.salon_id = p_salon and a.monat = p_monat;

  with bew as (
    select b.monat, b.verhalten_nr as nr, b.art, b.note, b.bewertete_person_id as pid, b.verhalten as titel, b.saeule
      from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
     where a.salon_id = p_salon and b.monat in (p_monat, v_vor)
  ),
  pv as (
    select monat, nr, pid, max(titel) as titel, max(saeule) as saeule,
           (max(note) filter (where art = 'selbstbild'))::numeric as sb, avg(note) filter (where art = 'fremdbild') as fb
      from bew group by monat, nr, pid
  ),
  vh as (select monat, nr, max(titel) as titel, max(saeule) as saeule, avg(sb) as sb, avg(fb) as fb from pv group by monat, nr),
  ppm as (select monat, pid, avg(sb) as sb, avg(fb) as fb from pv group by monat, pid),
  ges as (select monat, avg(sb) as sb, avg(fb) as fb from ppm group by monat)
  select
    (select jsonb_build_object('selbstbild', round(g.sb, 2), 'fremdbild', round(g.fb, 2), 'differenz', round(g.sb - g.fb, 2)) from ges g where g.monat = p_monat),
    (select jsonb_build_object('selbstbild', round(g.sb, 2), 'fremdbild', round(g.fb, 2), 'differenz', round(g.sb - g.fb, 2)) from ges g where g.monat = v_vor),
    coalesce((select jsonb_agg(jsonb_build_object(
        'nr', h.nr, 'titel', h.titel, 'saeule', h.saeule,
        'selbstbild', round(h.sb, 2), 'fremdbild', round(h.fb, 2), 'differenz', round(h.sb - h.fb, 2),
        'fremdbild_vormonat', (select round(x.fb, 2) from vh x where x.monat = v_vor and x.nr = h.nr),
        'veraenderung', (select round(h.fb - x.fb, 2) from vh x where x.monat = v_vor and x.nr = h.nr)) order by h.nr)
        from vh h where h.monat = p_monat), '[]'::jsonb)
    into v_ges, v_ges_alt, v_vh;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nr', f.nr, 'titel', f.titel, 'begruendung', f.begruendung,
           'ergebnis', (select x from jsonb_array_elements(v_vh) x where (x->>'nr')::integer = f.nr),
           'beispiele', coalesce((
              select jsonb_agg(public.analyse_anonymisieren(k.kommentar, null, p_salon))
                from (select nullif(btrim(b.kommentar), '') as kommentar
                        from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
                       where a.salon_id = p_salon and b.monat = p_monat and b.verhalten_nr = f.nr and b.art = 'fremdbild'
                         and nullif(btrim(b.kommentar), '') is not null
                       order by md5(b.kommentar) limit 2) k), '[]'::jsonb)) order by f.nr), '[]'::jsonb)
    into v_fokus
    from public.fokus_am(p_salon, p_datum) f;

  select count(*) into v_gesamt from public.personen p
   where p.salon_id = p_salon and p.aktiv and p.nimmt_an_teamumfrage
     and exists (select 1 from public.umfrage_bewertungen b join public.umfrage_abgaben ab on ab.id = b.abgabe_id
                  where ab.salon_id = p_salon and b.monat = p_monat and b.bewertete_person_id = p.id and b.art = 'fremdbild');
  select count(*), count(*) filter (where an.status = 'freigegeben') into v_fertig, v_frei
    from public.analysen an where an.salon_id = p_salon and an.monat = p_monat and an.typ = 'person';
  select exists (select 1 from public.monatsabschluesse m where m.salon_id = p_salon and m.monat = p_monat) into v_abschluss;

  return jsonb_build_object(
    'monat', to_char(p_monat, 'YYYY-MM'),
    'vormonat', case when v_ges_alt is null then null else to_char(v_vor, 'YYYY-MM') end,
    'schwellen', jsonb_build_object('ausgewogen', v_z.schwelle_ausgewogen, 'niedrig', v_z.schwelle_niedrig, 'hoch', v_z.schwelle_hoch),
    'beteiligung', jsonb_build_object('erwartet', v_erw, 'abgegeben', v_abg),
    'team', v_ges, 'team_vormonat', v_ges_alt, 'verhalten', v_vh, 'fokus', v_fokus,
    'analysen', jsonb_build_object('gesamt', v_gesamt, 'fertig', v_fertig, 'freigegeben', v_frei),
    'abgeschlossen', v_abschluss);
end;
$$;

revoke all on function public.agenda_daten(uuid, date, date) from public, anon, authenticated;

-- Baut die Agenda (Blöcke mit Minuten und Punkten) und ihre lesbare Fassung.
--  Priorität im Fokus-Block: 1. Fokus-Verhalten, 2. größte Teamdifferenzen, 3. größte Veränderung zum Vormonat.
--  Aufbau (die Kommentare stehen hier, damit der Funktionsrumpf in der Datenbank unverändert bleibt):
--    Einstieg und Beteiligung
--    Team-Kennzahlen
--    Fokus-Block: zuerst die Fokus-Verhalten (höchstens drei), dann auffällige Differenzen, dann die größten Veränderungen
--    Entwicklungsfelder: die niedrigsten Fremdbilder (ohne das, was schon im Fokus-Block steht)
--    Vereinbarungen
--    Hinweis: Stand unvollständig
--    Lesbare Fassung
create or replace function public.agenda_bauen(p_salon uuid, p_monat date, p_datum date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d        jsonb := public.agenda_daten(p_salon, p_monat, p_datum);
  s        jsonb := d->'schwellen';
  v_hoch   numeric := (s->>'hoch')::numeric;
  v_nied   numeric := (s->>'niedrig')::numeric;
  v_ausg   numeric := (s->>'ausgewogen')::numeric;
  t        jsonb := d->'team';
  ta       jsonb := d->'team_vormonat';
  v_monat  text := public.agenda_monatsname(p_monat);
  v_naechst text := public.agenda_monatsname((p_monat + interval '2 month')::date);
  punkte_e jsonb := '[]'::jsonb;
  punkte_k jsonb := '[]'::jsonb;
  punkte_f jsonb := '[]'::jsonb;
  punkte_d jsonb := '[]'::jsonb;
  punkte_v jsonb;
  v_hinweis text[] := '{}';
  v_fb     numeric;
  v_diff   numeric;
  v_stufe  text;
  v_einord text;
  r        record;
  v_nrs    integer[] := '{}';
  v_zahl   integer;
  v_fokus_n integer := 0;
  bloecke  jsonb;
  inhalt   jsonb;
  v_text   text := '';
  b        jsonb;
  p        text;
begin
  punkte_e := punkte_e || to_jsonb(format('Danke an alle: %s von %s haben die Umfrage für %s abgegeben.', d->'beteiligung'->>'abgegeben', d->'beteiligung'->>'erwartet', v_monat));
  if (d->'beteiligung'->>'abgegeben')::integer < (d->'beteiligung'->>'erwartet')::integer then
    punkte_e := punkte_e || to_jsonb(format('%s Abgaben fehlen noch.', (d->'beteiligung'->>'erwartet')::integer - (d->'beteiligung'->>'abgegeben')::integer));
  end if;

  if t is not null then
    v_fb := (t->>'fremdbild')::numeric;
    v_diff := (t->>'differenz')::numeric;
    v_stufe := case when v_fb >= v_hoch then 'hoch' when v_fb < v_nied then 'niedrig' else 'mittel' end;
    v_einord := case when abs(v_diff) <= v_ausg then 'ausgewogen' when v_diff > 0 then 'Selbstüberschätzung' else 'Selbstunterschätzung' end;
    punkte_k := punkte_k || to_jsonb(format('Selbstbild %s, Fremdbild %s, Differenz %s (%s).', public.agenda_zahl((t->>'selbstbild')::numeric), public.agenda_zahl(v_fb), public.agenda_diff(v_diff), v_einord));
    punkte_k := punkte_k || to_jsonb(format('Das Fremdbild liegt in der Stufe „%s“.', v_stufe));
    if ta is not null then
      punkte_k := punkte_k || to_jsonb(format('Zum Vormonat: Fremdbild %s auf %s, Selbstbild %s auf %s.', public.agenda_zahl((ta->>'fremdbild')::numeric), public.agenda_zahl(v_fb), public.agenda_zahl((ta->>'selbstbild')::numeric), public.agenda_zahl((t->>'selbstbild')::numeric)));
    end if;
  else
    punkte_k := punkte_k || to_jsonb('Für diesen Monat liegen noch keine Ergebnisse vor.'::text);
  end if;

  for r in select x from jsonb_array_elements(d->'fokus') x loop
    exit when v_fokus_n >= 3;
    v_zahl := (r.x->>'nr')::integer;
    v_nrs := v_nrs || v_zahl;
    v_fokus_n := v_fokus_n + 1;
    punkte_f := punkte_f || to_jsonb(
      format('Fokus – Verhalten %s: %s. %s', v_zahl, r.x->>'titel',
        case when r.x->'ergebnis' is null then 'Für diesen Monat liegt noch kein Ergebnis vor.'
             else format('Fremdbild %s, Selbstbild %s%s.', public.agenda_zahl((r.x->'ergebnis'->>'fremdbild')::numeric), public.agenda_zahl((r.x->'ergebnis'->>'selbstbild')::numeric),
                         case when r.x->'ergebnis'->>'veraenderung' is null then '' else ', Veränderung zum Vormonat ' || public.agenda_diff((r.x->'ergebnis'->>'veraenderung')::numeric) end) end));
    if nullif(btrim(r.x->>'begruendung'), '') is not null then
      punkte_f := punkte_f || to_jsonb('Warum wichtig: ' || btrim(r.x->>'begruendung'));
    end if;
    if jsonb_array_length(r.x->'beispiele') > 0 then
      punkte_f := punkte_f || to_jsonb('Beispiele aus den Kommentaren (ohne Namen): ' || (select string_agg('„' || e || '“', ' · ') from jsonb_array_elements_text(r.x->'beispiele') e));
    end if;
  end loop;
  if v_fokus_n < 3 then
    for r in
      select x, 'differenz' as quelle, abs((x->>'differenz')::numeric) as gewicht
        from jsonb_array_elements(d->'verhalten') x
       where (x->>'differenz') is not null and abs((x->>'differenz')::numeric) > v_ausg and not ((x->>'nr')::integer = any (v_nrs))
       order by abs((x->>'differenz')::numeric) desc, (x->>'nr')::integer
       limit 3 - v_fokus_n
    loop
      v_nrs := v_nrs || (r.x->>'nr')::integer;
      v_fokus_n := v_fokus_n + 1;
      punkte_f := punkte_f || to_jsonb(format('Größte Teamdifferenz – Verhalten %s: %s. Selbstbild %s, Fremdbild %s, Differenz %s.', r.x->>'nr', r.x->>'titel',
        public.agenda_zahl((r.x->>'selbstbild')::numeric), public.agenda_zahl((r.x->>'fremdbild')::numeric), public.agenda_diff((r.x->>'differenz')::numeric)));
    end loop;
  end if;
  if v_fokus_n < 3 then
    for r in
      select x
        from jsonb_array_elements(d->'verhalten') x
       where (x->>'veraenderung') is not null and (x->>'veraenderung')::numeric <> 0 and not ((x->>'nr')::integer = any (v_nrs))
       order by abs((x->>'veraenderung')::numeric) desc, (x->>'nr')::integer
       limit 3 - v_fokus_n
    loop
      v_nrs := v_nrs || (r.x->>'nr')::integer;
      v_fokus_n := v_fokus_n + 1;
      punkte_f := punkte_f || to_jsonb(format('Größte Veränderung zum Vormonat – Verhalten %s: %s. Fremdbild %s auf %s (%s).', r.x->>'nr', r.x->>'titel',
        public.agenda_zahl((r.x->>'fremdbild_vormonat')::numeric), public.agenda_zahl((r.x->>'fremdbild')::numeric), public.agenda_diff((r.x->>'veraenderung')::numeric)));
    end loop;
  end if;
  if v_fokus_n = 0 then
    punkte_f := punkte_f || to_jsonb('Es ist kein Fokus-Verhalten markiert und es gibt keine auffälligen Differenzen. Gemeinsam entscheiden, worauf der nächste Monat schauen soll.'::text);
  end if;

  for r in
    select x from jsonb_array_elements(d->'verhalten') x
     where (x->>'fremdbild') is not null and not ((x->>'nr')::integer = any (v_nrs))
     order by (x->>'fremdbild')::numeric, (x->>'nr')::integer limit 3
  loop
    punkte_d := punkte_d || to_jsonb(format('Entwicklungsfeld – Verhalten %s: %s. Fremdbild %s.', r.x->>'nr', r.x->>'titel', public.agenda_zahl((r.x->>'fremdbild')::numeric)));
  end loop;
  if jsonb_array_length(punkte_d) = 0 then
    punkte_d := punkte_d || to_jsonb('Alle Verhalten stehen schon im Fokus-Block oder haben noch kein Ergebnis. Gemeinsam sammeln, wo es im Alltag hakt.'::text);
  end if;

  punkte_v := jsonb_build_array(
    format('Was nehmen wir uns bis zum nächsten Meeting (%s) konkret vor?', v_naechst),
    'Wer kümmert sich um welchen Punkt, und bis wann?',
    'Welche Fokus-Verhalten bleiben bestehen, welche kommen neu dazu?');

  bloecke := jsonb_build_array(
    jsonb_build_object('id', 'einstieg',       'titel', 'Einstieg und Beteiligung', 'minuten', 2, 'punkte', punkte_e),
    jsonb_build_object('id', 'kennzahlen',     'titel', 'Team-Kennzahlen des Monats', 'minuten', 3, 'punkte', punkte_k),
    jsonb_build_object('id', 'fokus',          'titel', 'Fokus-Verhalten', 'minuten', 7, 'punkte', punkte_f),
    jsonb_build_object('id', 'entwicklung',    'titel', 'Entwicklungsfelder und Differenzen', 'minuten', 4, 'punkte', punkte_d),
    jsonb_build_object('id', 'vereinbarungen', 'titel', 'Vereinbarungen für den nächsten Monat', 'minuten', 2, 'punkte', punkte_v));

  if not (d->>'abgeschlossen')::boolean then
    v_hinweis := array_append(v_hinweis, 'Der Monat ist noch nicht abgeschlossen.'::text);
  end if;
  if (d->'analysen'->>'fertig')::integer < (d->'analysen'->>'gesamt')::integer then
    v_hinweis := array_append(v_hinweis, format('Stand unvollständig: %s von %s Einzelanalysen liegen vor.', d->'analysen'->>'fertig', d->'analysen'->>'gesamt'));
  end if;
  if (d->'beteiligung'->>'abgegeben')::integer < (d->'beteiligung'->>'erwartet')::integer then
    v_hinweis := array_append(v_hinweis, format('Stand unvollständig: %s von %s Abgaben.', d->'beteiligung'->>'abgegeben', d->'beteiligung'->>'erwartet'));
  end if;

  inhalt := jsonb_build_object(
    'monat', d->>'monat',
    'bloecke', bloecke,
    'summe_minuten', 18,
    'hinweis', case when cardinality(v_hinweis) = 0 then null else array_to_string(v_hinweis, ' ') end,
    'beispiele_enthalten', exists (select 1 from jsonb_array_elements(d->'fokus') x where jsonb_array_length(x->'beispiele') > 0),
    'fokus_nrs', to_jsonb(v_nrs));
  perform public.agenda_validieren(inhalt);

  v_text := format('# Agenda für das Teammeeting (%s, 18 Minuten)', v_monat) || E'\n';
  if inhalt->>'hinweis' is not null then
    v_text := v_text || E'\n> ' || (inhalt->>'hinweis') || E'\n';
  end if;
  for b in select x from jsonb_array_elements(bloecke) x loop
    v_text := v_text || E'\n' || format('## %s (%s Min.)', b->>'titel', b->>'minuten') || E'\n';
    for p in select e from jsonb_array_elements_text(b->'punkte') e loop
      v_text := v_text || '- ' || p || E'\n';
    end loop;
  end loop;

  return jsonb_build_object('inhalt', inhalt, 'text_md', btrim(v_text, E'\n'));
end;
$$;

revoke all on function public.agenda_bauen(uuid, date, date) from public, anon, authenticated;

-- Die Agenda als Zeile für die Oberfläche (analysen, Typ team_agenda)
create or replace function public.agenda_speichern_intern(p_salon uuid, p_monat date, p_datum date)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_a  jsonb;
  v_id uuid;
begin
  v_a := public.agenda_bauen(p_salon, p_monat, p_datum);
  insert into public.analysen (salon_id, monat, typ, person_id, inhalt, text_md, modell, prompt_version, input_hash, status, geprueft, fakten_hinweis)
  values (p_salon, p_monat, 'team_agenda', null, v_a->'inhalt', v_a->>'text_md', 'vorlage', 'agenda-vorlage-v1', md5((v_a->'inhalt')::text), 'entwurf', true, '[]'::jsonb)
  on conflict (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update
     set inhalt = excluded.inhalt, text_md = excluded.text_md, modell = excluded.modell, prompt_version = excluded.prompt_version,
         input_hash = excluded.input_hash, status = 'entwurf', geprueft = true, fakten_hinweis = '[]'::jsonb, erstellt_am = now(),
         bearbeitet_von = null, bearbeitet_von_name = null, bearbeitet_am = null,
         freigegeben_von = null, freigegeben_von_name = null, freigegeben_am = null
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.agenda_speichern_intern(uuid, date, date) from public, anon, authenticated;

-- agenda_erzeugen(): baut die Agenda für einen Bezugsmonat und speichert sie als Entwurf (ersetzt eine vorhandene).
create or replace function public.agenda_erzeugen(p_monat date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_monat date;
  v_id    uuid;
begin
  v_salon := public.analyse_zugriff();
  v_monat := coalesce(date_trunc('month', p_monat)::date, (select max(a.monat) from public.umfrage_abgaben a where a.salon_id = v_salon));
  if v_monat is null or not exists (select 1 from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat) then
    raise exception 'Für diesen Monat gibt es noch keine Abgabe' using errcode = '22023';
  end if;
  v_id := public.agenda_speichern_intern(v_salon, v_monat, (now() at time zone 'Europe/Berlin')::date);
  return public.analyse_zeile(v_id);
end;
$$;

revoke all on function public.agenda_erzeugen(date) from public, anon;
grant execute on function public.agenda_erzeugen(date) to authenticated;

create or replace function public.agenda_lesen(p_monat date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_id    uuid;
begin
  v_salon := public.analyse_zugriff();
  select a.id into v_id from public.analysen a
   where a.salon_id = v_salon and a.typ = 'team_agenda' and a.monat = date_trunc('month', p_monat)::date;
  return case when v_id is null then null else public.analyse_zeile(v_id) end;
end;
$$;

revoke all on function public.agenda_lesen(date) from public, anon;
grant execute on function public.agenda_lesen(date) to authenticated;

create or replace function public.agenda_bearbeiten(p_id uuid, p_text_md text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a       public.analysen;
  v_salon uuid;
  v_ich   public.personen;
begin
  v_salon := public.analyse_zugriff();
  select * into a from public.analysen where id = p_id and typ = 'team_agenda' and salon_id = v_salon;
  if a.id is null then
    raise exception 'Agenda nicht gefunden' using errcode = '42501';
  end if;
  if nullif(btrim(p_text_md), '') is null then
    raise exception 'Der Text darf nicht leer sein' using errcode = '22023';
  end if;
  select * into v_ich from public.personen where auth_user_id = (select auth.uid()) and aktiv;
  update public.analysen
     set text_md = p_text_md, bearbeitet_von = (select auth.uid()), bearbeitet_von_name = coalesce(v_ich.name, 'Unbekannt'), bearbeitet_am = now(),
         status = 'entwurf', freigegeben_von = null, freigegeben_von_name = null, freigegeben_am = null
   where id = p_id;
  return public.analyse_zeile(p_id);
end;
$$;

revoke all on function public.agenda_bearbeiten(uuid, text) from public, anon;
grant execute on function public.agenda_bearbeiten(uuid, text) to authenticated;

create or replace function public.agenda_freigeben(p_id uuid, p_freigabe boolean default true)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a       public.analysen;
  v_salon uuid;
  v_ich   public.personen;
begin
  v_salon := public.analyse_zugriff();
  select * into a from public.analysen where id = p_id and typ = 'team_agenda' and salon_id = v_salon;
  if a.id is null then
    raise exception 'Agenda nicht gefunden' using errcode = '42501';
  end if;
  select * into v_ich from public.personen where auth_user_id = (select auth.uid()) and aktiv;
  if coalesce(p_freigabe, true) then
    update public.analysen set status = 'freigegeben', freigegeben_von = (select auth.uid()), freigegeben_von_name = coalesce(v_ich.name, 'Unbekannt'), freigegeben_am = now() where id = p_id;
  else
    update public.analysen set status = 'entwurf', freigegeben_von = null, freigegeben_von_name = null, freigegeben_am = null where id = p_id;
  end if;
  return public.analyse_zeile(p_id);
end;
$$;

revoke all on function public.agenda_freigeben(uuid, boolean) from public, anon;
grant execute on function public.agenda_freigeben(uuid, boolean) to authenticated;


-- 5. Termine (nur Admin) ─────────────────────────────────────────────────────

create or replace function public.termin_admin_salon()
returns uuid
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
  if v_salon is null then
    raise exception 'Kein Salon' using errcode = '42501';
  end if;
  return v_salon;
end;
$$;

revoke all on function public.termin_admin_salon() from public, anon, authenticated;

-- Empfänger eines Termins: alle Verantwortlichen des Salons, auf Wunsch zusätzlich der Admin
create or replace function public.termin_empfaenger(p_termin uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.email order by p.email), '{}')
    from public.meeting_termine t
    join public.personen p on p.aktiv and nullif(btrim(p.email), '') is not null
                          and ((p.rolle = 'verantwortlicher' and p.salon_id = t.salon_id) or (t.cc_admin and p.rolle = 'admin'))
   where t.id = p_termin
$$;

revoke all on function public.termin_empfaenger(uuid) from public, anon, authenticated;

create or replace function public.termine_liste()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
begin
  v_salon := public.termin_admin_salon();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id,
             'startet_am', t.startet_am,
             'startet_lokal', to_char(t.startet_am at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI'),
             'titel', t.titel,
             'bezugsmonat', to_char(t.bezugsmonat, 'YYYY-MM'),
             'bezugsmonat_effektiv', to_char(coalesce(t.bezugsmonat, public.agenda_bezugsmonat(t.startet_am)), 'YYYY-MM'),
             'vorlauf_tage', to_jsonb(t.vorlauf_tage),
             'vorlauf_stunden', to_jsonb(t.vorlauf_stunden),
             'cc_admin', t.cc_admin,
             'aktiv', t.aktiv,
             'vergangen', t.startet_am <= now(),
             'empfaenger', to_jsonb(public.termin_empfaenger(t.id)),
             'mails', coalesce((select jsonb_agg(jsonb_build_object(
                         'art', m.art, 'status', m.status, 'gesendet_am', m.gesendet_am, 'versuche', m.versuche, 'fehler', m.fehler,
                         'endgueltig_fehlgeschlagen', m.status = 'fehler' and m.versuche >= 3) order by m.art desc)
                         from public.mail_log m where m.termin_id = t.id), '[]'::jsonb)) order by t.startet_am desc)
      from public.meeting_termine t
     where t.salon_id = v_salon and not t.entfernt), '[]'::jsonb);
end;
$$;

revoke all on function public.termine_liste() from public, anon;
grant execute on function public.termine_liste() to authenticated;

-- termin_speichern(): neu (p_id leer) oder ändern. p_startet_lokal ist die Berliner Uhrzeit (Sommer-/Winterzeit rechnet die Datenbank).
create or replace function public.termin_speichern(
  p_id uuid, p_startet_lokal timestamp, p_titel text default 'Teammeeting', p_bezugsmonat date default null,
  p_vorlauf_tage integer[] default '{2}', p_vorlauf_stunden numeric[] default '{1}', p_cc_admin boolean default false, p_aktiv boolean default true)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_id    uuid;
begin
  v_salon := public.termin_admin_salon();
  if p_startet_lokal is null then
    raise exception 'Der Zeitpunkt fehlt' using errcode = '22023';
  end if;
  if nullif(btrim(p_titel), '') is null then
    raise exception 'Der Titel fehlt' using errcode = '22023';
  end if;
  if p_vorlauf_tage is null or cardinality(p_vorlauf_tage) not between 1 and 5 or exists (select 1 from unnest(p_vorlauf_tage) x where x is null or x not between 0 and 30) then
    raise exception 'Der Vorlauf in Tagen muss zwischen 0 und 30 liegen' using errcode = '22023';
  end if;
  if p_vorlauf_stunden is null or cardinality(p_vorlauf_stunden) not between 1 and 5 or exists (select 1 from unnest(p_vorlauf_stunden) x where x is null or x < 0 or x > 72) then
    raise exception 'Der Vorlauf in Stunden muss zwischen 0 und 72 liegen' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.meeting_termine (salon_id, startet_am, titel, bezugsmonat, vorlauf_tage, vorlauf_stunden, cc_admin, aktiv)
    values (v_salon, p_startet_lokal at time zone 'Europe/Berlin', btrim(p_titel), date_trunc('month', p_bezugsmonat)::date, p_vorlauf_tage, p_vorlauf_stunden, coalesce(p_cc_admin, false), coalesce(p_aktiv, true))
    returning id into v_id;
  else
    update public.meeting_termine
       set startet_am = p_startet_lokal at time zone 'Europe/Berlin', titel = btrim(p_titel), bezugsmonat = date_trunc('month', p_bezugsmonat)::date,
           vorlauf_tage = p_vorlauf_tage, vorlauf_stunden = p_vorlauf_stunden, cc_admin = coalesce(p_cc_admin, false), aktiv = coalesce(p_aktiv, true)
     where id = p_id and salon_id = v_salon and not entfernt
     returning id into v_id;
    if v_id is null then
      raise exception 'Termin nicht gefunden' using errcode = '42501';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.termin_speichern(uuid, timestamp, text, date, integer[], numeric[], boolean, boolean) from public, anon;
grant execute on function public.termin_speichern(uuid, timestamp, text, date, integer[], numeric[], boolean, boolean) to authenticated;

-- termine_serie(): mehrere Termine auf einmal; die Uhrzeit bleibt in Berliner Zeit gleich (auch über die Zeitumstellung)
create or replace function public.termine_serie(
  p_start_lokal timestamp, p_titel text, p_rhythmus text, p_anzahl integer, p_cc_admin boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  i       integer;
  v_lokal timestamp;
begin
  v_salon := public.termin_admin_salon();
  if p_rhythmus not in ('woechentlich', 'zweiwoechentlich', 'monatlich') then
    raise exception 'Der Rhythmus muss woechentlich, zweiwoechentlich oder monatlich sein' using errcode = '22023';
  end if;
  if p_anzahl is null or p_anzahl not between 1 and 60 then
    raise exception 'Die Zahl der Termine muss zwischen 1 und 60 liegen' using errcode = '22023';
  end if;
  if p_start_lokal is null or nullif(btrim(p_titel), '') is null then
    raise exception 'Zeitpunkt und Titel fehlen' using errcode = '22023';
  end if;
  for i in 0..p_anzahl - 1 loop
    v_lokal := case p_rhythmus when 'woechentlich' then p_start_lokal + (i * interval '7 days')
                               when 'zweiwoechentlich' then p_start_lokal + (i * interval '14 days')
                               else p_start_lokal + (i * interval '1 month') end;
    insert into public.meeting_termine (salon_id, startet_am, titel, cc_admin)
    values (v_salon, v_lokal at time zone 'Europe/Berlin', btrim(p_titel), coalesce(p_cc_admin, false));
  end loop;
  return p_anzahl;
end;
$$;

revoke all on function public.termine_serie(timestamp, text, text, integer, boolean) from public, anon;
grant execute on function public.termine_serie(timestamp, text, text, integer, boolean) to authenticated;

-- termin_entfernen(): der Termin verschwindet aus der Liste und löst keine Mails mehr aus (das Protokoll bleibt)
create or replace function public.termin_entfernen(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_id    uuid;
begin
  v_salon := public.termin_admin_salon();
  update public.meeting_termine set entfernt = true, aktiv = false where id = p_id and salon_id = v_salon returning id into v_id;
  if v_id is null then
    raise exception 'Termin nicht gefunden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.termin_entfernen(uuid) from public, anon;
grant execute on function public.termin_entfernen(uuid) to authenticated;


-- 6. Versand-Job (nur service_role) ──────────────────────────────────────────

-- Welche Mails sind jetzt fällig? Antwort: [ { termin_id, art, salon, titel, startet_am, startet_lokal, bezugsmonat, empfaenger } ]
--  vorab: ab (Termin − größter Vorlauf in Tagen), gerechnet in Berliner Uhrzeit (Zeitumstellung bleibt die Uhrzeit gleich)
--  kurz:  ab (Termin − größter Vorlauf in Stunden), absolute Stunden
--  Nach Terminbeginn wird nichts mehr gesendet. Schon gesendete, laufende und dreimal gescheiterte Mails sind nicht fällig.
create or replace function public.versand_faellig(p_jetzt timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with jetzt as (select coalesce(p_jetzt, now()) as t),
  kandidaten as (
    select t.*, a.art,
           case a.art
             when 'vorab' then (((t.startet_am at time zone 'Europe/Berlin') - make_interval(days => (select max(x) from unnest(t.vorlauf_tage) x))) at time zone 'Europe/Berlin')
             else t.startet_am - make_interval(secs => ((select max(x) from unnest(t.vorlauf_stunden) x) * 3600)::double precision)
           end as ab
      from public.meeting_termine t
     cross join (values ('vorab'), ('kurz')) as a(art)
     where t.aktiv and not t.entfernt
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'termin_id', k.id, 'art', k.art, 'salon', (select s.name from public.salons s where s.id = k.salon_id),
           'titel', k.titel, 'startet_am', k.startet_am,
           'startet_lokal', to_char(k.startet_am at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI'),
           'bezugsmonat', to_char(coalesce(k.bezugsmonat, public.agenda_bezugsmonat(k.startet_am)), 'YYYY-MM'),
           'empfaenger', to_jsonb(public.termin_empfaenger(k.id))) order by k.startet_am, k.art desc), '[]'::jsonb)
    from kandidaten k, jetzt
   where jetzt.t >= k.ab and jetzt.t < k.startet_am
     and cardinality(public.termin_empfaenger(k.id)) > 0
     and not exists (
       select 1 from public.mail_log m
        where m.termin_id = k.id and m.art = k.art
          and (m.status = 'gesendet'
               or (m.status = 'in_arbeit' and m.aktualisiert_am > jetzt.t - interval '10 minutes')
               or (m.versuche >= 3 and m.status <> 'in_arbeit')
               or (m.status = 'in_arbeit' and m.versuche >= 3)))
$$;

revoke all on function public.versand_faellig(timestamptz) from public, anon, authenticated;
grant execute on function public.versand_faellig(timestamptz) to service_role;

-- Eine Mail für sich beanspruchen. Gibt { id, versuche } zurück, wenn dieser Lauf senden darf, sonst null.
--  Der Unique-Constraint (termin_id, art) entscheidet, auch wenn zwei Läufe gleichzeitig kommen. Wiederholt wird nur nach einem Fehler
--  (höchstens dreimal) oder wenn ein Lauf seit mehr als 10 Minuten „in Arbeit“ hängt.
create or replace function public.versand_beanspruchen(p_termin uuid, p_art text, p_jetzt timestamptz default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_jetzt timestamptz := coalesce(p_jetzt, now());
  v_empf  text[];
  v_id    uuid;
  v_vers  integer;
begin
  if p_art not in ('vorab', 'kurz') then
    raise exception 'Unbekannte Art der Mail' using errcode = '22023';
  end if;
  v_empf := public.termin_empfaenger(p_termin);
  if cardinality(v_empf) = 0 then
    return null;
  end if;

  insert into public.mail_log (termin_id, art, empfaenger, status, versuche, gesendet_am, aktualisiert_am)
  values (p_termin, p_art, v_empf, 'in_arbeit', 1, v_jetzt, v_jetzt)
  on conflict (termin_id, art) do nothing
  returning id, versuche into v_id, v_vers;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'versuche', v_vers);
  end if;

  update public.mail_log m
     set status = 'in_arbeit', versuche = m.versuche + 1, empfaenger = v_empf, aktualisiert_am = v_jetzt
   where m.termin_id = p_termin and m.art = p_art and m.versuche < 3
     and (m.status = 'fehler' or (m.status = 'in_arbeit' and m.aktualisiert_am < v_jetzt - interval '10 minutes'))
   returning m.id, m.versuche into v_id, v_vers;
  if v_id is null then
    return null;
  end if;
  return jsonb_build_object('id', v_id, 'versuche', v_vers);
end;
$$;

revoke all on function public.versand_beanspruchen(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.versand_beanspruchen(uuid, text, timestamptz) to service_role;

create or replace function public.versand_abschliessen(p_id uuid, p_erfolg boolean, p_fehler text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.mail_log
     set status = case when p_erfolg then 'gesendet' else 'fehler' end,
         fehler = case when p_erfolg then null else left(coalesce(p_fehler, 'Unbekannter Fehler'), 500) end,
         gesendet_am = case when p_erfolg then now() else gesendet_am end,
         aktualisiert_am = now()
   where id = p_id and status = 'in_arbeit';
end;
$$;

revoke all on function public.versand_abschliessen(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.versand_abschliessen(uuid, boolean, text) to service_role;

-- Die Agenda für eine Mail: die gespeicherte (Entwurf oder freigegeben), sonst wird sie aus den Daten erzeugt.
--  Antwort: { status, hinweis, bloecke: [ { id, titel, minuten, punkte } ] } – ohne Kommentar-Beispiele (Mails enthalten nur Teamebene)
--  Aufbau (die Kommentare stehen hier, damit der Funktionsrumpf in der Datenbank unverändert bleibt):
--    Kommentar-Beispiele und alles, was Namen enthalten könnte, bleibt draußen: nur Punkte ohne „Beispiele aus den Kommentaren“
create or replace function public.agenda_fuer_versand(p_termin uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t       public.meeting_termine;
  v_monat date;
  v_id    uuid;
  a       public.analysen;
begin
  select * into t from public.meeting_termine where id = p_termin;
  if t.id is null then
    return null;
  end if;
  v_monat := coalesce(t.bezugsmonat, public.agenda_bezugsmonat(t.startet_am));
  select * into a from public.analysen where salon_id = t.salon_id and typ = 'team_agenda' and monat = v_monat;
  if a.id is null then
    if not exists (select 1 from public.umfrage_abgaben x where x.salon_id = t.salon_id and x.monat = v_monat) then
      return jsonb_build_object('status', 'keine_daten', 'monat', to_char(v_monat, 'YYYY-MM'), 'hinweis', 'Für diesen Monat liegt noch keine Auswertung vor.', 'bloecke', '[]'::jsonb);
    end if;
    v_id := public.agenda_speichern_intern(t.salon_id, v_monat, (t.startet_am at time zone 'Europe/Berlin')::date);
    select * into a from public.analysen where id = v_id;
  end if;
  return jsonb_build_object(
    'status', a.status,
    'monat', to_char(v_monat, 'YYYY-MM'),
    'hinweis', a.inhalt->>'hinweis',
    'bloecke', (select coalesce(jsonb_agg(jsonb_build_object('id', b->>'id', 'titel', b->>'titel', 'minuten', b->'minuten', 'punkte',
                  (select coalesce(jsonb_agg(p), '[]'::jsonb) from jsonb_array_elements(b->'punkte') p where p #>> '{}' not like 'Beispiele aus den Kommentaren%'))), '[]'::jsonb)
                  from jsonb_array_elements(a.inhalt->'bloecke') b));
end;
$$;

revoke all on function public.agenda_fuer_versand(uuid) from public, anon, authenticated;
grant execute on function public.agenda_fuer_versand(uuid) to service_role;
