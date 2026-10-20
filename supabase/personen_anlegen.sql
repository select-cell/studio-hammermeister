-- ═══════════════════════════════════════════════════════════════════════════
--  Vorlage · Personen anlegen (Hammermeister)
-- ═══════════════════════════════════════════════════════════════════════════
--  Keine Migration, sondern eine Vorlage für den Admin:
--
--    1. Unten statt „HIER-EMAIL-EINTRAGEN“ die echten E-Mail-Adressen einsetzen.
--       Zeilen ohne „@“ werden übersprungen, die Vorlage ist also gefahrlos ausführbar.
--    2. Im Supabase SQL-Editor ausführen. Bereits vorhandene E-Mails bleiben unverändert.
--    3. Danach unter  Authentication → Users → „Invite user“  dieselben Adressen einladen.
--       Ein Trigger verknüpft Login und Person automatisch über die E-Mail
--       (auch in umgekehrter Reihenfolge).
--
--  Michael Hammermeister ist Verantwortlicher UND Teil des Teams (nimmt_an_teamumfrage = true).
--  Schreibweise „Behzad Pour Sakha“ ist bestätigt.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.personen (salon_id, name, email, rolle, nimmt_an_teamumfrage)
select s.id, v.name, v.email, v.rolle, v.nimmt_an_teamumfrage
from public.salons s
cross join (values
  ('Michael Hammermeister', 'HIER-EMAIL-EINTRAGEN', 'verantwortlicher', true),
  ('Antonella Stipic',      'HIER-EMAIL-EINTRAGEN', 'mitarbeiter',      true),
  ('Jaroslaw Schatalov',    'HIER-EMAIL-EINTRAGEN', 'mitarbeiter',      true),
  ('Behzad Pour Sakha',     'HIER-EMAIL-EINTRAGEN', 'mitarbeiter',      true),
  ('Olena Pankova',         'HIER-EMAIL-EINTRAGEN', 'mitarbeiter',      true),
  ('Lena Reifschneider',    'HIER-EMAIL-EINTRAGEN', 'mitarbeiter',      true)
) as v(name, email, rolle, nimmt_an_teamumfrage)
where s.name = 'Hammermeister'
  and v.email like '%@%'
on conflict (email) do nothing;

-- Admin (Plattformbetreiber): gehört zu keinem Salon und nimmt nicht an der Umfrage teil
insert into public.personen (salon_id, name, email, rolle, nimmt_an_teamumfrage)
select null::uuid, v.name, v.email, 'admin', false
from (values
  ('Plattformbetreiber', 'HIER-EMAIL-EINTRAGEN')
) as v(name, email)
where v.email like '%@%'
on conflict (email) do nothing;
