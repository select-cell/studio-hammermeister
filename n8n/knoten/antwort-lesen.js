// Liest die Antwort des Agenten und macht daraus das Ergebnis für diesen Auftrag.
let k;
try {
  k = $('Anfrage prüfen').item.json;
} catch (e) {
  k = $('Anfrage prüfen').all()[$itemIndex].json;
}
const r = $input.item.json;
const fertig = (code, rest) => ({ json: { ref: k.ref, aufgabe: k.aufgabe, code, ...rest } });

// Die Antwort der Anthropic-API: { content: [{ type: 'text', text }], stop_reason, usage }. Ein Fehler kommt als { error: { type, message } }
// (oder als Text bei einer Zeitüberschreitung). Auch die Form { output: '…' } wird gelesen.
const teile = Array.isArray(r.content) ? r.content.filter((x) => x && x.type === 'text' && typeof x.text === 'string').map((x) => x.text) : null;
const text = teile ? teile.join('') : (typeof r.output === 'string' ? r.output : undefined);
const api = teile
  ? { stop_reason: r.stop_reason ?? null, ausgabe_token: r.usage?.output_tokens ?? null }
  : {};
if (r.error || typeof text !== 'string') {
  const meldung = typeof r.error === 'string' ? r.error : ([r.error?.type, r.error?.message].filter(Boolean).join(': ') || 'Die KI hat keine Antwort geliefert.');
  if (/429|rate.?limit|overloaded/i.test(meldung)) return fertig(429, { fehler: 'Die KI ist gerade ausgelastet.', detail: meldung });
  return fertig(502, { fehler: 'Die KI ist nicht erreichbar oder hat nicht geantwortet.', detail: meldung });
}
if (!text.trim()) return fertig(502, { fehler: 'Die KI hat keinen Text geliefert.', detail: api.stop_reason ? 'stop_reason: ' + api.stop_reason : null });

// Wie die Edge Function: Code-Zaun entfernen, Umbrüche mitten in Wörtern entfernen (Streaming liefert Text in Stücken mit einem
// Umbruch dazwischen), sonst das erste vollständige {...} suchen
function reparieren(t) {
  let aus = '';
  let inText = false;
  let escape = false;
  for (const c of t) {
    if (c === '\n' || c === '\r') continue;
    if (!inText) {
      if (c === '"') inText = true;
      aus += c;
    } else if (escape) {
      escape = false;
      aus += c;
    } else if (c === '\\') {
      escape = true;
      aus += c;
    } else if (c === '"') {
      inText = false;
      aus += c;
    } else {
      aus += c === '\t' ? ' ' : c;
    }
  }
  return aus;
}
function ersteJsonStelle(t) {
  const ohneZaun = t.replace(/```(?:json)?/gi, '');
  try {
    return JSON.parse(ohneZaun.trim());
  } catch (e) {
    // weiter
  }
  const von = ohneZaun.indexOf('{');
  if (von < 0) throw new Error('kein JSON');
  const r = reparieren(ohneZaun.slice(von));
  let tiefe = 0;
  let inText = false;
  let escape = false;
  for (let i = 0; i < r.length; i++) {
    const c = r[i];
    if (inText) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inText = false;
    } else if (c === '"') inText = true;
    else if (c === '{') tiefe++;
    else if (c === '}' && --tiefe === 0) return JSON.parse(r.slice(0, i + 1));
  }
  throw new Error('JSON unvollständig');
}

const hinweise = [];
if (api.stop_reason === 'max_tokens') hinweise.push('Die Antwort wurde wegen des Token-Limits abgeschnitten (stop_reason max_tokens). Im Knoten „Claude …“ max_tokens im Body erhöhen.');
let ausgabe;
try {
  ausgabe = ersteJsonStelle(text);
} catch (e) {
  // Die Plattform fragt dann selbst noch einmal nach (höchstens dreimal)
  hinweise.push('Die Antwort ist kein gültiges JSON: ' + e.message + (e.message === 'JSON unvollständig' ? ' (abgeschnitten? Dann am Knoten „Claude …“ die Option „Maximum Number of Tokens“ erhöhen)' : ''));
  ausgabe = text;
}

// Form prüfen (nur zur Orientierung; die Plattform prüft die Form beim Lesen selbst)
function pruefeAnalyse(a) {
  if (typeof a.zusammenfassung !== 'string' || !a.zusammenfassung.trim()) hinweise.push('zusammenfassung fehlt');
  for (const [name, [min, max]] of Object.entries(k.listen)) {
    const liste = a[name];
    if (!Array.isArray(liste) || liste.length === 0) hinweise.push(name + ' fehlt oder ist leer');
    else if (liste.length < min || liste.length > max) hinweise.push(name + ': ' + liste.length + ' Punkte (erwartet ' + min + ' bis ' + max + ')');
  }
  if (!(k.hinweisSchluessel in a)) hinweise.push(k.hinweisSchluessel + ' fehlt (wird als leer gewertet)');
  if (k.verbotenMuster && new RegExp(k.verbotenMuster).test(JSON.stringify(a))) hinweise.push(k.verbotenText);
}

function pruefeAgenda(a) {
  const bloecke = a.bloecke;
  if (!Array.isArray(bloecke) || bloecke.length !== k.bloecke.length) {
    hinweise.push('bloecke: ' + k.bloecke.length + ' Blöcke erwartet');
    return;
  }
  let summe = 0;
  k.bloecke.forEach(([id, min, max], i) => {
    const b = bloecke[i];
    if (!b || typeof b !== 'object') return hinweise.push('Block ' + (i + 1) + ': id „' + id + '“ erwartet');
    const ganz = typeof b.minuten === 'number' && Number.isInteger(b.minuten);
    if (ganz) summe += b.minuten;
    if (b.id !== id) return hinweise.push('Block ' + (i + 1) + ': id „' + id + '“ erwartet');
    if (!ganz) hinweise.push(id + ': minuten ist keine ganze Zahl');
    else if (b.minuten < min || b.minuten > max) hinweise.push(id + ': ' + b.minuten + ' Minuten (erlaubt ' + min + ' bis ' + max + ')');
    const anzahl = Array.isArray(b.punkte) ? b.punkte.length : 0;
    if (anzahl === 0) hinweise.push(id + ': punkte fehlt oder ist leer');
    else if (anzahl < k.punkteProBlock[0] || anzahl > k.punkteProBlock[1]) hinweise.push(id + ': ' + anzahl + ' Punkte (erwartet ' + k.punkteProBlock[0] + ' bis ' + k.punkteProBlock[1] + ')');
  });
  if (summe < k.gesamt[0] || summe > k.gesamt[1]) hinweise.push('Summe ' + summe + ' Minuten (erlaubt ' + k.gesamt[0] + ' bis ' + k.gesamt[1] + ')');
}

if (typeof ausgabe === 'object' && ausgabe !== null && !Array.isArray(ausgabe)) {
  if (k.form === 'agenda') pruefeAgenda(ausgabe);
  else pruefeAnalyse(ausgabe);
} else if (typeof ausgabe === 'object') {
  hinweise.push('Die Antwort ist kein JSON-Objekt');
}

return fertig(200, { ausgabe, meta: { strang: k.strang, prompt_version: k.prompt_version, hinweise, ...api } });
