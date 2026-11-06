// Edge Function „analyse-erstellen“: die KI-Funktionen der Plattform (Einzelanalyse, Sammellauf, Gesamtauswertung, Agenda).
//
// Aufruf: POST { aufgabe: 'einzelanalyse' | 'gesamtauswertung' | 'agenda' | 'sammellauf', monat: 'YYYY-MM', person_id?, neu?, ausgenommen? }
//         mit der Anmeldung der Person (JWT, verify_jwt an). Nur der Admin darf (Schalter salons.ki_nur_admin): Das entscheidet die Datenbank.
//
// DER EINZIGE WEG: Diese Function → Webhook (n8n) → Anthropic → Antwort des Webhooks → diese Function → Datenbank.
// Es gibt keinen direkten Aufruf der Anthropic-API. Alle Datenbank-Aufrufe laufen mit der Anmeldung der aufrufenden Person;
// ein service_role-Schlüssel wird nicht gebraucht. Die Anmeldung geht an den Webhook weiter, der sie bei der Plattform bestätigen lässt.
//
// Adresse des Webhooks: Das Secret AI_WEBHOOK_URL (Supabase → Edge Functions → Secrets) hat Vorrang; ohne Secret gilt die Standardadresse unten.
//   AI_WEBHOOK_URL   Production-Adresse des n8n-Webhooks, z. B. https://<dein-n8n>/webhook/<pfad>
// Die Logik steht in analyse.ts (mit Tests), das Protokoll in docs/ki-funktionen.md.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { bearbeite, erzeugeWebhook, KiFehler, leseAnfrage, leseWebhookUrl, ZEITBUDGET_MS, type AnalyseZeile, type Aufgabe, type Datenbank, type Kontext, type Pruefung } from './analyse.ts'

// Standardadresse des n8n-Webhooks dieser Plattform (Production-Adresse). Kein Geheimnis: Der Webhook verlangt eine gültige Anmeldung.
// Bei der Übertragung auf eine andere Salon-Plattform diese Adresse ersetzen oder das Secret AI_WEBHOOK_URL setzen.
const STANDARD_WEBHOOK_URL = 'https://tobitest2008.app.n8n.cloud/webhook/hammermeister'

const KOPF = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
}

const antwort = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: KOPF })
const fehler = (status: number, art: string, meldung: string) => antwort(status, { fehler: art, meldung })

class DbFehler extends Error {
  constructor(
    public readonly code: string | undefined,
    meldung: string,
  ) {
    super(meldung)
  }
}

// Nur das, was gebraucht wird: rpc (so bleibt die Typisierung des Supabase-Clients außen vor)
type Client = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> }

function datenbank(sb: Client): Datenbank {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const r = await sb.rpc(name, args)
    if (r.error) throw new DbFehler(r.error.code, r.error.message)
    return r.data
  }
  const m = (k: Kontext) => `${k.monat}-01`
  return {
    async eingabe(aufgabe: Aufgabe, k: Kontext) {
      const d =
        aufgabe === 'einzelanalyse' ? await rpc('analyse_eingabe_ki', { p_person: k.person_id, p_monat: m(k) })
        : aufgabe === 'gesamtauswertung' ? await rpc('gesamt_eingabe', { p_monat: m(k) })
        : await rpc('agenda_ki_eingabe', { p_monat: m(k) })
      return d as { eingabe: Record<string, unknown>; hash: string }
    },
    async lese(aufgabe: Aufgabe, k: Kontext) {
      const d =
        aufgabe === 'einzelanalyse' ? await rpc('analyse_lesen', { p_person: k.person_id, p_monat: m(k) })
        : aufgabe === 'gesamtauswertung' ? await rpc('gesamt_lesen', { p_monat: m(k) })
        : await rpc('agenda_lesen', { p_monat: m(k) })
      return (d as AnalyseZeile | null) ?? null
    },
    async pruefe(aufgabe: Aufgabe, k: Kontext, ausgabe: Record<string, unknown>, text: string): Promise<Pruefung> {
      if (aufgabe === 'agenda') return (await rpc('agenda_ki_pruefen', { p_monat: m(k), p_ausgabe: ausgabe })) as Pruefung
      const d = (aufgabe === 'einzelanalyse'
        ? await rpc('analyse_pruefen', { p_person: k.person_id, p_monat: m(k), p_inhalt: ausgabe, p_text: text })
        : await rpc('gesamt_pruefen', { p_monat: m(k), p_inhalt: ausgabe, p_text: text })) as { geprueft: boolean; unbekannt: string[] }
      return { ok: true, meldung: null, geprueft: d.geprueft, unbekannt: d.unbekannt }
    },
    async speichere(aufgabe: Aufgabe, k: Kontext, s) {
      const d =
        aufgabe === 'einzelanalyse'
          ? await rpc('analyse_ki_speichern', { p_person: k.person_id, p_monat: m(k), p_inhalt: s.ausgabe, p_text_md: s.text_md, p_prompt_version: s.prompt_version, p_input_hash: s.hash, p_versuche: s.versuche })
        : aufgabe === 'gesamtauswertung'
          ? await rpc('gesamt_speichern', { p_monat: m(k), p_inhalt: s.ausgabe, p_text_md: s.text_md, p_prompt_version: s.prompt_version, p_input_hash: s.hash, p_versuche: s.versuche })
          : await rpc('agenda_ki_speichern', { p_monat: m(k), p_ausgabe: s.ausgabe, p_prompt_version: s.prompt_version, p_input_hash: s.hash, p_versuche: s.versuche })
      return d as AnalyseZeile
    },
    async uebersicht(monat: string) {
      const d = (await rpc('abschluss_uebersicht', { p_monat: `${monat}-01` })) as {
        abschluss: unknown
        personen: { person_id: string; name: string; hat_auswertung: boolean; analyse: unknown }[]
      }
      return {
        abgeschlossen: d.abschluss !== null && d.abschluss !== undefined,
        offen: d.personen.filter((p) => p.hat_auswertung && !p.analyse).map((p) => ({ person_id: p.person_id, name: p.name })),
      }
    },
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: KOPF })
  if (req.method !== 'POST') return fehler(405, 'methode', 'Nur POST ist erlaubt.')

  const auth = req.headers.get('authorization')
  if (!auth) return fehler(401, 'keine_anmeldung', 'Bitte melde dich an.')

  let roh: unknown
  try {
    roh = await req.json()
  } catch {
    return fehler(400, 'ungueltige_anfrage', 'Die Anfrage ist ungültig.')
  }
  const anfrage = leseAnfrage(roh)
  if (!anfrage) return fehler(400, 'ungueltige_anfrage', 'Aufgabe, Monat oder Person fehlen oder sind ungültig.')

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const url = leseWebhookUrl({ AI_WEBHOOK_URL: Deno.env.get('AI_WEBHOOK_URL')?.trim() || STANDARD_WEBHOOK_URL })
    const ergebnis = await bearbeite(anfrage, datenbank(sb as unknown as Client), erzeugeWebhook(url, auth), { jetzt: () => Date.now(), budgetMs: ZEITBUDGET_MS })
    return antwort(200, ergebnis)
  } catch (err) {
    if (err instanceof DbFehler) {
      if (err.code === '42501') return fehler(/permission denied/i.test(err.message) ? 401 : 403, 'keine_berechtigung', /permission denied/i.test(err.message) ? 'Bitte melde dich an.' : err.message)
      if (err.code === '22023') return fehler(422, 'keine_daten', err.message)
      return fehler(500, 'datenbank', 'Die Analyse konnte nicht erstellt werden.')
    }
    if (err instanceof KiFehler) {
      const status = err.art === 'ki_nicht_eingerichtet' ? 503 : err.art === 'zeitueberschreitung' ? 504 : err.art === 'ki_ueberlastet' ? 429 : err.art === 'monat_offen' ? 422 : 502
      return fehler(status, err.art, err.message)
    }
    return fehler(500, 'unbekannt', 'Unerwarteter Fehler. Bitte versuche es noch einmal.')
  }
})
