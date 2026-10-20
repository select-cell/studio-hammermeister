import type { Person, Rolle } from './types'

// Zwei unabhängige Merkmale steuern, was jemand sieht (siehe docs/plattform-architektur.md §2):
//  - nimmt_an_teamumfrage → Teilnehmer-Bereiche
//  - rolle verantwortlicher/admin → Leitungs-Bereiche
// Michael Hammermeister hat beides. Der Schutz im Frontend ist nur Komfort;
// die eigentliche Sicherheit liegt in RLS und den Datenbank-Funktionen.

export type Bedingung = 'teilnehmer' | 'leitung' | 'teilnehmerOderLeitung'

export const istLeitung = (p: Person): boolean => p.rolle === 'verantwortlicher' || p.rolle === 'admin'

export const istTeilnehmer = (p: Person): boolean => p.nimmt_an_teamumfrage

export function erfuellt(bedingung: Bedingung, p: Person): boolean {
  switch (bedingung) {
    case 'teilnehmer':
      return istTeilnehmer(p)
    case 'leitung':
      return istLeitung(p)
    case 'teilnehmerOderLeitung':
      return istTeilnehmer(p) || istLeitung(p)
  }
}

export const rolleLabel: Record<Rolle, string> = {
  mitarbeiter: 'Team',
  verantwortlicher: 'Verantwortlicher',
  admin: 'Admin',
}

export const vorname = (p: Person): string => p.name.split(' ')[0]

export const initiale = (name: string): string => name.trim().charAt(0).toUpperCase()
