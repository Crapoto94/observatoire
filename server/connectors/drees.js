// DREES : indicateur d'accessibilité potentielle localisée (APL) aux professionnels de santé, par commune (classeurs Excel,
// un par profession, un onglet « APL AAAA » par millésime). Valeur communale et population standardisée : les moyennes
// d'un territoire (GOSB, département, région) sont pondérées par la population standardisée (préconisation de la DREES).
const XLSX = require('xlsx');
const { fetchRetry } = require('./melodi');

const cache = new Map();
async function workbook(url) {
  const c = cache.get(url);
  if (c && Date.now() - c.at < 6 * 3600 * 1000) return c.map;
  const r = await fetchRetry(url);
  const wb = XLSX.read(Buffer.from(await r.arrayBuffer()), { type: 'buffer' });
  const map = new Map(); // code commune -> [{ year, apl, popStd }]
  for (const name of wb.SheetNames) {
    const m = /APL\s+(\d{4})/i.exec(name);
    if (!m) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false });
    const h = rows.findIndex((x) => x[0] === 'Code commune INSEE');
    if (h < 0) continue;
    const head = rows[h].map((x) => String(x || ''));
    const iApl = 2, iPop = head.findIndex((x) => /standardis/i.test(x)); // population (féminine pour les sages-femmes) standardisée
    for (const x of rows.slice(h + 1)) {
      const code = String(x[0] || '').padStart(5, '0');
      if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
      const apl = Number(x[iApl]), pop = Number(x[iPop]);
      if (!Number.isFinite(apl)) continue;
      (map.get(code) || map.set(code, []).get(code)).push({ year: m[1], apl, pop: Number.isFinite(pop) ? pop : null });
    }
  }
  cache.set(url, { at: Date.now(), map });
  return map;
}

function rowsOf(list, profession) {
  const out = [];
  for (const v of list || []) {
    const dims = { PROFESSION: profession };
    out.push({ period: v.year, dims: { ...dims, MESURE: 'APL' }, measure: 'valeur', value: v.apl });
    if (v.pop != null) {
      out.push({ period: v.year, dims: { ...dims, MESURE: 'POP_STD' }, measure: 'valeur', value: v.pop });
      out.push({ period: v.year, dims: { ...dims, MESURE: 'APL_POND' }, measure: 'valeur', value: v.apl * v.pop }); // APL × population standardisée
    }
  }
  return out;
}

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  const rows = [];
  for (const s of config.sources) rows.push(...rowsOf((await workbook(s.url)).get(geo.code), s.profession));
  return rows;
}

async function fetchMany(config, geos) {
  const comm = geos.filter((g) => (g.level || 'COM') === 'COM');
  const out = new Map(comm.map((g) => [g.code, []]));
  for (const s of config.sources) {
    const wb = await workbook(s.url);
    for (const g of comm) out.get(g.code).push(...rowsOf(wb.get(g.code), s.profession));
  }
  return out;
}

module.exports = { fetchGeo, fetchMany };
