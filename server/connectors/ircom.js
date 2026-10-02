// Impôt sur le revenu par commune (IRCOM, DGFiP) : une archive par année de revenus (2021-2024) contenant un classeur Excel national.
// Les archives sont téléchargées, le classeur communal est lu puis filtré sur l'Île-de-France (montants en milliers d'euros).
const JSZip = require('jszip');
const XLSX = require('xlsx');
const { fetchRetry } = require('./melodi');

const IDF = new Set(['75', '77', '78', '91', '92', '93', '94', '95']);
const TRANCHES = {
  'Total': '_T', '0 à 10 000': 'T1', '10 001 à 12 000': 'T2', '12 001 à 15 000': 'T3', '15 001 à 20 000': 'T4',
  '20 001 à 30 000': 'T5', '30 001 à 50 000': 'T6', '50 001 à 100 000': 'T7', '+ de 100 000': 'T8',
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

let cache = null;

async function loadYear(resource, year) {
  const res = await fetchRetry(`https://www.data.gouv.fr/api/1/datasets/r/${resource}`, { redirect: 'follow', signal: AbortSignal.timeout(900000) });
  if (!res.ok) throw new Error(`téléchargement IRCOM ${year} : HTTP ${res.status}`);
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const entry = Object.values(zip.files).find((f) => /ircom_communes.*\.xlsx$/i.test(f.name));
  if (!entry) throw new Error(`classeur communal introuvable dans l'archive IRCOM ${year}`);
  const wb = XLSX.read(await entry.async('nodebuffer'), { dense: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, blankrows: false });
  const out = new Map();
  for (const r of rows) {
    const tranche = TRANCHES[r[3]];
    if (!tranche || typeof r[0] !== 'string') continue;
    const dep = r[0].slice(0, 2);
    if (!IDF.has(dep)) continue;
    const code = `${dep}${String(r[1]).padStart(3, '0')}`;
    const list = out.get(code) || out.set(code, []).get(code);
    const add = (mesure, value) => { if (value != null) list.push({ period: String(year), dims: { MESURE: mesure, TRANCHE: tranche }, measure: 'valeur', value }); };
    const foyers = num(r[4]), rfr = num(r[5]), impot = num(r[6]), imposes = num(r[7]), rfrImposes = num(r[8]);
    add('FOYERS_FISCAUX', foyers); add('RFR', rfr); add('IMPOT_NET', impot); add('FOYERS_IMPOSES', imposes); add('RFR_IMPOSES', rfrImposes);
    if (foyers && rfr != null) add('RFR_MOYEN', (rfr * 1000) / foyers);
  }
  return out;
}

async function load(config) {
  if (cache && Date.now() - cache.at < 60 * 60000) return cache.byCommune;
  const byCommune = new Map();
  for (const y of config.years) {
    const m = await loadYear(y.resource, y.year);
    for (const [code, rows] of m) (byCommune.get(code) || byCommune.set(code, []).get(code)).push(...rows);
  }
  cache = { at: Date.now(), byCommune };
  return byCommune;
}

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  return (await load(config)).get(geo.code) || [];
}
async function fetchMany(config, geos) {
  const idx = await load(config);
  return new Map(geos.map((g) => [g.code, idx.get(g.code) || []]));
}

module.exports = { fetchGeo, fetchMany };
