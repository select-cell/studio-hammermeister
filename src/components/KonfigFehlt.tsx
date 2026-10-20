import Logo from './Logo'

/** Wird gezeigt, wenn die .env fehlt (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). */
export default function KonfigFehlt() {
  return (
    <div className="seite-zentriert">
      <div className="karte karte-schmal">
        <div className="seite-logo">
          <Logo />
        </div>
        <h1 className="karte-titel">Verbindung zu Supabase fehlt</h1>
        <p className="text-gedimmt">
          Es sind keine Zugangsdaten hinterlegt. Lege im Projektordner eine Datei <code>.env</code> an (Vorlage:{' '}
          <code>.env.example</code>) und trage <code>VITE_SUPABASE_URL</code> sowie{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> ein. Danach die App neu starten bzw. neu bauen.
        </p>
      </div>
    </div>
  )
}
