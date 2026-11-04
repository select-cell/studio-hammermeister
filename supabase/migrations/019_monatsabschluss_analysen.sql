-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 019 · Erweiterung E: Monatsabschluss und Einzelanalyse (nur Verantwortliche und Admin)
-- ═══════════════════════════════════════════════════════════════════════════
--  Die Leitung schließt einen Monat ab (auch mit fehlenden Abgaben) und lässt für jede Person eine Einzelanalyse
--  erstellen. ALLE ZAHLEN kommen aus SQL; die KI (Edge Function „analyse-erstellen“) formuliert nur den Text. Ob jede Zahl
--  im Text aus den Daten stammt, prüft die Datenbank selbst (Faktencheck): Die Edge Function kann das Ergebnis nicht
--  fälschen.
--
--  Neu:
--    monatsabschluesse           Tabelle: wer hat welchen Monat wann abgeschlossen, x von y Abgaben (gesperrt)
--    analysen                    Tabelle: Einzelanalysen als Entwurf oder freigegeben (gesperrt)
--    monat_abschliessen()        schließt einen Monat ab (idempotent, aktualisiert die Zählung)
--    abschluss_uebersicht()      Stand des Abschlusses und aller Analysen eines Monats
--    analyse_eingabe()           die Eingabe für die KI: Kennzahlen aus SQL, Kommentare OHNE Absender, Namen durch Platzhalter ersetzt
--    analyse_pruefen()           Faktencheck eines Textes gegen die Eingabe (ohne zu speichern)
--    analyse_speichern()         speichert eine erzeugte Analyse als Entwurf; prüft die Fakten selbst
--    analyse_bearbeiten()        geänderter Text; gespeichert wird, wer wann geändert hat
--    analyse_freigeben()         Entwurf freigeben oder zurücknehmen
--    analyse_lesen()             eine Analyse lesen
--
--  Regeln:
--    - Nur Verantwortliche und Admin des eigenen Salons (42501 für alle anderen). Mitarbeiter haben keinen Zugriff auf analysen.
--    - Die Tabellen sind für Anmeldungen gesperrt; Zugriff nur über diese Funktionen.
--    - Schalter salons.eigene_analyse_nur_admin (Migration 018): Ist er an, sieht ein Verantwortlicher die Analyse über sich
--      selbst nicht (nur der Admin).
--    - Die Eingabe für die KI enthält keine Namen (Platzhalter „die bewertete Person“, „Kollege A“ …) und keine Absender.
--    - Faktencheck: Jede Zahl im Text muss in der Eingabe vorkommen (Schreibweise 3,5 = 3.5 = 3,50). Erlaubt sind außerdem die
--      Zahlen 1 bis 5 (die Bewertungsskala). Sonst wird die Analyse als „geprüft: nein“ gekennzeichnet.
--    - Wird neu generiert oder der Text bearbeitet, geht die Analyse zurück auf „Entwurf“ (neue Freigabe nötig).
--
--  Idempotent, ohne DROP (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Tabellen ────────────────────────────────────────────────────────────────

create table if not exists public.monatsabschluesse (
  id                    uuid primary key default gen_random_uuid(),
  salon_id              uuid        not null references public.salons(id),
  monat                 date        not null,
  abgeschlossen_am      timestamptz not null default now(),
  abgeschlossen_von     uuid        not null,                  -- der Login
  abgeschlossen_von_name text       not null,
  abgaben_erwartet      integer,
  abgaben_vorhanden     integer,

  constraint monatsabschluesse_monat_erster check (monat = date_trunc('month', monat)::date),
  constraint monatsabschluesse_einmalig unique (salon_id, monat)
);

comment on table public.monatsabschluesse is 'Abgeschlossene Monate (auch unvollständig: abgaben_vorhanden < abgaben_erwartet). Nur über Funktionen les- und schreibbar.';

create table if not exists public.analysen (
  id                     uuid primary key default gen_random_uuid(),
  salon_id               uuid        not null references public.salons(id),
  monat                  date        not null,
  typ                    text        not null check (typ in ('person', 'team_agenda', 'kommentar_qualitaet')),
  person_id              uuid        references public.personen(id) on delete cascade,   -- leer bei team_agenda
  inhalt                 jsonb       not null,                                           -- strukturierte Ausgabe der KI
  text_md                text,                                                           -- lesbare Fassung, bearbeitbar
  modell                 text,
  prompt_version         text,
  input_hash             text,
  status                 text        not null default 'entwurf' check (status in ('entwurf', 'freigegeben')),
  geprueft               boolean     not null default false,                             -- Faktencheck bestanden
  fakten_hinweis         jsonb       not null default '[]'::jsonb,                       -- Zahlen im Text, die nicht in den Daten stehen
  erstellt_am            timestamptz not null default now(),
  bearbeitet_von         uuid,
  bearbeitet_von_name    text,
  bearbeitet_am          timestamptz,
  freigegeben_von        uuid,
  freigegeben_von_name   text,
  freigegeben_am         timestamptz,

  constraint analysen_monat_erster check (monat = date_trunc('month', monat)::date),
  constraint analysen_person_nur_bei_person check ((typ = 'person') = (person_id is not null) or typ = 'kommentar_qualitaet')
);

comment on table public.analysen is 'Einzelanalysen (und später Agenda, Kommentar-Hinweise) als Entwurf oder freigegeben. Nur über Funktionen les- und schreibbar.';

-- Je Salon, Monat, Typ und Person nur eine Analyse (NULL gilt als ein Wert, deshalb der Ausdruck statt eines UNIQUE-Constraints)
create unique index if not exists uq_analysen_einmalig
  on public.analysen (salon_id, monat, typ, coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists idx_analysen_salon_monat on public.analysen (salon_id, monat);

alter table public.monatsabschluesse enable row level security;
alter table public.analysen          enable row level security;
revoke all on public.monatsabschluesse, public.analysen from public, anon, authenticated;


-- 2. Hilfen (intern, nicht aufrufbar) ────────────────────────────────────────

-- Salon der Leitung und Prüfung, ob die Person analysiert werden darf. Gibt den Salon zurück.
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

-- Namen in einem Text durch Platzhalter ersetzen: die bewertete Person → „die bewertete Person“, alle anderen → „Kollege A“, „Kollege B“ …
-- Ersetzt werden vollständiger Name, Vorname und Nachname (ab 3 Buchstaben), ohne Rücksicht auf Groß-/Kleinschreibung.
create or replace function public.analyse_anonymisieren(p_text text, p_ziel uuid, p_salon uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_text  text := p_text;
  r       record;
  teile   text[];
  v_platz text;
begin
  if v_text is null then
    return null;
  end if;
  -- erst die langen Namen, damit „Anna Beck“ nicht zuerst zu „Kollege A Beck“ wird
  for r in
    select p.id, p.name,
           case when p.id = p_ziel then 'die bewertete Person'
                else 'Kollege ' || chr(64 + (row_number() over (partition by (p.id = p_ziel) order by p.name))::integer) end as platz
      from public.personen p
     where p.salon_id = p_salon
     order by length(p.name) desc, p.name
  loop
    teile := regexp_split_to_array(btrim(r.name), '\s+');
    v_platz := r.platz;
    v_text := regexp_replace(v_text, '\m' || regexp_replace(btrim(r.name), '([\\.^$*+?()\[\]{}|])', '\\\1', 'g') || '\M', v_platz, 'gi');
    if array_length(teile, 1) >= 2 and length(teile[1]) >= 3 then
      v_text := regexp_replace(v_text, '\m' || regexp_replace(teile[1], '([\\.^$*+?()\[\]{}|])', '\\\1', 'g') || '\M', v_platz, 'gi');
    end if;
    if array_length(teile, 1) >= 2 and length(teile[array_length(teile, 1)]) >= 3 then
      v_text := regexp_replace(v_text, '\m' || regexp_replace(teile[array_length(teile, 1)], '([\\.^$*+?()\[\]{}|])', '\\\1', 'g') || '\M', v_platz, 'gi');
    end if;
    if array_length(teile, 1) = 1 and length(teile[1]) >= 3 then
      v_text := regexp_replace(v_text, '\m' || regexp_replace(teile[1], '([\\.^$*+?()\[\]{}|])', '\\\1', 'g') || '\M', v_platz, 'gi');
    end if;
  end loop;
  return v_text;
end;
$$;

revoke all on function public.analyse_anonymisieren(text, uuid, uuid) from public, anon, authenticated;

-- Alle Zahlen eines Textes, vereinheitlicht („3,50“ → „3.5“). Listenpunkte wie „1. “ am Zeilenanfang und Datumsstriche zählen nicht als Zahl.
create or replace function public.analyse_zahlen(p_text text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct trim_scale(replace(m[1], ',', '.')::numeric)::text), '{}')
    from regexp_matches(
           regexp_replace(coalesce(p_text, ''), '(^|\n)[ \t]*\d+[.)][ \t]', '\1', 'g'),
           '(?<![\w.,])(\d+(?:[.,]\d+)?)(?![\w])', 'g') as m
$$;

revoke all on function public.analyse_zahlen(text) from public, anon, authenticated;

-- Alle Zahlen, die in der Eingabe stehen (Zahlenwerte und Zahlen in Texten) plus die Bewertungsskala 1 bis 5.
create or replace function public.analyse_erlaubte_zahlen(p_eingabe jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct z), '{}')
    from (
      select trim_scale((v #>> '{}')::numeric)::text as z
        from jsonb_path_query(p_eingabe, 'strict $.**') v
       where jsonb_typeof(v) = 'number'
      union
      select unnest(public.analyse_zahlen(v #>> '{}'))
        from jsonb_path_query(p_eingabe, 'strict $.**') v
       where jsonb_typeof(v) = 'string'
      union
      select g::text from generate_series(1, 5) g
    ) x
$$;

revoke all on function public.analyse_erlaubte_zahlen(jsonb) from public, anon, authenticated;

-- Faktencheck: Welche Zahlen stehen im Text (und in der strukturierten Ausgabe), aber nicht in der Eingabe?
create or replace function public.analyse_faktencheck(p_eingabe jsonb, p_inhalt jsonb, p_text text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with erlaubt as (select unnest(public.analyse_erlaubte_zahlen(p_eingabe)) as z),
       gefunden as (
         select unnest(public.analyse_zahlen(coalesce(p_text, '') || E'\n' || coalesce(p_inhalt::text, ''))) as z),
       unbekannt as (select g.z from gefunden g where g.z not in (select z from erlaubt) order by g.z::numeric)
  select jsonb_build_object(
           'geprueft', not exists (select 1 from unbekannt),
           'unbekannt', coalesce((select jsonb_agg(z order by z::numeric) from unbekannt), '[]'::jsonb))
$$;

revoke all on function public.analyse_faktencheck(jsonb, jsonb, text) from public, anon, authenticated;


-- 3. monat_abschliessen() ────────────────────────────────────────────────────
--  Schließt den Monat ab, auch wenn Abgaben fehlen. Ein zweiter Aufruf aktualisiert nur die Zählung (wer abgeschlossen hat, bleibt stehen).
--  Antwort: { monat, abgeschlossen_am, abgeschlossen_von, abgaben_erwartet, abgaben_vorhanden, unvollstaendig }

create or replace function public.monat_abschliessen(p_monat date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon  uuid;
  v_monat  date;
  v_status jsonb;
  v_ich    public.personen;
  v_erw    integer;
  v_vorh   integer;
  r        public.monatsabschluesse;
begin
  v_salon := public.analyse_zugriff();
  if p_monat is null then
    raise exception 'Der Monat fehlt' using errcode = '22023';
  end if;
  v_monat := date_trunc('month', p_monat)::date;
  if not exists (select 1 from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat) then
    raise exception 'Für diesen Monat gibt es noch keine Abgabe' using errcode = '22023';
  end if;
  select * into v_ich from public.personen where auth_user_id = (select auth.uid()) and aktiv;

  v_status := public.abgabe_status(v_monat);
  v_erw  := (v_status->>'erwartet')::integer;
  v_vorh := (v_status->>'abgegeben')::integer;

  insert into public.monatsabschluesse (salon_id, monat, abgeschlossen_von, abgeschlossen_von_name, abgaben_erwartet, abgaben_vorhanden)
  values (v_salon, v_monat, (select auth.uid()), coalesce(v_ich.name, 'Unbekannt'), v_erw, v_vorh)
  on conflict (salon_id, monat) do update
     set abgaben_erwartet = excluded.abgaben_erwartet, abgaben_vorhanden = excluded.abgaben_vorhanden
  returning * into r;

  return jsonb_build_object(
    'monat', to_char(r.monat, 'YYYY-MM'),
    'abgeschlossen_am', r.abgeschlossen_am,
    'abgeschlossen_von', r.abgeschlossen_von_name,
    'abgaben_erwartet', r.abgaben_erwartet,
    'abgaben_vorhanden', r.abgaben_vorhanden,
    'unvollstaendig', coalesce(r.abgaben_vorhanden < r.abgaben_erwartet, false));
end;
$$;

comment on function public.monat_abschliessen(date) is 'Schließt einen Monat ab (auch unvollständig). Nur Verantwortliche und Admin.';

revoke all on function public.monat_abschliessen(date) from public, anon;
grant execute on function public.monat_abschliessen(date) to authenticated;


-- 4. analyse_eingabe() ───────────────────────────────────────────────────────
--  Die Eingabe für die KI. Alle Zahlen aus SQL, die Kommentare ohne Absender und ohne Namen.
--  Antwort: { eingabe: { … }, hash }  (hash = md5 der Eingabe; die Edge Function bildet daraus mit der Prompt-Version den input_hash)

create or replace function public.analyse_eingabe(p_person uuid, p_monat date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon  uuid;
  v_z      public.salons;
  v_aus    jsonb;
  v_mtext  text;
  v_vor    text;
  v_akt    jsonb;
  v_alt    jsonb;
  v_ein    jsonb;
  v_fremd  jsonb;
  v_eigen  jsonb;
  v_komm   jsonb;
begin
  v_salon := public.analyse_zugriff(p_person);
  select * into v_z from public.salons where id = v_salon;

  v_aus := public.auswertung_person(p_person, null, null, false);   -- ohne Absender
  v_mtext := coalesce(to_char(date_trunc('month', p_monat)::date, 'YYYY-MM'), (select max(m) from jsonb_array_elements_text(v_aus->'monate') m));
  if v_mtext is null or coalesce(jsonb_typeof(v_aus->'detail'->v_mtext->'gesamt'), 'null') = 'null' then
    raise exception 'Für diesen Monat liegt keine Auswertung vor' using errcode = '22023';
  end if;
  select max(m) into v_vor
    from jsonb_array_elements_text(v_aus->'monate') m
   where m < v_mtext and coalesce(jsonb_typeof(v_aus->'detail'->m->'gesamt'), 'null') <> 'null';
  v_akt := v_aus->'detail'->v_mtext;
  v_alt := case when v_vor is null then null else v_aus->'detail'->v_vor end;

  -- Kommentare der Kollegen (anonym) und eigene Kommentare, Namen durch Platzhalter ersetzt
  select coalesce(jsonb_agg(jsonb_build_object('verhalten', (v->>'nr')::integer, 'bewertung', (k->>'note')::integer,
                                               'text', public.analyse_anonymisieren(k->>'text', p_person, v_salon))
                            order by (v->>'nr')::integer, (k->>'note')::integer desc, md5(k->>'text')), '[]'::jsonb)
    into v_fremd
    from jsonb_array_elements(v_akt->'verhalten') v, jsonb_array_elements(v->'kommentare') k;
  select coalesce(jsonb_agg(jsonb_build_object('verhalten', (v->>'nr')::integer, 'text', public.analyse_anonymisieren(v->>'sb_kommentar', p_person, v_salon))
                            order by (v->>'nr')::integer), '[]'::jsonb)
    into v_eigen
    from jsonb_array_elements(v_akt->'verhalten') v
   where nullif(btrim(v->>'sb_kommentar'), '') is not null;

  -- Kennzahlen zu den erhaltenen Kommentaren
  select jsonb_build_object(
           'erhaltene_kommentare', count(*),
           'woerter_schnitt', round(avg(array_length(regexp_split_to_array(btrim(k->>'text'), '\s+'), 1))::numeric, 1))
    into v_komm
    from jsonb_array_elements(v_akt->'verhalten') v, jsonb_array_elements(v->'kommentare') k;

  v_ein := jsonb_build_object(
    'monat',    v_mtext,
    'vormonat', v_vor,
    'schwellen', jsonb_build_object('ausgewogen', v_z.schwelle_ausgewogen, 'niedrig', v_z.schwelle_niedrig, 'hoch', v_z.schwelle_hoch),
    'person',   'die bewertete Person',
    'kennzahlen', jsonb_build_object(
      'selbstbild', (v_akt->'gesamt'->>'sb')::numeric,
      'fremdbild',  (v_akt->'gesamt'->>'fb')::numeric,
      'differenz',  (v_akt->'gesamt'->>'diff')::numeric,
      'anzahl_fremdbilder', (v_akt->'gesamt'->>'anzahl_fremdbilder')::integer,
      'stufe_fremdbild', case when (v_akt->'gesamt'->>'fb') is null then null
                              when (v_akt->'gesamt'->>'fb')::numeric >= v_z.schwelle_hoch then 'hoch'
                              when (v_akt->'gesamt'->>'fb')::numeric <  v_z.schwelle_niedrig then 'niedrig' else 'mittel' end,
      'einordnung', case when (v_akt->'gesamt'->>'diff') is null then null
                         when abs((v_akt->'gesamt'->>'diff')::numeric) <= v_z.schwelle_ausgewogen then 'ausgewogen'
                         when (v_akt->'gesamt'->>'diff')::numeric > 0 then 'selbstueberschaetzung' else 'selbstunterschaetzung' end),
    'vormonat_kennzahlen', case when v_alt is null then null else jsonb_build_object(
      'selbstbild', (v_alt->'gesamt'->>'sb')::numeric,
      'fremdbild',  (v_alt->'gesamt'->>'fb')::numeric,
      'differenz',  (v_alt->'gesamt'->>'diff')::numeric) end,
    'verhalten', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nr', (v->>'nr')::integer,
               'titel', v->>'titel',
               'saeule', v->>'saeule',
               'selbstbild', (v->>'sb')::numeric,
               'fremdbild', (v->>'fb')::numeric,
               'differenz', (v->>'diff')::numeric,
               'stufe_fremdbild', case when (v->>'fb') is null then null
                                       when (v->>'fb')::numeric >= v_z.schwelle_hoch then 'hoch' when (v->>'fb')::numeric < v_z.schwelle_niedrig then 'niedrig' else 'mittel' end,
               'einordnung', case when (v->>'diff') is null then null
                                  when abs((v->>'diff')::numeric) <= v_z.schwelle_ausgewogen then 'ausgewogen'
                                  when (v->>'diff')::numeric > 0 then 'selbstueberschaetzung' else 'selbstunterschaetzung' end,
               'fremdbild_vormonat', (select (x->>'fb')::numeric from jsonb_array_elements(coalesce(v_alt->'verhalten', '[]'::jsonb)) x where (x->>'nr') = (v->>'nr')),
               'veraenderung', case when (select (x->>'fb')::numeric from jsonb_array_elements(coalesce(v_alt->'verhalten', '[]'::jsonb)) x where (x->>'nr') = (v->>'nr')) is null then null
                                    else round((v->>'fb')::numeric - (select (x->>'fb')::numeric from jsonb_array_elements(v_alt->'verhalten') x where (x->>'nr') = (v->>'nr')), 2) end)
             order by (v->>'nr')::integer), '[]'::jsonb)
        from jsonb_array_elements(v_akt->'verhalten') v),
    'kommentare_der_kollegen', v_fremd,
    'eigene_kommentare', v_eigen,
    'kommentar_kennzahlen', v_komm);

  return jsonb_build_object('eingabe', v_ein, 'hash', md5(v_ein::text));
end;
$$;

comment on function public.analyse_eingabe(uuid, date) is
  'Eingabe für die KI-Analyse einer Person: Kennzahlen aus SQL, Kommentare ohne Absender, Namen durch Platzhalter ersetzt. Nur Leitung.';

revoke all on function public.analyse_eingabe(uuid, date) from public, anon;
grant execute on function public.analyse_eingabe(uuid, date) to authenticated;


-- 5. analyse_pruefen() · Faktencheck ohne Speichern ──────────────────────────
--  Antwort: { geprueft: boolean, unbekannt: [ "4.71", … ] }

create or replace function public.analyse_pruefen(p_person uuid, p_monat date, p_inhalt jsonb, p_text text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ein jsonb;
begin
  v_ein := public.analyse_eingabe(p_person, p_monat)->'eingabe';
  return public.analyse_faktencheck(v_ein, p_inhalt, p_text);
end;
$$;

revoke all on function public.analyse_pruefen(uuid, date, jsonb, text) from public, anon;
grant execute on function public.analyse_pruefen(uuid, date, jsonb, text) to authenticated;


-- 6. analyse_speichern() ─────────────────────────────────────────────────────
--  Speichert eine erzeugte Analyse als Entwurf (ersetzt eine vorhandene und setzt sie zurück). Ob die Fakten stimmen, ermittelt die
--  Datenbank selbst. Antwort: die Analyse (siehe analyse_lesen).

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

create or replace function public.analyse_speichern(
  p_person uuid, p_monat date, p_inhalt jsonb, p_text_md text, p_modell text, p_prompt_version text, p_input_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_salon uuid;
  v_ein   jsonb;
  v_fakt  jsonb;
  v_monat date;
  v_id    uuid;
begin
  v_salon := public.analyse_zugriff(p_person);
  if p_inhalt is null or jsonb_typeof(p_inhalt) <> 'object' then
    raise exception 'Die Analyse hat kein gültiges Format' using errcode = '22023';
  end if;
  if nullif(btrim(p_text_md), '') is null then
    raise exception 'Die Analyse enthält keinen Text' using errcode = '22023';
  end if;
  v_ein   := public.analyse_eingabe(p_person, p_monat)->'eingabe';
  v_monat := (v_ein->>'monat' || '-01')::date;
  v_fakt  := public.analyse_faktencheck(v_ein, p_inhalt, p_text_md);

  insert into public.analysen (salon_id, monat, typ, person_id, inhalt, text_md, modell, prompt_version, input_hash, status, geprueft, fakten_hinweis)
  values (v_salon, v_monat, 'person', p_person, p_inhalt, p_text_md, p_modell, p_prompt_version, p_input_hash, 'entwurf',
          (v_fakt->>'geprueft')::boolean, v_fakt->'unbekannt')
  on conflict (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update
     set inhalt = excluded.inhalt, text_md = excluded.text_md, modell = excluded.modell, prompt_version = excluded.prompt_version,
         input_hash = excluded.input_hash, status = 'entwurf', geprueft = excluded.geprueft, fakten_hinweis = excluded.fakten_hinweis,
         erstellt_am = now(), bearbeitet_von = null, bearbeitet_von_name = null, bearbeitet_am = null,
         freigegeben_von = null, freigegeben_von_name = null, freigegeben_am = null
  returning id into v_id;

  return public.analyse_zeile(v_id);
end;
$$;

comment on function public.analyse_speichern(uuid, date, jsonb, text, text, text, text) is
  'Speichert eine erzeugte Einzelanalyse als Entwurf; der Faktencheck läuft in der Datenbank. Nur Leitung.';

revoke all on function public.analyse_speichern(uuid, date, jsonb, text, text, text, text) from public, anon;
grant execute on function public.analyse_speichern(uuid, date, jsonb, text, text, text, text) to authenticated;


-- 7. analyse_lesen(), analyse_bearbeiten(), analyse_freigeben() ──────────────

create or replace function public.analyse_lesen(p_person uuid, p_monat date)
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
  v_salon := public.analyse_zugriff(p_person);
  select a.id into v_id from public.analysen a
   where a.salon_id = v_salon and a.typ = 'person' and a.person_id = p_person and a.monat = date_trunc('month', p_monat)::date;
  return case when v_id is null then null else public.analyse_zeile(v_id) end;
end;
$$;

revoke all on function public.analyse_lesen(uuid, date) from public, anon;
grant execute on function public.analyse_lesen(uuid, date) to authenticated;

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
  select * into a from public.analysen where id = p_id;
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
  v_fakt := public.analyse_faktencheck(v_ein, a.inhalt, p_text_md);

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
  select * into a from public.analysen where id = p_id;
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


-- 8. abschluss_uebersicht() ──────────────────────────────────────────────────
--  Antwort: { monat, monate, abschluss: { … } | null, personen: [ { person_id, name, hat_auswertung, analyse: { … } | null } ],
--             analysen_fertig, analysen_gesamt, freigegeben }
--  Verborgen (Schalter eigene_analyse_nur_admin): die eigene Person des Verantwortlichen.

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
begin
  v_salon := public.analyse_zugriff();
  select * into v_z from public.salons where id = v_salon;
  select p.id into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  v_verborgen := case when v_z.eigene_analyse_nur_admin and not public.ist_admin() then v_ich end;

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
        left join public.analysen an on an.salon_id = v_salon and an.monat = v_monat and an.typ = 'person' and an.person_id = pers.id
    )
    select jsonb_build_object(
      'monat',  to_char(v_monat, 'YYYY-MM'),
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

comment on function public.abschluss_uebersicht(date) is 'Stand von Monatsabschluss und Einzelanalysen eines Monats. Nur Leitung.';

revoke all on function public.abschluss_uebersicht(date) from public, anon;
grant execute on function public.abschluss_uebersicht(date) to authenticated;
