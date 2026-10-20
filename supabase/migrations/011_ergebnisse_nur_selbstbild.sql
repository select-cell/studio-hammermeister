-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 011 · „Meine Ergebnisse“: Mitarbeiter sehen nur ihre eigenen Antworten
-- ═══════════════════════════════════════════════════════════════════════════
--  Wunsch des Auftraggebers: Mitarbeiter finden in ihren Ergebnissen nur ihr Selbstbild, also das,
--  was sie selbst geantwortet haben. Wie die Kolleg:innen sie bewertet haben (Fremdbild, Differenz,
--  Kommentare, Einzelnoten) sehen nur Verantwortliche und Admin.
--
--  Umsetzung in der Datenbank, nicht im Frontend:
--    auswertung_selbstbild()  neue interne Funktion. Sie liest ausschließlich Zeilen mit
--                             art = 'selbstbild' und kann Fremdbilder deshalb gar nicht ausgeben.
--    meine_ergebnisse()       Verantwortliche und Admin bekommen weiter die volle Auswertung
--                             (auswertung_person), alle anderen nur auswertung_selbstbild().
--
--  Die Antwort hat dieselben Schlüssel wie bisher (fb, diff, kommentare … sind leer bzw. null),
--  dazu "nur_selbstbild": true. So bleibt das Format stabil, und die Oberfläche richtet sich nach
--  diesem Kennzeichen. Die Rolle entscheidet bei jedem Aufruf neu: Wer zum Verantwortlichen wird,
--  sieht sofort alles, wer zurückgestuft wird, nur noch das Selbstbild.
--
--  Nicht verändert: team_ergebnisse() (nur Team-Schnitte), person_ergebnisse() und team_dashboard()
--  (nur Leitung).
--
--  Idempotent, ohne DROP (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Selbstbild-Auswertung einer Person (intern) ─────────────────────────────

create or replace function public.auswertung_selbstbild(
  p_person uuid, p_von date default null, p_bis date default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
bew as (   -- nur das, was die Person selbst geantwortet hat
  select b.*
    from public.umfrage_bewertungen b
   where b.bewertete_person_id = p_person
     and b.art = 'selbstbild'
     and (p_von is null or b.monat >= p_von) and (p_bis is null or b.monat <= p_bis)
),
vh as (    -- je Monat und Verhalten
  select monat, verhalten_nr as nr,
         max(grundpfeiler) as grundpfeiler, max(saeule) as saeule, max(verhalten) as titel,
         max(note)::numeric as sb,
         max(kommentar)     as sb_kommentar
    from bew
   group by monat, verhalten_nr
),
ges as (   -- je Monat: Durchschnitt der Verhalten
  select monat, avg(sb) as sb from vh group by monat
),
saeulen as (   -- je Monat und Säule: Durchschnitt der Verhalten
  select monat, grundpfeiler, saeule, avg(sb) as sb, count(*) as n
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
  'nur_selbstbild',    true,
  'absender_sichtbar', false,
  'monate',            coalesce((select jsonb_agg(to_char(monat, 'YYYY-MM') order by monat) from mon), '[]'::jsonb),
  'verlauf',           coalesce((
      select jsonb_agg(jsonb_build_object(
               'monat',     to_char(m.monat, 'YYYY-MM'),
               'sb',        round(g.sb, 2),
               'fb',        null,
               'diff',      null,
               'rituale',   (select round(avg(r.antwort_zahl), 2) from rit r where r.monat = m.monat and r.typ = 'skala'),
               'dauer_min', (select a.dauer_min from abg a where a.monat = m.monat)) order by m.monat)
        from mon m left join ges g on g.monat = m.monat), '[]'::jsonb),
  'detail',            coalesce((
      select jsonb_object_agg(to_char(m.monat, 'YYYY-MM'), jsonb_build_object(
        'gesamt',    (select jsonb_build_object('sb', round(g.sb, 2), 'fb', null, 'diff', null, 'anzahl_fremdbilder', null)
                        from ges g where g.monat = m.monat),
        'dauer_min', (select a.dauer_min from abg a where a.monat = m.monat),
        'saeulen',   coalesce((select jsonb_agg(jsonb_build_object(
                                 'grundpfeiler', s.grundpfeiler, 'saeule', s.saeule,
                                 'sb', round(s.sb, 2), 'fb', null, 'diff', null,
                                 'anzahl_verhalten', s.n) order by s.grundpfeiler nulls first, s.saeule nulls first)
                          from saeulen s where s.monat = m.monat), '[]'::jsonb),
        'verhalten', coalesce((select jsonb_agg(jsonb_build_object(
                                 'nr', v.nr, 'titel', v.titel, 'grundpfeiler', v.grundpfeiler, 'saeule', v.saeule,
                                 'sb', round(v.sb, 2), 'fb', null, 'diff', null,
                                 'anzahl_fremdbilder', 0,
                                 'sb_kommentar', v.sb_kommentar,
                                 'kommentare',  '[]'::jsonb,
                                 'fremdbilder', null) order by v.nr)
                          from vh v where v.monat = m.monat), '[]'::jsonb),
        'rituale',   coalesce((select jsonb_agg(jsonb_build_object(
                                 'ritual', r.ritual, 'frage_nr', r.frage_nr, 'frage', r.frage, 'typ', r.typ,
                                 'zahl', r.antwort_zahl, 'text', r.antwort_text) order by r.ritual, r.frage_nr)
                          from rit r where r.monat = m.monat), '[]'::jsonb)
      ))
        from mon m), '{}'::jsonb)
)
$$;

comment on function public.auswertung_selbstbild(uuid, date, date) is
  'Auswertung einer Person NUR aus ihren eigenen Antworten (art = selbstbild). Intern; gibt nie Fremdbilder aus.';

revoke all on function public.auswertung_selbstbild(uuid, date, date) from public, anon, authenticated;


-- 2. meine_ergebnisse: Leitung voll, alle anderen nur das Selbstbild ─────────

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

  -- Fremdbilder sehen nur Verantwortliche und Admin (auch bei sich selbst)
  if v_p.rolle in ('verantwortlicher', 'admin') then
    return public.auswertung_person(v_p.id, p_von, p_bis, public.absender_sichtbar_fuer(v_p.id, v_p.id));
  end if;
  return public.auswertung_selbstbild(v_p.id, p_von, p_bis);
end;
$$;

comment on function public.meine_ergebnisse(date, date) is
  'Eigene Auswertung für Teilnehmer. Verantwortliche und Admin: Selbstbild, Fremdbild, Kommentare (Absender nach absender_sichtbar_fuer). Alle anderen: nur das Selbstbild (nur_selbstbild = true).';

revoke all on function public.meine_ergebnisse(date, date) from public, anon;
grant execute on function public.meine_ergebnisse(date, date) to authenticated;
