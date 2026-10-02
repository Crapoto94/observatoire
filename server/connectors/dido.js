// Connecteur SDES (DiDo) : téléchargement des fichiers CSV de la base Sit@del2 (autorisations d'urbanisme créant des logements),
// filtrés par territoire à la source, lus en flux puis agrégés par année à l'import.
// Catalogue : https://www.statistiques.developpement-durable.gouv.fr/catalogue?page=dataset&datasetId=6513f0189d7d312c80ec5b5b
const readline = require('readline');
const { Readable } = require('stream');
const { fetchJson } = require('./melodi');

const API = 'https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1';
const FILTER_FIELD = { COM: 'COMM', DEP: 'DEP_CODE', REG: 'REG_CODE' };

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, (k + 1) * n));

// Millésime le plus récent du fichier (mis en cache une heure)
const cache = new Map();
async function latestMillesime(config) {
  const hit = cache.get(config.rid);
  if (hit && Date.now() - hit.at < 3600e3) return hit.value;
  const d = await fetchJson(`${API}/datasets/${config.dataset}`);
  const file = (d.datafiles || []).find((f) => f.rid === config.rid);
  const value = file?.millesimes?.[0]?.millesime;
  if (!value) throw new Error(`millésime introuvable pour le fichier ${config.rid}`);
  cache.set(config.rid, { at: Date.now(), value });
  return value;
}

function parseLine(line, delim = ';') {
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

// Lit le CSV filtré en flux et appelle onRecord pour chaque ligne (objet colonne -> valeur, colonnes utiles seulement)
async function streamCsv(config, filter, onRecord) {
  const millesime = await latestMillesime(config);
  const url = `${API}/datafiles/${config.rid}/csv?millesime=${millesime}&withColumnName=true&withColumnDescription=false&withColumnUnit=false&${filter}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(1200000) });
  if (!res.ok) throw new Error(`DiDo HTTP ${res.status} (${config.rid})`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity });
  let idx = null;
  const want = ['COMM', 'TYPE_DAU', 'DATE_REELLE_AUTORISATION', 'DATE_REELLE_DOC', 'DATE_REELLE_DAACT',
    'NB_LGT_TOT_CREES', 'NB_LGT_IND_CREES', 'NB_LGT_COL_CREES', 'NB_LGT_PRET_LOC_SOCIAL', 'NB_LGT_DEMOLIS'];
  for await (const line of rl) {
    const cells = parseLine(line);
    if (!idx) { idx = Object.fromEntries(cells.map((h, k) => [h, k])); continue; }
    const rec = {};
    for (const w of want) rec[w] = cells[idx[w]] ?? '';
    onRecord(rec);
  }
  return millesime;
}

const num = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Agrégation annuelle : logements autorisés / commencés / achevés (selon la date de chaque étape), logements sociaux, démolitions,
// nombre d'autorisations, par type de logement (individuel / collectif) et type d'autorisation (PC, DP, PA).
function accumulator() {
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
      const steps = [['LGT_AUTORISES', r.DATE_REELLE_AUTORISATION], ['LGT_COMMENCES', r.DATE_REELLE_DOC], ['LGT_ACHEVES', r.DATE_REELLE_DAACT]];
      for (const [mesure, date] of steps) {
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

/** Un territoire (commune, département ou région). */
async function fetchGeo(config, geo) {
  const field = FILTER_FIELD[geo.level || 'COM'];
  if (!field) return null; // pas de niveau intercommunal dans le fichier
  const a = accumulator();
  await streamCsv(config, `${field}=eq:${geo.code}`, (r) => a.add(r));
  return a.rows();
}

/** Plusieurs communes (par lots de 60 pour limiter la taille de l'URL). */
const IDF_DEPTS = new Set(['75', '77', '78', '91', '92', '93', '94', '95']);

async function fetchMany(config, geos) {
  const comm = geos.filter((g) => (g.level || 'COM') === 'COM');
  const out = new Map(geos.map((g) => [g.code, []]));
  // beaucoup de communes d'Île-de-France : un seul fichier filtré sur la région, filtré ensuite en interne
  if (comm.length >= 200 && comm.every((g) => IDF_DEPTS.has(g.code.slice(0, 2)))) {
    const accs = new Map(comm.map((g) => [g.code, accumulator()]));
    await streamCsv(config, 'REG_CODE=eq:11', (r) => accs.get(r.COMM)?.add(r));
    for (const [code, a] of accs) out.get(code).push(...a.rows());
    return out;
  }
  for (const part of chunk(comm.map((g) => g.code), 60)) {
    const accs = new Map(part.map((c) => [c, accumulator()]));
    await streamCsv(config, `COMM=in:${part.join(',')}`, (r) => accs.get(r.COMM)?.add(r));
    for (const [code, a] of accs) out.get(code).push(...a.rows());
  }
  return out;
}

module.exports = { fetchGeo, fetchMany };
