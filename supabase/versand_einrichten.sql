-- ═══════════════════════════════════════════════════════════════════════════
--  Versand der Agenda-Mails einrichten (Erweiterung F)
-- ═══════════════════════════════════════════════════════════════════════════
--  KEINE nummerierte Migration: Das Skript legt einen Zeitplan an, der erst Sinn hat, wenn der Mail-Versand fertig eingerichtet ist.
--  Der Admin führt es einmal im SQL-Editor von Supabase aus, wenn Folgendes erledigt ist:
--
--    1. Edge Function „agenda-versand“ ist veröffentlicht (ohne JWT-Prüfung; das Secret prüft die Function selbst).
--    2. Unter Edge Functions → Secrets sind gesetzt:
--         CRON_SECRET     langer Zufallswert (z. B. 40 Zeichen), derselbe Wert steht unten in diesem Skript
--         RESEND_API_KEY  API-Schlüssel von Resend (resend.com)
--         MAIL_ABSENDER   z. B. Salon Muster <plattform@deine-domain.de>  (Domain bei Resend bestätigt)
--         PLATTFORM_URL   Adresse der Plattform, z. B. https://dein-salon.netlify.app
--    3. Unter Database → Extensions sind pg_cron und pg_net eingeschaltet.
--    4. Termine sind eingetragen (Plattform → Leitung → Termine, nur Admin).
--
--  Vorher im Skript eintragen (zwei Stellen, beide mit HIER_ markiert): das CRON_SECRET und die Projekt-Referenz Deiner Supabase-Instanz
--  (Project Settings → General → Reference ID; die Adresse der Function lautet https://<REFERENZ>.supabase.co/functions/v1/agenda-versand).
--
--  Was das Skript tut:
--    - legt das CRON_SECRET im Vault ab (nicht im Klartext im Zeitplan),
--    - plant „agenda-versand“ alle 15 Minuten ein. Die Function entscheidet selbst, ob eine Mail fällig ist (Tage und Stunden
--      vor dem Termin in Berliner Zeit) und sendet nie doppelt (Mail-Protokoll mit UNIQUE je Termin und Art).
--
--  Ausprobieren ohne Versand: Im Zeitplan unten body := '{"trocken": true}' setzen, dann zeigt die Antwort nur, was fällig wäre.
--  Kontrolle:   select * from cron.job_run_details order by start_time desc limit 10;
--               select id, status_code, content from net._http_response order by created desc limit 10;
--  Anhalten:    select cron.unschedule('agenda-versand');
--
--  Idempotent: Ein zweiter Lauf ersetzt Secret und Zeitplan (gleicher Name).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. CRON_SECRET im Vault ────────────────────────────────────────────────────
do $$
declare
  -- HIER das CRON_SECRET eintragen (dasselbe wie bei den Edge-Function-Secrets):
  v_secret constant text := 'HIER_DAS_CRON_SECRET_EINTRAGEN';
  v_id     uuid;
begin
  if v_secret = 'HIER_DAS_CRON_SECRET_EINTRAGEN' or length(v_secret) < 24 then
    raise exception 'Bitte zuerst das CRON_SECRET (mindestens 24 Zeichen) in diesem Skript eintragen.';
  end if;
  select id into v_id from vault.secrets where name = 'agenda_cron_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'agenda_cron_secret', 'Secret für den Aufruf der Edge Function agenda-versand');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
end
$$;

-- 2. Zeitplan: alle 15 Minuten ───────────────────────────────────────────────
do $$
declare
  -- HIER die Projekt-Referenz Deiner Supabase-Instanz eintragen (nur der Teil vor „.supabase.co“):
  v_referenz constant text := 'HIER_DIE_PROJEKT_REFERENZ_EINTRAGEN';
begin
  if v_referenz = 'HIER_DIE_PROJEKT_REFERENZ_EINTRAGEN' or v_referenz !~ '^[a-z0-9]{10,30}$' then
    raise exception 'Bitte zuerst die Projekt-Referenz (Project Settings → General → Reference ID) in diesem Skript eintragen.';
  end if;
  perform cron.schedule(
    'agenda-versand',
    '*/15 * * * *',
    format($job$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'content-type', 'application/json',
                     'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_cron_secret')),
        body    := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    $job$, 'https://' || v_referenz || '.supabase.co/functions/v1/agenda-versand')
  );
end
$$;
