// Connecteur API Melodi (INSEE) : https://api.insee.fr/melodi
const BASE = 'https://api.insee.fr/melodi';

// Intervalle minimal entre deux appels par hôte (l'API Recherche d'entreprises limite à 7 appels/s)
const SPACING = { 'recherche-entreprises.api.gouv.fr': 250 };
const nextSlot = new Map();
async function throttle(url) {
  const gap = SPACING[new URL(url).hostname];
  if (!gap) return;
  const at = Math.max(Date.now(), nextSlot.get(url.split('/')[2]) ?? 0);
  nextSlot.set(url.split('/')[2], at + gap);
  if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now()));
}

// Les coupures réseau du serveur durent parfois une vingtaine de secondes : relances espacées de 2 s à 30 s
async function fetchJson(url, tries = 7) {
  let last;
  for (let t = 1; t <= tries; t++) {
    try {
      await throttle(url);
      const r = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { Accept: 'application/json' } });
      if (r.status === 429) throw new Error(`HTTP 429 sur ${url}`);
      if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
      return await r.json();
    } catch (e) {
      last = e;
      if (/HTTP 4(?!29)dd/.test(e.message)) throw e; // erreur définitive (404, 400…) : inutile de relancer
      await new Promise((res) => setTimeout(res, Math.min(30000, 2000 * 2 ** (t - 1))));
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

// fetch avec relances sur coupure réseau ou 5xx (le corps n'est lu qu'après : une relance repart de zéro)
async function fetchRetry(url, opts = {}, tries = 6) {
  let last;
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(url, opts);
      if (r.status >= 500 || r.status === 429) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      last = e;
      await new Promise((res) => setTimeout(res, Math.min(30000, 2000 * 2 ** (t - 1))));
    }
  }
  throw last;
}

module.exports = { fetchRetry, fetchJson, fetchLabels, fetchGeo };
