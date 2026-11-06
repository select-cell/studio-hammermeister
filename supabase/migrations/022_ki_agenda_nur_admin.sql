-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 022 · Die von der KI formulierte Agenda ist solange nur für den Admin, wie der Schalter „ki_nur_admin“ an ist
-- ═══════════════════════════════════════════════════════════════════════════
--  Lücke in 021: Einzelanalyse und Gesamtauswertung waren für Verantwortliche gesperrt, die von der KI formulierte Agenda aber nicht.
--  Verantwortliche konnten sie lesen, bearbeiten, freigeben, bekamen sie per Mail und sahen sie im Monatsbericht.
--
--  Regel (gilt nur bei ki_nur_admin = true, dem Standard):
--    - Eine Agenda, die nicht aus der Vorlage stammt (modell ≠ 'vorlage'), liest, bearbeitet und gibt nur der Admin frei.
--      Für Verantwortliche und Mitarbeiter ist sie nicht vorhanden: agenda_lesen() liefert null, also auch kein Monatsbericht mit ihr.
--    - Verantwortliche können sie nicht durch eine Vorlage überschreiben (agenda_erzeugen() lehnt ab, mit Hinweis).
--    - Die Mail (agenda_fuer_versand) enthält dann nie den KI-Text, sondern die Agenda aus der Vorlage (nicht gespeichert, nur gebaut).
--  Mit ki_nur_admin = false verhält sich alles wie in 021.
--
--  Die Agenda aus der Vorlage (modell = 'vorlage') bleibt Sache der Leitung wie in Erweiterung F.
--  Idempotent, ohne DROP und ohne DELETE.
-- ═══════════════════════════════════════════════════════════════════════════

-- Ist diese Agenda für die aufrufende Person gesperrt? Gesperrt: KI-Agenda, Schalter an, Aufrufer nicht Admin.
-- (Ohne Anmeldung, also beim Versand der Mails, ist niemand Admin.)
create or replace function public.agenda_ki_gesperrt(p_salon uuid, p_modell text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_modell is distinct from 'vorlage'
     and not public.ist_admin()
     and coalesce((select s.ki_nur_admin from public.salons s where s.id = p_salon), true)
$$;

revoke all on function public.agenda_ki_gesperrt(uuid, text) from public, anon, authenticated;

create or replace function public.agenda_lesen(p_monat date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon  uuid;
  v_id     uuid;
  v_modell text;
begin
  v_salon := public.analyse_zugriff();
  select a.id, a.modell into v_id, v_modell from public.analysen a
   where a.salon_id = v_salon and a.typ = 'team_agenda' and a.monat = date_trunc('month', p_monat)::date;
  if v_id is null or public.agenda_ki_gesperrt(v_salon, v_modell) then
    return null;
  end if;
  return public.analyse_zeile(v_id);
end;
$$;

create or replace function public.agenda_erzeugen(p_monat date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon  uuid;
  v_monat  date;
  v_id     uuid;
  v_modell text;
begin
  v_salon := public.analyse_zugriff();
  v_monat := coalesce(date_trunc('month', p_monat)::date, (select max(a.monat) from public.umfrage_abgaben a where a.salon_id = v_salon));
  if v_monat is null or not exists (select 1 from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat) then
    raise exception 'Für diesen Monat gibt es noch keine Abgabe' using errcode = '22023';
  end if;
  select a.modell into v_modell from public.analysen a where a.salon_id = v_salon and a.typ = 'team_agenda' and a.monat = v_monat;
  if v_modell is not null and public.agenda_ki_gesperrt(v_salon, v_modell) then
    raise exception 'Die Agenda dieses Monats kann nur der Admin ändern.' using errcode = '42501';
  end if;
  v_id := public.agenda_speichern_intern(v_salon, v_monat, (now() at time zone 'Europe/Berlin')::date);
  return public.analyse_zeile(v_id);
end;
$$;

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
  if a.id is null or public.agenda_ki_gesperrt(v_salon, a.modell) then
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

-- Bearbeiten: Bei einer KI-Agenda läuft der Faktencheck erneut, denn die Leitung könnte eine Zahl geändert haben
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
  v_fakt  jsonb;
begin
  v_salon := public.analyse_zugriff();
  select * into a from public.analysen where id = p_id and typ = 'team_agenda' and salon_id = v_salon;
  if a.id is null or public.agenda_ki_gesperrt(v_salon, a.modell) then
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
  if a.prompt_version like 'agenda-ki-%' then
    v_fakt := public.analyse_faktencheck(public.agenda_ki_basis(v_salon, a.monat, (now() at time zone 'Europe/Berlin')::date),
                                         '{}'::jsonb, public.agenda_pruef_text(p_text_md));
    update public.analysen set geprueft = (v_fakt->>'geprueft')::boolean, fakten_hinweis = v_fakt->'unbekannt' where id = p_id;
  end if;
  return public.analyse_zeile(p_id);
end;
$$;

-- Die Mail (Aufruf nur durch den Versand, ohne Anmeldung): Ist die Agenda des Monats eine KI-Agenda und der Schalter an,
-- steht in der Mail die Agenda aus der Vorlage. Sie wird nur gebaut, nicht gespeichert, die KI-Agenda bleibt unberührt.
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
  v_bau   jsonb;
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
  elsif public.agenda_ki_gesperrt(t.salon_id, a.modell) then
    v_bau := public.agenda_bauen(t.salon_id, v_monat, (t.startet_am at time zone 'Europe/Berlin')::date);
    a.status := 'entwurf';
    a.inhalt := v_bau->'inhalt';
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

-- Rechte wie in 020 und 021 (create or replace behält sie; zur Sicherheit noch einmal)
revoke all on function public.agenda_lesen(date) from public, anon;
grant execute on function public.agenda_lesen(date) to authenticated;
revoke all on function public.agenda_erzeugen(date) from public, anon;
grant execute on function public.agenda_erzeugen(date) to authenticated;
revoke all on function public.agenda_freigeben(uuid, boolean) from public, anon;
grant execute on function public.agenda_freigeben(uuid, boolean) to authenticated;
revoke all on function public.agenda_bearbeiten(uuid, text) from public, anon;
grant execute on function public.agenda_bearbeiten(uuid, text) to authenticated;
revoke all on function public.agenda_fuer_versand(uuid) from public, anon, authenticated;
grant execute on function public.agenda_fuer_versand(uuid) to service_role;
