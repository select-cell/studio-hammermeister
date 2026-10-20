-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 010 · Wartung: Testdaten einer Person restlos entfernen
-- ═══════════════════════════════════════════════════════════════════════════
--  Für Testzugänge (z. B. ein Mitarbeiter, der die Umfrage einmal ausfüllt) und für den Admin,
--  der zum Test kurz an der Umfrage teilnimmt. Danach sollen die Testwerte nicht in den Teamschnitten
--  und Ranglisten stehen bleiben.
--
--  Aufruf im Supabase SQL-Editor (nur dort; für die Plattform und alle Logins gesperrt):
--
--    select public.testdaten_entfernen('tobischw546@gmail.com');          -- Mitarbeiter: Daten UND Person
--    select public.testdaten_entfernen('select@voidos.de', false);        -- Admin: nur die Daten, Person bleibt
--
--  Entfernt wird:
--    - die eigenen Abgaben der Person samt aller Bewertungen und Rituale,
--    - alle Bewertungen, die andere über die Person abgegeben haben,
--    - Nennungen der Person als „Entwicklung des Monats“ bei anderen,
--    - bei Mitarbeitern (p_person_loeschen = true) die Zeile in „personen“.
--  Der Login in Authentication → Users bleibt bestehen und wird dort von Hand gelöscht.
--  Verantwortliche und Admin werden nie gelöscht, nur ihre Daten.
--
--  Idempotent, ohne DROP (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.testdaten_entfernen(p_email text, p_person_loeschen boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_name     text;
  v_rolle    text;
  v_abgaben  integer;
  v_ueber    integer;
  v_nennung  integer;
  v_geloescht boolean := false;
begin
  select p.id, p.name, p.rolle into v_id, v_name, v_rolle
    from public.personen p
   where p.email = lower(btrim(p_email));
  if v_id is null then
    raise exception 'Keine Person mit der E-Mail %', p_email using errcode = 'P0002';
  end if;
  if p_person_loeschen and v_rolle <> 'mitarbeiter' then
    raise exception '% ist % und wird nicht gelöscht. Mit p_person_loeschen = false werden nur die Daten entfernt.', v_name, v_rolle
      using errcode = '42501';
  end if;

  -- Eigene Abgaben (die Bewertungen und Rituale darin gehen per ON DELETE CASCADE mit)
  delete from public.umfrage_abgaben where feedbackgeber_id = v_id;
  get diagnostics v_abgaben = row_count;

  -- Was andere über die Person abgegeben haben
  delete from public.umfrage_bewertungen where bewertete_person_id = v_id;
  get diagnostics v_ueber = row_count;

  -- Nennungen als „Entwicklung des Monats“ (dort steht nur der Name)
  update public.umfrage_abgaben
     set entwicklung_person = null, entwicklung_begruendung = null
   where entwicklung_person = v_name;
  get diagnostics v_nennung = row_count;

  if p_person_loeschen then
    delete from public.personen where id = v_id;
    v_geloescht := true;
  end if;

  return jsonb_build_object(
    'person',                       v_name,
    'rolle',                        v_rolle,
    'abgaben_geloescht',            v_abgaben,
    'bewertungen_ueber_person_geloescht', v_ueber,
    'nennungen_entfernt',           v_nennung,
    'person_geloescht',             v_geloescht,
    'hinweis', case when v_geloescht
      then 'Den Login noch in Authentication → Users löschen.'
      else 'Die Person bleibt bestehen. Nur ihre Daten wurden entfernt.' end);
end;
$$;

comment on function public.testdaten_entfernen(text, boolean) is
  'Wartung: entfernt Abgaben, Bewertungen über die Person und Nennungen; bei Mitarbeitern auch die Person. Nur im SQL-Editor aufrufbar.';

revoke all on function public.testdaten_entfernen(text, boolean) from public, anon, authenticated;
