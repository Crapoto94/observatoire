// Indice de position sociale (IPS) des écoles (Éducation nationale) : moyenne des écoles de la commune, par rentrée et par secteur.
// Le champ IPS est publié en texte : la moyenne est calculée ici à partir des écoles d'Île-de-France.
const { odsRecords } = require('./open');

const BASE = 'https://data.education.gouv.fr';
const DATASET = 'fr-en-ips-ecoles-ap2022';

let cache = null;

async function load() {
  if (cache && Date.now() - cache.at < 30 * 60000) return cache.byCommune;
  const rentrees = [];
  for (let y = 2022; y <= new Date().getFullYear(); y++) rentrees.push(`${y}-${y + 1}`);
  const acc = new Map(); // commune -> `${rentrée}|${secteur}` -> { sum, n }
  for (const rentree of rentrees) {
    const recs = await odsRecords({ base: BASE, dataset: DATASET }, {
      where: `region="ILE-DE-FRANCE" and rentree_scolaire="${rentree}"`,
      select: 'code_insee_de_la_commune, secteur, ips',
    }).catch(() => []);
    for (const r of recs) {
      const ips = Number(String(r.ips ?? '').replace(',', '.'));
      const code = r.code_insee_de_la_commune;
      if (!code || !Number.isFinite(ips) || ips <= 0) continue;
      const m = acc.get(code) || acc.set(code, new Map()).get(code);
      for (const secteur of [String(r.secteur || '').toLowerCase() === 'privé' || String(r.secteur || '').toLowerCase() === 'prive' ? 'prive' : 'public', '_T']) {
        const k = `${rentree}|${secteur}`;
        const a = m.get(k) || m.set(k, { sum: 0, n: 0 }).get(k);
        a.sum += ips; a.n++;
      }
    }
  }
  const byCommune = new Map();
  for (const [code, m] of acc) {
    const rows = [];
    for (const [k, a] of m) {
      const [period, secteur] = k.split('|');
      rows.push({ period, dims: { MESURE: 'IPS_MOYEN', SECTEUR: secteur }, measure: 'valeur', value: a.sum / a.n });
      rows.push({ period, dims: { MESURE: 'NB_ECOLES', SECTEUR: secteur }, measure: 'valeur', value: a.n });
    }
    byCommune.set(code, rows);
  }
  cache = { at: Date.now(), byCommune };
  return byCommune;
}

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  return (await load()).get(geo.code) || [];
}
async function fetchMany(config, geos) {
  const idx = await load();
  return new Map(geos.map((g) => [g.code, idx.get(g.code) || []]));
}

module.exports = { fetchGeo, fetchMany };
