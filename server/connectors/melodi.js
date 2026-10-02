// Connecteur API Melodi (INSEE) : https://api.insee.fr/melodi
const BASE = 'https://api.insee.fr/melodi';

async function fetchJson(url, tries = 5) {
  let last;
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
      return await r.json();
    } catch (e) {
      last = e;
      await new Promise((res) => setTimeout(res, 2000 * t));
    }
  }
  throw last;
}

// Libellés des modalités de chaque dimension (hors géographie, trop volumineuse).
async function fetchLabels(ds) {
  const j = await fetchJson(`${BASE}/range/${ds}`);
  const labels = {};
  for (const r of j.range || []) {
    if (r.type === 'geo' || r.concept?.code === 'GEO') continue;
    const values = {};
    for (const v of r.values || []) values[v.code] = v.label?.fr || v.label?.en || v.code;
    labels[r.concept.code] = { label: r.concept.label?.fr || r.concept.code, values };
  }
  return labels;
}

// Observations d'un territoire (geoId du type 2025-COM-94041, 2025-DEP-94, 2025-EPCI-200054781, 2025-REG-11), aplaties en lignes { period, dims, measure, value }.
async function fetchGeo(config, geoId) {
  let url = `${BASE}/data/${config.ds}?GEO=${geoId}&maxResult=10000`;
  const rows = [];
  let pages = 0;
  while (url && pages++ < 100) {
    const j = await fetchJson(url);
    for (const o of j.observations || []) {
      const { GEO, FREQ, TIME_PERIOD, ...dims } = o.dimensions || {};
      // statut de l'observation : O = valeur manquante, A = normale ; confidentialité F = libre
      const st = o.attributes ? `${o.attributes.OBS_STATUS ?? ''}${o.attributes.CONF_STATUS && o.attributes.CONF_STATUS !== 'F' ? '/' + o.attributes.CONF_STATUS : ''}` : null;
      for (const [measure, m] of Object.entries(o.measures || {})) {
        rows.push({ period: TIME_PERIOD ?? null, dims, measure, value: typeof m?.value === 'number' ? m.value : null, status: st });
      }
    }
    url = j.paging?.next || null;
  }
  return rows;
}

module.exports = { fetchJson, fetchLabels, fetchGeo };
