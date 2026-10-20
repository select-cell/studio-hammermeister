// Erzeugt supabase/migrations/003_seed_hammermeister_inhalte.sql direkt aus der Umfrage in referenz/.
// Aufruf: node scripts/erzeuge-seed-inhalte.mjs
// Damit werden Verhalten und Bewertungsstufen nicht von Hand abgetippt, sondern 1:1 übernommen.
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

const quelle = new URL('../referenz/umfrage-hammermeister.html', import.meta.url)
const ziel = new URL('../supabase/migrations/003_seed_hammermeister_inhalte.sql', import.meta.url)

const html = readFileSync(quelle, 'utf8')
const von = html.indexOf('const CONFIG = {')
const bis = html.indexOf('/* ═══════════════════ ENDE KONFIGURATION')
if (von < 0 || bis < 0) throw new Error('CONFIG-Block in der Umfrage nicht gefunden')
const CONFIG = vm.runInNewContext(`${html.slice(von, bis)}\nCONFIG;`)

if (CONFIG.rituale.length !== 0) throw new Error('Die Umfrage enthält Rituale. Dieses Skript seedet bisher nur Verhalten.')

const verhalten = CONFIG.verhalten.map((v, i) => {
  if (!v.titel) throw new Error(`Verhalten ${i + 1} hat keinen Titel`)
  if (!Array.isArray(v.kriterien) || v.kriterien.length !== 5) throw new Error(`Verhalten ${i + 1} braucht genau 5 Bewertungsstufen`)
  return {
    nr: i + 1,
    grundpfeiler: v.grundpfeiler || null,
    saeule: v.saeule || null,
    titel: v.titel,
    video_url: v.video || null,
    kriterien: v.kriterien.map((k, s) => ({
      stufe: s + 1,
      bezeichnung: k.stufe,
      prozent: k.prozent,
      leitsatz: k.text,
      punkte: k.items,
    })),
  }
})

const json = `[\n${verhalten.map((v) => `  ${JSON.stringify(v)}`).join(',\n')}\n]`
if (json.includes('$daten$')) throw new Error('Der Inhalt enthält die Begrenzung $daten$')

const sql = `-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 003 · Phase 2 · Inhalte Hammermeister (Seed)
-- ═══════════════════════════════════════════════════════════════════════════
--  ${verhalten.length} Verhalten mit je 5 Bewertungsstufen, 1:1 aus referenz/umfrage-hammermeister.html.
--  Grundpfeiler und Säulen sind leer (Zuordnung folgt), es gibt keine Rituale.
--
--  ERZEUGT mit:  node scripts/erzeuge-seed-inhalte.mjs   – nicht von Hand ändern.
--  Kann gefahrlos mehrfach ausgeführt werden (vorhandene Verhalten bleiben unverändert).
--  Spätere Textänderungen kommen als eigene Migration (update ...).
-- ═══════════════════════════════════════════════════════════════════════════

with daten as (
  select $daten$${json}$daten$::jsonb as j
),
neu as (
  insert into public.verhalten (salon_id, nr, grundpfeiler, saeule, titel, video_url)
  select s.id,
         (v->>'nr')::smallint,
         nullif(v->>'grundpfeiler', ''),
         nullif(v->>'saeule', ''),
         v->>'titel',
         nullif(v->>'video_url', '')
  from public.salons s
  cross join daten
  cross join lateral jsonb_array_elements(daten.j) as v
  where s.name = 'Hammermeister'
  on conflict (salon_id, nr) do nothing
  returning id, nr
)
insert into public.verhalten_kriterien (verhalten_id, stufe, bezeichnung, prozent, leitsatz, punkte)
select neu.id,
       (k->>'stufe')::smallint,
       k->>'bezeichnung',
       k->>'prozent',
       k->>'leitsatz',
       array(select t.x from jsonb_array_elements_text(k->'punkte') with ordinality as t(x, n) order by t.n)
from daten
cross join lateral jsonb_array_elements(daten.j) as v
join neu on neu.nr = (v->>'nr')::smallint
cross join lateral jsonb_array_elements(v->'kriterien') as k
on conflict (verhalten_id, stufe) do nothing;
`

writeFileSync(ziel, sql)
console.log(`${verhalten.length} Verhalten, ${verhalten.length * 5} Bewertungsstufen → ${ziel.pathname} (${Math.round(sql.length / 1024)} KB)`)
