# n8n-Workflow für die KI-Funktionen

n8n vermittelt zwischen der Plattform und Anthropic. Es ist die **einzige** Station zwischen Plattform und KI: Plattform → Webhook (n8n) → Anthropic → Antwort des Webhooks → Plattform. Aufgerufen wird der Webhook von der Edge Function `analyse-erstellen` (nicht vom Browser). Alles Weitere (Prinzip, Prüfungen, Rechte) steht in [`docs/ki-funktionen.md`](../docs/ki-funktionen.md).

Der Workflow ist **plattform-neutral**: Für diese Plattform ist es derselbe Workflow wie für jede andere, nur mit eigenem Webhook-Pfad und eigener Adresse bei „Anmeldung prüfen“. Wer schon einen laufenden Workflow einer anderen Salon-Plattform hat, **dupliziert** ihn (Abschnitt 3). Die Code-Knoten liegen unter [`knoten/`](knoten/).

## 1. Protokoll

**Anfrage** der Edge Function an den Webhook (POST, `Authorization: Bearer <Anmeldung der Person>`):

```json
{
  "aufgabe": "einzelanalyse",
  "prompt_version": "analyse-v2",
  "auftraege": [
    { "ref": "1", "system": "…Prompt…", "nachricht": "Daten (JSON):\n{…}", "eingabe": { "…": "…" } }
  ]
}
```

- `aufgabe`: `einzelanalyse`, `gesamtauswertung` oder `agenda`. Der Sammellauf sendet mehrere Aufträge einer Einzelanalyse in **einer** Anfrage (höchstens zwei).
- `ref`: laufende Nummer („1“, „2“), nie eine Kennung aus der Datenbank.
- `system`: Prompt (kommt aus der Plattform, versioniert), `nachricht`: Daten als Text, `eingabe`: dieselben Daten als Objekt.

**Antwort** (direkt als Antwort des Webhooks, „Respond to Webhook“):

```json
{
  "aufgabe": "einzelanalyse",
  "ergebnisse": [
    { "ref": "1", "code": 200, "ausgabe": { "…": "…" }, "meta": { "hinweise": [], "stop_reason": "end_turn" } },
    { "ref": "2", "code": 502, "fehler": "Die KI ist nicht erreichbar oder hat nicht geantwortet.", "detail": "…" }
  ]
}
```

- Ein Fehler bei einem Auftrag stoppt die anderen nicht. Ist **jeder** Auftrag gescheitert, steht das auch im Status (`429` ausgelastet, sonst `502`).
- Unvollständige Anfrage: `400`. Fehlende oder ungültige Anmeldung: `401` mit `{"ok": false, "fehler": "Bitte melde dich an."}`, **bevor** etwas an die KI geht.
- `ausgabe` darf das JSON-Objekt oder der Rohtext der KI sein; die Edge Function liest beides (Zäune, Zeilenumbrüche mitten in Wörtern, abgeschnittenes JSON) und die Datenbank prüft verbindlich. `meta` ist nur zur Orientierung beim Testen.
- Die Function liest `ergebnisse` auch bei Status `429` und `502`.

## 2. Die Knoten

```
Webhook → Anmeldung prüfen → Angemeldet? ─ja─▶ Anfrage prüfen → Gültig? ─ja─▶ Aufgabe wählen ─┬─▶ Claude Einzelanalyse ───┐
                                  └─nein─▶ Nicht angemeldet (401)        └─nein─▶ Anfrage ungültig (400)   ├─▶ Claude Gesamtauswertung ┤
                                                                                                           └─▶ Claude Agenda ──────────┤
Antwort senden ◀── Antwort bündeln ◀── (Zahlencheck, optional) ◀── Antwort lesen ◀───────────────────────────────────────────────────────┘
```

| Knoten | Typ | Einstellung |
|---|---|---|
| **Webhook** | Webhook | POST, Pfad z. B. `hammermeister-ki`, Antwort über „Respond to Webhook“ (`responseMode: responseNode`). CORS ist nicht nötig, weil die Edge Function vom Server aus aufruft. |
| **Anmeldung prüfen** | HTTP Request | `GET https://obsakxdjfpaoajwsteiv.supabase.co/auth/v1/user`; Header `Authorization: {{ $json.headers.authorization \|\| '' }}` und `apikey: <anon-Schlüssel dieser Plattform>`; Timeout 10 s; „Include Response Headers and Status“ an, „Never Error“ an |
| **Angemeldet?** | IF | `{{ $execution.mode === 'test' \|\| $json.statusCode === 200 }}` (im Editor-Test immer ja) |
| **Nicht angemeldet** | Respond to Webhook | Status `401`, Body `{"ok": false, "fehler": "Bitte melde dich an."}` |
| **Anfrage prüfen** | Code | [`knoten/anfrage-pruefen.js`](knoten/anfrage-pruefen.js): Aufgabe bekannt? Aufträge vollständig? (`AUFGABEN`, höchstens 10 Aufträge) |
| **Gültig?** / **Anfrage ungültig** | IF / Respond to Webhook | Status `400` mit den Gründen |
| **Aufgabe wählen** | Switch | eine Regel je Aufgabe: `{{ $json.aufgabe }}` ist `einzelanalyse`, `gesamtauswertung` oder `agenda` |
| **Claude …** (drei) | HTTP Request | `POST https://api.anthropic.com/v1/messages`, Anmeldung „Anthropic“ (oder Header `x-api-key`), Header `anthropic-version: 2023-06-01`, Body siehe unten, Timeout 90 s, **Batching 10**, „Never Error“ an |
| **Antwort lesen** | Code (je Auftrag) | [`knoten/antwort-lesen.js`](knoten/antwort-lesen.js) |
| **Antwort bündeln** | Code (einmal für alle) | [`knoten/antwort-buendeln.js`](knoten/antwort-buendeln.js) |
| **Antwort senden** | Respond to Webhook | Status `{{ $json.code }}`, Body `{{ $json.body }}` |

Body der **Claude-Knoten** (der Prompt kommt aus der Plattform, nicht aus n8n):

```
={{ JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 4096, temperature: 0.3, system: $json.system, messages: [{ role: 'user', content: $json.nachricht }] }) }}
```

Claude wird bewusst über den gewöhnlichen **HTTP-Request-Knoten** aufgerufen und nicht über den „KI-Agent“-Knoten: Der Agent-Knoten lieferte zerstückelten, leeren oder abgeschnittenen Text. Der HTTP-Aufruf ist deterministisch und liefert die vollständige Antwort samt `stop_reason`. Die Aufträge einer Anfrage laufen durch das Batching **gleichzeitig**.

## 3. Für diese Plattform einrichten

**Der fertige Workflow zum Importieren:** [`hammermeister-ki.workflow.json`](hammermeister-ki.workflow.json) (15 Knoten, Webhook-Pfad `hammermeister`, „Anmeldung prüfen“ gegen diese Plattform mit deren öffentlichem Schlüssel, `saveDataSuccessExecution: none`). Er enthält **keine Zugangsdaten**. Erzeugt wird er aus den Code-Knoten in [`knoten/`](knoten/) mit `node n8n/erzeuge-workflow.mjs` (für eine andere Plattform: `--pfad`, `--url`, `--key`, `--aus`).

1. In n8n: **Workflows → Import from File** (oder im Editor „Import from file“) und `hammermeister-ki.workflow.json` wählen.
2. In den **drei Knoten „Claude Einzelanalyse“, „Claude Gesamtauswertung“ und „Claude Agenda“** die Anthropic-Zugangsdaten auswählen (Credential vom Typ „Anthropic“ mit dem API-Schlüssel; der Schlüssel steht nur hier, nie in der Plattform).
3. Workflow **veröffentlichen** (Publish). Die Production-Adresse lautet dann `https://<dein-n8n>/webhook/hammermeister`; für `tobitest2008.app.n8n.cloud` also `https://tobitest2008.app.n8n.cloud/webhook/hammermeister`. Nicht die Test-Adresse (`/webhook-test/…`) verwenden.
4. In den Einstellungen des Workflows bleibt „Erfolgreiche Ausführungen speichern“ auf **Nein**, damit keine Daten in n8n liegen bleiben.
5. **Adresse in der Plattform:** Sie steht als Standard in der Edge Function (`STANDARD_WEBHOOK_URL` in `supabase/functions/analyse-erstellen/index.ts`). Ein Secret `AI_WEBHOOK_URL` in Supabase hat Vorrang und ändert die Adresse ohne neue Veröffentlichung.
6. **Prüfen:** In der Plattform als Admin unter Leitung → Monatsabschluss eine Einzelanalyse erstellen. Kommt „Der KI-Dienst hat die Anmeldung nicht angenommen“, zeigt „Anmeldung prüfen“ auf die falsche Plattform oder hat den falschen Schlüssel; kommt „… wurde nicht gefunden“, ist der Workflow nicht veröffentlicht oder die Adresse falsch.

**Für eine andere Plattform:** `node n8n/erzeuge-workflow.mjs --pfad <pfad> --url https://<projekt>.supabase.co --key <anon-oder-publishable-Schlüssel> --aus <datei>.json` und dann wie oben. Der Schlüssel ist der **öffentliche** (derselbe wie in der `.env` des Frontends), nie der `service_role`-Schlüssel.

**Geprüft ist der Workflow in einer echten n8n-Instanz** (n8n 2.35.7, lokal, mit nachgebauter Anthropic-API und nachgebauter „Wer bin ich?“-Antwort der Plattform): Import, Veröffentlichung und 28 Prüfungen, darunter 401 ohne und mit falscher Anmeldung (Anthropic wird nie gefragt), 400 bei ungültiger Anfrage, alle drei Aufgaben mit unverändertem Prompt, zwei Aufträge in einer Anfrage, ein überlasteter und ein guter Auftrag, 429 bei jedem überlasteten Auftrag, zerstückelte Wörter, Code-Zaun und abgeschnittene Antwort. Dazu läuft die Orchestrierung der Edge Function (`analyse.ts`, unverändert) gegen diesen Workflow durch. **Nicht geprüft:** die Anmeldung der Anthropic-Zugangsdaten am Knoten (in der Testfassung steht dort stattdessen ein Header), die echte Antwort von Anthropic und die Prüfung der Anmeldung gegen die echte Plattform. Das zeigt der erste Lauf mit echter Anmeldung.

**Prüfen ohne Plattform (Editor-Test):** Im Ordner [`testanfragen/`](testanfragen/) liegen vier fertige Anfragen: `einzelanalyse.json`, `gesamtauswertung.json`, `agenda.json` (mit den echten Prompts der Plattform, aber erfundenen Daten ohne echte Namen oder Zahlen) und `ungueltig.json` (muss mit `400` beantwortet werden). So geht es:

1. Im Editor den Webhook-Knoten öffnen, „Listen for test event“ wählen und die **Test-Adresse** kopieren.
2. Eine Anfrage senden, z. B. `curl -X POST -H 'content-type: application/json' --data @n8n/testanfragen/agenda.json '<Test-Adresse>'`. Im Editor-Test entfällt die Anmeldeprüfung (`$execution.mode === 'test'`).
3. Erwartet: Antwort mit `ergebnisse[0].code` `200`, `ausgabe` mit dem JSON der KI und `meta.hinweise` leer. Ist `meta.stop_reason` `max_tokens`, am Claude-Knoten `max_tokens` erhöhen.
4. Danach **mit echter Anmeldung** über die Production-Adresse prüfen: in der Plattform als Admin eine Einzelanalyse erstellen (Schritt 6 oben). Die Prüfung der Anmeldung gegen die Plattform lässt sich nur so testen.

Die Code-Knoten in [`knoten/`](knoten/) sind gegen diese Testanfragen mit einer nachgebauten n8n-Umgebung geprüft (Anfrage prüfen, Antwort lesen, Antwort bündeln, 429 und abgeschnittene Antworten); das ersetzt den Test in der echten Instanz nicht.

## 4. Eine neue Aufgabe oder Plattform anbinden

**Neue Aufgabe:** in **Anfrage prüfen** (`AUFGABEN`) eintragen, in **Aufgabe wählen** eine Regel ergänzen, einen Knoten **Claude …** kopieren und mit **Antwort lesen** verbinden. Auf der Plattform: Prompt, Version, Eingabe-Baustein, Leseregel, Prüfung.

**Neue Plattform:** Workflow duplizieren, neuer Webhook-Pfad, bei „Anmeldung prüfen“ die Adresse und den anon-Schlüssel der neuen Plattform eintragen, in der neuen Plattform das Secret `AI_WEBHOOK_URL` setzen. Alles andere bleibt unverändert.

## 5. Grenzen

- **n8n Cloud** beendet Anfragen nach etwa **100 Sekunden**. Darum höchstens zwei Aufträge je Anfrage (Sammellauf in Paketen) und gleichzeitige Aufrufe.
- Der Workflow prüft nur, **ob** die Anmeldung gültig ist, nicht die Rolle. Die Daten für die KI stammen aus der Datenbank, die nur dem Admin antwortet (Schalter `salons.ki_nur_admin`). Wer zusätzlich verhindern will, dass ein anderer gültiger Login den Webhook direkt auslöst, ergänzt nach „Anmeldung prüfen“ einen Aufruf von `rpc/ich` und prüft `rolle = 'admin'`.
- Der Zusatzkontext in `AUFGABEN[...].zusatzkontext` ist leer. Der Kontext des Salons kommt aus der Plattform (`salons.ki_kontext`, Oberfläche „Kontext für die KI“); dort gehört er hin, damit er Teil der Eingabe und des Hashes ist. **Keine Zahlen in den Zusatzkontext schreiben:** Der Faktencheck der Datenbank lehnt Zahlen ab, die nicht in den Daten stehen.
- **Nicht getestet** ist der echte Lauf durch eine echte n8n-Instanz mit echter Anthropic-Antwort. Die Protokollseite der Plattform ist mit einem nachgebauten Webhook geprüft (siehe `docs/ki-funktionen.md`, Abschnitt 12).
