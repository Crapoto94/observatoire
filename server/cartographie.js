// Cartographie : couches communales (jeux disponibles) avec valeur par commune, tendance et résumé GOSB / Ivry / Val-de-Marne / Île-de-France.
const { all } = require('./db');
const { KPIS, seriesOf, matches, totalOnly } = require('./kpi');
const { membersOf } = require('./groups');
const { populationSeries } = require('./importer');
const { REF_GEO } = require('./seed');

// couches propres à la cartographie (en plus des KPI du tableau de bord)
const EXTRA = [
  { id: 'validations', label: 'Validations du réseau ferré (1er trimestre, pour 1 000 hab.)', theme: 'Mobilité', dataset: 'idfm_ferre', where: { MESURE: 'VALIDATIONS' }, perK: true, dir: 'none' },
  { id: 'velo', label: 'Capacité de stationnement vélo (pour 1 000 hab.)', theme: 'Mobilité', dataset: 'velo_stationnement', where: { MESURE: 'CAPACITE', MOBILIER: '_T' }, perK: true, dir: 'up' },
];
const LAYERS = [...KPIS, ...EXTRA].map((k) => ({ ...k, label: k.perK && !/1 000/.test(k.label) ? `${k.label} (pour 1 000 hab.)` : k.label }));

// jeux construits par comptage d'événements (accidents, autorisations) : l'absence de ligne signifie « zéro » et non « inconnu »
const ZERO_FILL = new Set(['accidents', 'autorises', 'commences']);
const ADDITIVE = (l) => !l.ratio && !['%', '€', '€/m²'].includes(l.unit || '');
const FLAT = 0.5; // % d'évolution en deçà duquel la tendance est jugée stable

// population la plus proche de la période (millésimes du recensement)
function popAt(series, period) {
  const s = series || {};
  const keys = Object.keys(s);
  if (!keys.length) return null;
  const y = Number(String(period).slice(0, 4));
  const best = keys.reduce((b, k) => (Math.abs(Number(k) - y) < Math.abs(Number(b) - y) ? k : b), keys[0]);
  return s[best] || null;
}

function trendOf(cur, prev) {
  if (cur == null || prev == null) return null;
  const pct = prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null;
  const dir = pct == null ? (cur > prev ? 'up' : cur < prev ? 'down' : 'flat') : Math.abs(pct) < FLAT ? 'flat' : pct > 0 ? 'up' : 'down';
  return { dir, pct, abs: cur - prev };
}

function list() {
  const shapes = new Set(all('SELECT code FROM geo_shapes').map((r) => r.code));
  const cover = new Map();
  for (const r of all('SELECT dataset_id, geo FROM data_rows GROUP BY dataset_id, geo')) {
    if (shapes.has(r.geo)) cover.set(r.dataset_id, (cover.get(r.dataset_id) || 0) + 1);
  }
  return LAYERS.map((l) => ({ id: l.id, label: l.label, theme: l.theme, dataset: l.dataset, unit: l.unit || '', perK: !!l.perK, dir: l.dir, communes: cover.get(l.dataset) || 0 }));
}

// lignes d'un jeu pour des territoires, restreintes en SQL aux modalités fixées par la couche
function rowsFor(layer, geos) {
  const conds = [], params = [layer.dataset];
  const dimsToFilter = { ...layer.where };
  for (const [d, v] of Object.entries(dimsToFilter)) {
    if (!/^[A-Z0-9_]+$/.test(d)) continue;
    conds.push(`json_extract(dims, '$.${d}') = ?`); params.push(v);
  }
  if (layer.ratio) {
    const codes = [...layer.ratio.num, ...layer.ratio.den];
    conds.push(`json_extract(dims, '$.${layer.ratio.dim}') IN (${codes.map(() => '?').join(',')})`); params.push(...codes);
  }
  const by = new Map();
  for (let i = 0; i < geos.length; i += 500) {
    const part = geos.slice(i, i + 500);
    const rows = all(
      `SELECT geo, period, dims, value FROM data_rows WHERE dataset_id = ? AND geo IN (${part.map(() => '?').join(',')}) AND value IS NOT NULL ${conds.map((c) => 'AND ' + c).join(' ')}`,
      params[0], ...part, ...params.slice(1)
    );
    for (const r of rows) (by.get(r.geo) || by.set(r.geo, []).get(r.geo)).push({ period: r.period, dims: JSON.parse(r.dims || '{}'), value: r.value });
  }
  return by;
}

function layerData(id, scope = '94', periodWanted = '') {
  const layer = LAYERS.find((l) => l.id === id);
  if (!layer) return null;
  const members = membersOf(String(scope).toUpperCase());
  const communes = members.length
    ? members
    : all(scope === 'idf' ? 'SELECT code FROM geo_shapes' : 'SELECT s.code FROM geo_shapes s JOIN geos g ON g.code = s.code WHERE g.dept = ?', ...(scope === 'idf' ? [] : [scope])).map((r) => r.code);
  const pops = populationSeries();
  const per = (geo, period, v) => {
    if (!layer.perK) return v;
    const p = popAt(pops[geo], period);
    return p ? (v / p) * 1000 : null;
  };
  const seriesGeo = (geo, rows) => seriesOf(rows || [], layer).map((s) => ({ period: s.period, value: per(geo, s.period, s.value) })).filter((s) => s.value != null);

  const byGeo = rowsFor(layer, communes);
  const periodsSet = new Set();
  const series = new Map();
  for (const g of communes) {
    const s = seriesGeo(g, byGeo.get(g));
    if (s.length) { series.set(g, s); s.forEach((p) => periodsSet.add(p.period)); }
  }
  const periods = [...periodsSet].sort();
  const period = periods.includes(periodWanted) ? periodWanted : periods[periods.length - 1] || '';
  const pi = periods.indexOf(period);
  const prevPeriod = pi > 0 ? periods[pi - 1] : null;
  const zero = ZERO_FILL.has(layer.id) && series.size >= communes.length * 0.5; // jeu suffisamment chargé : absence = 0
  const values = {};
  for (const g of communes) {
    const s = series.get(g) || [];
    const at = (per2) => s.find((p) => p.period === per2)?.value ?? null;
    let cur = at(period);
    if (cur == null) { if (!zero) continue; cur = per(g, period, 0); if (cur == null) continue; }
    let prev = prevPeriod ? at(prevPeriod) : null;
    let pp = prevPeriod;
    if (prev == null && zero && prevPeriod) prev = per(g, prevPeriod, 0);
    if (prev == null && !zero) { const i = s.findIndex((p) => p.period === period); if (i > 0) { prev = s[i - 1].value; pp = s[i - 1].period; } }
    values[g] = { v: cur, prev: prev ?? null, prevPeriod: prev != null ? pp : null, trend: trendOf(cur, prev ?? null) };
  }

  // résumé : GOSB (agrégat), Ivry, Val-de-Marne, Île-de-France. Quand le jeu n'existe pas à ce niveau (jeux communaux), somme des communes.
  const refs = [['GOSB', 'Grand-Orly Seine Bièvre'], [REF_GEO.code, 'Ivry-sur-Seine'], ['94', 'Val-de-Marne'], ['11', 'Île-de-France']];
  const rrows = rowsFor(layer, refs.map((r) => r[0]));
  const codesOf = (code) => (code === 'GOSB' ? membersOf('GOSB') : code === '94' ? all("SELECT s.code FROM geo_shapes s JOIN geos g ON g.code = s.code WHERE g.dept = '94'").map((r) => r.code) : code === '11' ? all('SELECT code FROM geo_shapes').map((r) => r.code) : []);
  const summary = refs.map(([code, nom]) => {
    let s = seriesGeo(code, rrows.get(code));
    let aggregated = false;
    if (!s.length && ADDITIVE(layer) && codesOf(code).length) {
      const raw = rowsFor(layer, codesOf(code));
      const sum = new Map();
      for (const [, rows] of raw) for (const r of seriesOf(rows, layer)) sum.set(r.period, (sum.get(r.period) ?? 0) + r.value);
      s = [...sum.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([period2, v]) => ({ period: period2, value: per(code, period2, v) })).filter((x) => x.value != null);
      aggregated = s.length > 0;
    }
    const i = s.findIndex((p) => p.period === period);
    const cur = i >= 0 ? s[i] : null;
    const prev = i > 0 ? s[i - 1] : null;
    return { code, nom, aggregated, value: cur?.value ?? null, period: cur?.period ?? null, prev: prev?.value ?? null, prevPeriod: prev?.period ?? null, trend: trendOf(cur?.value ?? null, prev?.value ?? null), series: s.slice(-8) };
  });
  const l = { id: layer.id, label: layer.label, theme: layer.theme, dataset: layer.dataset, unit: layer.unit || '', perK: !!layer.perK, dir: layer.dir };
  return { layer: l, scope, period, periods, values, summary, gosb: membersOf('GOSB') };
}

module.exports = { list, layerData, LAYERS };
