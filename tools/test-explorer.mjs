// Test de l'explorateur avec les données réelles de l'API : chaque préréglage de chaque jeu est construit pour Ivry seul puis avec des
// territoires de comparaison. Contrôles : graphique non vide, une série par territoire disponible, pas de double compte,
// somme des catégories = total, ratios plausibles.
// Usage : node tools/test-explorer.mjs [jeu]   (le serveur doit tourner, par défaut sur http://localhost:2508)
import { buildSelection, selectRows, buildChart, pinnedDims } from '../client/src/explorer.ts';
import { VIEWS } from '../client/src/datasetViews.ts';

const API = process.env.API || 'http://localhost:2508/api';
const REF = '94041';
const only = process.argv[2];
const get = async (p) => (await fetch(API + p)).json();

const geos = await get('/geos');
const datasets = (await get('/datasets')).filter((d) => !only || d.id === only);
const geoName = (c) => geos.find((g) => g.code === c)?.nom ?? c;
const popOf = (c, per) => {
  const g = geos.find((x) => x.code === c);
  const s = g?.pop_series ?? {};
  const years = Object.keys(s);
  const y = Number(String(per ?? '').slice(0, 4));
  if (!years.length || !y) return g?.population || null;
  return s[years.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a))];
};
const cases = [
  ['Ivry', [REF]],
  ['Ivry+Vitry', [REF, '94081']],
  ['Ivry+Val-de-Marne', [REF, '94']],
  ['Ivry+Métropole', [REF, '200054781']],
];

let fails = 0, warns = 0, presetCount = 0;
const fmt = (v) => (v == null ? 'n.d.' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('fr-FR') : v.toFixed(1));

for (const d of datasets) {
  const ref = await get(`/datasets/${d.id}/data?geos=${REF}`);
  const labels = ref.labels || {};
  const label = (dim, code) => labels[dim]?.values?.[code] ?? (code === '_T' ? 'Total' : code);
  if (!ref.rows.length) { console.log(`✗ ${d.id}: aucune ligne pour Ivry`); fails++; continue; }
  const dimNames = [...new Set(ref.rows.flatMap((r) => Object.keys(r.dims)))];
  const view = VIEWS[d.id] ?? {};
  const hier = view.hier && view.hier.every((h) => dimNames.includes(h)) ? view.hier : null;
  const ctx = { dimNames, hier, label, geoName, popOf };
  const presets = view.presets?.length ? view.presets : [{ label: '(vue par défaut)', ...view }];
  const cache = new Map();
  const rowsFor = async (codes) => {
    const k = codes.join(',');
    if (!cache.has(k)) cache.set(k, (await get(`/datasets/${d.id}/data?geos=${k}`)).rows);
    return cache.get(k);
  };
  console.log(`\n${d.id} — ${d.label}`);
  for (const p of presets) {
    presetCount++;
    const sel = buildSelection(ref.rows, ctx, p);
    const problems = [];
    let summary = '';
    for (const [name, codes] of cases) {
      if (sel.x === '@GEO' && codes.length < 2) continue;
      const rows = await rowsFor(codes);
      const chart = buildChart(selectRows(rows, sel, ctx), sel, ctx);
      const present = [...new Set(rows.map((r) => r.geo))].length;
      if (!chart.data.length) { problems.push(`${name}: VIDE`); continue; }
      if (name === 'Ivry') {
        const first = chart.data[0], last = chart.data[chart.data.length - 1];
        summary = `${chart.data.length} pts [${first.x}: ${fmt(first[chart.names[0]])} … ${last.x}: ${fmt(last[chart.names[0]])}]${chart.names.length > 1 ? `, ${chart.names.length} séries` : ''}`;
        if (chart.dupes) problems.push(`doublons ${chart.dupes}`);
        // contrôle des ratios : un pourcentage doit rester entre 0 et 100 (hors indice de vieillissement et dépendance)
        if (sel.ratio && chart.unit === '%' && !/vieillissement|dépendance/.test(p.label)) {
          const bad = chart.data.flatMap((row) => chart.names.map((n) => row[n])).filter((v) => v != null && (v < 0 || v > 100));
          if (bad.length) problems.push(`ratio hors 0-100 : ${bad.map(fmt)}`);
        }
        // somme des catégories = total, pour les répartitions
        if (!p.partial && !chart.truncated && !sel.ratio && sel.mode === 'brut' && sel.x !== '@PERIOD' && sel.x !== '@GEO' && sel.x !== '@HIER' && !sel.series) {
          const sub = selectRows(rows, { ...sel, x: '@GEO', keep: {}, withTotals: true }, ctx).filter((r) => r.dims[sel.x] === '_T');
          const total = sub.reduce((s, r) => s + (r.value ?? 0), 0);
          const sum = chart.data.reduce((s, row) => s + (row[chart.names[0]] ?? 0), 0);
          if (total && Math.abs(sum - total) / total > 0.02) problems.push(`somme ${fmt(sum)} ≠ total ${fmt(total)}`);
          else if (total) summary += ` ✓ somme = total (${fmt(total)})`;
        }
      } else if (chart.geos.length < present) problems.push(`${name}: séries manquantes (${chart.geos.length}/${present})`);
    }
    if (problems.length) { fails += problems.some((x) => x.includes('VIDE') && x.startsWith('Ivry:')) || problems.some((x) => /somme|hors 0-100|doublons/.test(x)) ? 1 : 0; warns += problems.length; }
    console.log(`  ${problems.length ? '⚠' : '✓'} ${p.label}${summary ? ' — ' + summary : ''}${problems.length ? '\n      ' + problems.join('\n      ') : ''}`);
  }
}
console.log(`\n${presetCount} préréglages, ${fails} échec(s), ${warns} avertissement(s)`);
process.exit(fails ? 1 : 0);
