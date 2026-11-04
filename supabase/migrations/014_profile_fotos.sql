-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 014 · Profile, Fotos und Teamvorstellung (Plattform-Erweiterungen, Phase A)
-- ═══════════════════════════════════════════════════════════════════════════
--  HINWEIS: Der Auftraggeber braucht keine Teamvorstellung. Diese Migration wurde eingespielt und mit Migration 015
--  wieder stillgelegt (alle Zugriffe gesperrt). Die App benutzt nichts davon.
--
--  Jede Person kann ein Foto, eine Position und einen Kurztext für die Teamseite hinterlegen.
--  Das Foto ist freiwillig und nur mit ausdrücklicher Einwilligung möglich.
--
--  Datenmodell:
--    personen.foto_pfad              Pfad im privaten Bucket „profilbilder“: <salon_id>/<person_id>.webp
--    personen.position               z. B. „Stylistin“ (höchstens 80 Zeichen)
--    personen.kurztext               Kurzvorstellung (höchstens 280 Zeichen)
--    personen.foto_einwilligung_am   nur gesetzt, wenn die Person aktiv zugestimmt hat
--
--  Regeln (serverseitig, nicht im Frontend):
--    - Ohne Einwilligung gibt es kein Foto: Eine Prüfung (Constraint) lässt foto_pfad nur mit Einwilligung zu,
--      der Upload wird von den Storage-Regeln abgelehnt, und es kommt keine Signed URL zurück.
--    - Lesen dürfen eingeloggte Personen desselben Salons (Admin: der Salon dieser Instanz).
--    - Hochladen und Ersetzen darf nur die Person selbst. Entfernen darf die Person selbst und der Admin (Moderation).
--    - Position und Kurztext fremder Profile kann niemand ändern, auch nicht der Verantwortliche oder Admin.
--    - Geschrieben wird nur über die Funktionen unten; die Tabelle personen bleibt für Nutzer schreibgeschützt.
--
--  Idempotent (siehe CLAUDE.md). Nur für den Salon Hammermeister gedacht (eine Instanz).
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Spalten und Prüfungen ───────────────────────────────────────────────────

alter table public.personen
  add column if not exists foto_pfad            text,
  add column if not exists position             text,
  add column if not exists kurztext             text,
  add column if not exists foto_einwilligung_am timestamptz;

comment on column public.personen.foto_pfad            is 'Pfad des Profilfotos im privaten Bucket profilbilder (<salon_id>/<person_id>.webp). Nur mit Einwilligung.';
comment on column public.personen.position             is 'Position für die Teamvorstellung, höchstens 80 Zeichen.';
comment on column public.personen.kurztext             is 'Kurzvorstellung für die Teamvorstellung, höchstens 280 Zeichen.';
comment on column public.personen.foto_einwilligung_am is 'Zeitpunkt, an dem die Person der Anzeige von Foto und Kurzvorstellung zugestimmt hat. Leer = keine Einwilligung.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'personen_kurztext_laenge' and conrelid = 'public.personen'::regclass) then
    alter table public.personen add constraint personen_kurztext_laenge check (kurztext is null or char_length(kurztext) <= 280);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'personen_position_laenge' and conrelid = 'public.personen'::regclass) then
    alter table public.personen add constraint personen_position_laenge check ("position" is null or char_length("position") <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'personen_foto_nur_mit_einwilligung' and conrelid = 'public.personen'::regclass) then
    alter table public.personen add constraint personen_foto_nur_mit_einwilligung check (foto_pfad is null or foto_einwilligung_am is not null);
  end if;
end;
$$;


-- 2. Privater Bucket ─────────────────────────────────────────────────────────
--    Gespeichert wird nur, was der Browser erzeugt hat: quadratisch, 512 × 512 px, WebP (JPEG nur als Notlösung für
--    Browser ohne WebP-Export), ohne EXIF-Daten. Der Bucket nimmt deshalb nur diese Typen und höchstens 1 MB an.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profilbilder', 'profilbilder', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;


-- 3. Regeln für den Zugriff auf die Dateien ──────────────────────────────────
--    Die Prüfungen stehen in Funktionen, die als Besitzer laufen (so müssen sich die Storage-Regeln nicht selbst
--    durch die Regeln von personen fragen). Die Funktionen sind für eingeloggte Nutzer aufrufbar, geben aber nur
--    wahr/falsch zurück.

-- Darf die aufrufende Person die Datei lesen (Signed URL)? Nur im eigenen Salon und nur mit Einwilligung des Besitzers.
create or replace function public.profilbild_lesbar(p_pfad text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.personen eig
     where eig.aktiv
       and eig.foto_einwilligung_am is not null
       and eig.salon_id is not null
       and eig.salon_id = public.auswertung_salon_id()
       and exists (select 1 from public.personen ich where ich.auth_user_id = (select auth.uid()) and ich.aktiv)
       and p_pfad = eig.salon_id::text || '/' || eig.id::text || '.webp'
  )
$$;

-- Darf die aufrufende Person genau diese Datei hochladen oder ersetzen? Nur die eigene, und nur mit Einwilligung.
create or replace function public.profilbild_schreibbar(p_pfad text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.personen ich
     where ich.auth_user_id = (select auth.uid())
       and ich.aktiv
       and ich.salon_id is not null
       and ich.foto_einwilligung_am is not null
       and p_pfad = ich.salon_id::text || '/' || ich.id::text || '.webp'
  )
$$;

-- Darf die aufrufende Person die Datei entfernen? Die eigene, und fremde nur der Admin (Moderation) im Salon dieser Instanz.
-- Zum Entfernen muss die Datei auch lesbar sein (Postgres wendet beim Suchen die Lese-Regel mit an). Der Browser entfernt die Datei
-- deshalb, solange die Einwilligung noch gilt, und widerruft erst danach.
create or replace function public.profilbild_entfernbar(p_pfad text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.personen ich
      join public.personen eig on p_pfad = eig.salon_id::text || '/' || eig.id::text || '.webp'
     where ich.auth_user_id = (select auth.uid())
       and ich.aktiv
       and (ich.id = eig.id or (ich.rolle = 'admin' and eig.salon_id = public.auswertung_salon_id()))
  )
$$;

revoke all on function public.profilbild_lesbar(text), public.profilbild_schreibbar(text), public.profilbild_entfernbar(text) from public, anon;
grant execute on function public.profilbild_lesbar(text), public.profilbild_schreibbar(text), public.profilbild_entfernbar(text) to authenticated;

-- Die Regeln auf storage.objects (Row Level Security ist dort schon eingeschaltet).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'profilbilder_lesen') then
    create policy profilbilder_lesen on storage.objects
      for select to authenticated
      using (bucket_id = 'profilbilder' and public.profilbild_lesbar(name));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'profilbilder_anlegen') then
    create policy profilbilder_anlegen on storage.objects
      for insert to authenticated
      with check (bucket_id = 'profilbilder' and public.profilbild_schreibbar(name));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'profilbilder_ersetzen') then
    create policy profilbilder_ersetzen on storage.objects
      for update to authenticated
      using (bucket_id = 'profilbilder' and public.profilbild_schreibbar(name))
      with check (bucket_id = 'profilbilder' and public.profilbild_schreibbar(name));
  end if;
end;
$$;

-- Entfernen: die eigene Datei und, zur Moderation, jede Datei im Salon durch den Admin (eigener Abschnitt, damit er sich
-- bei Bedarf einzeln einspielen lässt).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'profilbilder_entfernen') then
    create policy profilbilder_entfernen on storage.objects
      for delete to authenticated
      using (bucket_id = 'profilbilder' and public.profilbild_entfernbar(name));
  end if;
end;
$$;


-- 4. ich(): die eigene Person fürs Frontend, jetzt mit Profil ────────────────
--    Alle bisherigen Felder bleiben unverändert; neu sind position, kurztext, foto_pfad und foto_einwilligung.

create or replace function public.ich()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',                   p.id,
    'name',                 p.name,
    'email',                p.email,
    'rolle',                p.rolle,
    'nimmt_an_teamumfrage', p.nimmt_an_teamumfrage,
    'aktiv',                p.aktiv,
    'aktiv_ab',             p.aktiv_ab,
    'position',             p."position",
    'kurztext',             p.kurztext,
    'foto_pfad',            case when p.foto_einwilligung_am is not null then p.foto_pfad end,
    'foto_einwilligung',    p.foto_einwilligung_am is not null,
    'salon', case when s.id is null then null else jsonb_build_object(
      'id',                       s.id,
      'name',                     s.name,
      'start_monat',              s.start_monat,
      'schwelle_ausgewogen',      s.schwelle_ausgewogen,
      'schwelle_niedrig',         s.schwelle_niedrig,
      'schwelle_hoch',            s.schwelle_hoch,
      'reminder_tage_nach_frist', s.reminder_tage_nach_frist
    ) end
  )
  from public.personen p
  left join public.salons s on s.id = p.salon_id
  where p.auth_user_id = (select auth.uid())
$$;

comment on function public.ich() is 'Eigene Person samt Salon und Profil für das Frontend; null, wenn der Login keiner Person zugeordnet ist.';

revoke all on function public.ich() from public, anon;
grant execute on function public.ich() to authenticated;


-- 5. Teamvorstellung ─────────────────────────────────────────────────────────
--    Alle aktiven Personen des eigenen Salons, die zum Team gehören (Teilnehmer der Teamumfrage und Verantwortliche).
--    Position, Kurztext und Foto gibt es nur, wenn die Person eingewilligt hat. Kein Zugriff auf E-Mail oder Rolle.

create or replace function public.team_profile()
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

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',               p.id,
             'name',             p.name,
             'einwilligung',     p.foto_einwilligung_am is not null,
             'position',         case when p.foto_einwilligung_am is not null then p."position" end,
             'kurztext',         case when p.foto_einwilligung_am is not null then p.kurztext end,
             'foto_pfad',        case when p.foto_einwilligung_am is not null then p.foto_pfad end
           ) order by p.name)
      from public.personen p
     where p.salon_id = v_salon
       and p.aktiv
       and (p.nimmt_an_teamumfrage or p.rolle = 'verantwortlicher')
  ), '[]'::jsonb);
end;
$$;

comment on function public.team_profile() is 'Teamvorstellung: aktive Personen des eigenen Salons. Position, Kurztext und Foto nur bei Einwilligung.';

revoke all on function public.team_profile() from public, anon;
grant execute on function public.team_profile() to authenticated;


-- 6. Eigenes Profil ändern ───────────────────────────────────────────────────

create or replace function public.profil_speichern(p_position text, p_kurztext text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos text := nullif(btrim(p_position), '');
  v_txt text := nullif(btrim(p_kurztext), '');
begin
  if v_pos is not null and char_length(v_pos) > 80 then
    raise exception 'Die Position darf höchstens 80 Zeichen lang sein.' using errcode = '22023';
  end if;
  if v_txt is not null and char_length(v_txt) > 280 then
    raise exception 'Der Kurztext darf höchstens 280 Zeichen lang sein.' using errcode = '22023';
  end if;

  update public.personen
     set "position" = v_pos, kurztext = v_txt
   where auth_user_id = (select auth.uid()) and aktiv;
  if not found then
    raise exception 'Kein Zugang' using errcode = '42501';
  end if;
end;
$$;

-- Einwilligung geben oder widerrufen. Beim Widerruf verschwindet das Foto aus der Datenbank (die Datei entfernt der Browser).
create or replace function public.foto_einwilligung_setzen(p_ja boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ja then
    update public.personen
       set foto_einwilligung_am = coalesce(foto_einwilligung_am, now())
     where auth_user_id = (select auth.uid()) and aktiv;
  else
    update public.personen
       set foto_einwilligung_am = null, foto_pfad = null
     where auth_user_id = (select auth.uid()) and aktiv;
  end if;
  if not found then
    raise exception 'Kein Zugang' using errcode = '42501';
  end if;
end;
$$;

-- Das hochgeladene Foto der eigenen Person eintragen. Nur der eigene Pfad, und nur mit Einwilligung.
create or replace function public.foto_pfad_setzen(p_pfad text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.personen;
begin
  select * into v_p from public.personen where auth_user_id = (select auth.uid()) and aktiv;
  if v_p.id is null then
    raise exception 'Kein Zugang' using errcode = '42501';
  end if;
  if v_p.salon_id is null then
    raise exception 'Dein Profil gehört zu keinem Salon, ein Foto ist deshalb nicht möglich.' using errcode = '22023';
  end if;
  if v_p.foto_einwilligung_am is null then
    raise exception 'Ohne deine Einwilligung gibt es kein Foto.' using errcode = '22023';
  end if;
  if p_pfad is distinct from v_p.salon_id::text || '/' || v_p.id::text || '.webp' then
    raise exception 'Ungültiger Pfad für das Foto.' using errcode = '22023';
  end if;
  update public.personen set foto_pfad = p_pfad where id = v_p.id;
end;
$$;

-- Das eigene Foto aus dem Profil nehmen (die Datei entfernt der Browser).
create or replace function public.foto_pfad_entfernen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.personen set foto_pfad = null where auth_user_id = (select auth.uid()) and aktiv;
  if not found then
    raise exception 'Kein Zugang' using errcode = '42501';
  end if;
end;
$$;

-- Moderation: Der Admin nimmt das Foto einer Person aus dem Profil (die Datei entfernt der Browser). Nur im Salon dieser Instanz.
create or replace function public.admin_foto_entfernen(p_person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ist_admin() then
    raise exception 'Nur für den Admin' using errcode = '42501';
  end if;
  update public.personen set foto_pfad = null
   where id = p_person and salon_id = public.auswertung_salon_id();
  if not found then
    raise exception 'Person nicht gefunden' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.profil_speichern(text, text)     is 'Eigene Position und eigenen Kurztext speichern (nur die eigene Zeile).';
comment on function public.foto_einwilligung_setzen(boolean) is 'Foto-Einwilligung der eigenen Person geben oder widerrufen (Widerruf entfernt auch den Foto-Pfad).';
comment on function public.foto_pfad_setzen(text)           is 'Eigenen Foto-Pfad eintragen; nur <salon_id>/<person_id>.webp und nur mit Einwilligung.';
comment on function public.foto_pfad_entfernen()            is 'Eigenen Foto-Pfad entfernen.';
comment on function public.admin_foto_entfernen(uuid)       is 'Admin: Foto einer Person aus dem Profil nehmen (Moderation).';

revoke all on function public.profil_speichern(text, text), public.foto_einwilligung_setzen(boolean), public.foto_pfad_setzen(text),
                       public.foto_pfad_entfernen(), public.admin_foto_entfernen(uuid) from public, anon;
grant execute on function public.profil_speichern(text, text), public.foto_einwilligung_setzen(boolean), public.foto_pfad_setzen(text),
                          public.foto_pfad_entfernen(), public.admin_foto_entfernen(uuid) to authenticated;
