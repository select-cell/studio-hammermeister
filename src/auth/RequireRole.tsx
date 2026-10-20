import { Navigate, Outlet } from 'react-router-dom'
import KeinZugang from '../components/KeinZugang'
import Laden from '../components/Laden'
import { erfuellt, type Bedingung } from '../lib/rechte'
import { useAuth } from './AuthContext'

/** Schutz für alles unter /app: eingeloggt, einer aktiven Person zugeordnet. */
export function RequireAuth() {
  const { laedt, session, personStatus } = useAuth()

  if (laedt || (session && (personStatus === 'leer' || personStatus === 'laedt'))) return <Laden />
  if (!session) return <Navigate to="/login" replace />
  if (personStatus !== 'bereit') return <KeinZugang />
  return <Outlet />
}

/** Schutz einzelner Bereiche nach den zwei Merkmalen aus §2. Wer nicht darf, landet auf /app. */
export function RequireZugriff({ bedingung }: { bedingung: Bedingung }) {
  const { person } = useAuth()
  if (!person || !erfuellt(bedingung, person)) return <Navigate to="/app" replace />
  return <Outlet />
}
