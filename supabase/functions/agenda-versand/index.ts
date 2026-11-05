// Edge Function „agenda-versand“ (Erweiterung F): schickt Verantwortlichen die Agenda vor dem Teammeeting per Mail.
//
// Aufruf: POST ohne Anmeldung, aber mit dem Header „x-cron-secret: <CRON_SECRET>“ – gedacht für den Zeitplan in der Datenbank
// (pg_cron + pg_net, siehe supabase/versand_einrichten.sql), alle 15 Minuten. Deshalb wird die Function ohne JWT-Prüfung
// veröffentlicht (verify_jwt aus); die Prüfung des Secrets übernimmt diese Datei. Ohne gültiges Secret passiert nichts.
// Optional: { "trocken": true } zeigt nur, was fällig wäre (nichts wird beansprucht oder gesendet).
//
// Ablauf (Details und Regeln in der Migration 020 und in versand.ts):
//   1. Konfiguration prüfen. Fehlt ein Secret, antwortet die Function mit 503 und fasst die Datenbank nicht an;
//      so verbraucht ein fehlender Schlüssel keinen der drei Versuche.
//   2. versand_faellig → je Mail versand_beanspruchen (UNIQUE je Termin und Art) → agenda_fuer_versand → Resend → versand_abschliessen.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   CRON_SECRET      langer Zufallswert, derselbe wie im Zeitplan
//   RESEND_API_KEY   API-Schlüssel von Resend
//   MAIL_ABSENDER    z. B. „Salon Muster <plattform@deine-domain.de>“ (Domain bei Resend bestätigt)
//   PLATTFORM_URL    Adresse der Plattform, z. B. https://dein-salon.netlify.app (für den Link in der Mail)
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase der Function selbst bereit; die Versand-Funktionen der Datenbank
// sind ausschließlich für service_role aufrufbar. Der Schlüssel liegt nie im Frontend oder im Repo.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { gleichInZeit, lauf, leseKonfiguration, resendSender, type Rpc } from './versand.ts'

const KOPF = { 'content-type': 'application/json; charset=utf-8' }
const antwort = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: KOPF })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return antwort(405, { fehler: 'methode', meldung: 'Nur POST ist erlaubt.' })

  const konfig = leseKonfiguration(Deno.env.toObject())
  if (!konfig.ok) {
    // Ohne CRON_SECRET kann nichts geprüft werden; auch das ist „nicht konfiguriert“
    return antwort(503, { fehler: 'nicht_konfiguriert', meldung: 'Der Versand ist noch nicht eingerichtet.', fehlend: konfig.fehlend })
  }
  const gesendet = req.headers.get('x-cron-secret') ?? ''
  if (!gleichInZeit(gesendet, konfig.konfig.cronSecret)) return antwort(401, { fehler: 'keine_berechtigung', meldung: 'Das Secret stimmt nicht.' })

  let trocken = false
  try {
    const body = (await req.json()) as { trocken?: boolean } | null
    trocken = body?.trocken === true
  } catch {
    /* kein Body ist in Ordnung */
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const rpc: Rpc = async (name, args) => {
    const r = await sb.rpc(name, args ?? {})
    if (r.error) throw new Error(`${name}: ${r.error.message}`)
    return r.data
  }

  try {
    if (trocken) {
      const faellig = (await rpc('versand_faellig')) as Array<{ termin_id: string; art: string; titel: string; startet_lokal: string; empfaenger: string[] }>
      return antwort(200, {
        trocken: true,
        faellig: faellig.map((f) => ({ termin_id: f.termin_id, art: f.art, titel: f.titel, startet_lokal: f.startet_lokal, empfaenger_anzahl: f.empfaenger.length })),
      })
    }
    const ergebnis = await lauf(rpc, resendSender(konfig.konfig), konfig.konfig)
    return antwort(200, ergebnis)
  } catch (e) {
    console.error('agenda-versand:', e instanceof Error ? e.message : e)
    return antwort(500, { fehler: 'lauf', meldung: 'Der Versand-Lauf ist fehlgeschlagen.' })
  }
})
