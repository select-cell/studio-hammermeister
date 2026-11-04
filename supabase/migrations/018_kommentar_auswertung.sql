-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 018 · Erweiterung D: Kommentar-Auswertung (nur Verantwortliche und Admin)
-- ═══════════════════════════════════════════════════════════════════════════
--  Sichtbar machen, wer Kommentare schreibt, wie ausführlich sie sind und wer keine schreibt. Alles rechnet die
--  Datenbank; die Oberfläche zeigt nur.
--
--  Neu:
--    v_kommentar_metriken        Kennzahlen je Absender und Monat (Ansicht, für Anmeldungen gesperrt)
--    kommentar_auswertung(monat) die Auswertung für die Leitung (Rollenprüfung, eigener Salon)
--    salons.eigene_analyse_nur_admin   Schalter (Standard aus): Verantwortliche sehen ihre eigenen Werte nicht
--
--  Regeln (Datenschutz):
--    - Nur Verantwortliche und Admin (42501 für alle anderen).
--    - Die Kennzahlen gelten je Person als ABSENDER. Kommentartexte erscheinen hier nie: weder mit noch ohne
--      Absender. Gegenüber dem Team bleiben Kommentare anonym.
--    - Pflichtkommentare (Bewertung 4 oder 5, laut Regel verpflichtend) und freiwillige Kommentare (Bewertung 1 bis 3)
--      werden getrennt gezählt. Die „freiwillige Quote“ misst nur die Fälle, in denen niemand zum Kommentar
--      verpflichtet war; sonst verzerrten die Pflichtkommentare das Bild.
--    - Eine „Quote“ ist immer Kommentare ÷ Bewertungen in Prozent, eine Stelle nach dem Komma.
--
--  Kennzahlen je Absender und Monat:
--    bewertungen, kommentare, quote
--    pflicht, pflicht_mit_kommentar
--    freiwillig_moeglich (Bewertungen 1 bis 3), freiwillig (davon mit Kommentar), freiwillig_quote
--    woerter_schnitt (alle Kommentare), woerter_schnitt_freiwillig
--    kurz_anteil (Anteil der Kommentare mit weniger als 5 Wörtern)
--    duplikate (gleicher Text mehrfach: Anzahl der Wiederholungen; Groß-/Kleinschreibung und Leerzeichen zählen nicht)
--    verhalten_ohne_kommentar (Verhalten, bei denen der Absender nirgends etwas geschrieben hat)
--
--  Idempotent, ohne DROP (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Schalter im Salon ───────────────────────────────────────────────────────

alter table public.salons
  add column if not exists eigene_analyse_nur_admin boolean not null default false;

comment on column public.salons.eigene_analyse_nur_admin is
  'Ist der Schalter an, sieht ein Verantwortlicher seine eigenen Werte in der Kommentar-Auswertung (und später in der Einzelanalyse) nicht; der Admin sieht alles. Standard: aus.';


-- 2. Ansicht: Kennzahlen je Absender und Monat ───────────────────────────────

create or replace view public.v_kommentar_metriken
with (security_invoker = true) as
with k as (
  select a.salon_id,
         b.monat,
         b.bewertende_person_id as person_id,
         b.verhalten_nr,
         b.note,
         nullif(btrim(b.kommentar), '') as kommentar
    from public.umfrage_bewertungen b
    join public.umfrage_abgaben a on a.id = b.abgabe_id
),
w as (
  select k.*,
         case when kommentar is null then null
              else array_length(regexp_split_to_array(kommentar, '\s+'), 1) end as woerter,
         lower(regexp_replace(kommentar, '\s+', ' ', 'g')) as norm
    from k
)
select
  salon_id,
  monat,
  person_id,
  count(*)                                                             as bewertungen,
  count(kommentar)                                                     as kommentare,
  count(*) filter (where note >= 4)                                    as pflicht,
  count(*) filter (where note >= 4 and kommentar is not null)          as pflicht_mit_kommentar,
  count(*) filter (where note < 4)                                     as freiwillig_moeglich,
  count(*) filter (where note < 4 and kommentar is not null)           as freiwillig,
  coalesce(sum(woerter), 0)::integer                                   as woerter_summe,
  coalesce(sum(woerter) filter (where note < 4), 0)::integer           as woerter_summe_freiwillig,
  count(*) filter (where woerter < 5)                                  as kurz,
  (count(kommentar) - count(distinct norm))::integer                   as duplikate,
  count(distinct verhalten_nr)                                         as verhalten_gesamt,
  (count(distinct verhalten_nr) - count(distinct verhalten_nr) filter (where kommentar is not null))::integer as verhalten_ohne_kommentar
from w
group by salon_id, monat, person_id;

comment on view public.v_kommentar_metriken is
  'Kommentar-Kennzahlen je Absender und Monat (Rohsummen). Nur über kommentar_auswertung() zugänglich.';

revoke all on public.v_kommentar_metriken from public, anon, authenticated;


-- 3. kommentar_auswertung() ──────────────────────────────────────────────────
--  Antwort:
--    { monat, monate: ['YYYY-MM', …],
--      konfig: { eigene_analyse_nur_admin, eigene_werte_verborgen },
--      team: { absender, bewertungen, kommentare, quote, pflicht, pflicht_mit_kommentar, freiwillig_moeglich, freiwillig,
--              freiwillig_quote, woerter_schnitt, kurz_anteil, duplikate },
--      personen: [ { person_id, name, rolle, abgegeben, bewertungen, kommentare, quote, pflicht, pflicht_mit_kommentar,
--                    freiwillig_moeglich, freiwillig, freiwillig_quote, woerter_schnitt, woerter_schnitt_freiwillig,
--                    kurz, kurz_anteil, duplikate, verhalten_gesamt, verhalten_ohne_kommentar,
--                    verlauf: [ { monat, quote, freiwillig_quote, woerter_schnitt, kommentare, bewertungen } ] } ],
--      ohne_kommentare: [ name, … ],   -- haben abgegeben, aber keinen einzigen Kommentar geschrieben
--      nicht_abgegeben: [ name, … ] }  -- haben für den Monat nicht abgegeben

create or replace function public.kommentar_auswertung(p_monat date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon     uuid;
  v_z         public.salons;
  v_monat     date;
  v_ich       uuid;
  v_verborgen uuid;
begin
  if not public.ist_leitung() then
    raise exception 'Nur für Verantwortliche und Admin' using errcode = '42501';
  end if;
  v_salon := public.auswertung_salon_id();
  select * into v_z from public.salons where id = v_salon;
  if v_z.id is null then
    raise exception 'Kein Salon' using errcode = '42501';
  end if;
  select p.id into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  -- Schalter: ein Verantwortlicher (nicht der Admin) sieht sich selbst nicht
  v_verborgen := case when v_z.eigene_analyse_nur_admin and not public.ist_admin() then v_ich end;

  v_monat := coalesce(
    date_trunc('month', p_monat)::date,
    (select max(m.monat) from public.v_kommentar_metriken m where m.salon_id = v_salon));

  return jsonb_build_object(
    'monat',  to_char(v_monat, 'YYYY-MM'),
    'monate', coalesce((select jsonb_agg(to_char(x.monat, 'YYYY-MM') order by x.monat)
                          from (select distinct m.monat from public.v_kommentar_metriken m where m.salon_id = v_salon) x), '[]'::jsonb),
    'konfig', jsonb_build_object('eigene_analyse_nur_admin', v_z.eigene_analyse_nur_admin, 'eigene_werte_verborgen', v_verborgen is not null),
    'team', (
      select jsonb_build_object(
        'absender',              count(*),
        'bewertungen',           coalesce(sum(m.bewertungen), 0),
        'kommentare',            coalesce(sum(m.kommentare), 0),
        'quote',                 round(100.0 * sum(m.kommentare) / nullif(sum(m.bewertungen), 0), 1),
        'pflicht',               coalesce(sum(m.pflicht), 0),
        'pflicht_mit_kommentar', coalesce(sum(m.pflicht_mit_kommentar), 0),
        'freiwillig_moeglich',   coalesce(sum(m.freiwillig_moeglich), 0),
        'freiwillig',            coalesce(sum(m.freiwillig), 0),
        'freiwillig_quote',      round(100.0 * sum(m.freiwillig) / nullif(sum(m.freiwillig_moeglich), 0), 1),
        'woerter_schnitt',       round(sum(m.woerter_summe)::numeric / nullif(sum(m.kommentare), 0), 1),
        'kurz_anteil',           round(100.0 * sum(m.kurz) / nullif(sum(m.kommentare), 0), 1),
        'duplikate',             coalesce(sum(m.duplikate), 0))
        from public.v_kommentar_metriken m
       where m.salon_id = v_salon and m.monat = v_monat),
    'personen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'person_id',                  p.id,
               'name',                       p.name,
               'rolle',                      p.rolle,
               'abgegeben',                  m.person_id is not null,
               'bewertungen',                coalesce(m.bewertungen, 0),
               'kommentare',                 coalesce(m.kommentare, 0),
               'quote',                      round(100.0 * m.kommentare / nullif(m.bewertungen, 0), 1),
               'pflicht',                    coalesce(m.pflicht, 0),
               'pflicht_mit_kommentar',      coalesce(m.pflicht_mit_kommentar, 0),
               'freiwillig_moeglich',        coalesce(m.freiwillig_moeglich, 0),
               'freiwillig',                 coalesce(m.freiwillig, 0),
               'freiwillig_quote',           round(100.0 * m.freiwillig / nullif(m.freiwillig_moeglich, 0), 1),
               'woerter_schnitt',            round(m.woerter_summe::numeric / nullif(m.kommentare, 0), 1),
               'woerter_schnitt_freiwillig', round(m.woerter_summe_freiwillig::numeric / nullif(m.freiwillig, 0), 1),
               'kurz',                       coalesce(m.kurz, 0),
               'kurz_anteil',                round(100.0 * m.kurz / nullif(m.kommentare, 0), 1),
               'duplikate',                  coalesce(m.duplikate, 0),
               'verhalten_gesamt',           coalesce(m.verhalten_gesamt, 0),
               'verhalten_ohne_kommentar',   coalesce(m.verhalten_ohne_kommentar, 0),
               'verlauf', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'monat',            to_char(h.monat, 'YYYY-MM'),
                           'quote',            round(100.0 * h.kommentare / nullif(h.bewertungen, 0), 1),
                           'freiwillig_quote', round(100.0 * h.freiwillig / nullif(h.freiwillig_moeglich, 0), 1),
                           'woerter_schnitt',  round(h.woerter_summe::numeric / nullif(h.kommentare, 0), 1),
                           'kommentare',       h.kommentare,
                           'bewertungen',      h.bewertungen) order by h.monat)
                    from public.v_kommentar_metriken h
                   where h.salon_id = v_salon and h.person_id = p.id), '[]'::jsonb)) order by p.name)
        from public.personen p
        left join public.v_kommentar_metriken m on m.salon_id = v_salon and m.person_id = p.id and m.monat = v_monat
       where p.salon_id = v_salon and p.aktiv and p.nimmt_an_teamumfrage
         and p.id is distinct from v_verborgen), '[]'::jsonb),
    'ohne_kommentare', coalesce((
      select jsonb_agg(p.name order by p.name)
        from public.v_kommentar_metriken m
        join public.personen p on p.id = m.person_id
       where m.salon_id = v_salon and m.monat = v_monat and m.kommentare = 0 and p.id is distinct from v_verborgen), '[]'::jsonb),
    'nicht_abgegeben', coalesce((
      select jsonb_agg(p.name order by p.name)
        from public.personen p
       where p.salon_id = v_salon and p.aktiv and p.nimmt_an_teamumfrage and p.id is distinct from v_verborgen
         and greatest(date_trunc('month', v_z.start_monat)::date, coalesce(p.aktiv_ab, v_z.start_monat)) <= v_monat
         and not exists (select 1 from public.v_kommentar_metriken m where m.salon_id = v_salon and m.person_id = p.id and m.monat = v_monat)), '[]'::jsonb));
end;
$$;

comment on function public.kommentar_auswertung(date) is
  'Kommentar-Kennzahlen je Absender und Monat für Verantwortliche und Admin (eigener Salon). Keine Kommentartexte.';

revoke all on function public.kommentar_auswertung(date) from public, anon;
grant execute on function public.kommentar_auswertung(date) to authenticated;
