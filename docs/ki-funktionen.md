# KI-Funktionen (Version 1.3)

Drei Funktionen formuliert eine KI, alles andere macht die Datenbank:

| Funktion | Wo | Ergebnis |
|---|---|---|
| **Einzelanalyse** | Leitung → Monatsabschluss, je Person (und als **Sammellauf** für alle fehlenden) | Gesprächsgrundlage: Stärken, Entwicklungsfelder, auffällige Differenzen, Empfehlung |
| **Gesamtauswertung** (Monatsauswertung des Teams) | Leitung → Monatsabschluss, Abschnitt „Gesamtauswertung“ | Text über das ganze Team, nur Teamwerte |
| **Agenda mit KI** | Leitung → Agenda, „Mit KI formulieren“ | Agenda für das Teammeeting: Blöcke und Zeiten stehen fest, die KI schreibt die Punkte |

Die Agenda aus der Vorlage (ohne KI, Erweiterung F) bleibt daneben bestehen und funktioniert auch, wenn die KI ausfällt.

Dieses Dokument gilt für **jede** Salon-Plattform (eigene Instanz mit eigenem Supabase-Projekt). Was salon-spezifisch ist, steht in Abschnitt 9. Es ist das Gegenstück zum Master-Dokument „KI-Auswertungen und Teammeeting-Agenda“ (Herkunft: Plattform DAWIID, Version 1.3); die Abweichungen von diesem Master stehen in Abschnitt 11.

---

## 1. Das Prinzip

- **Zahlen kommen nur aus SQL.** Die Datenbank rechnet alles und baut die Eingabe für die KI. Die KI formuliert nur Text.
- **Die Datenbank prüft die Antwort:** Aufbau (bei der Agenda: Blöcke, Reihenfolge, Minuten, Summe) und **jede Zahl im Text** (Faktencheck, `analyse_faktencheck`). „Geprüft“ rechnet nur die Datenbank, nie die KI und nie die Oberfläche.
- **Ein Mensch gibt frei.** Jeder Text ist zuerst ein Entwurf, gekennzeichnet mit „Von der KI formuliert“. Auch ein Text, der den Faktencheck nicht besteht, wird als Entwurf gespeichert und mit den auffälligen Zahlen angezeigt; die Leitung entscheidet.
- **Ein Weg zur KI, und nur einer:** Plattform → Webhook (n8n) → Anthropic → Antwort des Webhooks → Plattform. Es gibt keinen direkten Aufruf der Anthropic-API und keinen Rückfall.

## 2. Wer darf was

Eine Stelle entscheidet: `analyse_zugriff()` und `ki_zugriff()` in der Datenbank (Migration 021).

| Schalter | Standard | Wirkung |
|---|---|---|
| `salons.ki_nur_admin` | **an** | Nur der **Admin** darf Einzelanalysen und die Gesamtauswertung erstellen, lesen, bearbeiten und freigeben und die Agenda von der KI formulieren lassen. |

- Mit ausgeschaltetem Schalter (`update public.salons set ki_nur_admin = false;`) dürfen auch Verantwortliche. Den Kontext für die KI (Abschnitt 4) pflegt **immer nur der Admin**.
- Die **Agenda** bleibt für Verantwortliche wie bisher les-, bearbeit- und freigebbar (Vorlage und KI-Fassung); nur das **KI-Formulieren** ist Sache des Admins.
- **Verhaltensänderung gegenüber Version 1.2:** Dort durften Verantwortliche Einzelanalysen erstellen. Mit dem neuen Standard sehen sie diese nicht mehr, bis `ki_nur_admin` ausgeschaltet wird. `abschluss_uebersicht()` liefert dann `ki_erlaubt: false`, und die Seite zeigt statt der KI-Bereiche einen Hinweis.
- Mitarbeiter haben keinen Zugang. Die Rolle wird bei jedem Aufruf neu geprüft; das Frontend filtert nichts.
- **Kein `service_role`-Schlüssel im Frontend:** Die App prüft beim Start den Schlüssel aus der `.env`. Ein geheimer Schlüssel (`service_role`, `sb_secret_…`) oder jede andere Rolle als `anon` verhindert den Start mit einer klaren Meldung.

## 3. Der Weg der Daten

```
Browser (Admin)
   │  POST { aufgabe, monat, person_id?, neu?, ausgenommen? }  + Anmeldung (JWT)
   ▼
Edge Function „analyse-erstellen“   (verify_jwt an, nur Anmeldung der Person + anon-Schlüssel, kein service_role)
   │  1. Eingabe holen:  RPC analyse_eingabe_ki / gesamt_eingabe / agenda_ki_eingabe   (die Datenbank entscheidet über das Recht)
   │  2. gleiche Eingabe + gleiche Prompt-Version wie gespeichert → nichts tun (kein KI-Aufruf)
   │  3. POST an den Webhook, mit der Anmeldung der Person
   ▼
n8n (Webhook)  →  Anmeldung bei der Plattform bestätigen lassen  →  Anthropic (Claude)  →  Antwort des Webhooks
   ▲
   │  4. lesen (JSON), Datenbank prüft: RPC analyse_pruefen / gesamt_pruefen / agenda_ki_pruefen
   │  5. nicht bestanden → nächste Runde mit der Meldung (höchstens 3 Aufrufe, Zeitbudget 135 s)
   │  6. speichern: RPC analyse_ki_speichern / gesamt_speichern / agenda_ki_speichern  → Entwurf
   ▼
Browser zeigt den Entwurf.
```

Der Browser ruft **nie** den Webhook auf. Die Function ruft ihn vom Server aus auf, deshalb braucht der Webhook kein CORS. Die Function nimmt die Adresse aus dem Secret `AI_WEBHOOK_URL`, wenn es gesetzt ist, sonst die Standardadresse `STANDARD_WEBHOOK_URL` in `index.ts` (für diese Plattform: `https://tobitest2008.app.n8n.cloud/webhook/hammermeister`). Ist beides nicht brauchbar (keine https-Adresse), meldet die Seite „Die KI ist noch nicht eingerichtet.“

## 4. Die Eingabe für die KI

Die Eingabe besteht aus drei Schichten; alle gehören zum Hash (`input_hash`):

1. **Kennzahlen** aus der Datenbank (Selbstbild, Fremdbild, Differenzen, Veränderungen, Beteiligung). Nur diese Zahlen erlaubt der Faktencheck.
2. **Kriterien** der wichtigsten Verhalten: der Fokus, die zwei niedrigsten Fremdbilder und die zwei größten Differenzen (höchstens fünf Verhalten), je mit Bezeichnung und Leitsatz der Stufen. Ohne Prozentangaben, damit keine Zahl hineinkommt, die nicht in den Daten steht.
3. **Kontext des Salons** (`salons.ki_kontext`, höchstens 2000 Zeichen): Leitbild, Ton, Besonderheiten. Der Admin pflegt ihn unter **Leitung → Monatsabschluss → „Kontext für die KI“**. Die Datenbank lehnt Namen von Personen im Text ab (der Name des Salons ist erlaubt).

**Nie in der Eingabe:** Namen, Kennungen und E-Mail-Adressen. Bei der Einzelanalyse heißt die bewertete Person „die bewertete Person“, andere „Kollege A“, „Kollege B“ …; Kommentare gehen ohne Absender hinaus. Die **Gesamtauswertung und die Agenda** bekommen nur Teamwerte: keine Kommentartexte (nur Anzahlen) und nie die Begründungen der Leitung zum Fokus (nur Nummer und Titel).

**Schutz vor Anweisungen in Texten:** Der Prompt sagt der KI ausdrücklich, dass alle Texte in den Daten (Kommentare, Kontext, Kriterien) Material zum Auswerten sind und keine Anweisungen. Die Prüfung der Datenbank fängt zusätzlich ab, was trotzdem aus der Form fällt: falsche Zahlen, falscher Aufbau.

**Prompts** liegen versioniert im Code (`supabase/functions/analyse-erstellen/analyse.ts`): `analyse-v2` (Einzelanalyse), `gesamt-v2` (Gesamtauswertung), `agenda-ki-v2` (Agenda). Wer einen Prompt ändert, erhöht die Version; dann gilt die Eingabe als neu, und „Neu generieren“ ist nicht mehr nötig, um die geänderte Fassung zu bekommen. Der Prompt kommt aus der Plattform, **nicht** aus n8n.

## 5. Prüfungen

| Prüfung | Wo | Bei Abweichung |
|---|---|---|
| Form der Ausgabe (JSON, alle Schlüssel) | Function (`leseAusgabe`, mit Reparatur von Zeilenumbrüchen mitten in Wörtern und abgeschnittenem JSON) | nächste Runde mit Hinweis |
| Aufbau der Agenda (fünf Blöcke, Reihenfolge, Minuten, Summe, Punktezahl) | Datenbank: `agenda_ki_validieren` | nächste Runde; nach der dritten ohne richtigen Aufbau: Fehler `ungueltige_ausgabe` |
| **Faktencheck:** jede Zahl im Text steht in den Daten | Datenbank: `analyse_pruefen`, `gesamt_pruefen`, `agenda_ki_pruefen` | nächste Runde; nach der dritten Runde wird die letzte lesbare Fassung als **„Zahlen nicht geprüft“** gespeichert |
| Zeitbudget | Function: 135 s, mindestens 20 s je Runde | letzte lesbare Fassung zählt |
| Freigabe | Mensch | nur die Leitung/der Admin |

Beim **Bearbeiten** prüft die Datenbank den neuen Text noch einmal (nur der Text, nicht die alte KI-Ausgabe). Die Analyse geht danach auf „Entwurf“ zurück.

**Agenda mit KI:** Die KI liefert je Block `id`, `minuten` und `punkte`. **Titel, Hinweise (z. B. „Stand unvollständig“), Summe und den Markdown-Text setzt die Datenbank.** Die Titelzeile und die Hinweise zählen nicht zum Faktencheck. Die freigegebene Agenda erscheint wie bisher im Monatsbericht als PDF; Kommentar-Beispiele gibt es in der KI-Fassung nicht.

## 6. Ablauf in der Edge Function

| Kennwert | Wert | Bedeutung |
|---|---|---|
| `MAX_AUFRUFE` | 3 | KI-Aufrufe je Aufgabe (ein Versuch plus zwei Wiederholungen) |
| `ZEITBUDGET_MS` | 135 000 | Gesamtzeit je Aufruf der Function |
| `MIN_RUNDE_MS` | 20 000 | eine neue Runde beginnt nur, wenn noch so viel Zeit bleibt |
| `MAX_KI_ZEIT_MS` | 120 000 | längste Wartezeit auf den Webhook |
| `PAKET_GROESSE` | 2 | Personen je Aufruf des Sammellaufs (n8n Cloud beendet Anfragen nach etwa 100 Sekunden) |

- **Idempotent:** Gleiche Eingabe und gleiche Prompt-Version wie gespeichert → die Antwort kommt sofort mit `neu_erzeugt: false`, ohne KI-Aufruf. „Neu generieren“ (`neu: true`) erzwingt einen neuen Lauf.
- **Sammellauf:** Der Monat muss abgeschlossen sein (sonst `monat_offen`). Jeder Aufruf erledigt höchstens zwei Personen ohne Analyse in **einem** Aufruf des Webhooks (n8n arbeitet die Aufträge gleichzeitig ab) und antwortet mit `{ erstellt, fehlgeschlagen, verbleibend }`. Die Oberfläche ruft wiederholt auf, bis nichts mehr verbleibt, und nimmt Personen, bei denen es scheiterte, im selben Lauf aus (`ausgenommen`). Der Knopf „Nach diesem Durchgang anhalten“ beendet den Lauf sauber.

## 7. Protokolle

**Browser → Function** (`supabase.functions.invoke('analyse-erstellen')`):

```json
{ "aufgabe": "einzelanalyse" | "gesamtauswertung" | "agenda" | "sammellauf",
  "monat": "2026-11", "person_id": "<uuid, nur Einzelanalyse>", "neu": false, "ausgenommen": ["<uuid>", "…"] }
```

Antwort Einzelanalyse, Gesamtauswertung, Agenda: `{ "analyse": {…Zeile…}, "neu_erzeugt": true, "ki_aufrufe": 1 }`. Antwort Sammellauf: `{ "erstellt": [{person_id, name}], "fehlgeschlagen": [{person_id, name, meldung}], "verbleibend": 3 }`. Fehler: `{ "fehler": "<art>", "meldung": "<deutscher Text>" }`.

| Fehlerart | Status | Bedeutung |
|---|---|---|
| `ki_nicht_eingerichtet` | 503 | Secret `AI_WEBHOOK_URL` fehlt oder ist keine https-Adresse |
| `ki_nicht_erreichbar` | 502 | Webhook nicht erreichbar oder nicht gefunden (Workflow nicht veröffentlicht?) |
| `ki_abgelehnt` | 502 | der Webhook hat die Anmeldung nicht angenommen |
| `ki_ueberlastet` | 429 | Anthropic ist ausgelastet |
| `ki_fehler` | 502 | sonstiger Fehler des KI-Dienstes |
| `zeitueberschreitung` | 504 | das Zeitbudget ist aufgebraucht |
| `ungueltige_ausgabe` | 502 | auch nach drei Runden keine brauchbare Antwort |
| `monat_offen` | 422 | Sammellauf vor dem Abschluss des Monats |
| `keine_berechtigung` | 403 / 401 | kein Recht (z. B. `Nur für Admins.`) bzw. nicht angemeldet |
| `keine_daten` | 422 | für den Monat gibt es keine Abgabe |

**Function → Webhook** (Header `Authorization: Bearer <Anmeldung der Person>`): siehe [`n8n/README.md`](../n8n/README.md) (`aufgabe`, `prompt_version`, `auftraege[]` mit `ref`, `system`, `nachricht`, `eingabe`; Antwort `ergebnisse[]` mit `ref`, `code`, `ausgabe` oder `fehler`).

## 8. Oberfläche

- **Monatsabschluss** (`/app/leitung/abschluss`): Abschnitte *Abschluss*, *Gesamtauswertung* (erstellen, ansehen, bearbeiten, freigeben, neu generieren), *Einzelanalysen* (je Person, dazu „Alle fehlenden Analysen erstellen“ mit Fortschritt und Fehlerliste) und *Kontext für die KI (nur Admin)*. Ohne KI-Recht steht statt dessen der Hinweis, dass die KI-Funktionen für den Admin freigeschaltet sind; den Monat abschließen kann die Leitung weiter.
- **Agenda** (`/app/leitung/agenda`): „Mit KI formulieren“ und „Aus der Vorlage erzeugen“; mit vorhandener Agenda „Neu mit KI formulieren“ und „Neu aus den Daten erzeugen“, beide mit Rückfrage, wenn ein bearbeiteter oder freigegebener Text verloren ginge.
- **Kennzeichnung:** Abzeichen „Von der KI formuliert“ (nach dem Bearbeiten „… , bearbeitet“), Status *Entwurf*/*Freigegeben*, Faktencheck-Hinweis mit den auffälligen Zahlen, Fußzeile mit Herkunft („von der KI formuliert, über n8n (2 Versuche)“) und Prompt-Version.
- **Info und Datenschutz** nennt die Station n8n: „Plattform → Automatisierungsdienst n8n → Anthropic (Claude) und auf demselben Weg zurück“.

## 9. Einrichten

1. **Migration 021** einspielen (idempotent, ohne `DROP`/`DELETE`), danach `supabase/fingerabdruck_version_1_3.sql` ausführen und mit dem Referenzwert (Abschnitt 10) vergleichen.
2. **Edge Function** `analyse-erstellen` veröffentlichen: Dateien `index.ts` und `analyse.ts` vollständig, **JWT-Prüfung an**. (Ein Platzhalter als Dateiinhalt wird beim Veröffentlichen nicht bemerkt: danach `get_edge_function` oder einen Testaufruf prüfen.)
3. **n8n:** Workflow für diese Plattform bereitstellen (Anleitung in [`n8n/README.md`](../n8n/README.md)): eigener Webhook-Pfad, „Anmeldung prüfen“ auf die Adresse dieser Plattform, Anthropic-Zugangsdaten, **Workflow veröffentlichen**.
4. **Adresse des Webhooks:** Für diese Plattform steht die Production-Adresse als Standard in `index.ts` (`STANDARD_WEBHOOK_URL`). Ein **Secret** `AI_WEBHOOK_URL` (Supabase → Edge Functions → Secrets) hat Vorrang und ist der Weg, die Adresse zu ändern, ohne die Function neu zu veröffentlichen. Auf einer anderen Salon-Plattform entweder die Konstante ersetzen oder das Secret setzen (Production-Adresse, z. B. `https://<dein-n8n>/webhook/<pfad>`; nicht die Test-Adresse `/webhook-test/`). Die früheren Secrets `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_WEBHOOK_SECRET` werden nicht mehr gelesen und können entfernt werden. **Der Anthropic-Schlüssel gehört nur in n8n**, nie in die Plattform.
5. **Kontext eintragen:** als Admin unter Monatsabschluss „Kontext für die KI“ (Leitbild, Ton, Besonderheiten; ohne Namen).
6. **Prüfen:** als Admin eine Einzelanalyse erstellen; dann Gesamtauswertung und Agenda mit KI. Als Verantwortliche/r (Schalter an) darf kein KI-Bereich sichtbar sein.

**Salon-Parameter** (alles, was von Salon zu Salon verschieden ist; nichts davon steht in Migration 021):

| Parameter | Wo |
|---|---|
| Adresse des Webhooks | Konstante `STANDARD_WEBHOOK_URL` in `index.ts` oder Secret `AI_WEBHOOK_URL` (hat Vorrang) |
| Webhook-Pfad, „Anmeldung prüfen“ (Projekt-Adresse, anon-Schlüssel), Anthropic-Zugang, Modell | n8n |
| Kontext des Salons | `salons.ki_kontext` (Oberfläche) |
| Wer darf KI | `salons.ki_nur_admin` (Standard an), Rolle `admin` |
| Branche im Prompt („Friseursalon“) | `SYSTEM_EINZEL`, `SYSTEM_GESAMT`, `SYSTEM_AGENDA` in `analyse.ts` (bei anderer Branche anpassen und die Prompt-Versionen erhöhen) |
| Kriterien der Verhalten | Tabelle `verhalten_kriterien` (die Plattform hängt nicht an der Zahl der Verhalten) |

## 10. Auf eine andere Salon-Plattform übertragen

Voraussetzung ist Version 1.2 (Migrationen 016 bis 020, siehe [`version-1.2-aenderungen.md`](version-1.2-aenderungen.md)). Dann:

1. Dateien übernehmen: `supabase/migrations/021_ki_funktionen.sql`, `supabase/functions/analyse-erstellen/` (alle drei Dateien), `supabase/fingerabdruck_version_1_3.sql`, `n8n/README.md`, dieses Dokument; im Frontend `src/lib/abschluss.ts`, `src/lib/api.ts` (KI-Wrapper), `src/components/leitung/AnalyseText.tsx`, `src/pages/app/leitung/Abschluss.tsx`, `Agenda.tsx`, Textabschnitt „Auswertung mit KI“ in `src/pages/app/Info.tsx`, Stile `.lt-chip.ki`, `.lt-chips`, `.lt-sammel-fehler`, `.lt-zaehler` in `src/styles/leitung.css`.
2. Migration 021 einspielen (am besten in zwei Teilen; ein Zeitlimit des Werkzeugs heißt nicht „kaputt“: erst den Zustand prüfen).
3. Fingerabdruck prüfen. **Referenzwert Version 1.3** (Referenz-Plattform; PostgreSQL von Supabase):

```
anzahl        = 267
fingerabdruck = 9d184733f4ac9726d34c3c1b26839663
```

   Dieser Wert löst den von Version 1.2 ab (240 Objekte), weil Migration 021 einige Funktionen der Version 1.2 neu fasst (u. a. `abschluss_uebersicht`, `analyse_zeile`, `analyse_bearbeiten`, `agenda_bearbeiten`). Bekannte Ursachen für Abweichungen: Kommentare im Funktionsrumpf, die beim Einspielen fehlten; eine andere Postgres-Hauptversion.
4. Edge Function veröffentlichen, n8n und Secret einrichten (Abschnitt 9).
5. Branche, Kontext und Kriterien der neuen Plattform eintragen.

## 11. Abweichungen vom Master-Dokument

| Master | Hier | Warum |
|---|---|---|
| Der Browser ruft den Webhook auf, die Function ist nur Rückfall | Der Browser ruft **nur** die Edge Function; sie ruft den Webhook | Auftrag: ein einziger Weg, kein Rückfall. Bonus: kein CORS im Webhook nötig |
| Direkter Weg zu Anthropic als dritte Variante (`AI_PROVIDER=claude`) | entfernt | Auftrag: Daten nur über n8n zu Anthropic |
| Schlüssel für die KI in der Plattform möglich | nie; der Anthropic-Schlüssel steht nur in n8n | derselbe Grund |
| Schalter und Kontext wie hier | gleich (`ki_nur_admin`, `ki_kontext`) | |

## 12. Tests

| Bereich | Umfang |
|---|---|
| Datenbank (lokal, PGlite, Migrationen zweimal) | 129 Prüfungen in `ki-test`: Rechte je Rolle und Salon, Eingabe ohne Namen, Kriterien und Kontext (nur in der Eingabe, nicht in den erlaubten Zahlen), Hash, Faktencheck, Gesamtauswertung, Agenda mit KI (Aufbau, Titel/Hinweise von der Datenbank), Bearbeiten und Freigeben, Übersicht |
| Datenbank in Produktion | Rollback-Test mit `raise exception` am Ende (nichts bleibt zurück), Fingerabdruck 267 / `9d184733…` gleich wie lokal |
| Edge-Function-Logik (Vitest, 52 Prüfungen) | Prompts (Regeln gegen Anweisungen in Texten, Branche), Parser (Zäune, Zeilenumbrüche mitten in Wörtern, abgeschnittenes JSON), Webhook (Fehlerarten, Zeitüberschreitung), Runden und Zeitbudget, Sammellauf, Anfrage-Prüfung |
| n8n-Code-Knoten | die drei Knoten aus `n8n/knoten/` gegen die Testanfragen aus `n8n/testanfragen/` mit nachgebauter n8n-Umgebung: gültige und ungültige Anfrage, Antwort lesen ohne Hinweise, `429`, abgeschnittene Antwort, Bündeln im Protokoll |
| Schlüssel im Frontend (Vitest und Playwright) | `src/lib/schluessel.ts`: die App startet nicht mit einem `service_role`-, `sb_secret_`- oder anderen Nicht-`anon`-Schlüssel und sendet dann keine Anfrage |
| Oberfläche (Vitest und Playwright mit nachgebautem Datenbank-Dienst und Webhook) | Admin-Ablauf: erstellen, Faktencheck-Warnung, bearbeiten, freigeben, neu generieren mit Rückfrage; Sammellauf in Paketen und mit Fehlschlag; Gesamtauswertung; Agenda mit KI (inkl. Faktencheck und Ausfall der KI); Kontext (Name abgelehnt, löschen); Verantwortliche ohne KI-Recht sehen nichts und lösen keinen Aufruf aus; PDF nur mit freigegebener Analyse |

**Nicht getestet:** der **echte Lauf durch n8n mit echter Anthropic-Antwort**. Die Sandbox erreicht weder n8n noch Anthropic. Beim ersten echten Lauf bitte als Admin eine Einzelanalyse erstellen und prüfen (siehe Abschnitt 13).

## 13. Wenn etwas nicht klappt

| Meldung / Beobachtung | Ursache | Was tun |
|---|---|---|
| „Die KI ist noch nicht eingerichtet.“ | die wirksame Adresse (Secret oder Standard in `index.ts`) beginnt nicht mit `https://` | Adresse korrigieren (Abschnitt 9); ein Secret wird beim nächsten Aufruf gelesen |
| „Der KI-Dienst wurde nicht gefunden.“ | Workflow in n8n nicht veröffentlicht, falsche Adresse, Test-Adresse statt Production-Adresse | Workflow veröffentlichen, Production-URL eintragen |
| „… hat die Anmeldung nicht angenommen.“ | „Anmeldung prüfen“ in n8n zeigt auf eine andere Plattform oder hat den falschen anon-Schlüssel | Adresse `https://<Projekt>.supabase.co/auth/v1/user` und `apikey` prüfen |
| „Die KI ist gerade ausgelastet.“ | Anthropic `429`/`529` | in einer Minute wiederholen; beim Sammellauf bleiben die erledigten Analysen erhalten |
| „Die KI hat zu lange gebraucht.“ | n8n oder Anthropic antwortet zu langsam (n8n Cloud: etwa 100 s) | wiederholen; Pakete bleiben bei zwei Personen |
| Text mit „Zahlen nicht geprüft“ | die KI hat eine Zahl genannt, die nicht in den Daten steht | Text prüfen und anpassen oder „Neu generieren“; Freigabe bleibt Entscheidung der Leitung |
| Verantwortliche sehen keine Einzelanalysen mehr | `ki_nur_admin` ist an (Standard) | gewollt; zum Ändern `update public.salons set ki_nur_admin = false;` |
| Antwort mit zerhackten Wörtern („Fe↵edback“) | der KI-Agenten-Knoten von n8n setzt Antworten aus Stücken zusammen | Claude über den HTTP-Request-Knoten aufrufen (siehe `n8n/README.md`); der Parser der Function entfernt solche Umbrüche zusätzlich |

## 14. Bekannte Grenzen

- n8n prüft nur, **ob** jemand angemeldet ist, nicht welche Rolle die Person hat. Wer ein gültiges Login besitzt und die Adresse des Webhooks kennt, könnte ihn direkt auslösen (kostet KI-Aufrufe, liefert aber keine Daten, weil die Eingabe aus der Datenbank stammt, die nur dem Admin antwortet). Wer das ausschließen will, lässt n8n zusätzlich die Rolle über `ich` prüfen. Für den Start reicht die Anmeldeprüfung (Entscheidung des Auftraggebers).
- Die Gesamtauswertung kommt (noch) nicht in den Monatsbericht als PDF.
- Erfolgreiche Ausführungen sollten in n8n **nicht gespeichert** werden (`saveDataSuccessExecution: none`), damit dort keine Daten liegen bleiben.
- Der Salon-Kontext ist Freitext; die Datenbank erkennt Namen von Personen, aber keine Zahlen oder Inhalte, die dort nicht hingehören.
