import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const konfigurationVollstaendig = Boolean(url && anonKey)

// Ohne .env wird die App mit einem Hinweis angezeigt; die Platzhalter-Werte
// verhindern nur, dass createClient beim Start eine Ausnahme wirft.
// Angemeldet wird nur mit E-Mail und Passwort. Tokens in der Adresszeile werden nicht ausgewertet
// (detectSessionInUrl aus): Niemand soll sich per präpariertem Link in eine fremde Sitzung schieben lassen.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'nicht-konfiguriert', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
