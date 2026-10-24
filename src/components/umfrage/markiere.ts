/** Weiches Scrollen, außer das Gerät wünscht sich weniger Bewegung. */
export function scrollArt(): ScrollBehavior {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/** Hebt ein Element kurz rot hervor und scrollt es ins Bild (wie in der Umfrage, wenn etwas fehlt). */
export function markiere(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  el.style.outline = '2px solid var(--red-v)'
  el.scrollIntoView({ behavior: scrollArt(), block: 'center' })
  window.setTimeout(() => {
    el.style.outline = ''
  }, 900)
}

/** Holt ein Element ins Bild und setzt den Fokus darauf (z. B. „Absenden“ nach der letzten Bewertung). */
export function fokussiere(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: scrollArt(), block: 'center' })
  el.focus({ preventScroll: true })
}
