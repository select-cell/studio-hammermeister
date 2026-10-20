import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireZugriff } from './auth/RequireRole'
import Fehlergrenze from './components/Fehlergrenze'
import KonfigFehlt from './components/KonfigFehlt'
import Laden from './components/Laden'
import Layout from './components/Layout'
import { konfigurationVollstaendig } from './lib/supabase'
import Callback from './pages/Callback'
import GaesteUmfrage from './pages/GaesteUmfrage'
import Login from './pages/Login'
import NichtGefunden from './pages/NichtGefunden'
import Start from './pages/Start'
import Home from './pages/app/Home'
import { BereichPlatzhalter } from './pages/app/Platzhalter'
import UmfrageSeite from './pages/app/Umfrage'

// Die Auswertungen bringen die Diagramm-Bibliothek mit; sie wird erst geladen, wenn jemand eine Auswertung öffnet.
const Ergebnisse = lazy(() => import('./pages/app/Ergebnisse'))
const Team = lazy(() => import('./pages/app/Team'))
const Mitglieder = lazy(() => import('./pages/app/Mitglieder'))
const MitgliedDetail = lazy(() => import('./pages/app/MitgliedDetail'))

const nachgeladen = (seite: JSX.Element) => (
  <Fehlergrenze>
    <Suspense fallback={<Laden text="Auswertung wird geladen …" />}>{seite}</Suspense>
  </Fehlergrenze>
)

export default function App() {
  if (!konfigurationVollstaendig) return <KonfigFehlt />

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<Callback />} />
          <Route path="/gaeste-umfrage" element={<GaesteUmfrage />} />

          <Route path="/app" element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<Home />} />

              {/* Teilnehmer der Teamumfrage (nimmt_an_teamumfrage) */}
              <Route element={<RequireZugriff bedingung="teilnehmer" />}>
                <Route path="umfrage/:monat" element={<UmfrageSeite />} />
                <Route path="ergebnisse" element={nachgeladen(<Ergebnisse />)} />
              </Route>

              {/* Teilnehmer und Leitung */}
              <Route element={<RequireZugriff bedingung="teilnehmerOderLeitung" />}>
                <Route path="team" element={nachgeladen(<Team />)} />
                <Route path="chefumfrage" element={<BereichPlatzhalter id="chefumfrage" />} />
                <Route path="coaching" element={<BereichPlatzhalter id="coaching" />} />
              </Route>

              {/* Leitung (Verantwortlicher, Admin) */}
              <Route element={<RequireZugriff bedingung="leitung" />}>
                <Route path="mitglieder" element={nachgeladen(<Mitglieder />)} />
                <Route path="mitglieder/:id" element={nachgeladen(<MitgliedDetail />)} />
                <Route path="gaeste" element={<BereichPlatzhalter id="gaeste" />} />
                <Route path="meine-umfrage" element={<BereichPlatzhalter id="meine-umfrage" />} />
              </Route>

              <Route path="*" element={<Navigate to="/app" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<NichtGefunden />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
