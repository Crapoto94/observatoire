// Institut Paris Region (ORS Île-de-France) : mortalité 2019-2023 — espérance de vie à la naissance, à 35 et 65 ans, taux
// standardisés de mortalité générale et prématurée (avant 65 ans, pour 100 000 habitants). Couches ArcGIS par canton ou ville
// (une commune découpée en plusieurs cantons est regroupée), intercommunalité / EPT et département.
// Une commune est retrouvée par son nom de canton-ville : seules les communes qui forment à elles seules un canton-ville ont une valeur.
const { fetchJson } = require('./melodi');

const FIELDS = ['espvie0h', 'espvie0f', 'espvie35h', 'espvie35f', 'espvie65h', 'espvie65f', 'mortapremah', 'mortapremaf', 'mortaprema2s', 'mortaggenh', 'mortaggenf', 'mortaggen2s'];
const MESURES = { espvie0h: 'ESPVIE0_H', espvie0f: 'ESPVIE0_F', espvie35h: 'ESPVIE35_H', espvie35f: 'ESPVIE35_F', espvie65h: 'ESPVIE65_H', espvie65f: 'ESPVIE65_F', mortapremah: 'MORT_PREMA_H', mortapremaf: 'MORT_PREMA_F', mortaprema2s: 'MORT_PREMA', mortaggenh: 'MORT_GEN_H', mortaggenf: 'MORT_GEN_F', mortaggen2s: 'MORT_GEN' };
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

async function query(config, layer, where) {
  const p = new URLSearchParams({ f: 'json', where, outFields: '*', returnGeometry: 'false' });
  const j = await fetchJson(`${config.url}/${layer}/query?${p}`);
  return (j.features || []).map((f) => f.attributes);
}

function rowsOf(config, attrs) {
  if (!attrs) return [];
  return FIELDS.filter((f) => attrs[f] != null && Number.isFinite(Number(attrs[f]))).map((f) => ({ period: config.period, dims: { MESURE: MESURES[f] }, measure: 'valeur', value: Number(attrs[f]) }));
}

async function fetchGeo(config, geo) {
  const level = geo.level || 'COM';
  if (level === 'COM') {
    const rows = await query(config, config.layers.canton, `upper(nom_canton) like '%${plain(geo.nom).split(' ')[0].replace(/'/g, "''")}%'`);
    const hit = rows.find((a) => plain(a.nom_canton) === plain(geo.nom) || plain(a.nom_canton_2) === plain(geo.nom));
    return rowsOf(config, hit);
  }
  if (level === 'EPT' || level === 'EPCI') {
    const siren = level === 'EPT' ? (geo.siren || (geo.code === 'GOSB' ? '200058014' : null)) : geo.code;
    if (!siren) return null;
    return rowsOf(config, (await query(config, config.layers.interco, `siren = '${siren}'`))[0]);
  }
  if (level === 'DEP' && /^\d+$/.test(geo.code)) return rowsOf(config, (await query(config, config.layers.dep, `numdep = ${Number(geo.code)}`))[0]);
  return null;
}

module.exports = { fetchGeo };
