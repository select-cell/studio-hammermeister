-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 021 · KI-Funktionen: Einzelanalyse, Gesamtauswertung (Monatsauswertung) und Agenda mit KI
-- ═══════════════════════════════════════════════════════════════════════════
--  Die KI formuliert nur Text. Die Datenbank baut die Eingabe, prüft den Aufbau und jede Zahl und rechnet „geprüft“ selbst.
--  Der Weg zur KI ist genau einer: Plattform → Webhook (n8n) → Anthropic → Antwort des Webhooks → Plattform (Edge Function analyse-erstellen).
--
--  Neu:
--    salons.ki_nur_admin          Schalter (Standard an): KI-Funktionen nur für den Admin
--    salons.ki_kontext            Kontext des Salons für die KI (Leitbild, Werte, Ton), ohne Namen, höchstens 2000 Zeichen
--    analysen.versuche            wie oft die KI gefragt wurde; Typ „team_gesamt“ (Gesamtauswertung des Teams)
--    ki_kontext_lesen(), ki_kontext_speichern(text)                      nur Admin
--    analyse_eingabe_ki(person, monat), analyse_ki_speichern(…)          Einzelanalyse mit Kontext und Kriterien
--    gesamt_eingabe / _pruefen / _speichern / _lesen / _bearbeiten / _freigeben    Gesamtauswertung des Teams
--    agenda_ki_eingabe / _pruefen / _speichern                           Agenda, von der KI formuliert (die Vorlage ohne KI bleibt daneben)
--    interne Hilfen: ki_zugriff, ki_monat, ki_kriterien, ki_anreichern, team_basis, gesamt_basis, agenda_ki_basis,
--                    agenda_ki_validieren, agenda_ki_punkte, agenda_pruef_text
--
--  Regeln:
--    - Wer KI nutzen darf, entscheidet eine Stelle (analyse_zugriff / ki_zugriff): der Admin; Verantwortliche nur mit ki_nur_admin = false.
--      Der Schalter gilt für Erstellen, Lesen, Bearbeiten und Freigeben von Einzelanalyse und Gesamtauswertung. Bei der Agenda dürfen
--      Verantwortliche wie bisher lesen, bearbeiten und freigeben; nur das KI-Formulieren ist Sache des Admins.
--    - Die Eingabe enthält nie Namen, Kennungen oder E-Mail-Adressen. Team-Aufgaben (Gesamtauswertung, Agenda) bekommen nie
--      Kommentartexte (nur Anzahlen) und nie die Begründungen der Leitung zum Fokus (nur Nummer und Titel).
--    - Kontext des Salons und Kriterien der wichtigsten Verhalten gehören zur Eingabe (und damit zum Hash), aber NICHT zu den Zahlen,
--      die der Faktencheck erlaubt: Der Faktencheck prüft gegen die Daten allein.
--    - Die Agenda mit KI: Die KI liefert Block-Nummer, Minuten und Punkte; Titel, Hinweise und Summe setzt die Datenbank.
--
--  Idempotent, ohne DROP und ohne DELETE in den Anweisungen (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Spalten und Typ ─────────────────────────────────────────────────────────

alter table public.salons add column if not exists ki_nur_admin boolean not null default true;
alter table public.salons add column if not exists ki_kontext   text;

comment on column public.salons.ki_nur_admin is
  'Standard an: Nur der Admin darf KI-Analysen erstellen, lesen, bearbeiten und freigeben. Aus: auch Verantwortliche.';
comment on column public.salons.ki_kontext is
  'Kontext des Salons für die KI (Leitbild, Werte, Ton), ohne Namen von Personen, höchstens 2000 Zeichen. Gehört zur Eingabe der KI.';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.salons'::regclass and conname = 'salons_ki_kontext_laenge') then
    alter table public.salons add constraint salons_ki_kontext_laenge check (ki_kontext is null or length(ki_kontext) <= 2000);
  end if;
end
$$;

alter table public.analysen add column if not exists versuche integer;

-- Neuer Typ „team_gesamt“: die Prüfbedingung wird getauscht (in einem do-Block, nur wenn der Typ noch fehlt)
do $$
declare
  v_name text;
begin
  select c.conname into v_name
    from pg_constraint c
   where c.conrelid = 'public.analysen'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%team_agenda%' and pg_get_constraintdef(c.oid) not like '%team_gesamt%';
  if v_name is not null then
    execute format('alter table public.analysen drop constraint %I', v_name);
    alter table public.analysen add constraint analysen_typ_check
      check (typ in ('person', 'team_agenda', 'kommentar_qualitaet', 'team_gesamt'));
  end if;
end
$$;


-- 2. Zugriff: KI nur für den Admin (Schalter je Salon) ───────────────────────

-- Einzelanalysen (mit Person) sind KI-Funktionen: der Admin, oder Verantwortliche nur mit ki_nur_admin = false.
create or replace function public.analyse_zugriff(p_person uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_ich   uuid;
  v_z     public.salons;
begin
  if not public.ist_leitung() then
    raise exception 'Nur für Verantwortliche und Admin' using errcode = '42501';
  end if;
  v_salon := public.auswertung_salon_id();
  select * into v_z from public.salons where id = v_salon;
  if v_z.id is null then
    raise exception 'Kein Salon' using errcode = '42501';
  end if;
  if p_person is not null then
    if not public.ist_admin() and coalesce(v_z.ki_nur_admin, true) then
      raise exception 'Nur für Admins.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.personen p where p.id = p_person and p.salon_id = v_salon and p.nimmt_an_teamumfrage) then
      raise exception 'Person nicht gefunden' using errcode = '42501';
    end if;
    select p.id into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
    if v_z.eigene_analyse_nur_admin and not public.ist_admin() and p_person = v_ich then
      raise exception 'Die eigene Analyse ist nur für den Admin sichtbar' using errcode = '42501';
    end if;
  end if;
  return v_salon;
end;
$$;

revoke all on function public.analyse_zugriff(uuid) from public, anon, authenticated;

-- Salon, für den die aufrufende Person die KI für das Team nutzen darf (Gesamtauswertung, Agenda mit KI)
create or replace function public.ki_zugriff()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_nur   boolean;
begin
  v_salon := public.analyse_zugriff();
  if not public.ist_admin() then
    select s.ki_nur_admin into v_nur from public.salons s where s.id = v_salon;
    if coalesce(v_nur, true) then
      raise exception 'Nur für Admins.' using errcode = '42501';
    end if;
  end if;
  return v_salon;
end;
$$;

revoke all on function public.ki_zugriff() from public, anon, authenticated;

-- Der Monat für KI-Aufgaben: ohne Angabe der neueste mit Abgaben; ohne Abgaben in diesem Monat 22023
create or replace function public.ki_monat(p_salon uuid, p_monat date)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_monat date := coalesce(date_trunc('month', p_monat)::date, (select max(a.monat) from public.umfrage_abgaben a where a.salon_id = p_salon));
begin
  if v_monat is null or not exists (select 1 from public.umfrage_abgaben a where a.salon_id = p_salon and a.monat = v_monat) then
    raise exception 'Für diesen Monat gibt es noch keine Abgabe' using errcode = '22023';
  end if;
  return v_monat;
end;
$$;

revoke all on function public.ki_monat(uuid, date) from public, anon, authenticated;


-- 3. analyse_zeile() mit „versuche“ ──────────────────────────────────────────

create or replace function public.analyse_zeile(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'id', a.id,
           'monat', to_char(a.monat, 'YYYY-MM'),
           'typ', a.typ,
           'person_id', a.person_id,
           'inhalt', a.inhalt,
           'text_md', a.text_md,
           'modell', a.modell,
           'prompt_version', a.prompt_version,
           'input_hash', a.input_hash,
           'versuche', a.versuche,
           'status', a.status,
           'geprueft', a.geprueft,
           'fakten_hinweis', a.fakten_hinweis,
           'erstellt_am', a.erstellt_am,
           'bearbeitet_von', a.bearbeitet_von_name,
           'bearbeitet_am', a.bearbeitet_am,
           'freigegeben_von', a.freigegeben_von_name,
           'freigegeben_am', a.freigegeben_am)
    from public.analysen a where a.id = p_id
$$;

revoke all on function public.analyse_zeile(uuid) from public, anon, authenticated;


-- 4. Kontext des Salons und Kriterien (Teil der Eingabe) ─────────────────────

-- Kriterien der wichtigsten Verhalten: Fokus, die zwei niedrigsten Fremdbilder, die zwei größten Differenzen (höchstens fünf).
-- Nur Bezeichnung und Leitsatz der Stufen; keine Prozentangaben, damit keine Zahlen hineinkommen, die nicht in den Daten stehen.
create or replace function public.ki_kriterien(p_salon uuid, p_verhalten jsonb, p_datum date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with kand as (
    select (x->>'nr')::integer as nr,
           (x->>'fremdbild')::numeric as fb,
           abs(coalesce((x->>'differenz')::numeric, 0)) as ad
      from jsonb_array_elements(coalesce(p_verhalten, '[]'::jsonb)) x
  ),
  wahl as (
    select nr from (
      select f.nr::integer as nr from public.fokus_am(p_salon, p_datum) f
      union select nr from (select nr from kand where fb is not null order by fb, nr limit 2) a
      union select nr from (select nr from kand where ad > 0 order by ad desc, nr limit 2) b
    ) u order by nr limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object('nr', v.nr, 'titel', v.titel, 'stufen', s.stufen) order by v.nr), '[]'::jsonb)
    from public.verhalten v
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
               'stufe', k.stufe,
               'bezeichnung', left(regexp_replace(coalesce(k.bezeichnung, ''), '^\s*\d+\s*[–-]\s*', ''), 80),
               'leitsatz', left(coalesce(k.leitsatz, ''), 300)) order by k.stufe), '[]'::jsonb) as stufen
        from public.verhalten_kriterien k
       where k.verhalten_id = v.id and (nullif(btrim(k.bezeichnung), '') is not null or nullif(btrim(k.leitsatz), '') is not null)
    ) s
   where v.salon_id = p_salon and v.nr in (select nr from wahl) and jsonb_array_length(s.stufen) > 0
$$;

revoke all on function public.ki_kriterien(uuid, jsonb, date) from public, anon, authenticated;

-- Fügt Kontext und Kriterien zur Eingabe hinzu (nur für die KI und den Hash, nicht für den Faktencheck)
create or replace function public.ki_anreichern(p_salon uuid, p_basis jsonb, p_verhalten jsonb, p_datum date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select p_basis || jsonb_build_object(
           'salon_kontext', (select nullif(btrim(s.ki_kontext), '') from public.salons s where s.id = p_salon),
           'kriterien', public.ki_kriterien(p_salon, p_verhalten, p_datum))
$$;

revoke all on function public.ki_anreichern(uuid, jsonb, jsonb, date) from public, anon, authenticated;

create or replace function public.ki_kontext_lesen()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_z     public.salons;
begin
  v_salon := public.analyse_zugriff();
  if not public.ist_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  select * into v_z from public.salons where id = v_salon;
  return jsonb_build_object('kontext', v_z.ki_kontext, 'ki_nur_admin', v_z.ki_nur_admin);
end;
$$;

revoke all on function public.ki_kontext_lesen() from public, anon;
grant execute on function public.ki_kontext_lesen() to authenticated;

-- Der Name des Salons darf im Text vorkommen (er ist oft Teil eines Familiennamens); die Namen von Personen nicht.
create or replace function public.ki_kontext_speichern(p_text text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_z     public.salons;
  v_text  text := nullif(btrim(p_text), '');
  v_test  text;
begin
  v_salon := public.analyse_zugriff();
  if not public.ist_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  select * into v_z from public.salons where id = v_salon;
  if v_text is not null then
    if length(v_text) > 2000 then
      raise exception 'Der Text ist zu lang (höchstens 2000 Zeichen).' using errcode = '22023';
    end if;
    v_test := replace(lower(v_text), lower(v_z.name), '');
    if public.analyse_anonymisieren(v_test, null, v_salon) is distinct from v_test then
      raise exception 'Der Text enthält den Namen einer Person. Bitte ohne Namen schreiben.' using errcode = '22023';
    end if;
  end if;
  update public.salons set ki_kontext = v_text where id = v_salon;
  return public.ki_kontext_lesen();
end;
$$;

revoke all on function public.ki_kontext_speichern(text) from public, anon;
grant execute on function public.ki_kontext_speichern(text) to authenticated;


-- 5. Einzelanalyse mit Kontext ───────────────────────────────────────────────

-- Die Eingabe für die KI: die Eingabe der Auswertung plus Kontext und Kriterien. Der Hash gehört dazu.
create or replace function public.analyse_eingabe_ki(p_person uuid, p_monat date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_basis jsonb;
  v_ein   jsonb;
begin
  v_salon := public.analyse_zugriff(p_person);
  v_basis := public.analyse_eingabe(p_person, p_monat)->'eingabe';
  v_ein   := public.ki_anreichern(v_salon, v_basis, v_basis->'verhalten', (now() at time zone 'Europe/Berlin')::date);
  return jsonb_build_object('eingabe', v_ein, 'hash', md5(v_ein::text));
end;
$$;

revoke all on function public.analyse_eingabe_ki(uuid, date) from public, anon;
grant execute on function public.analyse_eingabe_ki(uuid, date) to authenticated;

-- Speichert eine von der KI formulierte Einzelanalyse (Anbieter „webhook“) mit der Zahl der Versuche
create or replace function public.analyse_ki_speichern(
  p_person uuid, p_monat date, p_inhalt jsonb, p_text_md text, p_prompt_version text, p_input_hash text, p_versuche integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  r := public.analyse_speichern(p_person, p_monat, p_inhalt, p_text_md, 'webhook', p_prompt_version, p_input_hash);
  update public.analysen set versuche = p_versuche where id = (r->>'id')::uuid;
  return public.analyse_zeile((r->>'id')::uuid);
end;
$$;

revoke all on function public.analyse_ki_speichern(uuid, date, jsonb, text, text, text, integer) from public, anon;
grant execute on function public.analyse_ki_speichern(uuid, date, jsonb, text, text, text, integer) to authenticated;

-- Einzelanalysen sind nur Typ „person“: Bearbeiten und Freigeben anderer Typen laufen über deren eigene Funktionen.
-- Beim Bearbeiten wird der neue Text geprüft: Er ersetzt, was gezeigt wird. Das ursprüngliche JSON der KI bleibt zur Dokumentation stehen.
create or replace function public.analyse_bearbeiten(p_id uuid, p_text_md text)
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
  v_ein   jsonb;
  v_fakt  jsonb;
begin
  select * into a from public.analysen where id = p_id and typ = 'person';
  if a.id is null then
    raise exception 'Analyse nicht gefunden' using errcode = '42501';
  end if;
  v_salon := public.analyse_zugriff(a.person_id);
  if a.salon_id <> v_salon then
    raise exception 'Analyse nicht gefunden' using errcode = '42501';
  end if;
  if nullif(btrim(p_text_md), '') is null then
    raise exception 'Der Text darf nicht leer sein' using errcode = '22023';
  end if;
  select * into v_ich from public.personen where auth_user_id = (select auth.uid()) and aktiv;
  v_ein  := public.analyse_eingabe(a.person_id, a.monat)->'eingabe';
  v_fakt := public.analyse_faktencheck(v_ein, '{}'::jsonb, p_text_md);

  update public.analysen
     set text_md = p_text_md, geprueft = (v_fakt->>'geprueft')::boolean, fakten_hinweis = v_fakt->'unbekannt',
         bearbeitet_von = (select auth.uid()), bearbeitet_von_name = coalesce(v_ich.name, 'Unbekannt'), bearbeitet_am = now(),
         status = 'entwurf', freigegeben_von = null, freigegeben_von_name = null, freigegeben_am = null
   where id = p_id;
  return public.analyse_zeile(p_id);
end;
$$;

revoke all on function public.analyse_bearbeiten(uuid, text) from public, anon;
grant execute on function public.analyse_bearbeiten(uuid, text) to authenticated;

create or replace function public.analyse_freigeben(p_id uuid, p_freigabe boolean default true)
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
  select * into a from public.analysen where id = p_id and typ = 'person';
  if a.id is null then
    raise exception 'Analyse nicht gefunden' using errcode = '42501';
  end if;
  v_salon := public.analyse_zugriff(a.person_id);
  if a.salon_id <> v_salon then
    raise exception 'Analyse nicht gefunden' using errcode = '42501';
  end if;
  select * into v_ich from public.personen where auth_user_id = (select auth.uid()) and aktiv;

  if coalesce(p_freigabe, true) then
    update public.analysen set status = 'freigegeben', freigegeben_von = (select auth.uid()), freigegeben_von_name = coalesce(v_ich.name, 'Unbekannt'), freigegeben_am = now()
     where id = p_id;
  else
    update public.analysen set status = 'entwurf', freigegeben_von = null, freigegeben_von_name = null, freigegeben_am = null where id = p_id;
  end if;
  return public.analyse_zeile(p_id);
end;
$$;

revoke all on function public.analyse_freigeben(uuid, boolean) from public, anon;
grant execute on function public.analyse_freigeben(uuid, boolean) to authenticated;


-- 6. Team-Eingabe (Gesamtauswertung und Agenda) ──────────────────────────────

-- Die Zahlen des Teams in einem Monat, vorgerechnet. Keine Namen, keine Kommentartexte, keine Begründungen zum Fokus.
create or replace function public.team_basis(p_salon uuid, p_monat date, p_datum date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d      jsonb := public.agenda_daten(p_salon, p_monat, p_datum);
  z      public.salons;
  t      jsonb := d->'team';
  ta     jsonb := d->'team_vormonat';
  v      jsonb;
  v_hoch numeric;
  v_nied numeric;
  v_ausg numeric;
  v_fb   numeric;
  v_diff numeric;
begin
  select * into z from public.salons where id = p_salon;
  if t is null then
    raise exception 'Für diesen Monat liegt keine Auswertung vor' using errcode = '22023';
  end if;
  v_hoch := z.schwelle_hoch; v_nied := z.schwelle_niedrig; v_ausg := z.schwelle_ausgewogen;
  v_fb := (t->>'fremdbild')::numeric; v_diff := (t->>'differenz')::numeric;

  v := coalesce((
    select jsonb_agg(jsonb_build_object(
             'nr', (h->>'nr')::integer, 'titel', h->>'titel', 'saeule', h->>'saeule',
             'selbstbild', h->'selbstbild', 'fremdbild', h->'fremdbild', 'differenz', h->'differenz',
             'stufe_fremdbild', case when h->>'fremdbild' is null then null
                                     when (h->>'fremdbild')::numeric >= v_hoch then 'hoch'
                                     when (h->>'fremdbild')::numeric < v_nied then 'niedrig' else 'mittel' end,
             'fremdbild_vormonat', h->'fremdbild_vormonat', 'veraenderung_fremdbild', h->'veraenderung') order by (h->>'nr')::integer)
      from jsonb_array_elements(d->'verhalten') h), '[]'::jsonb);

  return jsonb_build_object(
    'monat', d->>'monat',
    'skala', 'Noten von 1 (niedrig) bis 5 (hoch)',
    'bewertet', 'das Team',
    'kennzahlen', jsonb_build_object(
      'selbstbild', t->'selbstbild', 'fremdbild', t->'fremdbild', 'differenz', t->'differenz',
      'einordnung', case when abs(v_diff) <= v_ausg then 'ausgewogen' when v_diff > 0 then 'Selbstüberschätzung' else 'Selbstunterschätzung' end,
      'stufe_fremdbild', case when v_fb >= v_hoch then 'hoch' when v_fb < v_nied then 'niedrig' else 'mittel' end),
    'beteiligung', d->'beteiligung',
    'vormonat', case when ta is null then null else jsonb_build_object(
      'monat', d->>'vormonat', 'selbstbild', ta->'selbstbild', 'fremdbild', ta->'fremdbild', 'differenz', ta->'differenz',
      'veraenderung_fremdbild', round(v_fb - (ta->>'fremdbild')::numeric, 2),
      'veraenderung_selbstbild', round((t->>'selbstbild')::numeric - (ta->>'selbstbild')::numeric, 2)) end,
    'schwellen', d->'schwellen',
    'verhalten', v,
    'staerken', coalesce((
      select jsonb_agg(jsonb_build_object('nr', (s.x->>'nr')::integer, 'titel', s.x->>'titel', 'fremdbild', s.x->'fremdbild'))
        from (select x from jsonb_array_elements(v) x where x->>'fremdbild' is not null
               order by (x->>'fremdbild')::numeric desc, (x->>'nr')::integer limit 3) s), '[]'::jsonb),
    'entwicklungsfelder', coalesce((
      select jsonb_agg(jsonb_build_object('nr', (s.x->>'nr')::integer, 'titel', s.x->>'titel', 'fremdbild', s.x->'fremdbild'))
        from (select x from jsonb_array_elements(v) x where x->>'fremdbild' is not null
               order by (x->>'fremdbild')::numeric, (x->>'nr')::integer limit 3) s), '[]'::jsonb),
    'groesste_differenzen', coalesce((
      select jsonb_agg(jsonb_build_object('nr', (s.x->>'nr')::integer, 'titel', s.x->>'titel', 'differenz', s.x->'differenz',
                                          'fremdbild', s.x->'fremdbild', 'selbstbild', s.x->'selbstbild'))
        from (select x from jsonb_array_elements(v) x where x->>'differenz' is not null and abs((x->>'differenz')::numeric) > v_ausg
               order by abs((x->>'differenz')::numeric) desc, (x->>'nr')::integer limit 3) s), '[]'::jsonb),
    'groesste_veraenderungen', coalesce((
      select jsonb_agg(jsonb_build_object('nr', (s.x->>'nr')::integer, 'titel', s.x->>'titel', 'fremdbild', s.x->'fremdbild',
                                          'fremdbild_vormonat', s.x->'fremdbild_vormonat', 'veraenderung_fremdbild', s.x->'veraenderung_fremdbild'))
        from (select x from jsonb_array_elements(v) x where x->>'veraenderung_fremdbild' is not null and (x->>'veraenderung_fremdbild')::numeric <> 0
               order by abs((x->>'veraenderung_fremdbild')::numeric) desc, (x->>'nr')::integer limit 3) s), '[]'::jsonb),
    'kommentare', (
      select jsonb_build_object('fremdbild_bewertungen', count(*), 'davon_mit_kommentar', count(*) filter (where nullif(btrim(b.kommentar), '') is not null))
        from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
       where a.salon_id = p_salon and b.monat = p_monat and b.art = 'fremdbild'),
    'personen_mit_bewertung', (
      select count(distinct b.bewertete_person_id)
        from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
       where a.salon_id = p_salon and b.monat = p_monat and b.art = 'fremdbild'),
    'fokus_verhalten', coalesce((
      select jsonb_agg(jsonb_build_object('nr', (f->>'nr')::integer, 'titel', f->>'titel') order by (f->>'nr')::integer)
        from jsonb_array_elements(d->'fokus') f), '[]'::jsonb));
end;
$$;

revoke all on function public.team_basis(uuid, date, date) from public, anon, authenticated;


-- 7. Gesamtauswertung (Monatsauswertung des Teams) ───────────────────────────

create or replace function public.gesamt_basis(p_salon uuid, p_monat date, p_datum date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('monat', to_char(p_monat, 'YYYY-MM'), 'aufgabe', 'Gesamtauswertung des Teams', 'team', public.team_basis(p_salon, p_monat, p_datum))
$$;

revoke all on function public.gesamt_basis(uuid, date, date) from public, anon, authenticated;

create or replace function public.gesamt_eingabe(p_monat date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_monat date;
  v_datum date := (now() at time zone 'Europe/Berlin')::date;
  v_basis jsonb;
  v_ein   jsonb;
begin
  v_salon := public.ki_zugriff();
  v_monat := public.ki_monat(v_salon, p_monat);
  v_basis := public.gesamt_basis(v_salon, v_monat, v_datum);
  v_ein   := public.ki_anreichern(v_salon, v_basis, v_basis->'team'->'verhalten', v_datum);
  return jsonb_build_object('eingabe', v_ein, 'hash', md5(v_ein::text));
end;
$$;

revoke all on function public.gesamt_eingabe(date) from public, anon;
grant execute on function public.gesamt_eingabe(date) to authenticated;

create or replace function public.gesamt_pruefen(p_monat date, p_inhalt jsonb, p_text text)
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
  v_salon := public.ki_zugriff();
  v_monat := public.ki_monat(v_salon, p_monat);
  return public.analyse_faktencheck(public.gesamt_basis(v_salon, v_monat, (now() at time zone 'Europe/Berlin')::date), p_inhalt, p_text);
end;
$$;

revoke all on function public.gesamt_pruefen(date, jsonb, text) from public, anon;
grant execute on function public.gesamt_pruefen(date, jsonb, text) to authenticated;

create or replace function public.gesamt_speichern(
  p_monat date, p_inhalt jsonb, p_text_md text, p_prompt_version text, p_input_hash text, p_versuche integer default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_monat date;
  v_fakt  jsonb;
  v_id    uuid;
begin
  v_salon := public.ki_zugriff();
  v_monat := public.ki_monat(v_salon, p_monat);
  if p_inhalt is null or jsonb_typeof(p_inhalt) <> 'object' then
    raise exception 'Die Gesamtauswertung hat kein gültiges Format' using errcode = '22023';
  end if;
  if nullif(btrim(p_text_md), '') is null then
    raise exception 'Die Gesamtauswertung enthält keinen Text' using errcode = '22023';
  end if;
  v_fakt := public.analyse_faktencheck(public.gesamt_basis(v_salon, v_monat, (now() at time zone 'Europe/Berlin')::date), p_inhalt, p_text_md);

  insert into public.analysen (salon_id, monat, typ, person_id, inhalt, text_md, modell, prompt_version, input_hash, versuche, status, geprueft, fakten_hinweis)
  values (v_salon, v_monat, 'team_gesamt', null, p_inhalt, p_text_md, 'webhook', p_prompt_version, p_input_hash, p_versuche, 'entwurf',
          (v_fakt->>'geprueft')::boolean, v_fakt->'unbekannt')
  on conflict (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update
     set inhalt = excluded.inhalt, text_md = excluded.text_md, modell = excluded.modell, prompt_version = excluded.prompt_version,
         input_hash = excluded.input_hash, versuche = excluded.versuche, status = 'entwurf', geprueft = excluded.geprueft,
         fakten_hinweis = excluded.fakten_hinweis, erstellt_am = now(), bearbeitet_von = null, bearbeitet_von_name = null, bearbeitet_am = null,
         freigegeben_von = null, freigegeben_von_name = null, freigegeben_am = null
  returning id into v_id;
  return public.analyse_zeile(v_id);
end;
$$;

revoke all on function public.gesamt_speichern(date, jsonb, text, text, text, integer) from public, anon;
grant execute on function public.gesamt_speichern(date, jsonb, text, text, text, integer) to authenticated;

create or replace function public.gesamt_lesen(p_monat date)
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
  v_salon := public.ki_zugriff();
  select a.id into v_id from public.analysen a
   where a.salon_id = v_salon and a.typ = 'team_gesamt' and a.monat = date_trunc('month', p_monat)::date;
  return case when v_id is null then null else public.analyse_zeile(v_id) end;
end;
$$;

revoke all on function public.gesamt_lesen(date) from public, anon;
grant execute on function public.gesamt_lesen(date) to authenticated;

create or replace function public.gesamt_bearbeiten(p_id uuid, p_text_md text)
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
  v_salon := public.ki_zugriff();
  select * into a from public.analysen where id = p_id and typ = 'team_gesamt' and salon_id = v_salon;
  if a.id is null then
    raise exception 'Gesamtauswertung nicht gefunden' using errcode = '42501';
  end if;
  if nullif(btrim(p_text_md), '') is null then
    raise exception 'Der Text darf nicht leer sein' using errcode = '22023';
  end if;
  select * into v_ich from public.personen where auth_user_id = (select auth.uid()) and aktiv;
  v_fakt := public.analyse_faktencheck(public.gesamt_basis(v_salon, a.monat, (now() at time zone 'Europe/Berlin')::date), '{}'::jsonb, p_text_md);
  update public.analysen
     set text_md = p_text_md, geprueft = (v_fakt->>'geprueft')::boolean, fakten_hinweis = v_fakt->'unbekannt',
         bearbeitet_von = (select auth.uid()), bearbeitet_von_name = coalesce(v_ich.name, 'Unbekannt'), bearbeitet_am = now(),
         status = 'entwurf', freigegeben_von = null, freigegeben_von_name = null, freigegeben_am = null
   where id = p_id;
  return public.analyse_zeile(p_id);
end;
$$;

revoke all on function public.gesamt_bearbeiten(uuid, text) from public, anon;
grant execute on function public.gesamt_bearbeiten(uuid, text) to authenticated;

create or replace function public.gesamt_freigeben(p_id uuid, p_freigabe boolean default true)
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
  v_salon := public.ki_zugriff();
  select * into a from public.analysen where id = p_id and typ = 'team_gesamt' and salon_id = v_salon;
  if a.id is null then
    raise exception 'Gesamtauswertung nicht gefunden' using errcode = '42501';
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

revoke all on function public.gesamt_freigeben(uuid, boolean) from public, anon;
grant execute on function public.gesamt_freigeben(uuid, boolean) to authenticated;


-- 8. Agenda, von der KI formuliert ───────────────────────────────────────────

create or replace function public.agenda_ki_basis(p_salon uuid, p_monat date, p_datum date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'monat', to_char(p_monat, 'YYYY-MM'),
    'aufgabe', 'Agenda für das nächste Teammeeting',
    'team', public.team_basis(p_salon, p_monat, p_datum),
    'zeitbudget', jsonb_build_object(
      'gesamt_min', 15, 'gesamt_max', 20,
      'bloecke', jsonb_build_array(
        jsonb_build_object('id', 'einstieg',       'titel', 'Einstieg und Beteiligung',                'min', 2, 'max', 2, 'vorschlag', 2),
        jsonb_build_object('id', 'kennzahlen',     'titel', 'Team-Kennzahlen des Monats',              'min', 3, 'max', 3, 'vorschlag', 3),
        jsonb_build_object('id', 'fokus',          'titel', 'Fokus-Verhalten',                         'min', 6, 'max', 8, 'vorschlag', 7),
        jsonb_build_object('id', 'entwicklung',    'titel', 'Entwicklungsfelder und Differenzen',      'min', 3, 'max', 4, 'vorschlag', 4),
        jsonb_build_object('id', 'vereinbarungen', 'titel', 'Vereinbarungen für den nächsten Monat',   'min', 2, 'max', 3, 'vorschlag', 2))),
    'fokus_aktuell', coalesce((select jsonb_agg(jsonb_build_object('nr', f.nr::integer, 'titel', f.titel) order by f.nr) from public.fokus_am(p_salon, p_datum) f), '[]'::jsonb))
$$;

revoke all on function public.agenda_ki_basis(uuid, date, date) from public, anon, authenticated;

create or replace function public.agenda_ki_eingabe(p_monat date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_monat date;
  v_datum date := (now() at time zone 'Europe/Berlin')::date;
  v_basis jsonb;
  v_ein   jsonb;
begin
  v_salon := public.ki_zugriff();
  v_monat := public.ki_monat(v_salon, p_monat);
  v_basis := public.agenda_ki_basis(v_salon, v_monat, v_datum);
  v_ein   := public.ki_anreichern(v_salon, v_basis, v_basis->'team'->'verhalten', v_datum);
  return jsonb_build_object('eingabe', v_ein, 'hash', md5(v_ein::text));
end;
$$;

revoke all on function public.agenda_ki_eingabe(date) from public, anon;
grant execute on function public.agenda_ki_eingabe(date) to authenticated;

-- Aufbau der Antwort der KI: fünf Blöcke, Minuten (agenda_validieren), und jeder Punkt ist ein Text von höchstens 600 Zeichen
create or replace function public.agenda_ki_validieren(p_ausgabe jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  b jsonb;
  p jsonb;
begin
  perform public.agenda_validieren(p_ausgabe);
  for b in select x from jsonb_array_elements(p_ausgabe->'bloecke') x loop
    for p in select y from jsonb_array_elements(b->'punkte') y loop
      if jsonb_typeof(p) <> 'string' or btrim(p #>> '{}') = '' or length(p #>> '{}') > 600 then
        raise exception 'Im Block „%“ muss jeder Punkt ein Text mit höchstens 600 Zeichen sein', b->>'id' using errcode = '22023';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.agenda_ki_validieren(jsonb) from public, anon, authenticated;

-- Die Punkte als ein Text (für den Faktencheck)
create or replace function public.agenda_ki_punkte(p_ausgabe jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(string_agg(p #>> '{}', E'\n'), '')
    from jsonb_array_elements(p_ausgabe->'bloecke') b, jsonb_array_elements(b->'punkte') p
$$;

revoke all on function public.agenda_ki_punkte(jsonb) from public, anon, authenticated;

-- Der Text einer Agenda ohne Titelzeile und Hinweise: Beides setzt die Datenbank, dort stehen Zahlen (Summe der Minuten, Stand der Analysen)
create or replace function public.agenda_pruef_text(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(coalesce(p_text, ''), '(^|\n)(# |> )[^\n]*', '', 'g')
$$;

revoke all on function public.agenda_pruef_text(text) from public, anon, authenticated;

create or replace function public.agenda_ki_pruefen(p_monat date, p_ausgabe jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_monat date;
  v_fakt  jsonb;
begin
  v_salon := public.ki_zugriff();
  v_monat := public.ki_monat(v_salon, p_monat);
  begin
    perform public.agenda_ki_validieren(p_ausgabe);
  exception when sqlstate '22023' then
    return jsonb_build_object('ok', false, 'meldung', sqlerrm, 'geprueft', false, 'unbekannt', '[]'::jsonb);
  end;
  v_fakt := public.analyse_faktencheck(public.agenda_ki_basis(v_salon, v_monat, (now() at time zone 'Europe/Berlin')::date),
                                       jsonb_build_object('bloecke', p_ausgabe->'bloecke'), public.agenda_ki_punkte(p_ausgabe));
  return jsonb_build_object('ok', true, 'meldung', null, 'geprueft', v_fakt->'geprueft', 'unbekannt', v_fakt->'unbekannt');
end;
$$;

revoke all on function public.agenda_ki_pruefen(date, jsonb) from public, anon;
grant execute on function public.agenda_ki_pruefen(date, jsonb) to authenticated;

-- Speichert die von der KI formulierte Agenda als Entwurf. Titel, Hinweise und Summe setzt die Datenbank, „geprüft“ rechnet sie selbst.
create or replace function public.agenda_ki_speichern(
  p_monat date, p_ausgabe jsonb, p_prompt_version text, p_input_hash text, p_versuche integer default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon  uuid;
  v_monat  date;
  v_datum  date := (now() at time zone 'Europe/Berlin')::date;
  v_titel  text[] := array['Einstieg und Beteiligung', 'Team-Kennzahlen des Monats', 'Fokus-Verhalten', 'Entwicklungsfelder und Differenzen', 'Vereinbarungen für den nächsten Monat'];
  d        jsonb;
  bloecke  jsonb;
  b        jsonb;
  p        text;
  v_summe  integer;
  v_hinweis text[] := '{}';
  v_text   text;
  v_name   text;
  v_fakt   jsonb;
  v_id     uuid;
begin
  v_salon := public.ki_zugriff();
  v_monat := public.ki_monat(v_salon, p_monat);
  perform public.agenda_ki_validieren(p_ausgabe);

  d := public.agenda_daten(v_salon, v_monat, v_datum);
  bloecke := (
    select jsonb_agg(jsonb_build_object('id', x.blk->>'id', 'titel', v_titel[x.ord::integer], 'minuten', (x.blk->>'minuten')::integer,
                                        'punkte', (select jsonb_agg(btrim(y #>> '{}')) from jsonb_array_elements(x.blk->'punkte') y)) order by x.ord)
      from jsonb_array_elements(p_ausgabe->'bloecke') with ordinality as x(blk, ord));
  select sum((x->>'minuten')::integer) into v_summe from jsonb_array_elements(bloecke) x;

  if not (d->>'abgeschlossen')::boolean then
    v_hinweis := array_append(v_hinweis, 'Der Monat ist noch nicht abgeschlossen.'::text);
  end if;
  if (d->'analysen'->>'fertig')::integer < (d->'analysen'->>'gesamt')::integer then
    v_hinweis := array_append(v_hinweis, format('Stand unvollständig: %s von %s Einzelanalysen liegen vor.', d->'analysen'->>'fertig', d->'analysen'->>'gesamt'));
  end if;
  if (d->'beteiligung'->>'abgegeben')::integer < (d->'beteiligung'->>'erwartet')::integer then
    v_hinweis := array_append(v_hinweis, format('Stand unvollständig: %s von %s Abgaben.', d->'beteiligung'->>'abgegeben', d->'beteiligung'->>'erwartet'));
  end if;

  v_name := public.agenda_monatsname(v_monat);
  v_text := format('# Agenda für das Teammeeting (%s, %s Minuten)', v_name, v_summe) || E'\n';
  if cardinality(v_hinweis) > 0 then
    v_text := v_text || E'\n> ' || array_to_string(v_hinweis, ' ') || E'\n';
  end if;
  for b in select x from jsonb_array_elements(bloecke) x loop
    v_text := v_text || E'\n' || format('## %s (%s Min.)', b->>'titel', b->>'minuten') || E'\n';
    for p in select e from jsonb_array_elements_text(b->'punkte') e loop
      v_text := v_text || '- ' || p || E'\n';
    end loop;
  end loop;
  v_text := btrim(v_text, E'\n');

  v_fakt := public.analyse_faktencheck(public.agenda_ki_basis(v_salon, v_monat, v_datum), jsonb_build_object('bloecke', bloecke), public.agenda_pruef_text(v_text));

  insert into public.analysen (salon_id, monat, typ, person_id, inhalt, text_md, modell, prompt_version, input_hash, versuche, status, geprueft, fakten_hinweis)
  values (v_salon, v_monat, 'team_agenda', null,
          jsonb_build_object('monat', to_char(v_monat, 'YYYY-MM'), 'bloecke', bloecke, 'summe_minuten', v_summe,
                             'hinweis', nullif(array_to_string(v_hinweis, ' '), ''), 'beispiele_enthalten', false,
                             'fokus_nrs', coalesce((select jsonb_agg((f->>'nr')::integer order by (f->>'nr')::integer) from jsonb_array_elements(d->'fokus') f), '[]'::jsonb),
                             'ki', true),
          v_text, 'webhook', p_prompt_version, p_input_hash, p_versuche, 'entwurf', (v_fakt->>'geprueft')::boolean, v_fakt->'unbekannt')
  on conflict (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update
     set inhalt = excluded.inhalt, text_md = excluded.text_md, modell = excluded.modell, prompt_version = excluded.prompt_version,
         input_hash = excluded.input_hash, versuche = excluded.versuche, status = 'entwurf', geprueft = excluded.geprueft,
         fakten_hinweis = excluded.fakten_hinweis, erstellt_am = now(), bearbeitet_von = null, bearbeitet_von_name = null, bearbeitet_am = null,
         freigegeben_von = null, freigegeben_von_name = null, freigegeben_am = null
  returning id into v_id;
  return public.analyse_zeile(v_id);
end;
$$;

revoke all on function public.agenda_ki_speichern(date, jsonb, text, text, integer) from public, anon;
grant execute on function public.agenda_ki_speichern(date, jsonb, text, text, integer) to authenticated;

-- Die Vorlage ersetzt eine KI-Agenda vollständig und setzt auch die Zahl der Versuche zurück
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
  insert into public.analysen (salon_id, monat, typ, person_id, inhalt, text_md, modell, prompt_version, input_hash, versuche, status, geprueft, fakten_hinweis)
  values (p_salon, p_monat, 'team_agenda', null, v_a->'inhalt', v_a->>'text_md', 'vorlage', 'agenda-vorlage-v1', md5((v_a->'inhalt')::text), null, 'entwurf', true, '[]'::jsonb)
  on conflict (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update
     set inhalt = excluded.inhalt, text_md = excluded.text_md, modell = excluded.modell, prompt_version = excluded.prompt_version,
         input_hash = excluded.input_hash, versuche = null, status = 'entwurf', geprueft = true, fakten_hinweis = '[]'::jsonb, erstellt_am = now(),
         bearbeitet_von = null, bearbeitet_von_name = null, bearbeitet_am = null,
         freigegeben_von = null, freigegeben_von_name = null, freigegeben_am = null
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.agenda_speichern_intern(uuid, date, date) from public, anon, authenticated;

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
  if a.prompt_version like 'agenda-ki-%' then
    v_fakt := public.analyse_faktencheck(public.agenda_ki_basis(v_salon, a.monat, (now() at time zone 'Europe/Berlin')::date),
                                         '{}'::jsonb, public.agenda_pruef_text(p_text_md));
    update public.analysen set geprueft = (v_fakt->>'geprueft')::boolean, fakten_hinweis = v_fakt->'unbekannt' where id = p_id;
  end if;
  return public.analyse_zeile(p_id);
end;
$$;

revoke all on function public.agenda_bearbeiten(uuid, text) from public, anon;
grant execute on function public.agenda_bearbeiten(uuid, text) to authenticated;


-- 9. abschluss_uebersicht(): Analysen nur, wenn die Person KI nutzen darf ────────────────────────────────────────────

create or replace function public.abschluss_uebersicht(p_monat date default null)
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
  v_ki        boolean;
begin
  v_salon := public.analyse_zugriff();
  select * into v_z from public.salons where id = v_salon;
  select p.id into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  v_verborgen := case when v_z.eigene_analyse_nur_admin and not public.ist_admin() then v_ich end;
  v_ki := public.ist_admin() or not coalesce(v_z.ki_nur_admin, true);

  v_monat := coalesce(date_trunc('month', p_monat)::date, (select max(a.monat) from public.umfrage_abgaben a where a.salon_id = v_salon));

  return (
    with pers as (
      select p.id, p.name,
             exists (select 1 from public.umfrage_bewertungen b join public.umfrage_abgaben ab on ab.id = b.abgabe_id
                      where ab.salon_id = v_salon and b.monat = v_monat and b.bewertete_person_id = p.id and b.art = 'fremdbild') as hat_auswertung
        from public.personen p
       where p.salon_id = v_salon and p.aktiv and p.nimmt_an_teamumfrage and p.id is distinct from v_verborgen
    ),
    zeilen as (
      select pers.*, an.id as analyse_id
        from pers
        left join public.analysen an on an.salon_id = v_salon and an.monat = v_monat and an.typ = 'person' and an.person_id = pers.id and v_ki
    )
    select jsonb_build_object(
      'monat',  to_char(v_monat, 'YYYY-MM'),
      'ki_erlaubt', v_ki,
      'monate', coalesce((select jsonb_agg(to_char(x.monat, 'YYYY-MM') order by x.monat)
                            from (select distinct a.monat from public.umfrage_abgaben a where a.salon_id = v_salon) x), '[]'::jsonb),
      'abschluss', (select jsonb_build_object(
                      'abgeschlossen_am', m.abgeschlossen_am, 'abgeschlossen_von', m.abgeschlossen_von_name,
                      'abgaben_erwartet', m.abgaben_erwartet, 'abgaben_vorhanden', m.abgaben_vorhanden,
                      'unvollstaendig', coalesce(m.abgaben_vorhanden < m.abgaben_erwartet, false))
                      from public.monatsabschluesse m where m.salon_id = v_salon and m.monat = v_monat),
      'personen', coalesce((select jsonb_agg(jsonb_build_object(
                      'person_id', z.id, 'name', z.name, 'hat_auswertung', z.hat_auswertung,
                      'analyse', case when z.analyse_id is null then null else public.analyse_zeile(z.analyse_id) - 'inhalt' end) order by z.name)
                      from zeilen z), '[]'::jsonb),
      'analysen_gesamt', (select count(*) from zeilen z where z.hat_auswertung),
      'analysen_fertig', (select count(*) from zeilen z where z.hat_auswertung and z.analyse_id is not null),
      'freigegeben',     (select count(*) from zeilen z join public.analysen an on an.id = z.analyse_id where an.status = 'freigegeben'))
  );
end;
$$;

comment on function public.abschluss_uebersicht(date) is 'Stand von Monatsabschluss und Einzelanalysen eines Monats. Nur Leitung; die Analysen nur für den Admin (Schalter ki_nur_admin).';

revoke all on function public.abschluss_uebersicht(date) from public, anon;
grant execute on function public.abschluss_uebersicht(date) to authenticated;
