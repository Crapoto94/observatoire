// Connecteurs open data hors INSEE : API tabulaire data.gouv.fr, portails Opendatasoft, fichiers geo-dvf, API Recherche d'entreprises.
// Chaque connecteur expose fetchGeo(config, geo) -> lignes { period, dims, measure, value } ou null si le niveau géographique n'est pas géré.
const readline = require('readline');
const { Readable } = require('stream');
const { fetchJson, fetchRetry } = require('./melodi');

// ---------------- outils communs ----------------
function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[%\s €]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const basePeriodOf = (v) => (v == null || v === '' ? null : String(v).slice(0, 7).replace(/^(\d{4})-?00$/, '$1'));

// Additionne les lignes qui ont la même période, la même mesure et les mêmes dimensions
function mergeRows(rows) {
  const acc = new Map();
  for (const r of rows) {
    const k = `${r.period}|${r.measure}|${JSON.stringify(r.dims)}`;
    const cur = acc.get(k);
    if (cur) cur.value = (cur.value ?? 0) + (r.value ?? 0);
    else acc.set(k, { ...r });
  }
  return [...acc.values()];
}

// Ajoute les totaux (modalité _T) pour chaque sous-ensemble de dimensions : le cube devient complet et les graphiques
// n'ont plus à additionner des lignes. À n'utiliser que pour des mesures additives (comptages, surfaces, effectifs).
function withMarginals(rows, dimNames) {
  if (!dimNames.length) return rows;
  const acc = new Map();
  const masks = (1 << dimNames.length) - 1;
  for (const r of rows) {
    for (let m = 1; m <= masks; m++) {
      const dims = { ...r.dims };
      dimNames.forEach((d, k) => { if (m & (1 << k)) dims[d] = '_T'; });
      const key = `${r.period}|${JSON.stringify(dims)}`;
      const cur = acc.get(key) ?? { period: r.period, dims, measure: r.measure, value: 0 };
      cur.value += r.value ?? 0;
      acc.set(key, cur);
    }
  }
  return [...rows, ...acc.values()];
}

// Transforme des enregistrements bruts en lignes selon la description du jeu :
//   columns   : [{ field, measure, period?, periodField? }]  une ligne par colonne numérique (dimension MESURE)
//   dimFields : [{ field, dim }]                              dimensions lues dans l'enregistrement
//   count     : { measure }                                   mode comptage : une ligne par combinaison de dimensions
function mapRecords(records, spec, constDims = {}, constPeriod = null) {
  if (constPeriod === '$YEAR') constPeriod = String(new Date().getFullYear());
  const out = [];
  const periodOf = (v) => (spec.periodYear && v != null && v !== '' ? String(v).slice(0, 4) : basePeriodOf(v));
  const dimsOf = (r) => {
    const d = { ...constDims };
    for (const f of spec.dimFields || []) { const raw = r[f.field]; d[f.dim] = raw == null ? '_Z' : f.map && f.map[raw] !== undefined ? f.map[raw] : String(raw); }
    return d;
  };
  if (spec.count) {
    const acc = new Map();
    for (const r of records) {
      const period = periodOf(spec.periodField ? r[spec.periodField] : constPeriod) ?? constPeriod;
      const dims = { MESURE: spec.count.measure, ...dimsOf(r) };
      const key = `${period}|${JSON.stringify(dims)}`;
      const cur = acc.get(key) ?? { period, dims, measure: 'valeur', value: 0 };
      cur.value += 1;
      acc.set(key, cur);
    }
    return withMarginals([...acc.values()], (spec.dimFields || []).map((f) => f.dim));
  }
  for (const r of records) {
    for (const c of spec.columns || []) {
      const period = periodOf(c.period ?? (c.periodField ? r[c.periodField] : undefined) ?? (spec.periodField ? r[spec.periodField] : undefined) ?? constPeriod);
      const v = c.field === '@ONE' ? 1 : parseNum(r[c.field]);
      if (v == null) continue; // valeur absente : pas de ligne
      out.push({ period, dims: { MESURE: c.measure, ...dimsOf(r) }, measure: 'valeur', value: c.scale ? v * c.scale : v });
    }
  }
  const merged = spec.sum ? mergeRows(out) : out;
  return spec.marginals ? withMarginals(merged, (spec.dimFields || []).map((f) => f.dim)) : merged;
}

// ---------------- API tabulaire data.gouv.fr ----------------
const TAB = 'https://tabular-api.data.gouv.fr/api/resources';

const resourceCache = new Map();

async function resolveResource(src) {
  if (src.resource) return src.resource;
  const key = `${src.dataset}|${src.title}`;
  if (resourceCache.has(key)) return resourceCache.get(key);
  const d = await fetchJson(`https://www.data.gouv.fr/api/1/datasets/${src.dataset}/`);
  const re = new RegExp(src.title, 'i');
  const hit = (d.resources || []).find((r) => /csv/i.test(r.format || '') && re.test(r.title || ''));
  if (!hit) throw new Error(`ressource introuvable (${src.dataset} / ${src.title})`);
  resourceCache.set(key, hit.id);
  return hit.id;
}

// ---------------- téléchargement du fichier CSV d'une ressource data.gouv.fr, indexé par code territoire ----------------
// Évite les milliers de requêtes de l'API tabulaire : le fichier est téléchargé une fois, puis filtré en interne.
// Sert aussi de secours quand l'API tabulaire n'est pas joignable depuis le serveur.
function splitCsv(line, delim) {
  const cells = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { cells.push(cur); cur = ''; } else cur += c;
  }
  cells.push(cur);
  return cells;
}

const csvCache = new Map(); // ressource -> { at, geoField, map }
async function csvIndex(resource, geoField) {
  const hit = csvCache.get(resource);
  if (hit && hit.geoField === geoField && Date.now() - hit.at < 30 * 60000) return hit.map;
  const res = await fetchRetry(`https://www.data.gouv.fr/api/1/datasets/r/${resource}`, { redirect: 'follow', signal: AbortSignal.timeout(900000) });
  if (!res.ok) throw new Error(`téléchargement CSV : HTTP ${res.status} (${resource})`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity });
  const map = new Map();
  let head = null, delim = ';';
  for await (const line of rl) {
    if (!line) continue;
    if (!head) {
      delim = (line.match(/;/g) || []).length >= (line.match(/,/g) || []).length ? ';' : ',';
      head = splitCsv(line, delim).map((h) => h.replace(/^\uFEFF/, '').trim());
      if (!head.includes(geoField)) throw new Error(`colonne « ${geoField} » absente du fichier CSV (${resource})`);
      continue;
    }
    const cells = splitCsv(line, delim);
    const rec = {};
    head.forEach((h, i) => { rec[h] = cells[i] === '' || cells[i] === undefined ? null : cells[i]; });
    const code = rec[geoField];
    if (code == null) continue;
    (map.get(code) || map.set(code, []).get(code)).push(rec);
  }
  csvCache.set(resource, { at: Date.now(), geoField, map });
  if (csvCache.size > 4) csvCache.delete(csvCache.keys().next().value);
  return map;
}

async function tabularRecords(resource, geoField, code) {
  try {
    return await tabularApiRecords(resource, geoField, code);
  } catch (e) {
    // API tabulaire injoignable : repli sur le fichier CSV complet
    return (await csvIndex(resource, geoField)).get(code) || [];
  }
}

async function tabularApiRecords(resource, geoField, code) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const j = await fetchJson(`${TAB}/${resource}/data/?${encodeURIComponent(geoField)}__exact=${encodeURIComponent(code)}&page_size=200&page=${page}`);
    out.push(...(j.data || []));
    if (!j.links?.next || (j.data || []).length < 200) break;
  }
  return out;
}

async function fetchTabular(config, geo) {
  const sources = config.sources.filter((s) => (s.level || 'COM') === (geo.level || 'COM'));
  if (!sources.length) return null;
  const rows = [];
  const errors = [];
  for (const src of sources) {
    try {
      const resource = await resolveResource(src);
      const recs = await tabularRecords(resource, src.geoField, geo.code);
      rows.push(...mapRecords(recs, { ...config, ...(src.spec || {}) }, src.constDims || {}, src.period ?? null));
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (!rows.length && errors.length) throw new Error(errors[0]);
  return rows;
}

// ---------------- Opendatasoft (explore v2.1) ----------------
// Enregistrements d'une requête (where / select / group_by) : API paginée, ou en repli export CSV filtré du même jeu.
async function odsRecords(config, params) {
  const recs = [];
  try {
    for (let offset = 0; offset < 20000; offset += 100) {
      const p = new URLSearchParams({ limit: '100', offset: String(offset) });
      for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
      const j = await fetchJson(`${config.base}/api/explore/v2.1/catalog/datasets/${config.dataset}/records?${p}`);
      recs.push(...(j.results || []));
      if ((j.results || []).length < 100) break;
    }
    return recs;
  } catch (e) {
    if (/HTTP 4(?!29)\d\d/.test(e.message)) throw e; // requête invalide : l'export échouerait de même
    const p = new URLSearchParams({ limit: '-1', delimiter: ';', use_labels: 'false' });
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    const res = await fetchRetry(`${config.base}/api/explore/v2.1/catalog/datasets/${config.dataset}/exports/csv?${p}`, { signal: AbortSignal.timeout(600000) });
    if (!res.ok) throw new Error(`API puis export CSV en échec (${e.message} ; export HTTP ${res.status})`);
    const lines = (await res.text()).split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean);
    const head = splitCsv(lines.shift() || '', ';').map((h) => h.replace(/^\uFEFF/, '').trim());
    return lines.map((l) => { const c = splitCsv(l, ';'); return Object.fromEntries(head.map((h, i) => [h, c[i] === '' || c[i] === undefined ? null : c[i]])); });
  }
}

async function fetchOds(config, geo) {
  const field = config.levels?.[geo.level || 'COM'];
  if (!field) return null;
  const rows = [];
  for (const q of config.queries) {
    // certains jeux n'ont pas de code INSEE exploitable : recherche par nom de commune + département
    const byName = config.byName;
    const upper = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const geoWhere = byName
      ? `${field}="${upper(geo.nom)}" and ${byName.deptField}="${geo.code.slice(0, 2)}"`
      : config.geoQuote === false ? `${field}=${geo.code}` : `${field}="${geo.code}"`;
    const where = [geoWhere, q.where].filter(Boolean).join(' and ');
    const recs = await odsRecords(config, { where, select: q.select, group_by: q.groupBy });
    rows.push(...mapRecords(recs, { ...config, ...q }, q.constDims || {}, q.period ?? null));
  }
  return rows;
}

// ---------------- Demandes de valeurs foncières (fichiers geo-dvf par commune) ----------------
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, k) => [h, r[k]])));
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Statistiques annuelles d'une commune à partir de ses mutations (id_mutation -> lignes du fichier geo-dvf)
function dvfRows(year, byMut) {
  const rows = [];
  const stats = { Appartement: [], Maison: [] };
  for (const [, list] of byMut) {
    const locals = list.filter((x) => (x.type_local === 'Appartement' || x.type_local === 'Maison') && Number(x.surface_reelle_bati) > 0);
    const unique = new Map(locals.map((x) => [`${x.id_parcelle}|${x.lot1_numero}|${x.type_local}|${x.surface_reelle_bati}`, x]));
    const value = Number(list[0].valeur_fonciere);
    if (unique.size !== 1 || !(value > 0)) continue;
    const [x] = [...unique.values()];
    const surf = Number(x.surface_reelle_bati);
    stats[x.type_local].push({ value, surf, m2: value / surf });
  }
  rows.push({ period: String(year), dims: { MESURE: 'NB_MUTATIONS', TYPE_LOCAL: '_T' }, measure: 'valeur', value: byMut.size });
  for (const [type, list] of Object.entries(stats)) {
    const sane = list.filter((x) => x.m2 >= 500 && x.m2 <= 30000);
    const add = (mesure, value) => rows.push({ period: String(year), dims: { MESURE: mesure, TYPE_LOCAL: type }, measure: 'valeur', value });
    add('NB_VENTES', sane.length);
    add('PRIX_M2_MEDIAN', median(sane.map((x) => x.m2)));
    add('SURFACE_MEDIANE', median(sane.map((x) => x.surf)));
    add('VALEUR_MEDIANE', median(sane.map((x) => x.value)));
  }
  return rows;
}

async function fetchGeoDvf(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  const rows = [];
  for (const year of config.years) {
    const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/${geo.code.slice(0, 2)}/${geo.code}.csv`;
    const r = await fetchRetry(url, { signal: AbortSignal.timeout(120000), redirect: 'follow' });
    if (!r.ok) continue;
    const recs = parseCsv(await r.text()).filter((x) => x.nature_mutation === 'Vente');
    const byMut = new Map();
    for (const x of recs) (byMut.get(x.id_mutation) || byMut.set(x.id_mutation, []).get(x.id_mutation)).push(x);
    rows.push(...dvfRows(year, byMut));
  }
  return rows;
}

// ---------------- API Recherche d'entreprises (stock du jour : associations, ESS…) ----------------
async function fetchEntreprises(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  const year = String(new Date().getFullYear());
  const rows = [];
  for (const m of config.counts) {
    const j = await fetchJson(`https://recherche-entreprises.api.gouv.fr/search?code_commune=${geo.code}&${m.query}&per_page=1`);
    rows.push({ period: year, dims: { MESURE: m.measure }, measure: 'valeur', value: j.total_results ?? null });
    await new Promise((r) => setTimeout(r, 250)); // l'API limite le débit
  }
  return rows;
}

module.exports = { odsRecords, csvIndex, mergeRows, fetchTabular, fetchOds, fetchGeoDvf, fetchEntreprises, parseNum, mapRecords, resolveResource, dvfRows, TAB };
