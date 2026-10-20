import { erfuellt, istLeitung, type Bedingung } from './rechte'
import type { Person } from './types'

// Einzige Quelle für alle Bereiche der App: Navigation, Kacheln auf /app und
// Platzhalter-Seiten lesen von hier. Neue Bereiche nur hier ergänzen.

export interface Bereich {
  id: string
  pfad: string
  bedingung: Bedingung
  /** Bauphase, in der der Bereich fertig wird (docs/plattform-architektur.md §8) */
  phase: number
  /** Kurzer Name für die Navigation */
  nav: string
  titel: (p: Person) => string
  beschreibung: (p: Person) => string
}

/** Bereiche bis zu dieser Bauphase sind fertig; alle anderen zeigen „Kommt bald“. */
export const FERTIG_BIS_PHASE = 4

export const istFertig = (b: Bereich): boolean => b.phase <= FERTIG_BIS_PHASE

export const PHASEN: Record<number, string> = {
  2: 'Monatsumfrage',
  3: 'Auswertungen',
  4: 'Abgabe-Status & Reminder',
  5: 'Weitere Umfragetypen',
  6: 'Jarvis',
}

export const BEREICHE: Bereich[] = [
  {
    id: 'ergebnisse',
    pfad: '/app/ergebnisse',
    bedingung: 'teilnehmer',
    phase: 3,
    nav: 'Ergebnisse',
    titel: () => 'Meine Ergebnisse',
    beschreibung: (p) =>
      istLeitung(p) ? 'Selbstbild, Fremdbild und deine Entwicklung über die Monate.' : 'Deine eigenen Antworten und dein Selbstbild über die Monate.',
  },
  {
    id: 'team',
    pfad: '/app/team',
    bedingung: 'teilnehmerOderLeitung',
    phase: 3,
    nav: 'Team',
    titel: (p) => (istLeitung(p) ? 'Team-Dashboard' : 'Team-Ergebnisse'),
    beschreibung: (p) =>
      istLeitung(p)
        ? 'Rangliste, Heatmap und Auswertung für das ganze Team.'
        : 'So steht das Team insgesamt da – als Durchschnitt.',
  },
  {
    id: 'mitglieder',
    pfad: '/app/mitglieder',
    bedingung: 'leitung',
    phase: 3,
    nav: 'Mitglieder',
    titel: () => 'Mitglieder',
    beschreibung: () => 'Die individuelle Auswertung jedes Teammitglieds.',
  },
  {
    id: 'chefumfrage',
    pfad: '/app/chefumfrage',
    bedingung: 'teilnehmerOderLeitung',
    phase: 5,
    nav: 'Chefumfrage',
    titel: (p) => (istLeitung(p) ? 'Ergebnisse Chefumfrage' : 'Chefumfrage'),
    beschreibung: (p) =>
      istLeitung(p)
        ? 'Die Ergebnisse der Chefumfrage, die einmal im Quartal stattfindet.'
        : 'Einmal im Quartal gibst du hier Feedback an den Verantwortlichen.',
  },
  {
    id: 'gaeste',
    pfad: '/app/gaeste',
    bedingung: 'leitung',
    phase: 5,
    nav: 'Gäste',
    titel: () => 'Ergebnisse Gästeumfrage',
    beschreibung: () => 'Das Feedback eurer Gäste auf einen Blick.',
  },
  {
    id: 'meine-umfrage',
    pfad: '/app/meine-umfrage',
    bedingung: 'leitung',
    phase: 5,
    nav: 'Meine Umfrage',
    titel: () => 'Umfrage für den Verantwortlichen',
    beschreibung: () => 'Dein persönlicher Link zur Umfrage für den Verantwortlichen.',
  },
  {
    id: 'coaching',
    pfad: '/app/coaching',
    bedingung: 'teilnehmerOderLeitung',
    phase: 6,
    nav: 'Coaching',
    titel: () => 'Coaching mit Jarvis',
    beschreibung: () => 'Dein digitaler Coach, der deine Ergebnisse kennt.',
  },
]

export const sichtbareBereiche = (p: Person): Bereich[] => BEREICHE.filter((b) => erfuellt(b.bedingung, p))

export const bereichById = (id: string): Bereich | undefined => BEREICHE.find((b) => b.id === id)
