-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 015 · Profil, Fotos und Teamvorstellung stillgelegt
-- ═══════════════════════════════════════════════════════════════════════════
--  Entscheidung des Auftraggebers: Die Plattform braucht keine Teamvorstellung, keine Profile und keine Fotos.
--  Migration 014 war schon eingespielt. Damit davon nichts mehr benutzbar bleibt, wird alles stillgelegt:
--
--    - Die vier Zugriffsregeln des Foto-Speichers lassen nichts mehr durch (Lesen, Anlegen, Ersetzen, Entfernen).
--    - Die Funktionen für Profil, Foto und Teamvorstellung sind für eingeloggte Nutzer nicht mehr aufrufbar.
--
--  Bewusst nicht entfernt: die Spalten an personen, der (leere, private) Bucket und die Funktionen selbst. Das Entfernen
--  braucht Löschbefehle, die das Supabase-Werkzeug nicht ausführt; wer die Datenbank ganz aufräumen will, führt
--  supabase/aufraeumen_profil_fotos.sql im SQL-Editor aus. Die App benutzt nichts davon.
--
--  Idempotent (siehe CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'profilbilder_lesen') then
    alter policy profilbilder_lesen on storage.objects using (false);
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'profilbilder_anlegen') then
    alter policy profilbilder_anlegen on storage.objects with check (false);
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'profilbilder_ersetzen') then
    alter policy profilbilder_ersetzen on storage.objects using (false) with check (false);
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'profilbilder_entfernen') then
    alter policy profilbilder_entfernen on storage.objects using (false);
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.team_profile()',
    'public.profil_speichern(text, text)',
    'public.foto_einwilligung_setzen(boolean)',
    'public.foto_pfad_setzen(text)',
    'public.foto_pfad_entfernen()',
    'public.admin_foto_entfernen(uuid)',
    'public.profilbild_lesbar(text)',
    'public.profilbild_schreibbar(text)',
    'public.profilbild_entfernbar(text)'
  ]
  loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end;
$$;
