import { createClient } from '@supabase/supabase-js'

// Die Adresse beim Start merken, bevor der Supabase-Client sie auswertet:
// Die Callback-Seite braucht Fehlermeldungen aus dem Link (z. B. "abgelaufen").
export const startAdresse = {
  hash: window.location.hash,
  suche: window.location.search,
}

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const konfigurationVollstaendig = Boolean(url && anonKey)

// Ohne .env wird die App mit einem Hinweis angezeigt; die Platzhalter-Werte
// verhindern nur, dass createClient beim Start eine Ausnahme wirft.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'nicht-konfiguriert', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
