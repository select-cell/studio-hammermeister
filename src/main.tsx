import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/dm-sans/latin-300.css'
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-serif-display/latin-400.css'
import '@fontsource/dm-serif-display/latin-400-italic.css'
import App from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/umfrage.css'
import './styles/auswertung.css'
import './styles/abgabe.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
