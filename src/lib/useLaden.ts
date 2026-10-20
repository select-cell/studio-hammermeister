import { useCallback, useEffect, useState } from 'react'

export interface LadeZustand<T> {
  /** zuletzt geladene Daten; bleiben beim Nachladen stehen, damit die Seite nicht flackert */
  daten: T | null
  laedt: boolean
  fehler: boolean
  neuLaden: () => void
}

/** Lädt Daten beim Einblenden und bei jeder Änderung von `schluessel`. */
export function useLaden<T>(lader: () => Promise<T>, schluessel: string): LadeZustand<T> {
  const [zustand, setZustand] = useState<{ daten: T | null; laedt: boolean; fehler: boolean }>({ daten: null, laedt: true, fehler: false })
  const [versuch, setVersuch] = useState(0)

  useEffect(() => {
    let aktiv = true
    setZustand((z) => ({ ...z, laedt: true, fehler: false }))
    lader()
      .then((daten) => aktiv && setZustand({ daten, laedt: false, fehler: false }))
      .catch(() => aktiv && setZustand((z) => ({ ...z, laedt: false, fehler: true })))
    return () => {
      aktiv = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel, versuch])

  const neuLaden = useCallback(() => setVersuch((v) => v + 1), [])
  return { ...zustand, neuLaden }
}
