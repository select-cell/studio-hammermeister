-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 008 · Phase 4: Abgabe-Status und Reminder
-- ═══════════════════════════════════════════════════════════════════════════
--  Neu (docs §5.3 und §6):
--    abgabe_status(monat, heute)     wer hat für einen Monat abgegeben (Leitung)
--    ueberfaellige_abgaben(heute)    Reminder-Liste (Leitung)
--    ueberfaellige_von_salon()       interne Hilfe (nicht aufrufbar)
--
--  Regeln:
--    - Nur Verantwortliche und Admin (Rolle aus auth.uid()). Der Admin wertet den ersten
--      Salon dieser Instanz aus, wie in den Auswertungen (006).
--    - Die Frist für Monat M ist der letzte Tag von M. Überfällig sind die Tage danach:
--      tage_ueberfaellig = heute − Fristende (am 5.11. fehlt Oktober seit 5 Tagen).
--    - Erinnert wird, sobald tage_ueberfaellig > salons.reminder_tage_nach_frist
--      (Standard 3). Die 3 Tage sind Karenztage: Frist 31.10. → Reminder ab dem 4.11.
--      (das Beispiel in §6). Der Wert steht in salons, nicht im Code.
--    - Gezählt werden aktive Teilnehmer der Teamumfrage, ab max(start_monat, aktiv_ab).
--      Auch Michael steht als Teilnehmer in der Liste.
--    - Berechnet wird live beim Abruf, ein täglicher Job ist nicht nötig.
--    - Der Parameter p_heute simuliert das Datum zum Testen (docs §8, Phase 4). Er ist
--      nur der Leitung zugänglich und liest nur; es wird nichts verändert. Er darf höchstens
--      10 Jahre von heute abweichen (sonst würden bei „9999-12-31“ zehntausende Monate gerechnet).
--
--  Idempotent, ohne DROP (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Überfällige Abgaben eines Salons (intern) ───────────────────────────────

create or replace function public.ueberfaellige_von_salon(p_salon uuid, p_heute date default null)
returns table (person_id uuid, name text, monat date, frist date, tage_ueberfaellig integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, o.monat, o.frist, o.tage_ueberfaellig
    from public.salons s
    join public.personen p on p.salon_id = s.id and p.aktiv and p.nimmt_an_teamumfrage
   cross join lateral public.offene_monate_von(p.id, p_heute) o
   where s.id = p_salon
     and o.tage_ueberfaellig > s.reminder_tage_nach_frist
   order by o.tage_ueberfaellig desc, p.name, o.monat
$$;

comment on function public.ueberfaellige_von_salon(uuid, date) is
  'Fehlende Abgaben eines Salons, die länger als reminder_tage_nach_frist über der Frist sind. Intern; p_heute simuliert das Datum.';

revoke all on function public.ueberfaellige_von_salon(uuid, date) from public, anon, authenticated;


-- 2. ueberfaellige_abgaben() ─────────────────────────────────────────────────

create or replace function public.ueberfaellige_abgaben(p_heute date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_ich   uuid;
  v_heute date := coalesce(p_heute, (now() at time zone 'Europe/Berlin')::date);
  v_tage  smallint;
begin
  if not public.ist_leitung() then
    raise exception 'Nur für Verantwortliche und Admin' using errcode = '42501';
  end if;
  if p_heute is not null and abs(p_heute - (now() at time zone 'Europe/Berlin')::date) > 3660 then
    raise exception 'Das Testdatum muss innerhalb von 10 Jahren um heute liegen' using errcode = '22023';
  end if;
  v_salon := public.auswertung_salon_id();
  if v_salon is null then
    raise exception 'Kein Salon' using errcode = '42501';
  end if;

  select p.id into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  select s.reminder_tage_nach_frist into v_tage from public.salons s where s.id = v_salon;

  return jsonb_build_object(
    'heute',             v_heute,
    'erinnerung_ab_tag', v_tage + 1,
    'eintraege', coalesce((
      select jsonb_agg(jsonb_build_object(
               'person_id',         u.person_id,
               'name',              u.name,
               'ist_ich',           u.person_id = v_ich,
               'monat',             to_char(u.monat, 'YYYY-MM'),
               'frist',             u.frist,
               'tage_ueberfaellig', u.tage_ueberfaellig)
             order by u.tage_ueberfaellig desc, u.name, u.monat)
        from public.ueberfaellige_von_salon(v_salon, v_heute) u), '[]'::jsonb));
end;
$$;

comment on function public.ueberfaellige_abgaben(date) is
  'Reminder-Liste für Verantwortliche und Admin: je Teilnehmer und offenem Monat Name, Monat, Tage überfällig. p_heute simuliert das Datum.';

revoke all on function public.ueberfaellige_abgaben(date) from public, anon;
grant execute on function public.ueberfaellige_abgaben(date) to authenticated;


-- 3. abgabe_status() ─────────────────────────────────────────────────────────

create or replace function public.abgabe_status(p_monat date default null, p_heute date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon   uuid;
  v_heute   date := coalesce(p_heute, (now() at time zone 'Europe/Berlin')::date);
  v_aktuell date := date_trunc('month', coalesce(p_heute, (now() at time zone 'Europe/Berlin')::date))::date; -- 1. des laufenden Monats
  v_start   date;
  v_tage    smallint;
  v_monat   date;
  v_frist   date;
begin
  if not public.ist_leitung() then
    raise exception 'Nur für Verantwortliche und Admin' using errcode = '42501';
  end if;
  if p_heute is not null and abs(p_heute - (now() at time zone 'Europe/Berlin')::date) > 3660 then
    raise exception 'Das Testdatum muss innerhalb von 10 Jahren um heute liegen' using errcode = '22023';
  end if;
  v_salon := public.auswertung_salon_id();
  if v_salon is null then
    raise exception 'Kein Salon' using errcode = '42501';
  end if;

  select date_trunc('month', s.start_monat)::date, s.reminder_tage_nach_frist
    into v_start, v_tage
    from public.salons s where s.id = v_salon;

  -- Vor dem Start gibt es noch nichts abzugeben
  if v_aktuell < v_start then
    return jsonb_build_object(
      'monat', null, 'frist', null, 'heute', v_heute, 'start_monat', to_char(v_start, 'YYYY-MM'),
      'monate', '[]'::jsonb, 'erwartet', 0, 'abgegeben', 0, 'offen', 0, 'ueberfaellig', 0,
      'erinnerung_ab_tag', v_tage + 1, 'personen', '[]'::jsonb);
  end if;

  v_monat := coalesce(date_trunc('month', p_monat)::date, v_aktuell);
  if v_monat < v_start or v_monat > v_aktuell then
    raise exception 'Für diesen Monat gibt es keinen Abgabe-Status' using errcode = '22023';
  end if;
  v_frist := ((v_monat + interval '1 month') - interval '1 day')::date;

  return (
    with pers as (
      select p.id, p.name, p.rolle,
             greatest(v_start, coalesce(p.aktiv_ab, v_start)) as ab
        from public.personen p
       where p.salon_id = v_salon and p.aktiv and p.nimmt_an_teamumfrage
    ),
    zeile as (
      select pers.id, pers.name, pers.rolle,
             (v_monat >= pers.ab)                                      as erwartet,
             (a.id is not null)                                        as abgegeben,
             a.abgeschickt_am,
             coalesce((a.abgeschickt_am at time zone 'Europe/Berlin')::date > v_frist, false) as verspaetet,
             case when a.id is null and v_monat >= pers.ab then greatest(v_heute - v_frist, 0) else 0 end as tage
        from pers
        left join public.umfrage_abgaben a
               on a.salon_id = v_salon and a.feedbackgeber_id = pers.id and a.monat = v_monat
    )
    select jsonb_build_object(
      'monat',             to_char(v_monat, 'YYYY-MM'),
      'frist',             v_frist,
      'heute',             v_heute,
      'start_monat',       to_char(v_start, 'YYYY-MM'),
      'monate',            (select jsonb_agg(to_char(g, 'YYYY-MM') order by g)
                              from generate_series(v_start::timestamp, v_aktuell::timestamp, interval '1 month') g),
      'erwartet',          count(*) filter (where erwartet),
      'abgegeben',         count(*) filter (where abgegeben),
      'offen',             count(*) filter (where erwartet and not abgegeben),
      'ueberfaellig',      count(*) filter (where erwartet and not abgegeben and tage > v_tage),
      'erinnerung_ab_tag', v_tage + 1,
      'personen',          coalesce(jsonb_agg(jsonb_build_object(
                             'id',                z.id,
                             'name',              z.name,
                             'rolle',             z.rolle,
                             'erwartet',          z.erwartet,
                             'abgegeben',         z.abgegeben,
                             'zeitpunkt',         z.abgeschickt_am,
                             'verspaetet',        z.verspaetet,
                             'tage_ueberfaellig', z.tage,
                             'ueberfaellig',      (z.erwartet and not z.abgegeben and z.tage > v_tage))
                           order by z.name), '[]'::jsonb))
      from zeile z
  );
end;
$$;

comment on function public.abgabe_status(date, date) is
  'Abgabe-Status eines Monats (Standard: laufender Monat) für Verantwortliche und Admin: je Teilnehmer abgegeben ja/nein, Zeitpunkt, verspätet, überfällig. p_heute simuliert das Datum.';

revoke all on function public.abgabe_status(date, date) from public, anon;
grant execute on function public.abgabe_status(date, date) to authenticated;
