import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { abmelden as abmeldenApi, ladeIch } from '../lib/api'
import { konfigurationVollstaendig, supabase } from '../lib/supabase'
import type { Person } from '../lib/types'
import { AuthContext, type AuthWert, type PersonStatus } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [laedt, setLaedt] = useState(konfigurationVollstaendig)
  const [session, setSession] = useState<Session | null>(null)
  const [person, setPerson] = useState<Person | null>(null)
  const [personStatus, setPersonStatus] = useState<PersonStatus>('leer')
  const [version, setVersion] = useState(0)

  // Sitzung: beim Start lesen und auf Änderungen hören (Anmeldung, Abmeldung, Token-Erneuerung).
  useEffect(() => {
    if (!konfigurationVollstaendig) return
    let aktiv = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!aktiv) return
        setSession(data.session)
        setLaedt(false)
      })
      .catch(() => {
        if (aktiv) setLaedt(false)
      })
    const { data } = supabase.auth.onAuthStateChange((_ereignis, neueSession) => {
      setSession(neueSession)
      setLaedt(false)
    })
    return () => {
      aktiv = false
      data.subscription.unsubscribe()
    }
  }, [])

  // Person: nur neu laden, wenn sich der Nutzer ändert (nicht bei jedem Token-Refresh).
  const nutzerId = session?.user.id ?? null
  useEffect(() => {
    if (!nutzerId) {
      setPerson(null)
      setPersonStatus('leer')
      return
    }
    let abgebrochen = false
    setPersonStatus('laedt')
    ladeIch()
      .then((p) => {
        if (abgebrochen) return
        if (!p) {
          setPerson(null)
          setPersonStatus('unbekannt')
        } else if (!p.aktiv) {
          setPerson(null)
          setPersonStatus('inaktiv')
        } else {
          setPerson(p)
          setPersonStatus('bereit')
        }
      })
      .catch(() => {
        if (abgebrochen) return
        setPerson(null)
        setPersonStatus('fehler')
      })
    return () => {
      abgebrochen = true
    }
  }, [nutzerId, version])

  const abmelden = useCallback(async () => {
    await abmeldenApi()
    setPerson(null)
    setPersonStatus('leer')
  }, [])

  const neuLaden = useCallback(() => setVersion((v) => v + 1), [])

  const wert = useMemo<AuthWert>(
    () => ({ laedt, session, person, personStatus, abmelden, neuLaden }),
    [laedt, session, person, personStatus, abmelden, neuLaden],
  )

  return <AuthContext.Provider value={wert}>{children}</AuthContext.Provider>
}
