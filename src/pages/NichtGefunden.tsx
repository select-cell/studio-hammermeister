import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

export default function NichtGefunden() {
  return (
    <div className="seite-zentriert">
      <div className="karte karte-schmal">
        <div className="seite-logo">
          <Logo />
        </div>
        <h1 className="karte-titel">Diese Seite gibt es nicht</h1>
        <p className="text-gedimmt">Vielleicht ist der Link veraltet oder falsch abgetippt.</p>
        <Link to="/" className="btn btn-primaer btn-voll">
          Zur Startseite
        </Link>
      </div>
    </div>
  )
}
