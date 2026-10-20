-- Migration 007: Login nur mit bestätigter E-Mail-Adresse mit einer Person verknüpfen
--
-- Hintergrund: Die Plattform meldet per E-Mail und Passwort an (kein Magic Link). Die Verknüpfung
-- von Login und Person läuft über die E-Mail-Adresse (001). Ohne weitere Prüfung könnte sich jemand
-- selbst mit der Adresse eines Teammitglieds registrieren und wäre damit dieser Person zugeordnet.
-- Darum wird nur verknüpft, wenn die Adresse bestätigt ist. Vom Admin angelegte Logins mit
-- „Auto Confirm User“ sind von Beginn an bestätigt; alle anderen werden erst mit der Bestätigung
-- verknüpft. Zusätzlich gehört „Allow new users to sign up“ in Supabase auf aus (README).
--
-- Idempotent und ohne DROP (siehe CLAUDE.md).

-- 3a) Person angelegt/geändert: gibt es den bestätigten Login schon, sofort verknüpfen
create or replace function public.personen_vorbereiten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email := lower(btrim(new.email));
  new.name  := btrim(new.name);

  if new.auth_user_id is null then
    select u.id into new.auth_user_id
    from auth.users u
    where lower(u.email) = new.email
      and u.email_confirmed_at is not null
    limit 1;
  end if;

  return new;
end;
$$;

-- 3b) Login angelegt, E-Mail geändert oder bestätigt: passende Person verknüpfen
create or replace function public.auth_nutzer_verknuepfen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;

  update public.personen
     set auth_user_id = new.id
   where email = lower(btrim(new.email))
     and auth_user_id is null;
  return new;
end;
$$;

create or replace trigger auth_nutzer_verknuepfen
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.auth_nutzer_verknuepfen();

revoke all on function public.personen_vorbereiten()     from public, anon, authenticated;
revoke all on function public.auth_nutzer_verknuepfen()  from public, anon, authenticated;
