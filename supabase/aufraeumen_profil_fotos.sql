-- ═══════════════════════════════════════════════════════════════════════════
--  Aufräumen: Profil, Fotos und Teamvorstellung ganz aus der Datenbank entfernen
-- ═══════════════════════════════════════════════════════════════════════════
--  Keine Migration, sondern ein Wartungsskript für den Supabase SQL-Editor (das Supabase-Werkzeug führt Anweisungen mit
--  „drop“ und „delete“ nicht aus). Nur nötig, wenn du die Datenbank ganz aufräumen willst; die Plattform braucht nichts
--  davon (Migration 015 hat alles schon stillgelegt).
--
--  Entfernt: die Zugriffsregeln, die Funktionen für Profil, Foto und Teamvorstellung, die Prüfungen und Spalten an personen.
--  Den leeren Bucket „profilbilder“ löschst du im Supabase-Dashboard unter Storage (direkt per SQL ist das gesperrt).
--  ich() bleibt in der Fassung aus Migration 014 (zusätzliche Felder, die leer sind). Die Fassung aus 001 steht in
--  supabase/migrations/001_salons_personen.sql, falls du sie zurückholen willst.
--  Vorher prüfen: select count(*) from storage.objects where bucket_id = 'profilbilder';  (soll 0 sein)
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists profilbilder_lesen    on storage.objects;
drop policy if exists profilbilder_anlegen  on storage.objects;
drop policy if exists profilbilder_ersetzen on storage.objects;
drop policy if exists profilbilder_entfernen on storage.objects;

drop function if exists public.team_profile();
drop function if exists public.profil_speichern(text, text);
drop function if exists public.foto_einwilligung_setzen(boolean);
drop function if exists public.foto_pfad_setzen(text);
drop function if exists public.foto_pfad_entfernen();
drop function if exists public.admin_foto_entfernen(uuid);
drop function if exists public.profilbild_lesbar(text);
drop function if exists public.profilbild_schreibbar(text);
drop function if exists public.profilbild_entfernbar(text);

alter table public.personen
  drop constraint if exists personen_foto_nur_mit_einwilligung,
  drop constraint if exists personen_kurztext_laenge,
  drop constraint if exists personen_position_laenge,
  drop column if exists foto_pfad,
  drop column if exists foto_einwilligung_am,
  drop column if exists kurztext,
  drop column if exists "position";
