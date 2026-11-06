import BrandLogo from './BrandLogo'
import { schluesselProblem } from '../lib/supabase'

/** Wird gezeigt, wenn die .env fehlt (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). */
export default function KonfigFehlt() {
  return (
    <div className="seite-zentriert">
      <div className="karte karte-schmal">
        <div className="seite-logo">
          <BrandLogo variant="login" />
        </div>
        <h1 className="karte-titel">{schluesselProblem ? 'Falscher Schlüssel eingetragen' : 'Verbindung zu Supabase fehlt'}</h1>
        {schluesselProblem ? (
          <p className="text-gedimmt">
            In <code>VITE_SUPABASE_ANON_KEY</code> steht kein öffentlicher Schlüssel (anon bzw. publishable), sondern ein geheimer. Der gehört nie in die App:
            Jeder könnte ihn im Browser lesen. Die App startet deshalb nicht. Bitte den öffentlichen Schlüssel aus Supabase (Project Settings → API) eintragen,
            danach neu bauen und den geheimen Schlüssel in Supabase erneuern.
          </p>
        ) : (
          <p className="text-gedimmt">
            Es sind keine Zugangsdaten hinterlegt. Lege im Projektordner eine Datei <code>.env</code> an (Vorlage: <code>.env.example</code>) und trage{' '}
            <code>VITE_SUPABASE_URL</code> sowie <code>VITE_SUPABASE_ANON_KEY</code> ein. Danach die App neu starten bzw. neu bauen.
          </p>
        )}
      </div>
    </div>
  )
}
