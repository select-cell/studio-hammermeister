-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 006 · Phase 3 · Auswertungen
-- ═══════════════════════════════════════════════════════════════════════════
--  Im Supabase SQL-Editor ausführen (nach 005). Kann gefahrlos mehrfach ausgeführt werden.
--
--  Alle Zahlen werden hier berechnet (docs §5.5), das Frontend zeigt sie nur an:
--    Selbstbild   = eigene Note je Verhalten und Monat
--    Fremdbild    = Durchschnitt der Noten der Kolleg:innen je Verhalten und Monat
--    Abweichung   = Selbstbild − Fremdbild
--    Verdichtung  = je Säule und gesamt der Durchschnitt der Verhalten
--    Team-Schnitt = Durchschnitt über alle Teilnehmer (jede Person zählt gleich viel)
--    Alle Werte auf 2 Nachkommastellen, wie in den Ansichten v_selbst_vs_fremdbild und v_person_saeule.
--
--  Funktionen (alle security definer, Rolle über auth.uid()):
--    meine_ergebnisse(von, bis)          Teilnehmer: eigene Auswertung
--    team_ergebnisse(von, bis)           alle Eingeloggten: nur Team-Schnitte, keine Einzelpersonen
--    person_ergebnisse(person, von, bis) Verantwortlicher, Admin: Auswertung einer Person mit Absendern
--    team_dashboard(monat)               Verantwortlicher, Admin: alle Personen, Rangliste, Matrix
--
--  Wer die Absender einer Bewertung sieht, ist an EINER Stelle geregelt (absender_sichtbar_fuer):
--    - Teammitglieder: nie, auch nicht bei Bewertungen über sich selbst
--    - Verantwortlicher und Admin: bei allen anderen Personen immer
--    - Verantwortlicher bei Bewertungen über sich selbst: nur wenn der Salon-Schalter
--      verantwortlicher_sieht_eigene_absender eingeschaltet ist (Standard: aus). Die Rolle
--      entscheidet: Wird Michael zum Mitarbeiter, sieht er sie auch dann nicht.
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Einstellung im Salon ────────────────────────────────────────────────────

alter table public.salons
  add column if not exists verantwortlicher_sieht_eigene_absender boolean not null default false;

comment on column public.salons.verantwortlicher_sieht_eigene_absender is
  'Ob ein Verantwortlicher bei Bewertungen über sich selbst die Absender sieht. Standard: aus. Wirkt nur für die Rolle verantwortlicher.';


-- 2. Hilfen (intern, nicht aufrufbar) ────────────────────────────────────────

-- Der Salon, über den ausgewertet wird: der eigene; der Admin (ohne Salon) bekommt den ersten Salon dieser Instanz.
create or replace function public.auswertung_salon_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select salon_id from public.personen where auth_user_id = (select auth.uid()) and aktiv),
    (select s.id from public.salons s where public.ist_admin() order by s.erstellt_am limit 1))
$$;

-- Sieht die Person `p_betrachter` bei den Bewertungen über `p_ziel` die Absender?
create or replace function public.absender_sichtbar_fuer(p_betrachter uuid, p_ziel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when b.id is null or not b.aktiv then false
    when b.rolle = 'admin' then true
    when b.rolle = 'verantwortlicher' and b.id <> p_ziel then true
    when b.rolle = 'verantwortlicher' and b.id = p_ziel then coalesce(s.verantwortlicher_sieht_eigene_absender, false)
    else false
  end
  from (select 1) x
  left join public.personen b on b.id = p_betrachter
  left join public.salons   s on s.id = b.salon_id
$$;

revoke all on function public.auswertung_salon_id()                from public, anon, authenticated;
revoke all on function public.absender_sichtbar_fuer(uuid, uuid)   from public, anon, authenticated;


-- 3. Auswertung einer Person (intern) ────────────────────────────────────────

create or replace function public.auswertung_person(
  p_person uuid, p_von date default null, p_bis date default null, p_mit_absender boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
bew as (   -- alle Bewertungen ÜBER die Person (Selbstbild und Fremdbilder)
  select b.*
    from public.umfrage_bewertungen b
   where b.bewertete_person_id = p_person
     and (p_von is null or b.monat >= p_von) and (p_bis is null or b.monat <= p_bis)
),
vh as (    -- je Monat und Verhalten
  select monat, verhalten_nr as nr,
         max(grundpfeiler) as grundpfeiler, max(saeule) as saeule, max(verhalten) as titel,
         (max(note) filter (where art = 'selbstbild'))::numeric as sb,
         avg(note)       filter (where art = 'fremdbild')        as fb,
         count(*)        filter (where art = 'fremdbild')        as n_fb,
         max(kommentar)  filter (where art = 'selbstbild')       as sb_kommentar
    from bew
   group by monat, verhalten_nr
),
kom as (   -- Kommentare und Fremdbilder je Monat und Verhalten, getrennt nach „mit“ und „ohne“ Absender
  select monat, verhalten_nr as nr,
         jsonb_agg(jsonb_build_object('note', note, 'text', kommentar) order by md5(kommentar))
           filter (where kommentar is not null) as ohne,
         jsonb_agg(jsonb_build_object('von', bewertende_person, 'note', note, 'text', kommentar) order by bewertende_person)
           filter (where kommentar is not null) as mit,
         jsonb_agg(jsonb_build_object('von', bewertende_person, 'note', note) order by bewertende_person) as alle
    from bew
   where art = 'fremdbild'
   group by monat, verhalten_nr
),
ges as (   -- je Monat: Durchschnitt der Verhalten
  select monat, avg(sb) as sb, avg(fb) as fb, max(n_fb) as n_fb from vh group by monat
),
saeulen as (   -- je Monat und Säule: Durchschnitt der Verhalten
  select monat, grundpfeiler, saeule, avg(sb) as sb, avg(fb) as fb, count(*) as n
    from vh group by monat, grundpfeiler, saeule
),
abg as (   -- eigene Abgaben der Person (Ausfülldauer)
  select a.id, a.monat, round(a.ausfuelldauer_sek / 60.0, 1) as dauer_min
    from public.umfrage_abgaben a
   where a.feedbackgeber_id = p_person
     and (p_von is null or a.monat >= p_von) and (p_bis is null or a.monat <= p_bis)
),
rit as (   -- eigene Ritual-Antworten der Person
  select abg.monat, r.ritual, r.frage_nr, r.frage, r.typ, r.antwort_zahl, r.antwort_text
    from public.umfrage_rituale r join abg on abg.id = r.abgabe_id
),
mon as (
  select monat from vh union select monat from abg
)
select jsonb_build_object(
  'person',            (select jsonb_build_object('id', p.id, 'name', p.name) from public.personen p where p.id = p_person),
  'absender_sichtbar', p_mit_absender,
  'monate',            coalesce((select jsonb_agg(to_char(monat, 'YYYY-MM') order by monat) from mon), '[]'::jsonb),
  'verlauf',           coalesce((
      select jsonb_agg(jsonb_build_object(
               'monat',     to_char(m.monat, 'YYYY-MM'),
               'sb',        round(g.sb, 2),
               'fb',        round(g.fb, 2),
               'diff',      round(g.sb - g.fb, 2),
               'rituale',   (select round(avg(r.antwort_zahl), 2) from rit r where r.monat = m.monat and r.typ = 'skala'),
               'dauer_min', (select a.dauer_min from abg a where a.monat = m.monat)) order by m.monat)
        from mon m left join ges g on g.monat = m.monat), '[]'::jsonb),
  'detail',            coalesce((
      select jsonb_object_agg(to_char(m.monat, 'YYYY-MM'), jsonb_build_object(
        'gesamt',    (select jsonb_build_object('sb', round(g.sb, 2), 'fb', round(g.fb, 2), 'diff', round(g.sb - g.fb, 2), 'anzahl_fremdbilder', g.n_fb)
                        from ges g where g.monat = m.monat),
        'dauer_min', (select a.dauer_min from abg a where a.monat = m.monat),
        'saeulen',   coalesce((select jsonb_agg(jsonb_build_object(
                                 'grundpfeiler', s.grundpfeiler, 'saeule', s.saeule,
                                 'sb', round(s.sb, 2), 'fb', round(s.fb, 2), 'diff', round(s.sb - s.fb, 2),
                                 'anzahl_verhalten', s.n) order by s.grundpfeiler nulls first, s.saeule nulls first)
                          from saeulen s where s.monat = m.monat), '[]'::jsonb),
        'verhalten', coalesce((select jsonb_agg(jsonb_build_object(
                                 'nr', v.nr, 'titel', v.titel, 'grundpfeiler', v.grundpfeiler, 'saeule', v.saeule,
                                 'sb', round(v.sb, 2), 'fb', round(v.fb, 2), 'diff', round(v.sb - v.fb, 2),
                                 'anzahl_fremdbilder', v.n_fb,
                                 'sb_kommentar', v.sb_kommentar,
                                 'kommentare',  coalesce(case when p_mit_absender then k.mit else k.ohne end, '[]'::jsonb),
                                 'fremdbilder', case when p_mit_absender then k.alle end) order by v.nr)
                          from vh v left join kom k on k.monat = v.monat and k.nr = v.nr
                         where v.monat = m.monat), '[]'::jsonb),
        'rituale',   coalesce((select jsonb_agg(jsonb_build_object(
                                 'ritual', r.ritual, 'frage_nr', r.frage_nr, 'frage', r.frage, 'typ', r.typ,
                                 'zahl', r.antwort_zahl, 'text', r.antwort_text) order by r.ritual, r.frage_nr)
                          from rit r where r.monat = m.monat), '[]'::jsonb)
      ))
        from mon m), '{}'::jsonb)
)
$$;

revoke all on function public.auswertung_person(uuid, date, date, boolean) from public, anon, authenticated;


-- 4. meine_ergebnisse ────────────────────────────────────────────────────────

create or replace function public.meine_ergebnisse(p_von date default null, p_bis date default null)
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
   where auth_user_id = (select auth.uid()) and aktiv and nimmt_an_teamumfrage;
  if v_p.id is null then
    raise exception 'Kein Zugang zur Teamumfrage' using errcode = '42501';
  end if;
  return public.auswertung_person(v_p.id, p_von, p_bis, public.absender_sichtbar_fuer(v_p.id, v_p.id));
end;
$$;

comment on function public.meine_ergebnisse(date, date) is
  'Eigene Auswertung (Selbstbild, Fremdbild-Schnitt, Kommentare) für Teilnehmer. Absender nur, wenn absender_sichtbar_fuer es erlaubt.';

revoke all on function public.meine_ergebnisse(date, date) from public, anon;
grant execute on function public.meine_ergebnisse(date, date) to authenticated;


-- 5. person_ergebnisse ───────────────────────────────────────────────────────

create or replace function public.person_ergebnisse(p_person uuid, p_von date default null, p_bis date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me     public.personen;
  v_ziel   public.personen;
begin
  select * into v_me
    from public.personen
   where auth_user_id = (select auth.uid()) and aktiv and rolle in ('verantwortlicher', 'admin');
  if v_me.id is null then
    raise exception 'Nur für Verantwortliche und Admin' using errcode = '42501';
  end if;

  select * into v_ziel from public.personen where id = p_person;
  if v_ziel.id is null or (v_me.rolle <> 'admin' and v_ziel.salon_id is distinct from v_me.salon_id) then
    raise exception 'Person nicht gefunden' using errcode = '42501';
  end if;

  return public.auswertung_person(v_ziel.id, p_von, p_bis, public.absender_sichtbar_fuer(v_me.id, v_ziel.id));
end;
$$;

comment on function public.person_ergebnisse(uuid, date, date) is
  'Auswertung einer Person für Verantwortliche und Admin, mit Absendern (bei sich selbst nach dem Salon-Schalter).';

revoke all on function public.person_ergebnisse(uuid, date, date) from public, anon;
grant execute on function public.person_ergebnisse(uuid, date, date) to authenticated;


-- 6. team_ergebnisse ─────────────────────────────────────────────────────────
--  Nur Schnitte über das Team, keine Einzelpersonen. Einzige Ausnahme laut §5.3:
--  „Entwicklung des Monats“ mit der Anzahl der Nennungen pro Person.

create or replace function public.team_ergebnisse(p_von date default null, p_bis date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
begin
  if not exists (select 1 from public.personen where auth_user_id = (select auth.uid()) and aktiv) then
    raise exception 'Kein Zugang' using errcode = '42501';
  end if;
  v_salon := public.auswertung_salon_id();
  if v_salon is null then
    raise exception 'Kein Salon' using errcode = '42501';
  end if;

  return (
  with
  bew as (
    select b.monat, b.verhalten_nr as nr, b.art, b.note, b.bewertete_person_id as pid,
           b.grundpfeiler, b.saeule, b.verhalten
      from public.umfrage_bewertungen b
      join public.umfrage_abgaben a on a.id = b.abgabe_id
     where a.salon_id = v_salon
       and (p_von is null or b.monat >= p_von) and (p_bis is null or b.monat <= p_bis)
  ),
  pv as (    -- je Monat, Verhalten und Person
    select monat, nr, pid,
           max(grundpfeiler) as gp, max(saeule) as sae, max(verhalten) as titel,
           (max(note) filter (where art = 'selbstbild'))::numeric as sb,
           avg(note) filter (where art = 'fremdbild') as fb
      from bew group by monat, nr, pid
  ),
  vh as (    -- je Monat und Verhalten: Durchschnitt über die Personen
    select monat, nr, max(gp) as gp, max(sae) as sae, max(titel) as titel, avg(sb) as sb, avg(fb) as fb
      from pv group by monat, nr
  ),
  ppm as (   -- je Monat und Person: Durchschnitt der Verhalten
    select monat, pid, avg(sb) as sb, avg(fb) as fb from pv group by monat, pid
  ),
  ges as (   -- je Monat: Durchschnitt über die Personen
    select monat, avg(sb) as sb, avg(fb) as fb, count(*) as personen from ppm group by monat
  ),
  saeulen as (
    select monat, gp, sae, avg(sb) as sb, avg(fb) as fb, count(*) as n from vh group by monat, gp, sae
  ),
  abg as (
    select a.monat, count(*) as n, round(avg(a.ausfuelldauer_sek) / 60.0, 1) as dauer
      from public.umfrage_abgaben a
     where a.salon_id = v_salon
       and (p_von is null or a.monat >= p_von) and (p_bis is null or a.monat <= p_bis)
     group by a.monat
  ),
  rit as (
    select a.monat, r.ritual, r.frage_nr, r.frage, r.typ, r.antwort_zahl, r.antwort_text
      from public.umfrage_rituale r join public.umfrage_abgaben a on a.id = r.abgabe_id
     where a.salon_id = v_salon
       and (p_von is null or a.monat >= p_von) and (p_bis is null or a.monat <= p_bis)
  ),
  ent as (
    select a.monat, a.entwicklung_person as name, count(*) as n
      from public.umfrage_abgaben a
     where a.salon_id = v_salon and a.entwicklung_person is not null
       and (p_von is null or a.monat >= p_von) and (p_bis is null or a.monat <= p_bis)
     group by a.monat, a.entwicklung_person
  ),
  mon as (select monat from vh union select monat from abg),
  teiln as (select count(*) as n from public.personen where salon_id = v_salon and aktiv and nimmt_an_teamumfrage)
  select jsonb_build_object(
    'monate', coalesce((select jsonb_agg(to_char(monat, 'YYYY-MM') order by monat) from mon), '[]'::jsonb),
    'teilnehmer', (select n from teiln),
    'verlauf', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'monat',      to_char(m.monat, 'YYYY-MM'),
                 'sb',         round(g.sb, 2),
                 'fb',         round(g.fb, 2),
                 'diff',       round(g.sb - g.fb, 2),
                 'rituale',    (select round(avg(r.antwort_zahl), 2) from rit r where r.monat = m.monat and r.typ = 'skala'),
                 'dauer_min',  (select a.dauer from abg a where a.monat = m.monat),
                 'abgaben',    (select a.n from abg a where a.monat = m.monat),
                 'personen',   g.personen) order by m.monat)
          from mon m left join ges g on g.monat = m.monat), '[]'::jsonb),
    'detail', coalesce((
        select jsonb_object_agg(to_char(m.monat, 'YYYY-MM'), jsonb_build_object(
          'gesamt',    (select jsonb_build_object('sb', round(g.sb, 2), 'fb', round(g.fb, 2), 'diff', round(g.sb - g.fb, 2), 'personen', g.personen)
                          from ges g where g.monat = m.monat),
          'dauer_min', (select a.dauer from abg a where a.monat = m.monat),
          'abgaben',   (select a.n from abg a where a.monat = m.monat),
          'saeulen',   coalesce((select jsonb_agg(jsonb_build_object(
                                   'grundpfeiler', s.gp, 'saeule', s.sae,
                                   'sb', round(s.sb, 2), 'fb', round(s.fb, 2), 'diff', round(s.sb - s.fb, 2),
                                   'anzahl_verhalten', s.n) order by s.gp nulls first, s.sae nulls first)
                            from saeulen s where s.monat = m.monat), '[]'::jsonb),
          'verhalten', coalesce((select jsonb_agg(jsonb_build_object(
                                   'nr', v.nr, 'titel', v.titel, 'grundpfeiler', v.gp, 'saeule', v.sae,
                                   'sb', round(v.sb, 2), 'fb', round(v.fb, 2), 'diff', round(v.sb - v.fb, 2)) order by v.nr)
                            from vh v where v.monat = m.monat), '[]'::jsonb),
          'rituale',   jsonb_build_object(
                         'skalen', coalesce((select jsonb_agg(jsonb_build_object(
                                      'ritual', x.ritual, 'frage_nr', x.frage_nr, 'frage', x.frage,
                                      'schnitt', round(x.schnitt, 2), 'anzahl', x.n) order by x.ritual, x.frage_nr)
                                    from (select ritual, frage_nr, frage, avg(antwort_zahl) as schnitt, count(*) as n
                                            from rit where monat = m.monat and typ = 'skala' and antwort_zahl is not null
                                           group by ritual, frage_nr, frage) x), '[]'::jsonb),
                         'phasen', coalesce((select jsonb_agg(jsonb_build_object(
                                      'ritual', x.ritual, 'frage_nr', x.frage_nr, 'frage', x.frage,
                                      'phase', x.antwort_text, 'nennungen', x.n) order by x.ritual, x.frage_nr, x.n desc, x.antwort_text)
                                    from (select ritual, frage_nr, frage, antwort_text, count(*) as n
                                            from rit where monat = m.monat and typ = 'auswahl' and antwort_text is not null
                                           group by ritual, frage_nr, frage, antwort_text) x), '[]'::jsonb)),
          'entwicklung', coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'nennungen', e.n) order by e.n desc, e.name)
                                     from ent e where e.monat = m.monat), '[]'::jsonb)
        ))
          from mon m), '{}'::jsonb)
  )
  );
end;
$$;

comment on function public.team_ergebnisse(date, date) is
  'Team-Schnitte (Durchschnitt über alle Teilnehmer) ohne Einzelpersonen, für alle Eingeloggten.';

revoke all on function public.team_ergebnisse(date, date) from public, anon;
grant execute on function public.team_ergebnisse(date, date) to authenticated;


-- 7. team_dashboard ──────────────────────────────────────────────────────────
--  Alles für das Team-Dashboard eines Monats in einem Aufruf: je Person Selbstbild, Fremdbild,
--  Differenz, Ausfülldauer, Rang und Abgabe-Status, dazu die Matrix Verhalten × Person.

create or replace function public.team_dashboard(p_monat date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_monat date;
begin
  if not public.ist_leitung() then
    raise exception 'Nur für Verantwortliche und Admin' using errcode = '42501';
  end if;
  v_salon := public.auswertung_salon_id();
  if v_salon is null then
    raise exception 'Kein Salon' using errcode = '42501';
  end if;

  v_monat := coalesce(
    date_trunc('month', p_monat)::date,
    (select max(a.monat) from public.umfrage_abgaben a where a.salon_id = v_salon));

  return (
  with
  bew as (
    select b.monat, b.verhalten_nr as nr, b.art, b.note, b.bewertete_person_id as pid,
           b.grundpfeiler, b.saeule, b.verhalten
      from public.umfrage_bewertungen b
      join public.umfrage_abgaben a on a.id = b.abgabe_id
     where a.salon_id = v_salon and b.monat = v_monat
  ),
  pv as (
    select nr, pid, max(grundpfeiler) as gp, max(saeule) as sae, max(verhalten) as titel,
           (max(note) filter (where art = 'selbstbild'))::numeric as sb,
           avg(note) filter (where art = 'fremdbild') as fb
      from bew group by nr, pid
  ),
  vh as (
    select nr, max(gp) as gp, max(sae) as sae, max(titel) as titel, avg(sb) as sb, avg(fb) as fb from pv group by nr
  ),
  ppm as (select pid, avg(sb) as sb, avg(fb) as fb from pv group by pid),
  ges as (select avg(sb) as sb, avg(fb) as fb from ppm),
  saeulen as (select gp, sae, avg(sb) as sb, avg(fb) as fb, count(*) as n from vh group by gp, sae),
  abg as (
    select a.feedbackgeber_id as pid, round(a.ausfuelldauer_sek / 60.0, 1) as dauer
      from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat
  ),
  pers as (
    select p.id, p.name, p.rolle,
           exists (select 1 from abg where abg.pid = p.id) as abgegeben,
           round(m.sb, 2) as sb, round(m.fb, 2) as fb, round(m.sb - m.fb, 2) as diff,
           (select abg.dauer from abg where abg.pid = p.id) as dauer_min,
           (select count(distinct b.bewertende_person_id)
              from public.umfrage_bewertungen b
             where b.bewertete_person_id = p.id and b.monat = v_monat and b.art = 'fremdbild') as anzahl_fremdbilder,
           case when m.fb is null then null
                else rank() over (order by round(m.fb, 2) desc nulls last) end as rang
      from public.personen p
      left join ppm m on m.pid = p.id
     where p.salon_id = v_salon and p.aktiv and p.nimmt_an_teamumfrage
  ),
  mon as (
    select a.monat from public.umfrage_abgaben a where a.salon_id = v_salon group by a.monat
  )
  select jsonb_build_object(
    'monat',  to_char(v_monat, 'YYYY-MM'),
    'monate', coalesce((select jsonb_agg(to_char(monat, 'YYYY-MM') order by monat) from mon), '[]'::jsonb),
    'personen', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', x.id, 'name', x.name, 'rolle', x.rolle, 'abgegeben', x.abgegeben,
                 'sb', x.sb, 'fb', x.fb, 'diff', x.diff, 'dauer_min', x.dauer_min,
                 'anzahl_fremdbilder', x.anzahl_fremdbilder, 'rang', x.rang) order by x.rang nulls last, x.name)
          from pers x), '[]'::jsonb),
    'team', (select jsonb_build_object(
               'sb', round(g.sb, 2), 'fb', round(g.fb, 2), 'diff', round(g.sb - g.fb, 2),
               'dauer_min', (select round(avg(abg.dauer), 1) from abg),
               'abgaben', (select count(*) from abg),
               'teilnehmer', (select count(*) from pers))
               from ges g),
    'saeulen', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'grundpfeiler', s.gp, 'saeule', s.sae,
                 'sb', round(s.sb, 2), 'fb', round(s.fb, 2), 'diff', round(s.sb - s.fb, 2),
                 'anzahl_verhalten', s.n) order by s.gp nulls first, s.sae nulls first)
          from saeulen s), '[]'::jsonb),
    'verhalten', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nr', v.nr, 'titel', v.titel, 'grundpfeiler', v.gp, 'saeule', v.sae,
                 'team_sb', round(v.sb, 2), 'team_fb', round(v.fb, 2), 'team_diff', round(v.sb - v.fb, 2),
                 'werte', coalesce((select jsonb_agg(jsonb_build_object(
                                      'person_id', w.pid, 'sb', round(w.sb, 2), 'fb', round(w.fb, 2),
                                      'diff', round(w.sb - w.fb, 2)) order by w.pid)
                                from pv w where w.nr = v.nr), '[]'::jsonb)) order by v.nr)
          from vh v), '[]'::jsonb),
    'entwicklung', coalesce((
        select jsonb_agg(jsonb_build_object('name', e.name, 'nennungen', e.n) order by e.n desc, e.name)
          from (select a.entwicklung_person as name, count(*) as n
                  from public.umfrage_abgaben a
                 where a.salon_id = v_salon and a.monat = v_monat and a.entwicklung_person is not null
                 group by a.entwicklung_person) e), '[]'::jsonb)
  )
  );
end;
$$;

comment on function public.team_dashboard(date) is
  'Team-Dashboard eines Monats für Verantwortliche und Admin: Personen mit Rang, Team-Werte, Säulen, Matrix Verhalten × Person.';

revoke all on function public.team_dashboard(date) from public, anon;
grant execute on function public.team_dashboard(date) to authenticated;
