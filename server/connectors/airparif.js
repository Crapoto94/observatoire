// Airparif : inventaire des émissions (gaz à effet de serre, polluants) par secteur d'activité, années 2005, 2010, 2015,
// 2019 et 2022 (FeatureServer ArcGIS du portail open data d'Airparif), à la maille EPCI / EPT, département et région.
// Les communes d'un EPT reçoivent les valeurs de l'EPT (maille signalée par le KPI). Émissions en kilotonnes (kt éq. CO2 pour
// les GES, scopes 1 et 2) ; le ratio par habitant est calculé avec la population du territoire au millésime le plus proche.
const { fetchJson } = require('./melodi');

const yearPop = (series, y) => {
  const keys = Object.keys(series || {});
  if (!keys.length) return null;
  return series[keys.reduce((b, k) => (Math.abs(Number(k) - y) < Math.abs(Number(b) - y) ? k : b), keys[0])];
};

async function query(url, where, polluant) {
  const p = new URLSearchParams({ f: 'json', where: `${where} AND polluant = '${polluant}'`, outFields: 'emission_t,annee_ref,secten_n1', returnGeometry: 'false', resultRecordCount: '2000' });
  const j = await fetchJson(`${url}/query?${p}`);
  return (j.features || []).map((f) => f.attributes);
}

async function rowsFor(config, layer, where, popGeo) {
  const pops = require('../importer').populationSeries()[popGeo];
  const out = [];
  for (const [polluant, code] of Object.entries(config.polluants)) {
    const list = await query(config.layers[layer], where, polluant);
    const tot = {};
    for (const a of list) {
      if (a.emission_t == null) continue;
      const p = String(a.annee_ref);
      tot[p] = (tot[p] || 0) + a.emission_t;
      out.push({ period: p, dims: { POLLUANT: code, SECTEUR: a.secten_n1, MESURE: 'EMISSIONS_KT' }, measure: 'valeur', value: a.emission_t });
    }
    for (const [p, v] of Object.entries(tot)) {
      out.push({ period: p, dims: { POLLUANT: code, SECTEUR: '_T', MESURE: 'EMISSIONS_KT' }, measure: 'valeur', value: v });
      const pop = yearPop(pops, Number(p));
      if (pop) out.push({ period: p, dims: { POLLUANT: code, SECTEUR: '_T', MESURE: 'EMISSIONS_T_HAB' }, measure: 'valeur', value: (v * 1000) / pop });
    }
    // transport routier par habitant (émissions liées aux déplacements motorisés)
    for (const a of list.filter((x) => x.secten_n1 === 'TROUTE' && x.emission_t != null)) {
      const pop = yearPop(pops, Number(a.annee_ref));
      if (pop) out.push({ period: String(a.annee_ref), dims: { POLLUANT: code, SECTEUR: 'TROUTE', MESURE: 'EMISSIONS_T_HAB' }, measure: 'valeur', value: (a.emission_t * 1000) / pop });
    }
  }
  return out;
}

async function fetchGeo(config, geo) {
  const level = geo.level || 'COM';
  if (level === 'COM') {
    const groups = require('../groups');
    const ept = Object.entries(config.ept).find(([code]) => groups.membersOf(code).includes(geo.code));
    return ept ? rowsFor(config, 'epci', `numepci = ${ept[1]}`, ept[0]) : null;
  }
  if (level === 'DEP' && /^\d+$/.test(geo.code)) return rowsFor(config, 'dep', `numdep = ${Number(geo.code)}`, geo.code);
  if (level === 'REG') return rowsFor(config, 'reg', `numreg = ${Number(geo.code)}`, geo.code);
  return null;
}

module.exports = { fetchGeo };
