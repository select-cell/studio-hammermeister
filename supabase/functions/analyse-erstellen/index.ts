// Edge Function „analyse-erstellen“ (Erweiterung E): erzeugt die KI-Einzelanalyse einer Person für einen Monat.
//
// Aufruf: POST { person_id: uuid, monat: 'YYYY-MM', neu?: boolean } mit der Anmeldung der Leitung (JWT, verify_jwt an).
// Ablauf:
//   1. Die Eingabe baut die Datenbank (analyse_eingabe): Kennzahlen aus SQL, Kommentare ohne Absender, Namen durch Platzhalter ersetzt.
//      Dort wird auch die Rolle geprüft (nur Verantwortliche und Admin, eigener Salon; Schalter eigene_analyse_nur_admin).
//   2. Gleiche Eingabe und gleiche Prompt-Version wie die gespeicherte Analyse: kein neuer KI-Aufruf (außer neu = true).
//   3. Der Anbieter (Secret AI_PROVIDER = claude | webhook) formuliert den Text; die Zahlen bleiben die der Datenbank.
//   4. Der Faktencheck läuft in der Datenbank (analyse_pruefen); bei Abweichungen wird bis zu zweimal neu erzeugt.
//   5. analyse_speichern legt den Entwurf ab. Die Datenbank ermittelt „geprüft“ selbst.
// Alle Datenbank-Aufrufe laufen mit der Anmeldung der aufrufenden Person; ein service_role-Schlüssel wird nicht gebraucht.
//
// Secrets (Supabase → Edge Functions → Secrets): AI_PROVIDER, ANTHROPIC_API_KEY (und optional ANTHROPIC_MODEL)
// oder AI_WEBHOOK_URL (und optional AI_WEBHOOK_SECRET).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { erzeuge, inputHash, KiFehler, PROMPT_VERSION, waehleProvider, type Eingabe } from './analyse.ts'

const KOPF = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
}

const antwort = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: KOPF })
const fehler = (status: number, art: string, meldung: string) => antwort(status, { fehler: art, meldung })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: KOPF })
  if (req.method !== 'POST') return fehler(405, 'methode', 'Nur POST ist erlaubt.')

  const auth = req.headers.get('authorization')
  if (!auth) return fehler(401, 'keine_anmeldung', 'Bitte melde dich an.')

  let body: { person_id?: string; monat?: string; neu?: boolean }
  try {
    body = await req.json()
  } catch {
    return fehler(400, 'ungueltige_anfrage', 'Die Anfrage ist ungültig.')
  }
  const personId = String(body.person_id ?? '')
  const monat = String(body.monat ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(personId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) return fehler(400, 'ungueltige_anfrage', 'Person oder Monat fehlen.')

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const p_monat = `${monat}-01`

  try {
    // 1. Eingabe aus der Datenbank (prüft die Rolle)
    const e = await sb.rpc('analyse_eingabe', { p_person: personId, p_monat })
    if (e.error) {
      if (e.error.code === '42501') return fehler(403, 'keine_berechtigung', 'Dafür hast du keine Berechtigung.')
      if (e.error.code === '22023') return fehler(422, 'keine_daten', 'Für diesen Monat liegt keine Auswertung vor.')
      return fehler(500, 'datenbank', 'Die Daten konnten nicht geladen werden.')
    }
    const eingabe = (e.data as { eingabe: Eingabe; hash: string }).eingabe
    const hash = await inputHash((e.data as { hash: string }).hash)

    // 2. Idempotenz: gleiche Eingabe, gleiche Prompt-Version → kein neuer Aufruf
    if (!body.neu) {
      const vorhanden = await sb.rpc('analyse_lesen', { p_person: personId, p_monat })
      const a = vorhanden.data as { input_hash?: string } | null
      if (a && a.input_hash === hash) return antwort(200, { analyse: a, neu_erzeugt: false, ki_aufrufe: 0 })
    }

    // 3. und 4. Erzeugen und prüfen (der Faktencheck läuft in der Datenbank)
    const provider = waehleProvider(Deno.env.toObject())
    const ergebnis = await erzeuge(provider, eingabe, async (ausgabe, text_md) => {
      const r = await sb.rpc('analyse_pruefen', { p_person: personId, p_monat, p_inhalt: ausgabe, p_text: text_md })
      if (r.error) throw new KiFehler('ki_fehler', 'Der Faktencheck konnte nicht ausgeführt werden.')
      return r.data as { geprueft: boolean; unbekannt: string[] }
    })

    // 5. Als Entwurf speichern
    const s = await sb.rpc('analyse_speichern', {
      p_person: personId,
      p_monat,
      p_inhalt: ergebnis.ausgabe,
      p_text_md: ergebnis.text_md,
      p_modell: ergebnis.modell,
      p_prompt_version: PROMPT_VERSION,
      p_input_hash: hash,
    })
    if (s.error) {
      if (s.error.code === '42501') return fehler(403, 'keine_berechtigung', 'Dafür hast du keine Berechtigung.')
      return fehler(500, 'datenbank', 'Die Analyse konnte nicht gespeichert werden.')
    }
    return antwort(200, { analyse: s.data, neu_erzeugt: true, ki_aufrufe: ergebnis.aufrufe })
  } catch (err) {
    if (err instanceof KiFehler) {
      const status = err.art === 'ki_nicht_eingerichtet' ? 503 : err.art === 'zeitueberschreitung' ? 504 : 502
      return fehler(status, err.art, err.message)
    }
    return fehler(500, 'unbekannt', 'Unerwarteter Fehler. Bitte versuche es noch einmal.')
  }
})
