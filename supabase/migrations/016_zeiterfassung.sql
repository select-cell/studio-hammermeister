-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 016 · Erweiterung B: Zeiterfassung der Monatsumfrage
-- ═══════════════════════════════════════════════════════════════════════════
--  Gemessen wird die AKTIVE Zeit (Seite sichtbar und zuletzt bedient), nicht die Uhrzeit-Differenz
--  zwischen Start und Absenden auf dem Gerät. Die Uhr des Geräts spielt keine Rolle: Start, Herzschlag
--  und Abgabe stempelt der Server, das Gerät liefert nur Zählerstände (aus performance.now()).
--
--  Neu:
--    umfrage_sitzungen         eine Sitzung je Ausfüllversuch (Start, letzter Herzschlag, Abgabe, Zeiten, Kennzeichen)
--    umfrage_schrittzeiten     aktive Sekunden je Schritt (Entwicklung, Rituale, jedes Verhalten)
--    umfrage_starten()         beginnt eine Sitzung oder nimmt die offene wieder auf
--    umfrage_heartbeat()       meldet den Zählerstand, vom Server gedeckelt
--    umfrage_einreichen_v3()   wie v2, dazu Abschluss der Sitzung und Kennzeichen
--    zeit_auswertung()         Auswertung für die Leitung (Median, Spanne, Personen, Zeit je Verhalten)
--    sitzung_buchen()          interne Hilfe: Deckelung und Buchung (nicht aufrufbar)
--    salons.zeit_*             Schwellen der Kennzeichen (stehen in der Datenbank, nicht im Code)
--
--  Regeln:
--    - Nichts wird verworfen. Rohwerte bleiben stehen; auffällige Sitzungen werden nur gekennzeichnet:
--        zu_schnell          aktive Zeit < Anzahl Verhalten × zeit_min_sek_pro_verhalten
--        sehr_lang           Gesamtdauer > zeit_sehr_lang_sek (4 h)
--        viele_pausen        aktive Zeit / Gesamtdauer < zeit_pausen_quote (0,30)
--        wiederaufgenommen   die Sitzung wurde nach einer Unterbrechung (Neuladen, anderes Gerät) fortgesetzt
--        heartbeat_luecke    länger als zeit_heartbeat_luecke_sek (3 min) ohne Herzschlag
--        neu_begonnen        der Nutzer hat mit „Neu beginnen“ von vorn angefangen (die Sitzung ist abgebrochen)
--        ohne_sitzung        abgegeben ohne gestartete Sitzung (z. B. Netz weg beim Start): keine geprüfte Zeit
--      dauer_gueltig ist false bei zu_schnell oder sehr_lang (dann zählt die Zeit nicht in den Schnitten).
--    - Ein Herzschlag darf die aktive Zeit nie senken und höchstens um die echte Zeit seit dem letzten
--      Herzschlag (plus Toleranz) erhöhen, insgesamt nie über die Zeit seit dem Start. Aufgeblähte Werte
--      werden also gekappt statt geglaubt. Bei der Abgabe gilt aktive_sek <= gesamt_sek.
--    - Die Tabellen sind für Anmeldungen komplett gesperrt (wie alle umfrage_*-Tabellen); jeder sieht
--      seine eigene Zeit nur über die Antwort seiner Abgabe, die Leitung über zeit_auswertung().
--    - umfrage_einreichen_v2 bleibt vorerst aufrufbar, damit die bisher ausgelieferte Version der Plattform
--      weiter abgibt. Sobald die neue Version online ist, wird v2 für Anmeldungen gesperrt (Migration 017).
--
--  Das alte Feld umfrage_abgaben.ausfuelldauer_sek (Auswertungen 006, 011, 012) wird mit der aktiven Zeit
--  gefüllt, wenn sie gültig ist (60 bis 86400 s); gestartet_am mit dem Serverstart.
--
--  Idempotent, ohne DROP (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Schwellen im Salon ──────────────────────────────────────────────────────

alter table public.salons
  add column if not exists zeit_min_sek_pro_verhalten smallint     not null default 5     check (zeit_min_sek_pro_verhalten >= 0),
  add column if not exists zeit_sehr_lang_sek         integer      not null default 14400 check (zeit_sehr_lang_sek > 0),
  add column if not exists zeit_pausen_quote          numeric(3,2) not null default 0.30  check (zeit_pausen_quote between 0 and 1),
  add column if not exists zeit_heartbeat_luecke_sek  integer      not null default 180   check (zeit_heartbeat_luecke_sek > 0),
  add column if not exists zeit_toleranz_sek          smallint     not null default 10    check (zeit_toleranz_sek >= 0);

comment on column public.salons.zeit_min_sek_pro_verhalten is 'Unter so vielen aktiven Sekunden je Verhalten gilt eine Abgabe als „zu_schnell“.';
comment on column public.salons.zeit_sehr_lang_sek         is 'Über so vielen Sekunden Gesamtdauer gilt eine Abgabe als „sehr_lang“ (Standard 4 Stunden).';
comment on column public.salons.zeit_pausen_quote          is 'Unter diesem Anteil aktiv an der Gesamtdauer gilt eine Abgabe als „viele_pausen“.';
comment on column public.salons.zeit_heartbeat_luecke_sek  is 'Ohne Herzschlag länger als so viele Sekunden: Kennzeichen „heartbeat_luecke“.';
comment on column public.salons.zeit_toleranz_sek          is 'So viele Sekunden darf ein Herzschlag über der echten Zeit seit dem letzten liegen (Netzwerk-Schwankung).';


-- 2. Sitzungen und Schrittzeiten ─────────────────────────────────────────────

create table if not exists public.umfrage_sitzungen (
  id                 uuid primary key default gen_random_uuid(),
  salon_id           uuid        not null references public.salons(id),
  person_id          uuid        not null references public.personen(id) on delete cascade,
  monat              date        not null,                       -- 1. des Monats, wie umfrage_abgaben.monat
  gestartet_server   timestamptz not null default now(),         -- Serveruhr, nie die des Geräts
  letzter_heartbeat  timestamptz not null default now(),
  abgegeben_server   timestamptz,
  aktive_sek         integer     not null default 0,
  gesamt_sek         integer,                                    -- erst bei der Abgabe
  abgabe_id          uuid references public.umfrage_abgaben(id) on delete set null,
  flags              text[]      not null default '{}',
  dauer_gueltig      boolean,                                    -- erst bei der Abgabe; null = unbekannt

  constraint sitzungen_monat_erster          check (monat = date_trunc('month', monat)::date),
  constraint sitzungen_aktive_sek_positiv    check (aktive_sek >= 0),
  constraint sitzungen_gesamt_sek_positiv    check (gesamt_sek is null or gesamt_sek >= 0),
  constraint sitzungen_aktiv_hoechstens_ges  check (gesamt_sek is null or aktive_sek <= gesamt_sek),
  constraint sitzungen_einmalig              unique (person_id, monat, gestartet_server)
);

comment on table public.umfrage_sitzungen is
  'Ein Ausfüllversuch der Monatsumfrage mit Serverzeiten und aktiver Zeit. Nur über Funktionen les- und schreibbar.';

create index if not exists idx_sitzungen_salon_monat  on public.umfrage_sitzungen (salon_id, monat);
create index if not exists idx_sitzungen_person_monat on public.umfrage_sitzungen (person_id, monat);
create index if not exists idx_sitzungen_abgabe       on public.umfrage_sitzungen (abgabe_id);

-- Je Person und Monat gibt es höchstens eine offene Sitzung (auch bei zwei Tabs gleichzeitig)
create unique index if not exists uq_sitzungen_offen
  on public.umfrage_sitzungen (person_id, monat)
  where abgegeben_server is null and not (flags @> array['neu_begonnen']::text[]);

create table if not exists public.umfrage_schrittzeiten (
  sitzung_id     uuid        not null references public.umfrage_sitzungen(id) on delete cascade,
  schritt_index  smallint    not null check (schritt_index >= 0),   -- Reihenfolge in der Umfrage (0 = Frontblatt)
  verhalten_nr   smallint,                                          -- nur bei Verhalten-Seiten
  verhalten_id   uuid references public.verhalten(id) on delete set null,
  aktive_sek     integer     not null default 0 check (aktive_sek >= 0),
  primary key (sitzung_id, schritt_index)
);

comment on table public.umfrage_schrittzeiten is 'Aktive Sekunden je Schritt einer Sitzung (Entwicklung, Rituale, Verhalten).';

alter table public.umfrage_sitzungen     enable row level security;
alter table public.umfrage_schrittzeiten enable row level security;
-- Keine Policies und keine Rechte: Zugriff nur über die Funktionen unten (security definer)
revoke all on public.umfrage_sitzungen, public.umfrage_schrittzeiten from public, anon, authenticated;


-- 3. sitzung_buchen() · Deckelung und Buchung (intern) ───────────────────────
--  Nimmt den gemeldeten Zählerstand und speichert ihn, so weit er plausibel ist:
--    - nie weniger als bisher,
--    - höchstens so viel mehr wie echte Serverzeit seit dem letzten Herzschlag verging (plus Toleranz),
--    - insgesamt nie mehr als die Zeit seit dem Start.
--  Die Schrittzeiten dürfen zusammen nie mehr wachsen als die aktive Zeit selbst: Der freigegebene
--  Zuwachs wird in aufsteigender Schrittreihenfolge auf die Schritte verteilt.
--  Gibt die gespeicherte aktive Zeit zurück, bei einer geschlossenen Sitzung null.

create or replace function public.sitzung_buchen(p_sitzung uuid, p_aktive integer, p_schritte jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.umfrage_sitzungen;
  z        public.salons;
  v_seit   numeric;
  v_ziel   integer;
  v_rest   integer;
  v_flags  text[];
  e        record;
  v_alt    integer;
  v_add    integer;
begin
  select * into s
    from public.umfrage_sitzungen
   where id = p_sitzung and abgegeben_server is null and not (flags @> array['neu_begonnen']::text[])
     for update;
  if s.id is null then
    return null;
  end if;
  select * into z from public.salons where id = s.salon_id;

  v_seit := greatest(extract(epoch from (now() - s.letzter_heartbeat)), 0);

  v_ziel := greatest(coalesce(p_aktive, s.aktive_sek), s.aktive_sek);
  v_ziel := least(
    v_ziel,
    s.aktive_sek + floor(v_seit)::integer + z.zeit_toleranz_sek,
    greatest(floor(extract(epoch from (now() - s.gestartet_server)))::integer, s.aktive_sek));

  -- Schrittzeiten: nur steigend, zusammen höchstens um den freigegebenen Zuwachs
  v_rest := v_ziel - s.aktive_sek;
  if v_rest > 0 then
    for e in
      select case when (x->>'index') ~ '^\d{1,3}$' then (x->>'index')::smallint end as idx,
             case when (x->>'sek')   ~ '^\d{1,7}$' then (x->>'sek')::integer     end as sek,
             case when (x->>'nr')    ~ '^\d{1,4}$' then (x->>'nr')::smallint     end as nr
        from jsonb_array_elements(case when jsonb_typeof(p_schritte) = 'array' then p_schritte else '[]'::jsonb end) x
       where jsonb_typeof(x) = 'object'
       order by 1
       limit 200
    loop
      continue when e.idx is null or e.sek is null;
      exit when v_rest <= 0;
      select t.aktive_sek into v_alt
        from public.umfrage_schrittzeiten t
       where t.sitzung_id = s.id and t.schritt_index = e.idx;
      v_alt := coalesce(v_alt, 0);
      v_add := least(greatest(e.sek - v_alt, 0), v_rest);
      if v_add > 0 then
        insert into public.umfrage_schrittzeiten (sitzung_id, schritt_index, verhalten_nr, verhalten_id, aktive_sek)
        values (s.id, e.idx, e.nr,
                (select vh.id from public.verhalten vh where vh.salon_id = s.salon_id and vh.nr = e.nr),
                v_add)
        on conflict (sitzung_id, schritt_index)
        do update set aktive_sek = public.umfrage_schrittzeiten.aktive_sek + v_add;
        v_rest := v_rest - v_add;
      end if;
    end loop;
  end if;

  v_flags := s.flags;
  if v_seit > z.zeit_heartbeat_luecke_sek and not (v_flags @> array['heartbeat_luecke']::text[]) then
    v_flags := v_flags || array['heartbeat_luecke']::text[];
  end if;

  update public.umfrage_sitzungen
     set aktive_sek = v_ziel, letzter_heartbeat = now(), flags = v_flags
   where id = s.id;
  return v_ziel;
end;
$$;

comment on function public.sitzung_buchen(uuid, integer, jsonb) is
  'Intern: speichert den gemeldeten Zählerstand einer offenen Sitzung, gedeckelt auf die echte Serverzeit.';

revoke all on function public.sitzung_buchen(uuid, integer, jsonb) from public, anon, authenticated;


-- 4. umfrage_starten() ───────────────────────────────────────────────────────
--  Beginnt eine Sitzung für den Monat oder nimmt die offene wieder auf (Neuladen, Gerätewechsel).
--  p_neu: „Neu beginnen“ – die offene Sitzung wird als abgebrochen (neu_begonnen) beendet, es startet eine neue.
--  Antwort: { sitzung_id, aktive_sek, wiederaufgenommen, schritte: [ { index, nr, sek } ] }

create or replace function public.umfrage_starten(p_monat date, p_neu boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p        public.personen;
  v_s        public.umfrage_sitzungen;
  v_wieder   boolean := false;
  v_schritte jsonb;
begin
  select * into v_p
    from public.personen
   where auth_user_id = (select auth.uid()) and aktiv and nimmt_an_teamumfrage;
  if v_p.id is null then
    raise exception 'Kein Zugang zur Teamumfrage' using errcode = '42501';
  end if;
  if p_monat is null or p_monat <> date_trunc('month', p_monat)::date then
    raise exception 'Der Monat fehlt oder ist ungültig' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('umfrage_sitzung:' || v_p.id::text || ':' || p_monat::text, 0));

  if exists (select 1 from public.umfrage_abgaben a where a.feedbackgeber_id = v_p.id and a.monat = p_monat) then
    raise exception 'Für diesen Monat wurde die Umfrage bereits abgegeben.' using errcode = '23505';
  end if;
  if not exists (select 1 from public.offene_monate_von(v_p.id) o where o.monat = p_monat) then
    raise exception 'Für diesen Monat kann keine Umfrage abgegeben werden.' using errcode = '22023';
  end if;

  if coalesce(p_neu, false) then
    update public.umfrage_sitzungen
       set flags = flags || array['neu_begonnen']::text[]
     where person_id = v_p.id and monat = p_monat
       and abgegeben_server is null and not (flags @> array['neu_begonnen']::text[]);
  end if;

  select * into v_s
    from public.umfrage_sitzungen
   where person_id = v_p.id and monat = p_monat
     and abgegeben_server is null and not (flags @> array['neu_begonnen']::text[])
     for update;

  if v_s.id is not null then
    -- Fortsetzen: der Herzschlag-Takt beginnt neu, die Unterbrechung selbst zählt nicht als Zeit
    update public.umfrage_sitzungen
       set letzter_heartbeat = now(),
           flags = case when flags @> array['wiederaufgenommen']::text[] then flags else flags || array['wiederaufgenommen']::text[] end
     where id = v_s.id
     returning * into v_s;
    v_wieder := true;
  else
    insert into public.umfrage_sitzungen (salon_id, person_id, monat)
    values (v_p.salon_id, v_p.id, p_monat)
    returning * into v_s;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('index', t.schritt_index, 'nr', t.verhalten_nr, 'sek', t.aktive_sek)
                            order by t.schritt_index), '[]'::jsonb)
    into v_schritte
    from public.umfrage_schrittzeiten t
   where t.sitzung_id = v_s.id;

  return jsonb_build_object(
    'sitzung_id',        v_s.id,
    'aktive_sek',        v_s.aktive_sek,
    'wiederaufgenommen', v_wieder,
    'schritte',          v_schritte);
end;
$$;

comment on function public.umfrage_starten(date, boolean) is
  'Beginnt eine Sitzung für den Monat oder nimmt die offene wieder auf; Start stempelt der Server.';

revoke all on function public.umfrage_starten(date, boolean) from public, anon;
grant execute on function public.umfrage_starten(date, boolean) to authenticated;


-- 5. umfrage_heartbeat() ─────────────────────────────────────────────────────
--  Meldet den Zählerstand (aktive Sekunden gesamt und je Schritt, jeweils kumuliert).
--  Antwort: { offen: true, aktive_sek } oder { offen: false } bei geschlossener Sitzung (kein Fehler:
--  ein später Herzschlag nach dem Absenden soll nichts zerstören).

create or replace function public.umfrage_heartbeat(p_sitzung uuid, p_aktive_sek integer, p_schritte jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s     public.umfrage_sitzungen;
  v_aktiv integer;
begin
  select s.* into v_s
    from public.umfrage_sitzungen s
    join public.personen p on p.id = s.person_id
   where s.id = p_sitzung
     and p.auth_user_id = (select auth.uid()) and p.aktiv and p.nimmt_an_teamumfrage;
  if v_s.id is null then
    raise exception 'Sitzung nicht gefunden' using errcode = '42501';
  end if;

  v_aktiv := public.sitzung_buchen(v_s.id, p_aktive_sek, p_schritte);
  if v_aktiv is null then
    return jsonb_build_object('offen', false);
  end if;
  return jsonb_build_object('offen', true, 'aktive_sek', v_aktiv);
end;
$$;

comment on function public.umfrage_heartbeat(uuid, integer, jsonb) is
  'Meldet den Zählerstand einer eigenen offenen Sitzung; der Server deckelt auf die echte Zeit.';

revoke all on function public.umfrage_heartbeat(uuid, integer, jsonb) from public, anon;
grant execute on function public.umfrage_heartbeat(uuid, integer, jsonb) to authenticated;


-- 6. umfrage_einreichen_v3() ─────────────────────────────────────────────────
--  Die Abgabe selbst prüft und speichert umfrage_einreichen_v2 (Monat offen, vollständig, Pflichtkommentare,
--  Doppelabgabe 23505). Danach wird die Sitzung abgeschlossen. Fehlt der Herzschlag-Strom ganz, genügt der
--  Zählerstand aus dieser Abgabe; fehlt auch die Sitzung, wird die Abgabe als „ohne_sitzung“ vermerkt.
--  Antwort: { id, aktive_sek } – die eigene aktive Zeit für die Abschlussseite.

create or replace function public.umfrage_einreichen_v3(
  payload jsonb, p_sitzung uuid default null, p_aktive_sek integer default null, p_schritte jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p        public.personen;
  v_z        public.salons;
  v_s        public.umfrage_sitzungen;
  v_monat    date;
  v_text     text := nullif(btrim(payload->>'monat'), '');
  v_id       uuid;
  v_gesamt   integer;
  v_aktiv    integer;
  v_nv       integer;
  v_flags    text[];
  v_gueltig  boolean;
begin
  select * into v_p
    from public.personen
   where auth_user_id = (select auth.uid()) and aktiv and nimmt_an_teamumfrage;
  if v_p.id is null then
    raise exception 'Kein Zugang zur Teamumfrage' using errcode = '42501';
  end if;
  if v_text is null or v_text !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Der Monat fehlt oder ist ungültig' using errcode = '22023';
  end if;
  v_monat := (v_text || '-01')::date;
  select * into v_z from public.salons where id = v_p.salon_id;

  perform pg_advisory_xact_lock(hashtextextended('umfrage_sitzung:' || v_p.id::text || ':' || v_monat::text, 0));

  -- Welche Sitzung? Die angegebene (muss mir gehören), sonst die offene dieses Monats, sonst keine
  if p_sitzung is not null then
    select * into v_s from public.umfrage_sitzungen where id = p_sitzung and person_id = v_p.id for update;
    if v_s.id is null then
      raise exception 'Sitzung nicht gefunden' using errcode = '42501';
    end if;
    if v_s.monat <> v_monat then
      raise exception 'Die Sitzung gehört zu einem anderen Monat' using errcode = '22023';
    end if;
    if v_s.abgegeben_server is not null then
      raise exception 'Für diesen Monat wurde die Umfrage bereits abgegeben.' using errcode = '23505';
    end if;
    if v_s.flags @> array['neu_begonnen']::text[] then
      raise exception 'Diese Sitzung wurde beendet (neu begonnen)' using errcode = '22023';
    end if;
  else
    select * into v_s
      from public.umfrage_sitzungen
     where person_id = v_p.id and monat = v_monat
       and abgegeben_server is null and not (flags @> array['neu_begonnen']::text[])
       for update;
  end if;

  -- Die Abgabe selbst; bei jedem Fehler wird alles zurückgerollt, auch die Sitzung bleibt dann offen
  v_id := public.umfrage_einreichen_v2(payload);

  -- Keine Sitzung vorhanden: Abgabe vermerken, aber keine ungeprüfte Zeit der Geräteuhr übernehmen
  if v_s.id is null then
    insert into public.umfrage_sitzungen
      (salon_id, person_id, monat, gestartet_server, letzter_heartbeat, abgegeben_server,
       aktive_sek, gesamt_sek, abgabe_id, flags, dauer_gueltig)
    values (v_p.salon_id, v_p.id, v_monat, now(), now(), now(), 0, 0, v_id, array['ohne_sitzung']::text[], null);
    update public.umfrage_abgaben set ausfuelldauer_sek = null where id = v_id;
    return jsonb_build_object('id', v_id, 'aktive_sek', null);
  end if;

  -- Letzten Zählerstand buchen (gedeckelt), dann die Sitzung abschließen
  perform public.sitzung_buchen(v_s.id, p_aktive_sek, p_schritte);
  select * into v_s from public.umfrage_sitzungen where id = v_s.id;

  v_gesamt := greatest(floor(extract(epoch from (now() - v_s.gestartet_server)))::integer, 0);
  v_aktiv  := least(v_s.aktive_sek, v_gesamt);

  select count(*) into v_nv from public.verhalten vh where vh.salon_id = v_p.salon_id and vh.aktiv;

  v_flags := v_s.flags;
  if v_aktiv < v_nv * v_z.zeit_min_sek_pro_verhalten then
    v_flags := v_flags || array['zu_schnell']::text[];
  end if;
  if v_gesamt > v_z.zeit_sehr_lang_sek then
    v_flags := v_flags || array['sehr_lang']::text[];
  end if;
  if v_gesamt > 0 and v_aktiv::numeric / v_gesamt < v_z.zeit_pausen_quote then
    v_flags := v_flags || array['viele_pausen']::text[];
  end if;
  v_gueltig := not (v_flags @> array['zu_schnell']::text[] or v_flags @> array['sehr_lang']::text[]);

  update public.umfrage_sitzungen
     set abgegeben_server = now(), gesamt_sek = v_gesamt, aktive_sek = v_aktiv,
         abgabe_id = v_id, flags = v_flags, dauer_gueltig = v_gueltig
   where id = v_s.id;

  -- Altes Feld der Auswertungen: aktive Zeit, wenn gültig und plausibel (Constraint 60 bis 86400 s)
  update public.umfrage_abgaben
     set gestartet_am = v_s.gestartet_server,
         ausfuelldauer_sek = case when v_gueltig and v_aktiv between 60 and 86400 then v_aktiv end
   where id = v_id;

  return jsonb_build_object('id', v_id, 'aktive_sek', v_aktiv);
end;
$$;

comment on function public.umfrage_einreichen_v3(jsonb, uuid, integer, jsonb) is
  'Speichert die Abgabe (über umfrage_einreichen_v2) und schließt die Sitzung ab: Gesamtdauer vom Server, aktive Zeit gedeckelt, Kennzeichen.';

revoke all on function public.umfrage_einreichen_v3(jsonb, uuid, integer, jsonb) from public, anon;
grant execute on function public.umfrage_einreichen_v3(jsonb, uuid, integer, jsonb) to authenticated;


-- 7. zeit_auswertung() · nur Leitung ─────────────────────────────────────────
--  Antwort:
--    { monat: 'YYYY-MM' | null, monate: ['YYYY-MM', …], schwellen: {…},
--      team: { abgaben, gueltig, median_aktiv_min, min_aktiv_min, max_aktiv_min, median_gesamt_min },
--      personen: [ { person_id, name, aktiv_min, gesamt_min, flags, dauer_gueltig, abgebrochen, verhalten: { "<nr>": sek } } ],
--      verhalten: [ { nr, titel, median_sek, n } ] }
--  Die Schnitte zählen nur Sitzungen mit dauer_gueltig <> false; die Personenliste zeigt alle, auffällige mit Kennzeichen.

create or replace function public.zeit_auswertung(p_monat date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon  uuid;
  v_z      public.salons;
  v_monat  date;
begin
  if not public.ist_leitung() then
    raise exception 'Nur für Verantwortliche und Admin' using errcode = '42501';
  end if;
  v_salon := public.auswertung_salon_id();
  select * into v_z from public.salons where id = v_salon;
  if v_z.id is null then
    return jsonb_build_object('monat', null, 'monate', '[]'::jsonb);
  end if;

  v_monat := coalesce(
    date_trunc('month', p_monat)::date,
    (select max(s.monat) from public.umfrage_sitzungen s where s.salon_id = v_salon and s.abgegeben_server is not null));

  return jsonb_build_object(
    'monat', to_char(v_monat, 'YYYY-MM'),
    'monate', coalesce((select jsonb_agg(to_char(m.monat, 'YYYY-MM') order by m.monat desc)
                          from (select distinct s.monat from public.umfrage_sitzungen s
                                 where s.salon_id = v_salon and s.abgegeben_server is not null) m), '[]'::jsonb),
    'schwellen', jsonb_build_object(
      'min_sek_pro_verhalten', v_z.zeit_min_sek_pro_verhalten,
      'sehr_lang_min',         round(v_z.zeit_sehr_lang_sek / 60.0),
      'pausen_quote',          v_z.zeit_pausen_quote,
      'luecke_min',            round(v_z.zeit_heartbeat_luecke_sek / 60.0, 1)),
    'team', (
      select jsonb_build_object(
        'abgaben', count(*),
        'gueltig', count(*) filter (where s.dauer_gueltig is not false and 'ohne_sitzung' <> all (s.flags)),
        'median_aktiv_min', round(((percentile_cont(0.5) within group (order by s.aktive_sek)
                                    filter (where s.dauer_gueltig is not false and 'ohne_sitzung' <> all (s.flags))))::numeric / 60.0, 1),
        'min_aktiv_min', round((min(s.aktive_sek) filter (where s.dauer_gueltig is not false and 'ohne_sitzung' <> all (s.flags))) / 60.0, 1),
        'max_aktiv_min', round((max(s.aktive_sek) filter (where s.dauer_gueltig is not false and 'ohne_sitzung' <> all (s.flags))) / 60.0, 1),
        'median_gesamt_min', round(((percentile_cont(0.5) within group (order by s.gesamt_sek)
                                     filter (where s.dauer_gueltig is not false and 'ohne_sitzung' <> all (s.flags))))::numeric / 60.0, 1))
        from public.umfrage_sitzungen s
       where s.salon_id = v_salon and s.monat = v_monat and s.abgegeben_server is not null),
    'personen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'person_id', p.id,
               'name', p.name,
               'aktiv_min', case when 'ohne_sitzung' = any (s.flags) then null else round(s.aktive_sek / 60.0, 1) end,
               'gesamt_min', case when 'ohne_sitzung' = any (s.flags) then null else round(s.gesamt_sek / 60.0, 1) end,
               'flags', to_jsonb(s.flags),
               'dauer_gueltig', s.dauer_gueltig,
               'abgebrochen', (select count(*) from public.umfrage_sitzungen a
                                where a.person_id = s.person_id and a.monat = s.monat and a.flags @> array['neu_begonnen']::text[]),
               'verhalten', coalesce((select jsonb_object_agg(t.verhalten_nr::text, t.aktive_sek)
                                        from public.umfrage_schrittzeiten t
                                       where t.sitzung_id = s.id and t.verhalten_nr is not null), '{}'::jsonb))
             order by p.name)
        from public.umfrage_sitzungen s
        join public.personen p on p.id = s.person_id
       where s.salon_id = v_salon and s.monat = v_monat and s.abgegeben_server is not null), '[]'::jsonb),
    'verhalten', coalesce((
      select jsonb_agg(jsonb_build_object('nr', vh.nr, 'titel', vh.titel, 'median_sek', z.median, 'n', coalesce(z.n, 0)) order by vh.nr)
        from public.verhalten vh
        left join lateral (
          select round(percentile_cont(0.5) within group (order by t.aktive_sek)::numeric) as median, count(*) as n
            from public.umfrage_schrittzeiten t
            join public.umfrage_sitzungen s on s.id = t.sitzung_id
           where t.verhalten_nr = vh.nr and s.salon_id = v_salon and s.monat = v_monat
             and s.abgegeben_server is not null and s.dauer_gueltig is not false and 'ohne_sitzung' <> all (s.flags)
        ) z on true
       where vh.salon_id = v_salon and vh.aktiv), '[]'::jsonb));
end;
$$;

comment on function public.zeit_auswertung(date) is
  'Zeit-Auswertung der Umfrage für Verantwortliche und Admin: Median/Spanne, Personen mit Kennzeichen, Zeit je Verhalten.';

revoke all on function public.zeit_auswertung(date) from public, anon;
grant execute on function public.zeit_auswertung(date) to authenticated;


-- 8. Ansicht v_ausfuelldauer (Dashboard/SQL-Editor) liest jetzt aus den Sitzungen ────────────
--  Spaltenreihenfolge der alten Ansicht bleibt, neue Spalten stehen am Ende.

create or replace view public.v_ausfuelldauer
with (security_invoker = true) as
select
  a.salon,
  a.monat,
  a.feedbackgeber                                                     as person,
  round(case when 'ohne_sitzung' = any (s.flags) then null else coalesce(s.aktive_sek, a.ausfuelldauer_sek) end / 60.0, 1) as dauer_min,
  round(avg(case when 'ohne_sitzung' = any (s.flags) then null else coalesce(s.aktive_sek, a.ausfuelldauer_sek) end)
          filter (where s.dauer_gueltig is not false)
          over (partition by a.salon, a.monat) / 60.0, 1)             as team_schnitt_min,
  round(s.gesamt_sek / 60.0, 1)                                       as gesamt_min,
  s.flags,
  s.dauer_gueltig
from public.umfrage_abgaben a
left join public.umfrage_sitzungen s on s.abgabe_id = a.id
order by a.salon, a.monat desc, a.feedbackgeber;

revoke all on public.v_ausfuelldauer from anon, authenticated;
