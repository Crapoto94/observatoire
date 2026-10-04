// Airparif : historique de l'indice ATMO communal journalier (indice national depuis 2021 : 1 bon, 2 moyen, 3 dégradé,
// 4 mauvais, 5 très mauvais, 6 extrêmement mauvais), lu sur le GeoServer d'Airparif (couche vue_indice_atmo_2020_histo,
// échéance JM1 = indice constaté de la veille). Agrégats annuels par commune : jours renseignés, jours « dégradé » ou pire,
// « mauvais » ou pire, jours « dégradé » ou pire par polluant, indice moyen.
const { fetchJson } = require('./melodi');

const POLLUANTS = ['no2', 'o3', 'pm10', 'pm25'];

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  const p = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature', outputFormat: 'application/json', typeNames: config.layer,
    cql_filter: `insee='${geo.code}' AND echeance='JM1'`, propertyName: ['date', 'indice', ...POLLUANTS].join(','),
  });
  const j = await fetchJson(`${config.url}?${p}`);
  const by = new Map();
  for (const f of j.features || []) {
    const a = f.properties || {};
    if (!a.date || a.indice == null) continue;
    const y = String(a.date).slice(0, 4);
    const b = by.get(y) || by.set(y, { JOURS: 0, JOURS_DEGRADE: 0, JOURS_MAUVAIS: 0, SOMME: 0, ...Object.fromEntries(POLLUANTS.map((x) => [`DEGRADE_${x.toUpperCase()}`, 0])) }).get(y);
    b.JOURS++; b.SOMME += a.indice;
    if (a.indice >= config.seuilDegrade) b.JOURS_DEGRADE++;
    if (a.indice >= config.seuilMauvais) b.JOURS_MAUVAIS++;
    for (const x of POLLUANTS) if (a[x] >= config.seuilDegrade) b[`DEGRADE_${x.toUpperCase()}`]++;
  }
  const rows = [];
  for (const [y, b] of by) {
    if (b.JOURS < 30) continue; // année à peine entamée (31 décembre 2020)
    for (const [k, v] of Object.entries(b)) if (k !== 'SOMME') rows.push({ period: y, dims: { MESURE: k }, measure: 'valeur', value: v });
    rows.push({ period: y, dims: { MESURE: 'INDICE_MOYEN' }, measure: 'valeur', value: b.SOMME / b.JOURS });
  }
  return rows;
}

module.exports = { fetchGeo };
