-- ═══════════════════════════════════════════════════════════════════════════
--  Fingerabdruck von Version 1.3 (nur Lesen, ändert nichts)
-- ═══════════════════════════════════════════════════════════════════════════
--  Fasst alle Datenbank-Objekte der Version 1.3 (Migrationen 016 bis 021) zu einem Fingerabdruck zusammen: Funktionen (Quelltext und Rechte),
--  Tabellen und Ansichten (Spalten, Constraints, Indizes, Rechte) und die neuen Spalten in „salons“.
--  Im SQL-Editor der Ziel-Plattform ausführen und mit dem Referenzwert in docs/ki-funktionen.md (Abschnitt 10: 267 Objekte, 9d184733f4ac9726d34c3c1b26839663) vergleichen:
--  Gleicher Fingerabdruck = dieselbe Version 1.3. Weicht er ab, zeigt „objekte“ je Objekt einen Kurz-Hash; mit dem Referenz-Lauf zeilenweise
--  vergleichen (diff), dann ist das abweichende Objekt schnell gefunden.
--  Bekannte Ursache für Abweichungen: Kommentare IM Funktionsrumpf, die beim Einspielen fehlten, oder eine andere Postgres-Hauptversion.
-- ═══════════════════════════════════════════════════════════════════════════

with t as (
  select 'fn:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as obj,
         md5(pg_get_functiondef(p.oid)) || ' anon=' || has_function_privilege('anon', p.oid, 'execute')::text
           || ' auth=' || has_function_privilege('authenticated', p.oid, 'execute')::text
           || ' svc=' || has_function_privilege('service_role', p.oid, 'execute')::text as h
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in (
       -- 016 Zeiterfassung
       'umfrage_starten', 'umfrage_heartbeat', 'umfrage_einreichen_v3', 'zeit_auswertung', 'sitzung_buchen',
       -- 017 PDF-Export
       'pdf_monatsbericht', 'pdf_personenbericht', 'pdf_export_protokoll',
       -- 018 Kommentar-Auswertung
       'kommentar_auswertung',
       -- 019 Monatsabschluss und Einzelanalyse
       'analyse_zugriff', 'analyse_anonymisieren', 'analyse_zahlen', 'analyse_erlaubte_zahlen', 'analyse_faktencheck', 'monat_abschliessen',
       'analyse_eingabe', 'analyse_pruefen', 'analyse_zeile', 'analyse_speichern', 'analyse_lesen', 'analyse_bearbeiten', 'analyse_freigeben', 'abschluss_uebersicht',
       -- 020 Fokus, Agenda, Termine, Versand
       'fokus_am', 'fokus_liste', 'fokus_umschalten', 'agenda_validieren', 'agenda_daten', 'agenda_bauen', 'agenda_speichern_intern', 'agenda_erzeugen',
       'agenda_lesen', 'agenda_bearbeiten', 'agenda_freigeben', 'termin_admin_salon', 'termin_empfaenger', 'termine_liste', 'termin_speichern',
       'termine_serie', 'termin_entfernen', 'versand_faellig', 'versand_beanspruchen', 'versand_abschliessen', 'agenda_fuer_versand',
       'agenda_zahl', 'agenda_diff', 'agenda_monatsname', 'agenda_bezugsmonat',
       -- 021 KI-Funktionen
       'ki_zugriff', 'ki_monat', 'ki_kriterien', 'ki_anreichern', 'ki_kontext_lesen', 'ki_kontext_speichern', 'analyse_eingabe_ki', 'analyse_ki_speichern',
       'team_basis', 'gesamt_basis', 'gesamt_eingabe', 'gesamt_pruefen', 'gesamt_speichern', 'gesamt_lesen', 'gesamt_bearbeiten', 'gesamt_freigeben',
       'agenda_ki_basis', 'agenda_ki_eingabe', 'agenda_ki_validieren', 'agenda_ki_punkte', 'agenda_pruef_text', 'agenda_ki_pruefen', 'agenda_ki_speichern')
  union all
  select 'view:' || c.relname, md5(pg_get_viewdef(c.oid)) || ' opts=' || coalesce(array_to_string(c.reloptions, ','), '')
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('v_ausfuelldauer', 'v_kommentar_metriken')
  union all
  select 'col:' || table_name || '.' || column_name, md5(data_type || '|' || is_nullable || '|' || coalesce(column_default, ''))
    from information_schema.columns
   where table_schema = 'public'
     and (table_name in ('umfrage_sitzungen', 'umfrage_schrittzeiten', 'pdf_export_log', 'monatsabschluesse', 'analysen', 'fokus_verhalten', 'meeting_termine', 'mail_log', 'v_ausfuelldauer', 'v_kommentar_metriken')
          or (table_name = 'salons' and (column_name like 'zeit\_%' or column_name like 'ki\_%' or column_name = 'eigene_analyse_nur_admin')))
  union all
  select 'con:' || conrelid::regclass::text || '.' || conname, md5(pg_get_constraintdef(oid))
    from pg_constraint
   where contype <> 'n'
     and (conrelid::regclass::text in ('umfrage_sitzungen', 'umfrage_schrittzeiten', 'pdf_export_log', 'monatsabschluesse', 'analysen', 'fokus_verhalten', 'meeting_termine', 'mail_log')
          or (conrelid::regclass::text = 'salons' and (conname like 'salons\_zeit%' or conname like 'salons\_ki%')))
  union all
  select 'idx:' || indexname, md5(indexdef)
    from pg_indexes
   where schemaname = 'public' and tablename in ('umfrage_sitzungen', 'umfrage_schrittzeiten', 'pdf_export_log', 'monatsabschluesse', 'analysen', 'fokus_verhalten', 'meeting_termine', 'mail_log')
  union all
  select 'rechte:' || c.relname,
         c.relrowsecurity::text || ' anon_sel=' || has_table_privilege('anon', c.oid, 'select')::text || ' auth_sel=' || has_table_privilege('authenticated', c.oid, 'select')::text
           || ' auth_ins=' || has_table_privilege('authenticated', c.oid, 'insert')::text || ' auth_upd=' || has_table_privilege('authenticated', c.oid, 'update')::text
           || ' auth_del=' || has_table_privilege('authenticated', c.oid, 'delete')::text
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('umfrage_sitzungen', 'umfrage_schrittzeiten', 'pdf_export_log', 'monatsabschluesse', 'analysen', 'fokus_verhalten', 'meeting_termine', 'mail_log', 'v_ausfuelldauer', 'v_kommentar_metriken')
)
select count(*) as anzahl,
       md5(string_agg(obj || '=' || h, '|' order by obj collate "C")) as fingerabdruck,
       string_agg(obj || ' ' || left(md5(h), 8), E'\n' order by obj collate "C") as objekte
  from t;
