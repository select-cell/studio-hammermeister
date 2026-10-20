// Prüfung eines neuen Passworts im Formular. Die eigentliche Regel (Mindestlänge, Schwäche) setzt Supabase
// unter Authentication → Providers → Email; hier nur schnelle Rückmeldung vor dem Absenden.

export const MIN_LAENGE = 8

export type PasswortFehler = 'aktuellFehlt' | 'zuKurz' | 'verschieden' | 'gleich'

export function pruefePasswort(aktuell: string, neu: string, wiederholung: string): PasswortFehler | null {
  if (!aktuell) return 'aktuellFehlt'
  if (neu.length < MIN_LAENGE) return 'zuKurz'
  if (neu !== wiederholung) return 'verschieden'
  if (neu === aktuell) return 'gleich'
  return null
}

export const passwortFehlerText: Record<PasswortFehler | 'aktuellFalsch' | 'zuSchwach' | 'zuVieleAnfragen' | 'fehler', string> = {
  aktuellFehlt: 'Bitte gib dein aktuelles Passwort ein.',
  zuKurz: `Das neue Passwort braucht mindestens ${MIN_LAENGE} Zeichen.`,
  verschieden: 'Die beiden neuen Passwörter sind nicht gleich.',
  gleich: 'Das neue Passwort muss sich vom aktuellen unterscheiden.',
  aktuellFalsch: 'Das aktuelle Passwort stimmt nicht.',
  zuSchwach: 'Dieses Passwort ist zu einfach. Nimm eine längere Zeichenfolge, am besten mit Buchstaben und Zahlen gemischt.',
  zuVieleAnfragen: 'Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann noch einmal.',
  fehler: 'Das hat nicht geklappt. Bitte prüfe deine Verbindung und versuche es gleich noch einmal.',
}
