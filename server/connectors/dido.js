// Connecteur SDES (DiDo) : téléchargement des fichiers CSV du catalogue https://www.statistiques.developpement-durable.gouv.fr/catalogue,
// filtrés par territoire et limités aux colonnes utiles à la source, lus en flux puis agrégés à l'import.
//  - sitadel : autorisations d'urbanisme créant des logements (Sit@del2) -> logements autorisés / commencés / achevés par année
//  - rpls    : répertoire des logements locatifs des bailleurs sociaux (détail au logement) -> parc social par commune et millésime
const readline = require('readline');
const { Readable } = require('stream');
const { fetchJson } = require('./melodi');

const API = 'https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1';
const IDF_DEPTS = new Set(['75', '77', '78', '91', '92', '93', '94', '95']);
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, (k + 1) * n));

const num = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// ---------------- Sit@del2 ----------------
function sitadelAccumulator() {
  const acc = new Map();
  const add = (year, mesure, typeLgt, typeDau, v) => {
    if (!year) return;
    for (const td of [typeDau, '_T']) {
      const key = `${year}|${mesure}|${typeLgt}|${td}`;
      acc.set(key, (acc.get(key) ?? 0) + v);
    }
  };
  return {
    add(r) {
      const dau = r.TYPE_DAU || '_Z';
      const tot = num(r.NB_LGT_TOT_CREES), ind = num(r.NB_LGT_IND_CREES), col = num(r.NB_LGT_COL_CREES);
      for (const [mesure, date] of [['LGT_AUTORISES', r.DATE_REELLE_AUTORISATION], ['LGT_COMMENCES', r.DATE_REELLE_DOC], ['LGT_ACHEVES', r.DATE_REELLE_DAACT]]) {
        const y = date ? String(date).slice(0, 4) : null;
        add(y, mesure, '_T', dau, tot);
        add(y, mesure, 'INDIVIDUEL', dau, ind);
        add(y, mesure, 'COLLECTIF', dau, col);
      }
      const ya = r.DATE_REELLE_AUTORISATION ? String(r.DATE_REELLE_AUTORISATION).slice(0, 4) : null;
      add(ya, 'LGT_SOCIAUX_AUTORISES', '_T', dau, num(r.NB_LGT_PRET_LOC_SOCIAL));
      add(ya, 'LGT_DEMOLIS', '_T', dau, num(r.NB_LGT_DEMOLIS));
      add(ya, 'NB_AUTORISATIONS', '_T', dau, 1);
    },
    rows() {
      return [...acc.entries()].map(([k, value]) => {
        const [period, MESURE, TYPE_LOGEMENT, TYPE_DAU] = k.split('|');
        return { period, dims: { MESURE, TYPE_LOGEMENT, TYPE_DAU }, measure: 'valeur', value };
      });
    },
  };
}

// ---------------- RPLS ----------------
const epoque = (y) => (y < 1946 ? 'EP_AV1946' : y <= 1970 ? 'EP_1946_1970' : y <= 1990 ? 'EP_1971_1990' : y <= 2005 ? 'EP_1991_2005' : 'EP_2006_PLUS');

function rplsAccumulator(period) {
  const acc = new Map();
  const add = (critere, modalite) => {
    const k = `${critere}|${modalite}`;
    acc.set(k, (acc.get(k) ?? 0) + 1);
  };
  return {
    add(r) {
      add('TOTAL', '_T');
      add('NB_PIECES', `P${Math.min(6, Math.max(1, Math.round(num(r.NBPIECE)) || 1))}`);
      add('DPE', r.DPEENERGIE ? `DPE_${r.DPEENERGIE}` : 'DPE_ND');
      const y = Math.round(num(r.CONSTRUCT));
      if (y > 1500) add('EPOQUE', epoque(y));
      add('QPV', r.QPV_CODE === '1' ? 'QPV_OUI' : 'QPV_NON');
      if (r.FINAN_CODE) add('FINANCEMENT', `FIN_${r.FINAN_CODE}`);
      if (r.TYPECONST_LIBELLE) add('TYPE', r.TYPECONST_LIBELLE.startsWith('collectif') ? 'TYPE_COLLECTIF' : r.TYPECONST_LIBELLE.startsWith('individuel') ? 'TYPE_INDIVIDUEL' : 'TYPE_ETUDIANT');
    },
    rows() {
      return [...acc.entries()].map(([k, value]) => {
        const [CRITERE, MODALITE] = k.split('|');
        return { period, dims: { MESURE: 'LOGEMENTS_SOCIAUX', CRITERE, MODALITE }, measure: 'valeur', value };
      });
    },
  };
}

const KINDS = {
  sitadel: {
    geoField: 'COMM',
    columns: ['COMM', 'TYPE_DAU', 'DATE_REELLE_AUTORISATION', 'DATE_REELLE_DOC', 'DATE_REELLE_DAACT', 'NB_LGT_TOT_CREES', 'NB_LGT_IND_CREES', 'NB_LGT_COL_CREES', 'NB_LGT_PRET_LOC_SOCIAL', 'NB_LGT_DEMOLIS'],
    millesimes: 1,
    accumulator: () => sitadelAccumulator(),
  },
  rpls: {
    geoField: 'DEPCOM',
    // jusqu'au millésime 2024 la colonne s'appelle DEPCOM_CODE
    legacy: { before: '2025', geoField: 'DEPCOM_CODE' },
    columns: ['DEPCOM', 'NBPIECE', 'CONSTRUCT', 'DPEENERGIE', 'QPV_CODE', 'FINAN_CODE', 'TYPECONST_LIBELLE'],
    millesimes: 3,
    accumulator: (millesime) => rplsAccumulator(String(millesime).slice(0, 4)),
  },
};

// ---------------- téléchargement ----------------
const cache = new Map();
async function millesimes(config, n) {
  const hit = cache.get(config.rid);
  if (hit && Date.now() - hit.at < 3600e3) return hit.value.slice(0, n);
  const d = await fetchJson(`${API}/datasets/${config.dataset}`);
  const file = (d.datafiles || []).find((f) => f.rid === config.rid);
  const value = (file?.millesimes || []).map((m) => m.millesime);
  if (!value.length) throw new Error(`millésime introuvable pour le fichier ${config.rid}`);
  cache.set(config.rid, { at: Date.now(), value });
  return value.slice(0, n);
}

function parseLine(line) {
  const cells = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ';') { cells.push(cur); cur = ''; } else cur += c;
  }
  cells.push(cur);
  return cells;
}

// Lit le CSV filtré en flux ; onRecord reçoit un objet colonne -> valeur
const legacyOf = (kind, millesime) => (kind.legacy && String(millesime) < kind.legacy.before ? kind.legacy : null);

async function streamCsv(config, kind, millesime, filter, onRecord) {
  const old = legacyOf(kind, millesime);
  const rename = (c) => (old && c === kind.geoField ? old.geoField : c);
  const url = `${API}/datafiles/${config.rid}/csv?millesime=${millesime}&withColumnName=true&withColumnDescription=false&withColumnUnit=false&columns=${kind.columns.map(rename).join(',')}&${filter.replace(new RegExp(`^${kind.geoField}=`), `${rename(kind.geoField)}=`)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(1200000) });
  if (!res.ok) throw new Error(`DiDo HTTP ${res.status} (${config.rid})`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity });
  let head = null;
  for await (const line of rl) {
    const cells = parseLine(line);
    if (!head) { head = old ? cells.map((c) => (c === old.geoField ? kind.geoField : c)) : cells; continue; }
    const rec = {};
    head.forEach((h, k) => { rec[h] = cells[k] ?? ''; });
    onRecord(rec);
  }
}

// Le serveur DiDo répond parfois 502/504 sur les gros fichiers : on relance avec un accumulateur neuf
async function retry(fn, tries = 5) {
  let last;
  for (let t = 1; t <= tries; t++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * t)); }
  }
  throw last;
}

const kindOf = (config) => KINDS[config.kind || 'sitadel'];
const FILTER_FIELD = (kind) => ({ COM: kind.geoField, DEP: 'DEP_CODE', REG: 'REG_CODE' });

/** Un territoire (commune, département ou région). */
async function fetchGeo(config, geo) {
  const kind = kindOf(config);
  const field = FILTER_FIELD(kind)[geo.level || 'COM'];
  if (!field) return null; // pas de niveau intercommunal dans ces fichiers
  const out = [];
  for (const m of await millesimes(config, kind.millesimes)) {
    out.push(...(await retry(async () => {
      const a = kind.accumulator(m);
      await streamCsv(config, kind, m, `${field}=eq:${geo.code}`, (r) => a.add(r));
      return a.rows();
    })));
  }
  return out;
}

/** Plusieurs communes : un seul fichier filtré sur la région en Île-de-France, sinon lots de 60 communes. */
async function fetchMany(config, geos) {
  const kind = kindOf(config);
  const comm = geos.filter((g) => (g.level || 'COM') === 'COM');
  const out = new Map(geos.map((g) => [g.code, []]));
  const idf = comm.length >= 200 && comm.every((g) => IDF_DEPTS.has(g.code.slice(0, 2)));
  for (const m of await millesimes(config, kind.millesimes)) {
    const groups = idf ? [[comm.map((g) => g.code), 'REG_CODE=eq:11']] : chunk(comm.map((g) => g.code), 60).map((part) => [part, `${kind.geoField}=in:${part.join(',')}`]);
    for (const [codes, filter] of groups) {
      const accs = await retry(async () => {
        const map = new Map(codes.map((c) => [c, kind.accumulator(m)]));
        await streamCsv(config, kind, m, filter, (r) => map.get(r[kind.geoField])?.add(r));
        return map;
      });
      for (const [code, a] of accs) out.get(code).push(...a.rows());
    }
  }
  return out;
}

module.exports = { fetchGeo, fetchMany };
