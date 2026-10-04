// ADEME SINOE® : flux de collecte des déchets ménagers et assimilés (DMA), indicateurs de synthèse par collectivité
// compétente et par année (tonnages, population desservie, ratios, valorisation matière). Portail data.ademe.fr (Data Fair).
// La collecte relève des EPT depuis 2016 : les communes du Grand-Orly Seine Bièvre reçoivent les valeurs de l'EPT T12
// (dimension MAILLE = EPT). La série communale antérieure (commune compétente, jusqu'en 2015) est conservée (MAILLE = COM).
const { fetchJson } = require('./melodi');

const FIELDS = 'annee,c_acteur,n_acteur,pop_dma,tonnage_dma,tonnage_omr,tonnage_bio,tonnage_enc,tonnage_verre,pct_valo_mat';
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

let cache = null;
async function load(config) {
  if (cache && Date.now() - cache.at < 6 * 3600 * 1000) return cache.rows;
  const rows = [];
  let url = `${config.url}?size=1000&select=${FIELDS}&qs=${encodeURIComponent(config.qs)}`;
  for (let i = 0; url && i < 20; i++) {
    const j = await fetchJson(url);
    rows.push(...(j.results || []));
    url = j.next || null;
  }
  cache = { at: Date.now(), rows };
  return rows;
}

function rowsOf(list, maille) {
  const out = [];
  const put = (period, mesure, value) => { if (value != null && Number.isFinite(Number(value))) out.push({ period, dims: { MAILLE: maille, MESURE: mesure }, measure: 'valeur', value: Number(value) }); };
  for (const r of list) {
    const p = String(r.annee);
    put(p, 'TONNAGE_DMA', r.tonnage_dma); put(p, 'TONNAGE_OMR', r.tonnage_omr); put(p, 'TONNAGE_BIO', r.tonnage_bio);
    put(p, 'TONNAGE_EMB', r.tonnage_enc); put(p, 'TONNAGE_VERRE', r.tonnage_verre); put(p, 'PCT_VALO_MAT', r.pct_valo_mat);
    if (r.pop_dma > 0) { // population desservie absente certaines années (2022) : pas de ratio par habitant
      put(p, 'POP', r.pop_dma);
      if (r.tonnage_dma != null) put(p, 'DMA_KG_HAB', (r.tonnage_dma * 1000) / r.pop_dma);
      if (r.tonnage_omr != null) put(p, 'OMR_KG_HAB', (r.tonnage_omr * 1000) / r.pop_dma);
    }
  }
  return out;
}

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  const groups = require('../groups');
  const all = await load(config);
  const out = [];
  for (const [code, acteur] of Object.entries(config.ept)) {
    if (groups.membersOf(code).includes(geo.code)) out.push(...rowsOf(all.filter((r) => r.c_acteur === acteur), 'EPT'));
  }
  // commune compétente avant la création des EPT (« Commune d'Ivry », « Commune de Vitry Sur Seine »…)
  const nom = plain(geo.nom);
  const com = all.filter((r) => /^Commune d/i.test(r.n_acteur) && ((n) => nom === n || nom.startsWith(`${n} `))(plain(r.n_acteur.replace(/^Commune d(e |'|’)/i, ''))));
  out.push(...rowsOf(com, 'COM'));
  return out;
}

module.exports = { fetchGeo };
