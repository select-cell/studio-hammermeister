// Minimale Typen und Lader für den Vimeo-Player (nur nötig, wenn ein Verhalten eine Vimeo-URL hat).

export interface VimeoPlayer {
  getDuration(): Promise<number>
  setCurrentTime(sekunden: number): Promise<number>
  on(ereignis: string, rueckruf: (daten: { seconds: number }) => void): void
  destroy(): Promise<void>
}

declare global {
  interface Window {
    Vimeo?: { Player: new (iframe: HTMLIFrameElement) => VimeoPlayer }
  }
}

let ladevorgang: Promise<void> | null = null

export function ladeVimeoApi(): Promise<void> {
  if (window.Vimeo?.Player) return Promise.resolve()
  if (ladevorgang) return ladevorgang
  ladevorgang = new Promise<void>((erfolg, fehler) => {
    const skript = document.createElement('script')
    skript.src = 'https://player.vimeo.com/api/player.js'
    skript.onload = () => erfolg()
    skript.onerror = () => {
      ladevorgang = null
      fehler(new Error('Vimeo-Steuerung nicht ladbar'))
    }
    document.head.appendChild(skript)
  })
  return ladevorgang
}
