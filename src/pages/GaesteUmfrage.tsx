import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { SALON_NAME } from '../config'

/** Phase 5: öffentliche Gästeumfrage ohne Login (Link / QR-Code im Salon). */
export default function GaesteUmfrage() {
  return (
    <div className="seite-zentriert">
      <div className="karte karte-schmal">
        <div className="seite-logo">
          <Logo />
          <span className="brand-name">{SALON_NAME}</span>
        </div>
        <h1 className="karte-titel">Gästeumfrage</h1>
        <p className="text-gedimmt">Unsere Gästeumfrage ist bald hier verfügbar. Danke für dein Interesse!</p>
        <Link to="/" className="btn btn-sekundaer btn-voll">
          Zur Startseite
        </Link>
      </div>
    </div>
  )
}
