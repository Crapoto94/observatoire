// Comptes individuels des communes (DGFiP) : fichiers annuels du portail data.economie.gouv.fr (Opendatasoft).
// Les montants « par habitant » (champs f*) et les moyennes de la strate de population (champs m*) sont repris tels quels.
// Le code INSEE est reconstruit à partir du département (« 094 ») et du numéro de commune (« 041 »).
const { odsRecords } = require('./open');

const BASE = 'https://data.economie.gouv.fr';
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, (k + 1) * n));

const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function rowsOf(config, records) {
  const out = [];
  for (const r of records) {
    const period = String(r.an);
    for (const m of config.measures) {
      const v = num(r[m.field]);
      if (v != null) out.push({ period, dims: { MESURE: m.measure }, measure: 'valeur', value: v });
    }
  }
  return out;
}

// Enregistrements des communes demandées (codes INSEE) dans tous les fichiers annuels
async function fetchCodes(config, codes) {
  const out = new Map(codes.map((c) => [c, []]));
  const byDept = new Map();
  for (const c of codes) (byDept.get(c.slice(0, 2)) || byDept.set(c.slice(0, 2), []).get(c.slice(0, 2))).push(c);
  for (const dataset of config.datasets) {
    for (const [dept, list] of byDept) {
      for (const part of chunk(list, 40)) {
        const where = `dep="0${dept}" and icom in (${part.map((c) => `"${c.slice(2)}"`).join(', ')})`;
        const recs = await odsRecords({ base: BASE, dataset }, { where });
        const by = new Map();
        for (const r of recs) {
          const code = String(r.dep).slice(1) + String(r.icom);
          (by.get(code) || by.set(code, []).get(code)).push(r);
        }
        for (const [code, list2] of by) if (out.has(code)) out.get(code).push(...rowsOf(config, list2));
      }
    }
  }
  return out;
}

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  return (await fetchCodes(config, [geo.code])).get(geo.code);
}

async function fetchMany(config, geos) {
  const comm = geos.filter((g) => (g.level || 'COM') === 'COM');
  const got = await fetchCodes(config, comm.map((g) => g.code));
  return new Map(geos.map((g) => [g.code, got.get(g.code) || []]));
}

module.exports = { fetchGeo, fetchMany };
