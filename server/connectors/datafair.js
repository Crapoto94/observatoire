// Connecteur Data Fair (portail open data de l'Agence ORE : https://opendata.agenceore.fr, API /data-fair/api/v1).
// Les lignes d'un jeu sont lues par pages de 10 000, filtrées par territoire à la source (paramètre « champ_in »), puis agrégées à l'import.
const { fetchJson } = require('./melodi');
const open = require('./open');

const BASE = 'https://opendata.agenceore.fr/data-fair/api/v1';
const IDF = new Set(['75', '77', '78', '91', '92', '93', '94', '95']);
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, (k + 1) * n));

async function lines(config, filters) {
  const p = new URLSearchParams({ size: '10000', format: 'json', select: config.select.join(','), ...filters });
  let url = `${config.base || BASE}/datasets/${config.dataset}/lines?${p}`;
  const out = [];
  for (let pages = 0; url && pages < 200; pages++) {
    const j = await fetchJson(url);
    out.push(...(j.results || []));
    url = (j.results || []).length === 10000 ? j.next : null;
  }
  return out;
}

const rowsOf = (config, recs) => {
  let rows = open.mapRecords(recs, config, {}, config.period ?? null);
  return rows;
};

/** Un territoire (commune, département ou région selon config.levels). */
async function fetchGeo(config, geo) {
  const field = config.levels?.[geo.level || 'COM'];
  if (!field) return null;
  return rowsOf(config, await lines(config, { [`${field}_in`]: geo.code }));
}

/** Plusieurs communes (lots de 100 codes). */
async function fetchMany(config, geos) {
  const field = config.levels?.COM;
  if (!field) return null;
  const comm = geos.filter((g) => (g.level || 'COM') === 'COM');
  const out = new Map(geos.map((g) => [g.code, []]));
  // beaucoup de communes : téléchargement par région ou par département (préfixe du code commune), puis filtre interne
  const depts = [...new Set(comm.map((g) => g.code.slice(0, 2)))];
  if (comm.length >= 200) {
    const filters = config.levels?.REG && depts.every((d) => IDF.has(d))
      ? [{ [`${config.levels.REG}_in`]: '11' }]
      : depts.map((d) => ({ [`${field}_starts`]: d }));
    for (const f of filters) {
      const byGeo = new Map();
      for (const r of await lines(config, f)) {
        const k = String(r[field]);
        (byGeo.get(k) || byGeo.set(k, []).get(k)).push(r);
      }
      for (const [code, list] of byGeo) if (out.has(code)) out.get(code).push(...rowsOf(config, list));
    }
    return out;
  }
  for (const part of chunk(comm.map((g) => g.code), 100)) {
    const recs = await lines(config, { [`${field}_in`]: part.join(',') });
    const byGeo = new Map();
    for (const r of recs) {
      const k = String(r[field]);
      (byGeo.get(k) || byGeo.set(k, []).get(k)).push(r);
    }
    for (const [code, list] of byGeo) if (out.has(code)) out.get(code).push(...rowsOf(config, list));
  }
  return out;
}

module.exports = { fetchGeo, fetchMany };
