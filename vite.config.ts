import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Port 5173 ist in Supabase als Redirect-URL für die Entwicklung eingetragen (siehe README).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  test: { environment: 'node' },
})
