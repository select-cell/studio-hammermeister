-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 005 · Phase 2 · Funktionen der Monatsumfrage
-- ═══════════════════════════════════════════════════════════════════════════
--  Im Supabase SQL-Editor ausführen (nach 004). Kann gefahrlos mehrfach ausgeführt werden.
--
--    umfrage_inhalt()          Verhalten samt Stufen, Rituale, bewertbare Kolleg:innen
--    meine_offenen_monate()    Monate ohne Abgabe, jeweils mit Frist und Überfälligkeit
--    umfrage_einreichen_v2()   speichert eine Abgabe (alles oder nichts)
--    offene_monate_von()       interne Hilfe mit simulierbarem Datum (nicht aufrufbar)
--
--  Regeln (docs §5.3 und §6):
--    - Wer abgibt, kommt aus dem Login (auth.uid()), nie aus dem Payload.
--    - Der Monat muss offen sein: ab max(start_monat, aktiv_ab) bis zum laufenden Monat
--      (Berliner Zeit), ohne vorhandene Abgabe. Nachträgliche Abgabe bleibt möglich.
--    - Bewertet werden müssen genau alle aktiven Verhalten × alle aktiven Teilnehmer
--      (einschließlich der eigenen Person als Selbstbild).
--    - Note 1–5, ab Note 4 ist ein Kommentar Pflicht, Entwicklung nicht an sich selbst.
--    - Fragen- und Verhaltenstexte werden aus der Datenbank pro Abgabe mitgespeichert.
--
--  Die alte Funktion umfrage_einreichen() verliert ihre Rechte für anon UND authenticated:
--  Sie nimmt Namen aus dem Payload und würde die Regeln oben umgehen. Die alte HTML-Umfrage
--  ist nicht mit diesem Projekt verbunden und wird abgeschaltet.
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Offene Monate (intern) ──────────────────────────────────────────────────

create or replace function public.offene_monate_von(p_person uuid, p_heute date default null)
returns table (monat date, frist date, ueberfaellig boolean, tage_ueberfaellig integer)
language sql
stable
security definer
set search_path = public
as $$
  with heute as (
    select coalesce(p_heute, (now() at time zone 'Europe/Berlin')::date) as d
  ),
  ab_monat as (
    select greatest(s.start_monat, coalesce(p.aktiv_ab, s.start_monat)) as ab
      from public.personen p
      join public.salons s on s.id = p.salon_id
     where p.id = p_person and p.aktiv and p.nimmt_an_teamumfrage
  ),
  monate as (
    select g::date as m
      from ab_monat, heute,
           generate_series(ab_monat.ab::timestamp, date_trunc('month', heute.d)::timestamp, interval '1 month') as g
  )
  select monate.m,
         ((monate.m + interval '1 month') - interval '1 day')::date,
         heute.d > ((monate.m + interval '1 month') - interval '1 day')::date,
         greatest(heute.d - ((monate.m + interval '1 month') - interval '1 day')::date, 0)
    from monate
   cross join heute
   where not exists (
           select 1 from public.umfrage_abgaben a
            where a.feedbackgeber_id = p_person and a.monat = monate.m)
   order by monate.m
$$;

comment on function public.offene_monate_von(uuid, date) is
  'Offene Monate einer Person mit Frist und Überfälligkeit. Intern; p_heute simuliert das Datum für Tests.';

revoke all on function public.offene_monate_von(uuid, date) from public, anon, authenticated;


-- 2. meine_offenen_monate() ──────────────────────────────────────────────────

create or replace function public.meine_offenen_monate()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select p.id into v_id
    from public.personen p
   where p.auth_user_id = (select auth.uid()) and p.aktiv and p.nimmt_an_teamumfrage;
  if v_id is null then
    raise exception 'Kein Zugang zur Teamumfrage' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'monat',             to_char(o.monat, 'YYYY-MM'),
             'frist',             o.frist,
             'ueberfaellig',      o.ueberfaellig,
             'tage_ueberfaellig', o.tage_ueberfaellig) order by o.monat)
      from public.offene_monate_von(v_id) o
  ), '[]'::jsonb);
end;
$$;

comment on function public.meine_offenen_monate() is
  'Offene Monate der eingeloggten Person (Monat YYYY-MM, Frist, überfällig). Nur für Teilnehmer der Teamumfrage.';

revoke all on function public.meine_offenen_monate() from public, anon;
grant execute on function public.meine_offenen_monate() to authenticated;


-- 3. umfrage_inhalt() ────────────────────────────────────────────────────────

create or replace function public.umfrage_inhalt()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p public.personen;
begin
  select * into v_p
    from public.personen
   where auth_user_id = (select auth.uid()) and aktiv;
  if v_p.id is null then
    raise exception 'Kein Zugang' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'verhalten', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           v.id,
               'nr',           v.nr,
               'grundpfeiler', v.grundpfeiler,
               'saeule',       v.saeule,
               'titel',        v.titel,
               'video_url',    v.video_url,
               'kriterien',    coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'stufe',       k.stufe,
                           'bezeichnung', k.bezeichnung,
                           'prozent',     k.prozent,
                           'leitsatz',    k.leitsatz,
                           'punkte',      to_jsonb(k.punkte)) order by k.stufe)
                    from public.verhalten_kriterien k
                   where k.verhalten_id = v.id), '[]'::jsonb)) order by v.nr)
        from public.verhalten v
       where v.salon_id = v_p.salon_id and v.aktiv), '[]'::jsonb),

    'rituale', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',         r.id,
               'nr',         r.nr,
               'titel',      r.titel,
               'untertitel', r.untertitel,
               'einleitung', to_jsonb(r.einleitung),
               'video_url',  r.video_url,
               'fragen',     coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'nr',       f.nr,
                           'typ',      f.typ,
                           'frage',    f.frage,
                           'hinweis',  f.hinweis,
                           'optionen', to_jsonb(f.optionen),
                           'labels',   to_jsonb(f.labels),
                           'pflicht',  f.pflicht) order by f.nr)
                    from public.ritual_fragen f
                   where f.ritual_id = r.id), '[]'::jsonb)) order by r.nr)
        from public.rituale r
       where r.salon_id = v_p.salon_id and r.aktiv), '[]'::jsonb),

    'kollegen', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name) order by q.name)
        from public.personen q
       where q.salon_id = v_p.salon_id and q.aktiv and q.nimmt_an_teamumfrage and q.id <> v_p.id), '[]'::jsonb)
  );
end;
$$;

comment on function public.umfrage_inhalt() is
  'Inhalt der Umfrage für die eingeloggte Person: aktive Verhalten mit Stufen, Rituale mit Fragen, bewertbare Kolleg:innen.';

revoke all on function public.umfrage_inhalt() from public, anon;
grant execute on function public.umfrage_inhalt() to authenticated;


-- 4. umfrage_einreichen_v2() ─────────────────────────────────────────────────
--  Erwarteter Payload:
--    { "version": "…", "monat": "2026-10", "gestartet_am": "<ISO>", "zeitpunkt": "<ISO>",
--      "entwicklung": { "person_id": "<uuid>", "begruendung": "…" },
--      "rituale":     [ { "ritual_id": "<uuid>", "frage_nr": 1, "antwort": 3 | "Text" | null } ],
--      "bewertungen": [ { "verhalten_nr": 1, "bewertete_person_id": "<uuid>", "note": 1-5, "kommentar": "…" } ] }

create or replace function public.umfrage_einreichen_v2(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p          public.personen;
  v_salon      public.salons;
  v_nominee    public.personen;
  v_monat_text text := nullif(btrim(payload->>'monat'), '');
  v_monat      date;
  v_begr       text;
  v_zeit       timestamptz;
  v_start      timestamptz;
  v_dauer      integer;
  v_id         uuid;
  v_soll       integer;
  v_ist        integer;
  v_doppelt    integer;
  v_fehlt      integer;
  v_fremd      integer;
  v_ungueltig  integer;
  v_ohne_komm  integer;
  v_constraint text;
  r            record;
  v_antwort    jsonb;
  v_text       text;
  v_zahl       smallint;
begin
  -- Wer gibt ab? Immer die eingeloggte Person, nie jemand aus dem Payload.
  select * into v_p
    from public.personen
   where auth_user_id = (select auth.uid()) and aktiv and nimmt_an_teamumfrage;
  if v_p.id is null then
    raise exception 'Kein Zugang zur Teamumfrage' using errcode = '42501';
  end if;
  select * into v_salon from public.salons where id = v_p.salon_id;

  -- Monat: gültig, nicht schon abgegeben, offen (keine Zukunft, nicht vor dem Start)
  if v_monat_text is null or v_monat_text !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Der Monat fehlt oder ist ungültig' using errcode = '22023';
  end if;
  v_monat := (v_monat_text || '-01')::date;
  if exists (select 1 from public.umfrage_abgaben a where a.feedbackgeber_id = v_p.id and a.monat = v_monat) then
    raise exception 'Für % wurde die Umfrage für diesen Monat bereits abgegeben.', v_p.name using errcode = '23505';
  end if;
  if not exists (select 1 from public.offene_monate_von(v_p.id) o where o.monat = v_monat) then
    raise exception 'Für diesen Monat kann keine Umfrage abgegeben werden.' using errcode = '22023';
  end if;

  -- Entwicklung des Monats: ein Teammitglied (nicht man selbst) mit Begründung
  select * into v_nominee
    from public.personen q
   where q.id = nullif(payload->'entwicklung'->>'person_id', '')::uuid
     and q.salon_id = v_p.salon_id and q.aktiv and q.nimmt_an_teamumfrage and q.id <> v_p.id;
  if v_nominee.id is null then
    raise exception 'Entwicklung des Monats: Bitte eine Kollegin oder einen Kollegen auswählen' using errcode = '22023';
  end if;
  v_begr := nullif(btrim(payload->'entwicklung'->>'begruendung'), '');
  if v_begr is null then
    raise exception 'Entwicklung des Monats: Bitte eine Begründung angeben' using errcode = '22023';
  end if;

  -- Bewertungen: genau alle aktiven Verhalten × alle aktiven Teilnehmer (inkl. man selbst)
  if jsonb_typeof(payload->'bewertungen') is distinct from 'array' then
    raise exception 'Keine Bewertungen enthalten' using errcode = '22023';
  end if;

  with eing as (
    select (b->>'verhalten_nr')::smallint       as nr,
           (b->>'bewertete_person_id')::uuid    as pid,
           (b->>'note')::smallint               as note,
           nullif(btrim(b->>'kommentar'), '')   as kommentar
      from jsonb_array_elements(payload->'bewertungen') as b
  ),
  soll as (
    select vh.nr, q.id as pid
      from public.verhalten vh
     cross join public.personen q
     where vh.salon_id = v_p.salon_id and vh.aktiv
       and q.salon_id = v_p.salon_id and q.aktiv and q.nimmt_an_teamumfrage
  )
  select (select count(*) from soll),
         (select count(*) from eing),
         (select count(*) from (select 1 from eing group by nr, pid having count(*) > 1) d),
         (select count(*) from soll s where not exists (select 1 from eing e where e.nr = s.nr and e.pid = s.pid)),
         (select count(*) from eing e where not exists (select 1 from soll s where s.nr = e.nr and s.pid = e.pid)),
         (select count(*) from eing where note is null or note not between 1 and 5),
         (select count(*) from eing where note >= 4 and kommentar is null)
    into v_soll, v_ist, v_doppelt, v_fehlt, v_fremd, v_ungueltig, v_ohne_komm;

  if v_soll = 0 then
    raise exception 'Die Umfrage ist noch nicht eingerichtet' using errcode = '22023';
  end if;
  if v_ist <> v_soll or v_doppelt > 0 or v_fehlt > 0 or v_fremd > 0 then
    raise exception 'Die Bewertungen sind unvollständig oder passen nicht zum aktuellen Team' using errcode = '22023';
  end if;
  if v_ungueltig > 0 then
    raise exception 'Jede Note muss zwischen 1 und 5 liegen' using errcode = '22023';
  end if;
  if v_ohne_komm > 0 then
    raise exception 'Ab Note 4 ist ein Kommentar Pflicht' using errcode = '22023';
  end if;

  -- Ausfülldauer: Start und Absenden stammen beide vom Gerät → Differenz ist verlässlich
  begin
    v_zeit := nullif(payload->>'zeitpunkt', '')::timestamptz;
  exception when others then
    v_zeit := null;
  end;
  begin
    v_start := nullif(payload->>'gestartet_am', '')::timestamptz;
  exception when others then
    v_start := null;
  end;
  if v_start is not null and v_zeit is not null then
    v_dauer := extract(epoch from (v_zeit - v_start))::integer;
    if v_dauer not between 60 and 86400 then v_dauer := null; end if;
  end if;

  -- Kopf
  insert into public.umfrage_abgaben
    (salon, monat, feedbackgeber, entwicklung_person, entwicklung_begruendung,
     zeitpunkt_client, gestartet_am, ausfuelldauer_sek, umfrage_version, rohdaten,
     salon_id, feedbackgeber_id)
  values
    (v_salon.name, v_monat, v_p.name, v_nominee.name, v_begr,
     coalesce(v_zeit, now()), v_start, v_dauer, payload->>'version', payload,
     v_p.salon_id, v_p.id)
  returning id into v_id;

  -- Rituale: Fragen aus der Datenbank, Antworten aus dem Payload
  for r in
    select ri.id as ritual_id, ri.titel, rf.nr, rf.typ, rf.frage, rf.optionen, rf.pflicht
      from public.rituale ri
      join public.ritual_fragen rf on rf.ritual_id = ri.id
     where ri.salon_id = v_p.salon_id and ri.aktiv
     order by ri.nr, rf.nr
  loop
    v_antwort := null; v_text := null; v_zahl := null;
    select a->'antwort' into v_antwort
      from jsonb_array_elements(case when jsonb_typeof(payload->'rituale') = 'array' then payload->'rituale' else '[]'::jsonb end) as a
     where a->>'ritual_id' = r.ritual_id::text and (a->>'frage_nr')::smallint = r.nr
     limit 1;
    if v_antwort is not null and jsonb_typeof(v_antwort) <> 'null' then
      v_text := nullif(btrim(v_antwort #>> '{}'), '');
    end if;

    if v_text is null and r.pflicht then
      raise exception 'Ritual „%“: Bitte die Frage „%“ beantworten', r.titel, r.frage using errcode = '22023';
    end if;
    if v_text is not null and r.typ = 'skala' then
      if v_text !~ '^[1-5]$' then
        raise exception 'Ritual „%“: Die Antwort muss zwischen 1 und 5 liegen', r.titel using errcode = '22023';
      end if;
      v_zahl := v_text::smallint;
      v_text := null;
    elsif v_text is not null and r.typ = 'auswahl' and not (v_text = any (coalesce(r.optionen, '{}'))) then
      raise exception 'Ritual „%“: Ungültige Auswahl', r.titel using errcode = '22023';
    end if;

    insert into public.umfrage_rituale (abgabe_id, ritual, frage_nr, frage, typ, antwort_zahl, antwort_text)
    values (v_id, r.titel, r.nr, r.frage, r.typ,
            case when r.typ = 'skala' then v_zahl end,
            case when r.typ <> 'skala' then v_text end);
  end loop;

  -- Bewertungen (Selbstbild + Fremdbild), Texte als Momentaufnahme aus der Datenbank
  insert into public.umfrage_bewertungen
    (abgabe_id, salon, monat, bewertende_person, verhalten_nr, grundpfeiler, saeule, verhalten,
     art, bewertete_person, note, kommentar, bewertende_person_id, bewertete_person_id)
  select v_id, v_salon.name, v_monat, v_p.name, vh.nr, vh.grundpfeiler, vh.saeule, vh.titel,
         case when e.pid = v_p.id then 'selbstbild' else 'fremdbild' end,
         q.name, e.note, e.kommentar, v_p.id, e.pid
    from (
      select (b->>'verhalten_nr')::smallint     as nr,
             (b->>'bewertete_person_id')::uuid  as pid,
             (b->>'note')::smallint             as note,
             nullif(btrim(b->>'kommentar'), '') as kommentar
        from jsonb_array_elements(payload->'bewertungen') as b
    ) e
    join public.verhalten vh on vh.salon_id = v_p.salon_id and vh.nr = e.nr
    join public.personen  q  on q.id = e.pid;

  return v_id;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint in ('abgaben_einmal_pro_monat', 'abgaben_einmal_pro_monat_person') then
      raise exception 'Für % wurde die Umfrage für diesen Monat bereits abgegeben.', v_p.name using errcode = '23505';
    end if;
    raise;
end;
$$;

comment on function public.umfrage_einreichen_v2(jsonb) is
  'Speichert eine Abgabe der eingeloggten Person (Kopf, Rituale, Bewertungen) in einer Transaktion. Prüft Monat, Vollständigkeit und Kommentarpflicht.';

revoke all on function public.umfrage_einreichen_v2(jsonb) from public, anon;
grant execute on function public.umfrage_einreichen_v2(jsonb) to authenticated;


-- 5. Alte Einreich-Funktion sperren ──────────────────────────────────────────

revoke execute on function public.umfrage_einreichen(jsonb) from anon, authenticated;
