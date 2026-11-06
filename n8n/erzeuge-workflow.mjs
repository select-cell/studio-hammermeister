// Erzeugt den importierbaren n8n-Workflow aus den Code-Knoten in knoten/*.js.
//
//   node n8n/erzeuge-workflow.mjs                       → n8n/hammermeister-ki.workflow.json (Werte dieser Plattform)
//   node n8n/erzeuge-workflow.mjs --pfad mein-salon-ki --url https://<projekt>.supabase.co --key <anon-oder-publishable-Schlüssel> --aus datei.json
//
// Der Schlüssel ist der ÖFFENTLICHE Schlüssel der Plattform (anon bzw. publishable), derselbe wie in der .env des Frontends.
// Nie den service_role-Schlüssel eintragen. Zugangsdaten für Anthropic stehen NICHT in der Datei: Sie werden in n8n am Knoten ausgewählt.
//
// Mit --test-anthropic <Adresse> und --test-key <Text> entsteht eine Testfassung, die statt Anthropic eine eigene Adresse mit Header
// „x-api-key“ aufruft (für den lokalen Test mit einer nachgebauten Anthropic-API). Sie ist nicht zum Einsatz gedacht.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const arg = (name, standard) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : standard
}

const PFAD = arg('pfad', 'hammermeister')
const SUPABASE_URL = arg('url', 'https://obsakxdjfpaoajwsteiv.supabase.co').replace(/\/+$/, '')
const SCHLUESSEL = arg('key', 'sb_publishable_zf3ccu08gD-wSVLD_-81QA_jj3eOben')
const AUS = arg('aus', join(HIER, 'hammermeister-ki.workflow.json'))
const TEST_ANTHROPIC = arg('test-anthropic', '')
const TEST_KEY = arg('test-key', 'test')
const NAME = arg('name', 'Hammermeister KI')

const code = (datei) => readFileSync(join(HIER, 'knoten', datei), 'utf8')
const uuid = (text) => {
  const h = createHash('md5').update('hammermeister-ki:' + text).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const bedingungOptionen = { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }
const wahr = (id, ausdruck) => ({
  conditions: { options: bedingungOptionen, conditions: [{ id: uuid(id), leftValue: ausdruck, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' },
  options: {},
})

const claudeParameter = () => {
  const koerper = "={{ JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 4096, temperature: 0.3, system: $json.system, messages: [{ role: 'user', content: $json.nachricht }] }) }}"
  const optionen = { timeout: 90000, batching: { batch: { batchSize: 10, batchInterval: 0 } }, response: { response: { neverError: true } } }
  if (TEST_ANTHROPIC) {
    return {
      method: 'POST', url: TEST_ANTHROPIC, sendHeaders: true,
      headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }, { name: 'x-api-key', value: TEST_KEY }] },
      sendBody: true, specifyBody: 'json', jsonBody: koerper, options: optionen,
    }
  }
  return {
    method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
    sendBody: true, specifyBody: 'json', jsonBody: koerper, options: optionen,
  }
}

const knoten = (name, typ, version, position, parameter, extra = {}) => ({ parameters: parameter, id: uuid(name), name, type: typ, typeVersion: version, position, ...extra })

const nodes = [
  knoten('Webhook', 'n8n-nodes-base.webhook', 2, [0, 300],
    { httpMethod: 'POST', path: PFAD, authentication: 'none', responseMode: 'responseNode', options: { allowedOrigins: '*' } }, { webhookId: uuid('webhook-id') }),
  knoten('Anmeldung prüfen', 'n8n-nodes-base.httpRequest', 4.2, [240, 300], {
    method: 'GET', url: `${SUPABASE_URL}/auth/v1/user`, sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Authorization', value: "={{ $json.headers.authorization || '' }}" }, { name: 'apikey', value: SCHLUESSEL }] },
    options: { timeout: 10000, response: { response: { fullResponse: true, neverError: true } } },
  }),
  knoten('Angemeldet?', 'n8n-nodes-base.if', 2.2, [480, 300], wahr('angemeldet', "={{ $execution.mode === 'test' || $json.statusCode === 200 }}")),
  knoten('Nicht angemeldet', 'n8n-nodes-base.respondToWebhook', 1.1, [720, 480], {
    respondWith: 'json', responseBody: '{"ok": false, "fehler": "Bitte melde dich an."}', options: { responseCode: 401 },
  }),
  knoten('Anfrage prüfen', 'n8n-nodes-base.code', 2, [720, 220], { jsCode: code('anfrage-pruefen.js') }),
  knoten('Gültig?', 'n8n-nodes-base.if', 2.2, [960, 220], wahr('gueltig', '={{ $json.gueltig }}')),
  knoten('Anfrage ungültig', 'n8n-nodes-base.respondToWebhook', 1.1, [1200, 400], {
    respondWith: 'json', responseBody: '={{ { "ok": false, "fehler": "Die Anfrage ist ungültig.", "details": $json.fehler } }}', options: { responseCode: 400 },
  }),
  knoten('Aufgabe wählen', 'n8n-nodes-base.switch', 3.2, [1200, 140], {
    rules: {
      values: ['einzelanalyse', 'gesamtauswertung', 'agenda'].map((aufgabe, i) => ({
        conditions: {
          options: bedingungOptionen,
          conditions: [{ id: uuid('regel-' + aufgabe), leftValue: '={{ $json.aufgabe }}', rightValue: aufgabe, operator: { type: 'string', operation: 'equals' } }],
          combinator: 'and',
        },
        renameOutput: true,
        outputKey: ['Einzelanalyse', 'Gesamtauswertung', 'Agenda'][i],
      })),
    },
    options: {},
  }),
  knoten('Claude Einzelanalyse', 'n8n-nodes-base.httpRequest', 4.2, [1460, 0], claudeParameter()),
  knoten('Claude Gesamtauswertung', 'n8n-nodes-base.httpRequest', 4.2, [1460, 140], claudeParameter()),
  knoten('Claude Agenda', 'n8n-nodes-base.httpRequest', 4.2, [1460, 280], claudeParameter()),
  knoten('Antwort lesen', 'n8n-nodes-base.code', 2, [1700, 140], { mode: 'runOnceForEachItem', jsCode: code('antwort-lesen.js') }),
  knoten('Antwort bündeln', 'n8n-nodes-base.code', 2, [1940, 140], { jsCode: code('antwort-buendeln.js') }),
  knoten('Antwort senden', 'n8n-nodes-base.respondToWebhook', 1.1, [2180, 140], {
    respondWith: 'json', responseBody: '={{ $json.body }}', options: { responseCode: '={{ $json.code }}' },
  }),
  knoten('Hinweis', 'n8n-nodes-base.stickyNote', 1, [0, 0], {
    content:
      `## ${NAME}\n` +
      'KI-Funktionen der Plattform: Einzelanalyse, Gesamtauswertung, Agenda.\n\n' +
      '**Vor dem Veröffentlichen:** In den drei Knoten „Claude …“ die Anthropic-Zugangsdaten auswählen. ' +
      'Danach den Workflow veröffentlichen (Publish). Unter Einstellungen „Erfolgreiche Ausführungen speichern“ auf „Nein“ lassen.\n\n' +
      `Adresse für die Plattform (Secret AI_WEBHOOK_URL): …/webhook/${PFAD}\n\n` +
      'Anleitung: n8n/README.md im Repository der Plattform.',
    height: 240, width: 420, color: 4,
  }),
]

const verbinde = (...ziele) => ({ main: ziele.map((z) => (z ? [{ node: z, type: 'main', index: 0 }] : [])) })
const connections = {
  Webhook: verbinde('Anmeldung prüfen'),
  'Anmeldung prüfen': verbinde('Angemeldet?'),
  'Angemeldet?': verbinde('Anfrage prüfen', 'Nicht angemeldet'),
  'Anfrage prüfen': verbinde('Gültig?'),
  'Gültig?': verbinde('Aufgabe wählen', 'Anfrage ungültig'),
  'Aufgabe wählen': verbinde('Claude Einzelanalyse', 'Claude Gesamtauswertung', 'Claude Agenda'),
  'Claude Einzelanalyse': verbinde('Antwort lesen'),
  'Claude Gesamtauswertung': verbinde('Antwort lesen'),
  'Claude Agenda': verbinde('Antwort lesen'),
  'Antwort lesen': verbinde('Antwort bündeln'),
  'Antwort bündeln': verbinde('Antwort senden'),
}

const workflow = {
  name: NAME,
  nodes,
  connections,
  active: false,
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none', saveManualExecutions: false },
  pinData: {},
}

writeFileSync(AUS, JSON.stringify(workflow, null, 2) + '\n')
console.log(`${AUS}: ${nodes.length} Knoten, Pfad „${PFAD}“, Anmeldeprüfung gegen ${SUPABASE_URL}${TEST_ANTHROPIC ? ' (TESTFASSUNG)' : ''}`)
