// URSSAF (open.urssaf.fr) : établissements employeurs et effectifs salariés du secteur privé par commune et secteur (NA17),
// au 31 décembre depuis 2006. Lecture par l'API Opendatasoft générique, puis calcul des emplois des secteurs en croissance :
// pour chaque année, effectifs des secteurs dont les effectifs ont augmenté sur les 5 années précédentes (MESURE = EFFECTIFS_CROISSANCE).
const { fetchOds } = require('./open');

async function fetchGeo(config, geo) {
  const rows = await fetchOds(config, geo);
  if (!rows) return rows;
  const eff = new Map(); // secteur -> année -> effectifs
  for (const r of rows) {
    if (r.dims.MESURE !== 'EFFECTIFS' || r.dims.SECTEUR === '_T') continue;
    (eff.get(r.dims.SECTEUR) || eff.set(r.dims.SECTEUR, new Map()).get(r.dims.SECTEUR)).set(Number(r.period), r.value);
  }
  const years = [...new Set(rows.map((r) => Number(r.period)))].sort();
  for (const y of years) {
    let n = 0, ok = false;
    for (const s of eff.values()) {
      const cur = s.get(y), old = s.get(y - 5);
      if (cur == null || old == null) continue;
      ok = true;
      if (cur > old) n += cur;
    }
    if (ok) rows.push({ period: String(y), dims: { MESURE: 'EFFECTIFS_CROISSANCE', SECTEUR: '_T' }, measure: 'valeur', value: n });
  }
  return rows;
}

module.exports = { fetchGeo };
