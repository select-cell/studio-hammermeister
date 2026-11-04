import { BRAND } from '../config/brand'

export type LogoVariante = 'header' | 'login' | 'pdf'

/**
 * Das Logo des Salons. Die einzige Stelle, an der ein Logo ausgegeben wird (keine verstreuten <img>-Tags).
 * Die Dateien kommen aus src/assets/brand/<salon-slug>/; für den Nachtmodus wird logo-dark genutzt, falls es sie gibt.
 * Feste Höhe, Breite folgt dem Seitenverhältnis (object-fit: contain), damit nichts springt.
 */
export default function BrandLogo({ variant }: { variant: LogoVariante }) {
  const { name, logo } = BRAND
  if (!logo.hell) return <span className={`brand-logo brand-logo-${variant} brand-logo-text`}>{name}</span>
  return (
    <span className={`brand-logo brand-logo-${variant}${logo.dunkel ? ' hat-dunkel' : ''}`}>
      <img className="brand-logo-hell" src={logo.hell} alt={name} />
      {logo.dunkel && <img className="brand-logo-dunkel" src={logo.dunkel} alt="" aria-hidden="true" />}
    </span>
  )
}
