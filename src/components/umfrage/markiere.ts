/** Hebt ein Element kurz rot hervor und scrollt es ins Bild (wie in der Umfrage, wenn etwas fehlt). */
export function markiere(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  el.style.outline = '2px solid var(--red-v)'
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    el.style.outline = ''
  }, 900)
}

/** Setzt den Cursor in ein Feld (für fehlende Pflicht-Kommentare). */
export function fokussiere(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.focus({ preventScroll: true })
}
