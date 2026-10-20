export default function Fortschritt({ schritt, gesamt, fertig = false }: { schritt: number; gesamt: number; fertig?: boolean }) {
  const prozent = fertig ? 100 : Math.round((schritt / gesamt) * 100)
  const text = fertig ? 'Fertig' : schritt > 0 ? `${schritt} / ${gesamt}` : ''
  return (
    <div className="um-fortschritt" role="progressbar" aria-label="Fortschritt der Umfrage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prozent}>
      <span className="um-fortschritt-text">{text}</span>
      <div className="um-fortschritt-balken">
        <div className="um-fortschritt-fuellung" style={{ width: `${prozent}%` }} />
      </div>
    </div>
  )
}
