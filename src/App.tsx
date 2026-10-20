import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireZugriff } from './auth/RequireRole'
import KonfigFehlt from './components/KonfigFehlt'
import Layout from './components/Layout'
import { konfigurationVollstaendig } from './lib/supabase'
import Callback from './pages/Callback'
import GaesteUmfrage from './pages/GaesteUmfrage'
import Login from './pages/Login'
import NichtGefunden from './pages/NichtGefunden'
import Start from './pages/Start'
import Home from './pages/app/Home'
import { BereichPlatzhalter, MitgliedPlatzhalter } from './pages/app/Platzhalter'
import UmfrageSeite from './pages/app/Umfrage'

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
                <Route path="ergebnisse" element={<BereichPlatzhalter id="ergebnisse" />} />
              </Route>

              {/* Teilnehmer und Leitung */}
              <Route element={<RequireZugriff bedingung="teilnehmerOderLeitung" />}>
                <Route path="team" element={<BereichPlatzhalter id="team" />} />
                <Route path="chefumfrage" element={<BereichPlatzhalter id="chefumfrage" />} />
                <Route path="coaching" element={<BereichPlatzhalter id="coaching" />} />
              </Route>

              {/* Leitung (Verantwortlicher, Admin) */}
              <Route element={<RequireZugriff bedingung="leitung" />}>
                <Route path="mitglieder" element={<BereichPlatzhalter id="mitglieder" />} />
                <Route path="mitglieder/:id" element={<MitgliedPlatzhalter />} />
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
