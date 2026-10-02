// Île-de-France Mobilités : validations du réseau ferré (métro, RER, train, tramway) du dernier trimestre publié, agrégées par commune.
// Les validations sont publiées par lieu d'arrêt (ida) sans commune ; elles sont rattachées à la commune par le référentiel
// des zones d'arrêts (zdcid = ida, zdapostalregion = code INSEE).
const { fetchJson } = require('./melodi');

const BASE = 'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets';
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, (k + 1) * n));

let cache = null;

async function pages(dataset, params) {
  const out = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const p = new URLSearchParams({ limit: '100', offset: String(offset), ...params });
    const j = await fetchJson(`${BASE}/${dataset}/records?${p}`);
    out.push(...(j.results || []));
    if ((j.results || []).length < 100) break;
  }
  return out;
}

async function aggregate(config) {
  const stops = await pages(config.validations, { select: 'ida, sum(nb_vald) as s', group_by: 'ida' });
  const byIda = new Map(stops.filter((r) => r.ida != null).map((r) => [String(Math.round(r.ida)), r.s ?? 0]));
  const acc = new Map(); // commune -> { vald, arrets }
  for (const part of chunk([...byIda.keys()], 80)) {
    const zones = await pages('zones-d-arrets', { where: `zdcid in (${part.map((i) => `"${i}"`).join(', ')})`, select: 'zdcid, zdapostalregion', group_by: 'zdcid, zdapostalregion' });
    const seen = new Set();
    for (const z of zones) {
      if (!z.zdapostalregion || seen.has(z.zdcid)) continue; // un lieu d'arrêt n'est compté qu'une fois
      seen.add(z.zdcid);
      const a = acc.get(z.zdapostalregion) || acc.set(z.zdapostalregion, { vald: 0, arrets: 0 }).get(z.zdapostalregion);
      a.vald += byIda.get(String(z.zdcid)) ?? 0;
      a.arrets += 1;
    }
  }
  const rows = new Map();
  for (const [code, a] of acc) {
    rows.set(code, [
      { period: config.period, dims: { MESURE: 'VALIDATIONS' }, measure: 'valeur', value: a.vald },
      { period: config.period, dims: { MESURE: 'NB_ARRETS' }, measure: 'valeur', value: a.arrets },
    ]);
  }
  cache = { at: Date.now(), rows };
  return cache;
}

const load = async (config) => (cache && Date.now() - cache.at < 3600e3 ? cache : aggregate(config));

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  return (await load(config)).rows.get(geo.code) || [];
}

async function fetchMany(config, geos) {
  const c = await load(config);
  return new Map(geos.map((g) => [g.code, c.rows.get(g.code) || []]));
}

module.exports = { fetchGeo, fetchMany };
