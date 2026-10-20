// Diagrammfarben wie im alten Board (docs/plattform-architektur.md §5.6) – gleiche Werte wie --chart-* in tokens.css.
// Achsen, Gitter und Hervorhebungen kommen als CSS-Variablen, damit sie im Nachtmodus mitwechseln.
export const FARBE = {
  sb: '#C4845A',
  fb: '#4A7FA5',
  rituale: '#4CAF50',
  gut: '#4CAF50',
  schlecht: '#E24B4A',
  achse: 'var(--chart-achse)',
  gitter: 'var(--chart-gitter)',
  cursor: 'var(--chart-cursor)',
  korridor: 'var(--chart-korridor)',
} as const
