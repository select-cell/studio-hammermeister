# Fokus, Agenda, Termine und Mailversand (Erweiterung F)

Seiten unter **Leitung**: *Fokus* (`/app/leitung/fokus`), *Agenda* (`/app/leitung/agenda/:monat`) und *Termine* (`/app/leitung/termine`, **nur Admin**). Datenbank: Migration `020_fokus_agenda_termine.sql`. Versand: Edge Function `agenda-versand`, Zeitplan: `supabase/versand_einrichten.sql` (von Hand, siehe unten).

## Ablauf

1. Die Leitung markiert unter **Fokus**, welche Verhalten gerade besonders wichtig sind (mit Begründung, optional befristet).
2. Unter **Agenda** erzeugt sie die Agenda für einen Monat. Sie entsteht **aus den Daten, ohne KI**: alle Zahlen aus SQL, der Text aus einer festen Vorlage (`agenda-vorlage-v1`).
3. Die Leitung liest, **bearbeitet** (der Text, wer und wann wird gespeichert) und **gibt frei**. Jede Bearbeitung macht die Agenda wieder zum Entwurf. „Neu aus den Daten erzeugen“ fragt nach, wenn Text bearbeitet oder freigegeben war.
4. Der Admin trägt unter **Termine** die Teammeetings ein (einzeln oder als Serie). Zu jedem Termin gehen **zwei Mails an die Verantwortlichen**: die Agenda einige Tage vorher („vorab“) und eine Erinnerung mit den drei wichtigsten Punkten kurz davor („kurz“).
5. Eine **freigegebene** Agenda steht am Ende des **Monatsberichts als PDF**. Entwürfe nie.

## Fokus-Verhalten

- Tabelle `fokus_verhalten` (gesperrt). Zeitraum `gueltig_ab` bis `gueltig_bis` (leer = bis auf Weiteres, einschließlich dieses Tages), Begründung, wer es angelegt hat.
- „Aus dem Fokus nehmen“ beendet den Eintrag **gestern**; die Geschichte bleibt erhalten, ein späteres „wieder an“ legt einen neuen Eintrag an. „Begründung ändern“ aktualisiert den laufenden Eintrag.
- Ein Verhalten eines anderen Salons ist nicht erreichbar (`42501`). Ein Ende vor dem Beginn wird abgelehnt (`22023`, zusätzlich Constraint).

## Die Agenda

Fünf Blöcke in fester Reihenfolge, das **Zeitbudget prüft die Datenbank** (`agenda_validieren`, sonst `22023`):

| Block | Minuten | Inhalt |
|---|---|---|
| Einstieg und Beteiligung | 2 | Danke, wie viele haben abgegeben |
| Team-Kennzahlen des Monats | 3 | Selbstbild, Fremdbild, Differenz, Stufe, Vergleich zum Vormonat |
| Fokus-Verhalten | 6 bis 8 (Vorlage: 7) | siehe Priorität |
| Entwicklungsfelder und Differenzen | 3 bis 4 (Vorlage: 4) | die drei niedrigsten Fremdbilder, ohne Wiederholung aus dem Fokus-Block |
| Vereinbarungen | 2 bis 3 (Vorlage: 2) | Leitfragen für den nächsten Monat |

Die Summe liegt zwischen 15 und 20 Minuten (Vorlage: 18). Eine Agenda außerhalb wird nicht gespeichert.

**Priorität im Fokus-Block** (höchstens drei Verhalten): 1. die Fokus-Verhalten, 2. die größten Teamdifferenzen über der Ausgewogen-Schwelle, 3. die größten Veränderungen zum Vormonat. Ist nichts davon vorhanden, steht ein Hinweis zum gemeinsamen Entscheiden da.

**Hinweis „Stand unvollständig“:** Ist der Monat nicht abgeschlossen, fehlen Einzelanalysen oder Abgaben, steht das oben in der Agenda („Stand unvollständig: 1 von 7 Einzelanalysen liegen vor.“). Der Hinweis wird beim Erzeugen berechnet; ändert sich der Stand, hilft „Neu aus den Daten erzeugen“.

**Nur Teamebene:** keine Rangliste einzelner Personen, keine Absender. Zu den Fokus-Verhalten stehen auf der **Plattform** bis zu zwei **anonymisierte Kommentar-Beispiele** (Namen durch „die bewertete Person“ bzw. „Kollege A“ … ersetzt), sie erscheinen **nie in Mails und nie im PDF**.

## Termine (nur Admin)

- Tabelle `meeting_termine` (gesperrt). Der Zeitpunkt wird als `timestamptz` gespeichert; eingegeben und angezeigt wird die **Berliner Uhrzeit** (das Formular schickt „2026-10-26T10:00“ ohne Zeitzone, die Datenbank rechnet Sommer-/Winterzeit).
- **Serie** (jede Woche, alle zwei Wochen, jeden Monat, bis 60 Termine): Die Uhrzeit bleibt in Berliner Zeit gleich, auch über die Zeitumstellung (10:00 bleibt 10:00, in UTC wechselt es zwischen 08:00 und 09:00).
- **Bezugsmonat** der Agenda: Standard ist der Monat vor dem Termin (Berliner Zeit), auf Wunsch ein fester Monat.
- **Vorlauf:** Agenda-Mail so viele Tage vorher (Standard 2), Erinnerung so viele Stunden vorher (Standard 1). Mehrere Werte sind erlaubt, der größte löst aus. Eingabe z. B. „3; 1“ oder „0,5“ (ein Komma ist das Dezimalzeichen).
- **Empfänger:** alle aktiven Verantwortlichen des Salons mit E-Mail-Adresse, auf Wunsch zusätzlich der Admin (Kopie). **Mitarbeiter bekommen nie Mails.** Ohne Empfänger wird nichts beansprucht und die Terminliste weist darauf hin.
- Termine werden **nicht gelöscht**, sondern als „entfernt“ gekennzeichnet (keine Mails mehr, das Mail-Protokoll bleibt). „Mails pausieren“ stoppt nur den Versand. Vergangene Termine lassen sich nicht mehr bearbeiten.

## Der Versand

`agenda-versand` läuft alle 15 Minuten (Zeitplan in der Datenbank) und fragt die Datenbank, nicht den Kalender:

1. **`versand_faellig`**: Die Agenda-Mail ist ab „Termin minus größter Vorlauf in Tagen“ fällig, gerechnet in **Berliner Uhrzeit** (Termin Mo 26.10. 10:00, 2 Tage vorher = Sa 24.10. 10:00 Berliner Zeit = 08:00 UTC, nicht 48 Stunden). Die Erinnerung ab „Termin minus größter Vorlauf in Stunden“. **Nach Terminbeginn wird nichts mehr gesendet.** Eine verpasste Agenda-Mail wird bis dahin nachgeholt.
2. **`versand_beanspruchen`**: Genau ein Lauf darf eine Mail senden. `UNIQUE (termin_id, art)` in `mail_log` entscheidet, auch wenn zwei Läufe gleichzeitig kommen. Ein zweiter Lauf bekommt `null` und sendet nichts.
3. **`agenda_fuer_versand`**: die gespeicherte Agenda (Entwurf oder freigegeben), sonst wird die Vorlage erzeugt und als Entwurf gespeichert. Die Zeilen mit Kommentar-Beispielen sind entfernt. Ist der Entwurf noch nicht freigegeben, steht in der Mail „Stand: Entwurf, noch nicht freigegeben“.
4. Senden über **Resend** (Idempotenz-Schlüssel `<termin>-<art>`, damit auch ein abgebrochener Lauf nichts doppelt zustellt).
5. **`versand_abschliessen`**: „gesendet“ oder „fehler“ mit Meldung (höchstens 500 Zeichen).

**Fehler:** Ein Fehler wird im Mail-Protokoll festgehalten und **höchstens dreimal** wiederholt (im 15-Minuten-Takt). Danach gibt der Versand auf; der Admin sieht „nach 3 Versuchen fehlgeschlagen“ mit Grund in der Terminliste und eine Warnung oben. Ein Lauf, der länger als 10 Minuten „in Arbeit“ hängt (Absturz), wird übernommen und zählt als Versuch. Fehlt ein Secret, antwortet die Function mit `503` und fasst die Datenbank nicht an: **so verbraucht eine fehlende Einrichtung keinen Versuch.**

**Die Mails:**

- *vorab:* Betreff „Agenda für Teammeeting am Montag, 26. Oktober 2026“, Termin, alle fünf Blöcke mit Minuten und Punkten, Hinweis „Stand unvollständig“, Link zur Agenda auf der Plattform.
- *kurz:* Betreff „Gleich geht es los: Teammeeting um 10:00 Uhr“, die **drei wichtigsten Punkte** (Fokus zuerst, dann Kennzahlen), Link.
- Ohne Daten für den Bezugsmonat steht ein Hinweis statt einer leeren Agenda. Text und HTML; alle Inhalte sind maskiert. Farben stehen in der Mail fest, weil Mailprogramme keine Design-Tokens kennen.

## Einrichtung (einmalig, durch den Admin)

Die Function ist veröffentlicht, **der Zeitplan ist bewusst nicht aktiv**, bis alles bereit ist (Resend-Schlüssel, bestätigte Domain, Meeting-Termine fehlten bei der Entwicklung).

1. Bei **Resend** ein Konto anlegen, die Absender-Domain bestätigen, einen API-Schlüssel erzeugen.
2. In Supabase unter **Edge Functions → Secrets** setzen: `RESEND_API_KEY`, `MAIL_ABSENDER` (z. B. `Salon Hammermeister <plattform@deine-domain.de>`), `CRON_SECRET` (langer Zufallswert), `PLATTFORM_URL` (z. B. `https://hammermeister.netlify.app`).
3. Unter **Database → Extensions** `pg_cron` und `pg_net` einschalten.
4. Unter **Leitung → Termine** die Teammeetings eintragen.
5. `supabase/versand_einrichten.sql` im SQL-Editor ausführen (vorher das `CRON_SECRET` im Skript eintragen; es landet im Vault, nicht im Zeitplan). Zum Ausprobieren ohne Versand im Zeitplan `body := '{"trocken": true}'` setzen.

Anhalten: `select cron.unschedule('agenda-versand');`. Die Function nutzt `SUPABASE_SERVICE_ROLE_KEY`, den Supabase ihr selbst bereitstellt; der Schlüssel steht nie im Frontend, in der `.env` oder im Repo. Die Versand-Funktionen der Datenbank sind **nur für `service_role`** aufrufbar.

## Rechte

| | Mitarbeiter | Verantwortlicher | Admin | `service_role` |
|---|---|---|---|---|
| Fokus lesen und setzen | `42501` | ja (eigener Salon) | ja | – |
| Agenda erzeugen, lesen, bearbeiten, freigeben | `42501` | ja | ja | – |
| Termine lesen und verwalten | `42501` | `42501` | ja | – |
| `versand_*`, `agenda_fuer_versand` | gesperrt | gesperrt | gesperrt | ja |

Die Tabellen `fokus_verhalten`, `meeting_termine` und `mail_log` sind für alle Anmeldungen gesperrt (auch für den Admin); gelesen wird nur über die Funktionen. Alle internen Hilfen (`agenda_daten`, `agenda_bauen`, `termin_empfaenger` …) sind nicht aufrufbar.

## Tests

- **Datenbank** (PGlite, 218 Prüfungen): Rechte je Rolle und für `anon`; Zeitbudget (16 bis 20 Minuten erlaubt, darunter und darüber, falsche Reihenfolge, fehlende Punkte → `22023`); Fokus (an, ändern, aus, Geschichte, Zukunft, fremder Salon); Agenda (Kennzahlen, Priorität, Hinweis, **kein Name in der Agenda, keine Rangliste**, Ersetzen, Bearbeiten, Freigeben); Termine (Berliner Zeit im Sommer und Winter, Serien über die Zeitumstellung, Fehleingaben, Entfernen); **Fälligkeit über die Zeitumstellung** (25.10.2026: „vorab“ ab 08:00 UTC, nicht 07:59 und nicht erst 09:00; 28.03./29.03.); kein Versand nach Terminbeginn; mehrere Vorläufe; Empfänger (mit und ohne Admin-Kopie, nie Mitarbeiter); **kein Doppelversand** (Beanspruchen, Unique-Constraint), höchstens drei Versuche, hängender Lauf, gesendet bleibt gesendet; `agenda_fuer_versand` ohne Kommentare und Namen; Salon-Grenze.
- **Echte Datenbank:** Funktionen per Fingerabdruck identisch zum lokalen Lauf; ein zurückgerollter Test mit den wichtigsten Fällen (Rechte, Agenda, Termine, Fälligkeit, Beanspruchen).
- **Edge-Function-Logik** (Vitest, 29 Prüfungen): Konfiguration, Secret-Vergleich, Formatierung, beide Mails, Maskierung, Resend-Anfrage (Schlüssel, Idempotenz), Fehlertexte ohne Schlüssel, Ablauf (überspringen, Fehler, Protokoll mit Wiederholung, Begrenzung).
- **Browser:** Rechte und Navigation (Termine nur für den Admin), Fokus, Agenda (erzeugen, bearbeiten, freigeben, Rückfrage, Monatswechsel, Link aus der Mail), Termine (anlegen, Fehleingaben, bearbeiten, pausieren, Serie, entfernen, Fehlerdarstellung), Handy-Breite, Monatsbericht-PDF mit freigegebener, mit Entwurfs- und ohne Agenda.
- **Nicht getestet:** der echte Versand über Resend und der Zeitplan (die Sandbox erreicht weder Supabase noch Resend; Schlüssel und Domain fehlen). Die Function ist eingespielt (`ACTIVE`), der erste echte Lauf geschieht nach der Einrichtung. Ein Probelauf mit `{"trocken": true}` zeigt vorher, was fällig wäre.

## Grenzen

- Die Agenda ist eine **Vorlage aus den Daten**, keine KI-Formulierung. Das ist bewusst: Jede Zahl ist nachprüfbar, und es geht nichts an einen externen Anbieter.
- Der Hinweis „Stand unvollständig“ ist ein Stand vom Zeitpunkt des Erzeugens.
- Die Mail geht als **eine** Mail an alle Empfänger (sie sehen sich gegenseitig; es sind nur Leitung und Admin).
