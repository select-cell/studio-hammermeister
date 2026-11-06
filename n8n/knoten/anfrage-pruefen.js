// Einstellungen je Aufgabe (= je Strang). Eine neue Aufgabe: hier eintragen, im Knoten „Aufgabe wählen“ eine Regel
// ergänzen und einen Strang (Agent + Claude-Modell) kopieren.
const AUFGABEN = {
  einzelanalyse: {
    strang: 'Einzelanalyse',
    form: 'analyse',
    hinweisSchluessel: 'kommentar_qualitaet_hinweis',
    listen: { staerken: [2, 4], entwicklungsfelder: [2, 4], gespraechsfragen: [3, 4], vereinbarungen_vorschlaege: [2, 3] },
    // Laut Prompt nicht erlaubt: Buchstaben-Bezeichnungen wie „Kollege A“
    verbotenMuster: '\\bKollege\\s+[A-Z]\\b',
    verbotenText: 'Enthält eine Buchstaben-Bezeichnung wie „Kollege A“ (laut Prompt nicht erlaubt)',
    // Zusätzlicher Kontext für den Agenten (Salon, Begriffe). Keine Zahlen hineinschreiben: Der Faktencheck der Datenbank lehnt Zahlen ab, die nicht in den Daten stehen.
    zusatzkontext: '',
  },
  gesamtauswertung: {
    strang: 'Gesamtauswertung',
    form: 'analyse',
    hinweisSchluessel: 'datenlage_hinweis',
    listen: { staerken: [2, 4], entwicklungsfelder: [2, 4], gespraechsfragen: [3, 4], vereinbarungen_vorschlaege: [2, 3] },
    verbotenMuster: '',
    verbotenText: '',
    zusatzkontext: '',
  },
  agenda: {
    strang: 'Agenda',
    form: 'agenda',
    // Reihenfolge, Minuten (von, bis) und Gesamtdauer der Agenda; die Datenbank prüft sie verbindlich
    bloecke: [['einstieg', 2, 2], ['kennzahlen', 3, 3], ['fokus', 6, 8], ['entwicklung', 3, 4], ['vereinbarungen', 2, 3]],
    gesamt: [15, 20],
    punkteProBlock: [2, 4],
    zusatzkontext: '',
  },
};
const MAX_AUFTRAEGE = 10;

// Die Anfrage steckt im Body des Webhooks. Beim Testen im Editor darf auch der reine Inhalt einer Testanfrage
// (n8n/testanfragen/*.json) eingefügt werden: Dann steht sie direkt im Datensatz.
const eingang = $('Webhook').first().json;
const b = eingang.body ?? eingang;
const fehler = [];
const aufgabe = AUFGABEN[b.aufgabe];
if (!aufgabe) fehler.push('aufgabe ist unbekannt (erlaubt: ' + Object.keys(AUFGABEN).join(', ') + ')');
if (!Array.isArray(b.auftraege) || b.auftraege.length === 0) fehler.push('auftraege fehlt oder ist leer');
else if (b.auftraege.length > MAX_AUFTRAEGE) fehler.push('auftraege: höchstens ' + MAX_AUFTRAEGE);
else {
  const refs = new Set();
  b.auftraege.forEach((a, i) => {
    const wo = 'auftraege[' + i + ']';
    if (!a || typeof a !== 'object') return fehler.push(wo + ' ist kein Objekt');
    if (typeof a.ref !== 'string' || !a.ref) fehler.push(wo + ': ref fehlt');
    else if (refs.has(a.ref)) fehler.push(wo + ': ref ist doppelt');
    else refs.add(a.ref);
    if (typeof a.nachricht !== 'string' || !a.nachricht.trim()) fehler.push(wo + ': nachricht fehlt');
    else if (a.nachricht.length > 60000) fehler.push(wo + ': nachricht ist zu lang');
    if (typeof a.system !== 'string' || !a.system.trim()) fehler.push(wo + ': system fehlt');
    if (!a.eingabe || typeof a.eingabe !== 'object' || Array.isArray(a.eingabe)) fehler.push(wo + ': eingabe fehlt');
  });
}

if (fehler.length > 0) return [{ json: { gueltig: false, fehler } }];

return b.auftraege.map((a) => ({
  json: {
    gueltig: true,
    fehler: [],
    aufgabe: b.aufgabe,
    strang: aufgabe.strang,
    ref: a.ref,
    prompt_version: b.prompt_version ?? null,
    // Prompt aus der Plattform, danach der Kontext aus diesem Workflow
    system: aufgabe.zusatzkontext ? a.system + '\n\nZusätzlicher Kontext:\n' + aufgabe.zusatzkontext : a.system,
    nachricht: a.nachricht,
    eingabe: a.eingabe,
    form: aufgabe.form,
    hinweisSchluessel: aufgabe.hinweisSchluessel ?? null,
    listen: aufgabe.listen ?? null,
    verbotenMuster: aufgabe.verbotenMuster ?? '',
    verbotenText: aufgabe.verbotenText ?? '',
    bloecke: aufgabe.bloecke ?? null,
    gesamt: aufgabe.gesamt ?? null,
    punkteProBlock: aufgabe.punkteProBlock ?? null,
  },
}));
