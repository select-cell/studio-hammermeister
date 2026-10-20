-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 012 · „Meine Ergebnisse“: Mitarbeiter sehen die Kommentare der Kolleg:innen nicht
-- ═══════════════════════════════════════════════════════════════════════════
--  Klarstellung des Auftraggebers zu 011: Es geht nur um die Fremdbild-Kommentare der einzelnen
--  Kolleg:innen im eigenen Tab. Alles andere bleibt wie bisher: Selbstbild, Ø Fremdbild,
--  Differenz, Top/Flop, Detailtabelle, Verlauf, Rituale, Ausfülldauer und der eigene Kommentar.
--
--  Umsetzung in der Datenbank, nicht im Frontend:
--    ohne_fremdkommentare()   neue interne Funktion. Sie nimmt eine fertige Auswertung und leert
--                             je Verhalten die Liste "kommentare" (und "fremdbilder"). Dazu setzt sie
--                             "ohne_fremdkommentare": true, damit die Oberfläche den Grund nennen kann.
--    meine_ergebnisse()       Verantwortliche und Admin bekommen die Auswertung unverändert (auch bei
--                             sich selbst), alle anderen die Auswertung ohne Fremdkommentare.
--                             Die Rolle entscheidet bei jedem Aufruf neu.
--
--  Damit wird die strengere Fassung aus 011 abgelöst: meine_ergebnisse() ruft
--  auswertung_selbstbild() nicht mehr auf. Die Funktion bleibt vorerst bestehen (für alle Nutzer
--  gesperrt, wird nirgends verwendet) und kann im SQL-Editor entfernt werden.
--
--  Nicht verändert: team_ergebnisse() (nur Team-Schnitte, keine Kommentare), person_ergebnisse()
--  und team_dashboard() (nur Leitung).
--
--  Idempotent, ohne Löschbefehle (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Kommentare der Kolleg:innen aus einer fertigen Auswertung nehmen (intern) ──

create or replace function public.ohne_fremdkommentare(p_auswertung jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
select jsonb_set(
  p_auswertung || jsonb_build_object('ohne_fremdkommentare', true),
  '{detail}',
  coalesce((
    select jsonb_object_agg(
             m.key,
             case when jsonb_typeof(m.value -> 'verhalten') = 'array'
               then jsonb_set(
                      m.value,
                      '{verhalten}',
                      coalesce((
                        select jsonb_agg(
                                 (v.zeile - 'kommentare' - 'fremdbilder')
                                   || jsonb_build_object('kommentare', '[]'::jsonb, 'fremdbilder', null)
                                 order by v.pos)
                          from jsonb_array_elements(m.value -> 'verhalten') with ordinality as v(zeile, pos)
                      ), '[]'::jsonb))
               else m.value
             end)
      from jsonb_each(p_auswertung -> 'detail') m
  ), '{}'::jsonb)
)
$$;

comment on function public.ohne_fremdkommentare(jsonb) is
  'Leert in einer Personen-Auswertung die Kommentare und Einzelnoten der Kolleg:innen und setzt ohne_fremdkommentare = true. Intern.';

revoke all on function public.ohne_fremdkommentare(jsonb) from public, anon, authenticated;


-- 2. meine_ergebnisse: Leitung alles, alle anderen ohne Fremdkommentare ─────────

create or replace function public.meine_ergebnisse(p_von date default null, p_bis date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p   public.personen;
  v_erg jsonb;
begin
  select * into v_p
    from public.personen
   where auth_user_id = (select auth.uid()) and aktiv and nimmt_an_teamumfrage;
  if v_p.id is null then
    raise exception 'Kein Zugang zur Teamumfrage' using errcode = '42501';
  end if;

  v_erg := public.auswertung_person(v_p.id, p_von, p_bis, public.absender_sichtbar_fuer(v_p.id, v_p.id));

  -- Die Kommentare der Kolleg:innen sehen nur Verantwortliche und Admin (auch bei sich selbst)
  if v_p.rolle in ('verantwortlicher', 'admin') then
    return v_erg;
  end if;
  return public.ohne_fremdkommentare(v_erg);
end;
$$;

comment on function public.meine_ergebnisse(date, date) is
  'Eigene Auswertung für Teilnehmer. Verantwortliche und Admin: mit den Kommentaren der Kolleg:innen (Absender nach absender_sichtbar_fuer). Alle anderen: dieselben Zahlen, aber ohne Fremdkommentare (ohne_fremdkommentare = true).';

revoke all on function public.meine_ergebnisse(date, date) from public, anon;
grant execute on function public.meine_ergebnisse(date, date) to authenticated;


-- 3. Die strengere Funktion aus 011 wird nicht mehr verwendet ──────────────────

-- Nur wenn es sie noch gibt: Wurde sie schon entfernt, läuft 012 trotzdem sauber ein zweites Mal.
do $$
begin
  if to_regprocedure('public.auswertung_selbstbild(uuid,date,date)') is not null then
    comment on function public.auswertung_selbstbild(uuid, date, date) is
      'Nicht mehr verwendet (seit Migration 012 ruft meine_ergebnisse sie nicht mehr auf). Für alle Nutzer gesperrt; kann entfernt werden.';
  end if;
end;
$$;
