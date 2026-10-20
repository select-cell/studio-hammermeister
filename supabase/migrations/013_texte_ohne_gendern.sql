-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 013 · Texte ohne Gendern
-- ═══════════════════════════════════════════════════════════════════════════
--  Wunsch des Auftraggebers: Überall ohne Gendern schreiben, also einfach „Kollegen“ ohne Doppelpunkt-Form.
--  In der Datenbank stand die gegenderte Schreibweise noch in drei Funktionskommentaren und im
--  Kommentar innerhalb von meine_ergebnisse(). Die Texte in den Migrationen 005, 006, 011 und 012
--  wurden entsprechend angepasst; diese Migration bringt eine bereits eingespielte Datenbank auf
--  denselben Stand. Es ändert sich nur Text, keine Logik und keine Rechte.
--
--  Idempotent, ohne Löschbefehle (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Funktionskommentare ─────────────────────────────────────────────────────

comment on function public.umfrage_inhalt() is
  'Inhalt der Umfrage für die eingeloggte Person: aktive Verhalten mit Stufen, Rituale mit Fragen, bewertbare Kollegen.';

comment on function public.ohne_fremdkommentare(jsonb) is
  'Leert in einer Personen-Auswertung die Kommentare und Einzelnoten der Kollegen und setzt ohne_fremdkommentare = true. Intern.';


-- 2. meine_ergebnisse (nur der Kommentar im Funktionskörper ändert sich) ─────

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

  -- Die Kommentare der Kollegen sehen nur Verantwortliche und Admin (auch bei sich selbst)
  if v_p.rolle in ('verantwortlicher', 'admin') then
    return v_erg;
  end if;
  return public.ohne_fremdkommentare(v_erg);
end;
$$;

comment on function public.meine_ergebnisse(date, date) is
  'Eigene Auswertung für Teilnehmer. Verantwortliche und Admin: mit den Kommentaren der Kollegen (Absender nach absender_sichtbar_fuer). Alle anderen: dieselben Zahlen, aber ohne Fremdkommentare (ohne_fremdkommentare = true).';

revoke all on function public.meine_ergebnisse(date, date) from public, anon;
grant execute on function public.meine_ergebnisse(date, date) to authenticated;
