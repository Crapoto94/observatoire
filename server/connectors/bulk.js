// Import en masse (communes d'Île-de-France) : une requête pour plusieurs communes au lieu d'une par commune.
// Chaque fonction reçoit la liste des territoires et renvoie une Map code -> lignes { period, dims, measure, value, status }.
const zlib = require('zlib');
const readline = require('readline');
const { Readable } = require('stream');
const { fetchJson, fetchRetry } = require('./melodi');
const open = require('./open');

const BASE = 'https://api.insee.fr/melodi';
const MELODI_PAGE_SIZE = 10000;
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, (k + 1) * n));
const upper = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const communes = (geos) => geos.filter((g) => (g.level || 'COM') === 'COM');
const emptyMap = (geos) => new Map(geos.map((g) => [g.code, []]));
const push = (map, code, rows) => { if (map.has(code)) map.get(code).push(...rows); };

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

// ---------------- INSEE Melodi : plusieurs paramètres GEO dans la même requête ----------------
async function melodiMany(config, geos, geoId) {
  const out = emptyMap(geos);
  let url = `${BASE}/data/${config.ds}?${geos.map((g) => `GEO=${geoId(g)}`).join('&')}&maxResult=${MELODI_PAGE_SIZE}`;
  let pages = 0;
  while (url && pages++ < 200) {
    const j = await fetchJson(url);
    const observations = j.observations || [];
    // Melodi can return exactly maxResult rows without a `paging.next` link when a
    // multi-commune request is truncated. Treat that response as incomplete so the
    // importer splits the batch and retries it at a smaller geographic granularity.
    if (observations.length >= MELODI_PAGE_SIZE && !j.paging?.next) {
      throw new Error(`Réponse Melodi limitée à ${MELODI_PAGE_SIZE} observations sans page suivante`);
    }
    for (const o of observations) {
      const { GEO, FREQ, TIME_PERIOD, ...dims } = o.dimensions || {};
      const code = /^\d{4}-[A-Z]+-(.+)$/.exec(GEO || '')?.[1];
      if (!code || !out.has(code)) continue;
      const st = o.attributes ? `${o.attributes.OBS_STATUS ?? ''}${o.attributes.CONF_STATUS && o.attributes.CONF_STATUS !== 'F' ? '/' + o.attributes.CONF_STATUS : ''}` : null;
      for (const [measure, m] of Object.entries(o.measures || {})) {
        out.get(code).push({ period: TIME_PERIOD ?? null, dims, measure, value: typeof m?.value === 'number' ? m.value : null, status: st });
      }
    }
    url = j.paging?.next || null;
  }
  if (url) throw new Error('Pagination Melodi incomplète après 200 pages');
  return out;
}

// ---------------- API tabulaire data.gouv.fr : filtre __in sur le code commune ----------------
async function tabularMany(config, geos, progress = () => {}) {
  const comm = communes(geos);
  const sources = config.sources.filter((s) => (s.level || 'COM') === 'COM');
  if (!sources.length) return null;
  const out = emptyMap(geos);
  const errors = [];
  let any = false;
  for (const src of sources) {
    try {
      const resource = await open.resolveResource(src);
      const byGeo = new Map();
      // priorité au téléchargement du fichier complet (filtré en interne) ; l'API tabulaire sert de repli
      try {
        progress('téléchargement du fichier CSV' + (src.period ? ` (${src.period})` : ''));
        const idx = await open.csvIndex(resource, src.geoField);
        for (const g of comm) if (idx.has(g.code)) byGeo.set(g.code, idx.get(g.code));
        progress(`fichier lu : ${byGeo.size} communes concernées`);
      } catch (e) {
        progress(`CSV indisponible (${e.message}), repli sur l'API tabulaire`);
        byGeo.clear();
      }
      const parts = byGeo.size ? [] : chunk(comm.map((g) => g.code), 80);
      for (const [pi, part] of parts.entries()) {
        progress(`communes ${pi * 80 + 1}-${pi * 80 + part.length} sur ${comm.length}`);
        for (let page = 1; page <= 80; page++) {
          const j = await fetchJson(`${open.TAB}/${resource}/data/?${encodeURIComponent(src.geoField)}__in=${part.join(',')}&page_size=200&page=${page}`);
          for (const r of j.data || []) {
            const k = String(r[src.geoField]);
            (byGeo.get(k) || byGeo.set(k, []).get(k)).push(r);
          }
          if (!j.links?.next || (j.data || []).length < 200) break;
        }
      }
      for (const [code, recs] of byGeo) {
        const rows = open.mapRecords(recs, { ...config, ...(src.spec || {}) }, src.constDims || {}, src.period ?? null);
        if (rows.length) { push(out, code, rows); any = true; }
      }
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (!any && errors.length) throw new Error(errors[0]);
  return out;
}

// ---------------- Opendatasoft : clause « in (…) », ou recherche par nom de commune ----------------
const odsPages = (config, params) => open.odsRecords(config, params);

async function odsByName(config, comm, out) {
  const { deptField, yearField } = config.byName;
  const byKey = new Map(comm.map((g) => [`${g.code.slice(0, 2)}|${upper(g.nom)}`, g.code]));
  const depts = [...new Set(comm.map((g) => g.code.slice(0, 2)))];
  const now = new Date().getFullYear();
  for (const dept of depts) {
    for (let y = config.firstYear ?? 2009; y <= now; y++) {
      for (const q of config.queries) {
        const where = [`${deptField}="${dept}"`, yearField ? `year(${yearField})=${y}` : '', q.where].filter(Boolean).join(' and ');
        const recs = await odsPages(config, { where, select: q.select, group_by: q.groupBy });
        const byGeo = new Map();
        for (const r of recs) {
          const code = dept === '75' ? '75056' : byKey.get(`${dept}|${upper(String(r[config.byName.nameField] ?? ''))}`);
          if (!code) continue;
          (byGeo.get(code) || byGeo.set(code, []).get(code)).push(r);
        }
        for (const [code, list] of byGeo) push(out, code, mergeRows(open.mapRecords(list, { ...config, ...q }, q.constDims || {}, q.period ?? null)));
      }
    }
  }
  return out;
}

async function odsMany(config, geos) {
  const field = config.levels?.COM;
  if (!field) return null;
  const comm = communes(geos);
  const out = emptyMap(geos);
  if (config.byName) return odsByName(config, comm, out);
  const quote = config.geoQuote === false ? (c) => c : (c) => `"${c}"`;
  for (const part of chunk(comm.map((g) => g.code), 40)) {
    for (const q of config.queries) {
      const where = [`${field} in (${part.map(quote).join(', ')})`, q.where].filter(Boolean).join(' and ');
      const recs = await odsPages(config, {
        where,
        select: q.groupBy ? `${q.select}, ${field}` : q.select,
        group_by: q.groupBy ? `${q.groupBy}, ${field}` : q.groupBy,
      });
      const byGeo = new Map();
      for (const r of recs) {
        const k = String(r[field]);
        (byGeo.get(k) || byGeo.set(k, []).get(k)).push(r);
      }
      for (const [code, list] of byGeo) push(out, code, open.mapRecords(list, { ...config, ...q }, q.constDims || {}, q.period ?? null));
    }
  }
  return out;
}

// ---------------- DVF : fichiers geo-dvf par département (gzip, lus en flux) ----------------
function parseLine(line) {
  const cells = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cells.push(cur); cur = ''; } else cur += c;
  }
  cells.push(cur);
  return cells;
}

async function geodvfMany(config, geos) {
  const comm = communes(geos);
  const out = emptyMap(geos);
  const byDept = new Map();
  for (const g of comm) (byDept.get(g.code.slice(0, 2)) || byDept.set(g.code.slice(0, 2), []).get(g.code.slice(0, 2))).push(g.code);
  for (const [dept, codes] of byDept) {
    const want = new Set(codes);
    for (const year of config.years) {
      const res = await fetchRetry(`https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/departements/${dept}.csv.gz`, { redirect: 'follow', signal: AbortSignal.timeout(900000) });
      if (!res.ok) continue;
      const rl = readline.createInterface({ input: Readable.fromWeb(res.body).pipe(zlib.createGunzip()), crlfDelay: Infinity });
      let idx = null;
      const byComm = new Map();
      for await (const line of rl) {
        const cells = parseLine(line);
        if (!idx) { idx = Object.fromEntries(cells.map((h, k) => [h, k])); continue; }
        if (cells[idx.nature_mutation] !== 'Vente') continue;
        const code = dept === '75' ? '75056' : cells[idx.code_commune];
        if (!want.has(code)) continue;
        const rec = {
          id_mutation: cells[idx.id_mutation], valeur_fonciere: cells[idx.valeur_fonciere], id_parcelle: cells[idx.id_parcelle],
          lot1_numero: cells[idx.lot1_numero], type_local: cells[idx.type_local], surface_reelle_bati: cells[idx.surface_reelle_bati],
        };
        const m = byComm.get(code) || byComm.set(code, new Map()).get(code);
        (m.get(rec.id_mutation) || m.set(rec.id_mutation, []).get(rec.id_mutation)).push(rec);
      }
      for (const [code, byMut] of byComm) push(out, code, open.dvfRows(year, byMut));
    }
  }
  return out;
}

module.exports = { melodiMany, tabularMany, odsMany, geodvfMany, chunk };
