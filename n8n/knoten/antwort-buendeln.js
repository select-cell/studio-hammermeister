// Fasst die Ergebnisse aller Aufträge zur Antwort des Webhooks zusammen (geht direkt an die Plattform zurück).
const ergebnisse = $input.all().map((i) => ({
  ref: i.json.ref,
  code: i.json.code,
  ...(i.json.code === 200
    ? { ausgabe: i.json.ausgabe, meta: i.json.meta }
    : { fehler: i.json.fehler, detail: i.json.detail ?? null }),
}));

// Hat für keinen Auftrag etwas geklappt, steht der Fehler auch im Status der Antwort
const alleFehler = ergebnisse.every((e) => e.code >= 400);
const code = alleFehler ? (ergebnisse.some((e) => e.code === 429) ? 429 : 502) : 200;

return [{ json: { code, body: { aufgabe: $input.first().json.aufgabe, ergebnisse } } }];
