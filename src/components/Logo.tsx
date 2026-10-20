/** Das Markenzeichen aus der Umfrage (gestapelte Ebenen) auf Akzentfläche. */
export default function Logo({ klein = false }: { klein?: boolean }) {
  return (
    <span className={`brand-icon${klein ? ' klein' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    </span>
  )
}
