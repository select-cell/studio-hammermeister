import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { EmailOtpType } from '@supabase/supabase-js'
import { useAuth } from '../auth/AuthContext'
import Laden from '../components/Laden'
import Logo from '../components/Logo'
import { startAdresse, supabase } from '../lib/supabase'

const STANDARD_FEHLER = 'Die Anmeldung hat nicht geklappt. Bitte fordere einen neuen Link an.'
const ABGELAUFEN = 'Der Link ist abgelaufen oder wurde schon benutzt. Bitte fordere einen neuen Link an.'
const WARTEZEIT_MS = 6000

// Der Link aus der E-Mail liefert die Sitzung im Adressteil (#access_token=…) oder, mit angepasster
// E-Mail-Vorlage, als ?token_hash=…&type=email. Fehler (z. B. abgelaufen) kommen als error_* Parameter.
const hashParameter = new URLSearchParams(startAdresse.hash.replace(/^#/, ''))
const sucheParameter = new URLSearchParams(startAdresse.suche)

function fehlerAusAdresse(): string | null {
  const code = hashParameter.get('error_code') ?? sucheParameter.get('error_code')
  const fehler = hashParameter.get('error') ?? sucheParameter.get('error')
  if (!code && !fehler) return null
  return code === 'otp_expired' ? ABGELAUFEN : STANDARD_FEHLER
}

export default function Callback() {
  const { laedt, session } = useAuth()
  const navigate = useNavigate()
  const [fehler, setFehler] = useState<string | null>(fehlerAusAdresse)
  const verifiziert = useRef(false)

  // Link mit token_hash (angepasste E-Mail-Vorlage): einmalig bestätigen.
  useEffect(() => {
    const tokenHash = sucheParameter.get('token_hash')
    const typ = sucheParameter.get('type')
    if (!tokenHash || !typ || verifiziert.current) return
    verifiziert.current = true
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: typ as EmailOtpType }).then(({ error }) => {
      if (error) setFehler(ABGELAUFEN)
    })
  }, [])

  // Angemeldet → weiter nach /app, dort richtet sich der Inhalt nach den Rechten der Person.
  useEffect(() => {
    if (!laedt && session) navigate('/app', { replace: true })
  }, [laedt, session, navigate])

  // Kommt keine Sitzung zustande, nicht ewig warten.
  useEffect(() => {
    if (session || fehler) return
    const timer = setTimeout(() => setFehler(STANDARD_FEHLER), WARTEZEIT_MS)
    return () => clearTimeout(timer)
  }, [session, fehler])

  if (!fehler) return <Laden text="Du wirst angemeldet …" />

  return (
    <div className="seite-zentriert">
      <div className="karte karte-schmal">
        <div className="seite-logo">
          <Logo />
        </div>
        <h1 className="karte-titel">Anmeldung nicht möglich</h1>
        <div className="hinweis hinweis-fehler" role="alert">
          {fehler}
        </div>
        <Link to="/login" className="btn btn-primaer btn-voll">
          Neuen Link anfordern
        </Link>
      </div>
    </div>
  )
}
