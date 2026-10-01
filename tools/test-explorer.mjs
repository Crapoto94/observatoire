// Test de l'explorateur avec les données réelles de l'API : pour chaque jeu, sélection par défaut puis comparaison avec d'autres territoires.
// Usage : node tools/test-explorer.mjs   (le serveur doit tourner, par défaut sur http://localhost:2508)
import { initialSelection, selectRows, buildChart, pinnedDims } from '../client/src/explorer.ts';
import { VIEWS } from '../client/src/datasetViews.ts';

const API = process.env.API || 'http://localhost:2508/api';
const REF = '94041';
const get = async (p) => (await fetch(API + p)).json();

const geos = await get('/geos');
const datasets = await get('/datasets');
const geoName = (c) => geos.find((g) => g.code === c)?.nom ?? c;
const popOf = (c) => geos.find((g) => g.code === c)?.population || null;
const cases = [
  ['Ivry seul', [REF]],
  ['Ivry + Vitry (commune)', [REF, '94081']],
  ['Ivry + Val-de-Marne', [REF, '94']],
  ['Ivry + Métropole', [REF, '200054781']],
  ['Ivry + Île-de-France', [REF, '11']],
];

let fails = 0, warns = 0;
for (const d of datasets) {
  const ref = await get(`/datasets/${d.id}/data?geos=${REF}`);
  const labels = ref.labels || {};
  const label = (dim, code) => labels[dim]?.values?.[code] ?? (code === '_T' ? 'Total' : code);
  if (!ref.rows.length) { console.log(`✗ ${d.id}: aucune ligne pour Ivry`); fails++; continue; }
  const dimNames = [...new Set(ref.rows.flatMap((r) => Object.keys(r.dims)))];
  const hier = VIEWS[d.id]?.hier && VIEWS[d.id].hier.every((h) => dimNames.includes(h)) ? VIEWS[d.id].hier : null;
  const ctx = { dimNames, hier, label, geoName, popOf };
  const sel = initialSelection(ref.rows, ctx, VIEWS[d.id] ?? {});
  const out = [];
  for (const [name, codes] of cases) {
    const data = await get(`/datasets/${d.id}/data?geos=${codes.join(',')}`);
    const present = [...new Set(data.rows.map((r) => r.geo))];
    const chart = buildChart(selectRows(data.rows, sel, ctx), sel, ctx);
    const expected = present.length;
    const got = chart.geos.length;
    let flag = '';
    if (!chart.data.length) flag = 'VIDE';
    else if (got < expected) flag = `séries manquantes (${got}/${expected})`;
    else if (chart.dupes) flag = `doublons (${chart.dupes})`;
    if (flag) { if (flag === 'VIDE' || flag.startsWith('séries')) fails++; else warns++; }
    out.push(`${name}: ${chart.data.length} pts, ${chart.names.length} séries${flag ? ' ⚠ ' + flag : ''}${present.length < codes.length ? ' (jeu sans données pour ce niveau)' : ''}`);
  }
  const pins = pinnedDims(sel, ctx).map((p) => `${p}=${sel.pins[p]}`).join(', ');
  console.log(`\n${d.id} — x=${sel.x}${sel.series ? ' séries=' + sel.series : ''} | pins: ${pins || '—'}`);
  out.forEach((l) => console.log('   ' + l));
}
console.log(`\n${fails} échec(s), ${warns} avertissement(s)`);
process.exit(fails ? 1 : 0);
