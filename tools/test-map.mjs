// Test de la carte : pour chaque préréglage de chaque jeu chargé pour l'Île-de-France, récupère les valeurs communales via l'API
// (/datasets/:id/map), les calcule comme la carte et les compare, pour Ivry, au calcul local sur les mêmes lignes.
// Usage : node tools/test-map.mjs [jeu]   (le serveur doit tourner, par défaut sur http://localhost:2508)
import { buildSelection, categoryOptions, mapConstraints, mapValues, quantileBreaks } from '../client/src/explorer.ts';
import { VIEWS } from '../client/src/datasetViews.ts';

const API = process.env.API || 'http://localhost:2508/api';
const REF = '94041';
const only = process.argv[2];
const get = async (p) => (await fetch(API + p)).json();

const geos = await get('/geos?all=1');
const status = await get('/idf/status');
const datasets = (await get('/datasets')).filter((d) => d.map_capable && (d.map_communes ?? 0) >= 50 && (!only || d.id === only));
const geoName = (c) => geos.find((g) => g.code === c)?.nom ?? c;
const popOf = (c, per) => {
  const g = geos.find((x) => x.code === c);
  const s = g?.pop_series ?? {};
  const years = Object.keys(s);
  const y = Number(String(per ?? '').slice(0, 4));
  if (!years.length || !y) return g?.population || null;
  return s[years.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a))];
};
const fmt = (v) => (v == null ? 'n.d.' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('fr-FR') : v.toFixed(2));
const matches = (r, c, period) => Object.entries(c).every(([d, codes]) => codes.includes(r.dims[d])) && (!period || r.period === period);

let n = 0, warns = 0;
console.log(`${status.communes} communes d'Île-de-France connues, ${datasets.length} jeux avec carte`);
for (const d of datasets) {
  const ref = await get(`/datasets/${d.id}/data?geos=${REF}`);
  const labels = ref.labels || {};
  const label = (dim, code) => labels[dim]?.values?.[code] ?? (code === '_T' ? 'Total' : code);
  const dimNames = [...new Set(ref.rows.flatMap((r) => Object.keys(r.dims)))];
  const view = VIEWS[d.id] ?? {};
  const hier = view.hier && view.hier.every((h) => dimNames.includes(h)) ? view.hier : null;
  const ctx = { dimNames, hier, label, geoName, popOf };
  const periods = await get(`/datasets/${d.id}/periods`);
  console.log(`\n${d.id} — ${d.map_communes} communes avec données`);
  for (const p of view.presets?.length ? view.presets : [{ label: '(vue par défaut)', ...view }]) {
    n++;
    const sel = buildSelection(ref.rows, ctx, p);
    const catKey = sel.x === '@HIER' ? '@HIER' : sel.x.startsWith('@') ? '' : sel.x;
    const cat = catKey ? categoryOptions(ref.rows, catKey, sel, ctx)[0] ?? '' : '';
    const sv = sel.series && !sel.series.startsWith('@') ? categoryOptions(ref.rows, sel.series, sel, ctx)[0] ?? '' : '';
    const period = periods.includes(sel.period) ? sel.period : periods[periods.length - 1] ?? '';
    const pick = { cat, seriesVal: sv, period };
    const c = mapConstraints(sel, ctx, pick);
    const j = await get(`/datasets/${d.id}/map?scope=idf&period=${encodeURIComponent(period)}&dims=${encodeURIComponent(JSON.stringify(c))}`);
    const values = mapValues(j.rows, sel, ctx);
    const local = mapValues(ref.rows.filter((r) => matches(r, c, period)), sel, ctx).get(REF);
    const vs = [...values.values()].sort((a, b) => a - b);
    const problems = [];
    if (vs.length < 50) problems.push(`seulement ${vs.length} communes`);
    const remote = values.get(REF);
    if (local != null && remote != null && Math.abs(local - remote) > 1e-6 * Math.max(1, Math.abs(local))) problems.push(`Ivry ${fmt(remote)} ≠ local ${fmt(local)}`);
    if (local != null && remote == null) problems.push('Ivry absent de la carte');
    if (sel.ratio && (sel.ratio.factor ?? 100) === 100 && !/vieillissement|dépendance/.test(p.label) && vs.some((v) => v < 0 || v > 100)) problems.push('ratio hors 0-100');
    warns += problems.length ? 1 : 0;
    const br = quantileBreaks(vs, 6);
    console.log(`  ${problems.length ? '⚠' : '✓'} ${p.label} — ${vs.length} communes, min ${fmt(vs[0])} · médiane ${fmt(vs[Math.floor(vs.length / 2)])} · max ${fmt(vs[vs.length - 1])} · Ivry ${fmt(remote)} · ${br.length} classes${problems.length ? '\n      ' + problems.join('\n      ') : ''}`);
  }
}
console.log(`\n${n} lectures cartographiques, ${warns} avec avertissement`);
process.exit(0);
