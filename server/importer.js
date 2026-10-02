// Import des données dans la base locale (les données ne sont jamais lues en direct par l'interface).
//  - import « favoris » : un territoire à la fois (Ivry, territoires de comparaison) ;
//  - import « Île-de-France » : toutes les communes de la région, en masse (plusieurs communes par requête quand la source le permet).
const { db, all, get, run, tx } = require('./db');
const melodi = require('./connectors/melodi');
const open = require('./connectors/open');
const bulk = require('./connectors/bulk');
const dido = require('./connectors/dido');
const datafair = require('./connectors/datafair');
const icu = require('./connectors/icu');
const idfm = require('./connectors/idfm');
const { bootstrapIdf } = require('./idf');

const GEO_YEAR = '2025'; // millésime de la géographie utilisé par Melodi
const geoId = (g) => `${GEO_YEAR}-${g.level || 'COM'}-${g.code}`;

const CONNECTORS = {
  melodi: (config, geo) => melodi.fetchGeo(config, geoId(geo)),
  tabular: open.fetchTabular,
  ods: open.fetchOds,
  geodvf: open.fetchGeoDvf,
  entreprises: open.fetchEntreprises,
  dido: dido.fetchGeo,
  datafair: datafair.fetchGeo,
  icu: icu.fetchGeo,
  idfm: idfm.fetchGeo,
};

// import en masse : fonction, taille de lot de territoires. Les autres jeux sont importés commune par commune (4 en parallèle).
const BULK = {
  melodi: { fn: (config, geos) => bulk.melodiMany(config, geos, geoId), size: 50 },
  tabular: { fn: bulk.tabularMany, size: 400 },
  ods: { fn: bulk.odsMany, size: 400 },
  geodvf: { fn: bulk.geodvfMany, size: 100000 },
  dido: { fn: dido.fetchMany, size: 400 },
  datafair: { fn: datafair.fetchMany, size: 400 },
  icu: { fn: icu.fetchMany, size: 100000 },
  idfm: { fn: idfm.fetchMany, size: 100000 },
};

const jobs = new Map();
let jobSeq = 0;
const now = () => new Date().toISOString();

// Remplace les lignes d'un jeu pour un territoire (une transaction, instruction préparée une seule fois)
function storeRows(datasetId, geoCodes, rowsOf) {
  const ins = db.prepare('INSERT INTO data_rows (dataset_id, geo, period, dims, measure, value, status) VALUES (?,?,?,?,?,?,?)');
  const del = db.prepare('DELETE FROM data_rows WHERE dataset_id = ? AND geo = ?');
  let n = 0;
  tx(() => {
    for (const code of geoCodes) {
      del.run(datasetId, code);
      for (const r of rowsOf(code) || []) {
        ins.run(datasetId, code, r.period ?? null, JSON.stringify(r.dims), r.measure, r.value ?? null, r.status ?? null);
        n++;
      }
    }
  });
  return n;
}

async function importOne(dataset, geo, log) {
  const started = now();
  try {
    const config = JSON.parse(dataset.config || '{}');
    const connector = CONNECTORS[dataset.provider];
    if (!connector) throw new Error(`Connecteur « ${dataset.provider} » non disponible`);
    const rows = await connector(config, geo);
    if (rows === null) {
      // niveau géographique non géré par ce jeu : on retire d'éventuelles anciennes lignes sans signaler d'erreur
      run('DELETE FROM data_rows WHERE dataset_id = ? AND geo = ?', dataset.id, geo.code);
      log(`${dataset.id} / ${geo.nom} : niveau « ${geo.level} » non disponible pour ce jeu`);
      return 0;
    }
    const n = storeRows(dataset.id, [geo.code], () => rows);
    run('INSERT INTO import_log (dataset_id, geo, started, finished, status, rows) VALUES (?,?,?,?,?,?)', dataset.id, geo.code, started, now(), 'ok', n);
    log(`${dataset.id} / ${geo.nom} : ${n} lignes`);
    return n;
  } catch (e) {
    run('INSERT INTO import_log (dataset_id, geo, started, finished, status, rows, message) VALUES (?,?,?,?,?,?,?)',
      dataset.id, geo.code, started, now(), 'erreur', 0, String(e.message).slice(0, 500));
    log(`${dataset.id} / ${geo.nom} : ERREUR ${e.message}`);
    throw e;
  }
}

// Population de chaque territoire (commune, département, EPCI, région) : série historique du recensement (même source pour tous les niveaux,
// donc comparable). Sert au calcul « pour 1 000 habitants » ; la population retenue pour une période est celle du millésime le plus proche.
const POP_SQL = `SELECT geo, period, value FROM data_rows WHERE dataset_id = 'rp_serie_historique'
  AND json_extract(dims, '$.RP_MEASURE') = 'POP' AND json_extract(dims, '$.OCS') = '_T' AND value IS NOT NULL`;

function populationSeries() {
  const out = {};
  for (const r of all(POP_SQL)) (out[r.geo] ||= {})[r.period] = Math.round(r.value);
  return out;
}

// met à jour geos.population avec le dernier millésime disponible
function syncPopulations() {
  const series = populationSeries();
  let n = 0;
  const upd = db.prepare('UPDATE geos SET population = ? WHERE code = ?');
  tx(() => {
    for (const [geo, s] of Object.entries(series)) {
      upd.run(s[Object.keys(s).sort().pop()], geo);
      n++;
    }
  });
  return n;
}

function refreshStats(datasetId) {
  if (datasetId === 'rp_serie_historique') syncPopulations();
  const n = get('SELECT COUNT(*) AS n FROM data_rows WHERE dataset_id = ?', datasetId).n;
  const last = get(`SELECT MAX(finished) AS d FROM import_log WHERE dataset_id = ? AND status = 'ok'`, datasetId)?.d;
  const err = get(`SELECT message FROM import_log WHERE dataset_id = ? ORDER BY id DESC LIMIT 1`, datasetId);
  run('UPDATE datasets SET nb_rows = ?, last_import = ?, status = ? WHERE id = ?',
    n, last || null, err?.message ? 'erreur' : n ? 'ok' : null, datasetId);
}

async function ensureLabels(d, log) {
  try {
    const cfg = JSON.parse(d.config || '{}');
    if (d.provider === 'melodi' && !d.labels) {
      run('UPDATE datasets SET labels = ? WHERE id = ?', JSON.stringify(await melodi.fetchLabels(cfg.ds)), d.id);
    } else if (d.provider !== 'melodi' && cfg.labels) {
      run('UPDATE datasets SET labels = ? WHERE id = ?', JSON.stringify(cfg.labels), d.id);
    }
  } catch (e) {
    log(`${d.id} : libellés indisponibles (${e.message})`);
  }
}

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

const currentJob = () => [...jobs.values()].find((j) => j.status === 'en cours') || null;

const selectDatasets = (ids) => (ids?.length
  ? all(`SELECT * FROM datasets WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
  : all('SELECT * FROM datasets'));

// Chien de garde : un lot qui ne répond plus est abandonné (erreur journalisée) pour que l'import passe au suivant
const withTimeout = (p, ms, label) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`délai dépassé (${Math.round(ms / 60000)} min) : ${label}`)), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});
const CHUNK_TIMEOUT = 30 * 60000; // un lot d'import en masse
const GEO_TIMEOUT = 5 * 60000; // une commune en mode unitaire

// Import d'un jeu pour tous les territoires de l'Île-de-France (en masse)
async function importIdfDataset(d, geos, job, log) {
  const started = now();
  const cfg = JSON.parse(d.config || '{}');
  const b = BULK[d.provider];
  let total = 0;
  if (b) {
    for (const part of bulk.chunk(geos, b.size)) {
      try {
        const map = await withTimeout(b.fn(cfg, part, (m) => log(`${d.id} : ${m}`)), b.size >= 100000 ? 3 * CHUNK_TIMEOUT : CHUNK_TIMEOUT, `${d.id} (${part.length} communes)`);
        if (map === null) { log(`${d.id} : niveau communal non disponible`); job.done++; continue; }
        total += storeRows(d.id, part.map((g) => g.code), (code) => map.get(code));
        log(`${d.id} : ${part.length} communes traitées`);
      } catch (e) {
        job.errors++;
        log(`${d.id} : ERREUR ${e.message}`);
      }
      job.done++;
    }
  } else {
    await pool(geos, 4, async (g) => {
      try { total += await withTimeout(importOne(d, g, () => {}), GEO_TIMEOUT, `${d.id} / ${g.nom}`); } catch (e) { job.errors++; log(`${d.id} / ${g.nom} : ERREUR ${e.message}`); }
      job.done++;
    });
    log(`${d.id} : ${geos.length} communes traitées`);
  }
  run('INSERT INTO import_log (dataset_id, geo, started, finished, status, rows) VALUES (?,?,?,?,?,?)', d.id, 'IDF', started, now(), 'ok', total);
  refreshStats(d.id);
}

/**
 * Lance un import en tâche de fond.
 *  - par défaut : territoires favoris (bulk = 0) ou geoCodes ;
 *  - scope 'idf' : toutes les communes d'Île-de-France.
 */
function startImport({ datasetIds, geoCodes, scope } = {}) {
  // un seul import à la fois : si un import tourne déjà, on renvoie celui-ci
  const running = currentJob();
  if (running) return { ...running, already: true };
  const datasets = selectDatasets(datasetIds);
  const id = ++jobSeq;
  const job = { id, scope: scope || 'favoris', status: 'en cours', total: 1, done: 0, errors: 0, log: [], started: now(), activity: Date.now() };
  jobs.set(id, job);
  const log = (m) => { job.activity = Date.now(); job.log.push(m); if (job.log.length > 300) job.log.shift(); };

  if (scope === 'idf') {
    (async () => {
      try {
        await bootstrapIdf({ log });
        const geos = all('SELECT g.* FROM geos g JOIN geo_shapes s ON s.code = g.code ORDER BY g.code');
        job.total = datasets.reduce((n, d) => n + (BULK[d.provider] ? Math.ceil(geos.length / BULK[d.provider].size) : geos.length), 0);
        for (const d of datasets) {
          log(`${d.id} : import de ${geos.length} communes…`);
          await ensureLabels(d, log);
          await importIdfDataset(d, geos, job, log);
        }
        syncPopulations();
      } catch (e) {
        job.errors++;
        log(`ERREUR ${e.message}`);
      }
      job.status = job.errors ? 'terminé avec erreurs' : 'terminé';
      job.finished = now();
    })();
    return job;
  }

  const geos = geoCodes?.length
    ? all(`SELECT * FROM geos WHERE code IN (${geoCodes.map(() => '?').join(',')})`, ...geoCodes)
    : all('SELECT * FROM geos WHERE bulk = 0');
  job.total = datasets.length * geos.length;
  (async () => {
    for (const d of datasets) {
      await ensureLabels(d, log);
      for (const g of geos) {
        try { await importOne(d, g, log); } catch { job.errors++; }
        job.done++;
      }
      refreshStats(d.id);
    }
    job.status = job.errors ? 'terminé avec erreurs' : 'terminé';
    job.finished = now();
  })();
  return job;
}

/**
 * Chargement automatique de l'Île-de-France par le serveur (aucune action du navigateur requise) :
 * dès qu'aucun import ne tourne, les jeux dont la couverture communale est incomplète sont importés pour toutes les communes.
 * Chaque jeu n'est tenté qu'une fois par démarrage (les jeux à couverture structurellement partielle ne bouclent pas).
 */
function autoImportIdf({ intervalMs = 30000 } = {}) {
  const tried = new Set();
  const tick = () => {
    try {
      const running = currentJob();
      if (running) {
        // surveillance : un import sans activité depuis 20 min est signalé (les lots bloqués sont abandonnés par leur délai)
        if (Date.now() - (running.activity || 0) > 20 * 60000 && !running.warned) { running.warned = true; console.warn(`[import] job ${running.id} sans activité depuis 20 min`); running.log.push('ATTENTION : aucune activité depuis 20 min, le lot en cours sera abandonné à son délai'); }
        return;
      }
      const communes = get('SELECT COUNT(*) AS n FROM geo_shapes').n;
      const loaded = Object.fromEntries(all('SELECT dataset_id, COUNT(DISTINCT geo) AS n FROM data_rows WHERE geo IN (SELECT code FROM geo_shapes) GROUP BY dataset_id').map((r) => [r.dataset_id, r.n]));
      const todo = all('SELECT id FROM datasets').map((d) => d.id)
        .filter((id) => !tried.has(id) && (!communes || (loaded[id] || 0) < communes * 0.95));
      if (!todo.length) return;
      todo.forEach((id) => tried.add(id));
      console.log(`[import] Île-de-France : ${todo.length} jeu(x) à charger (${todo.join(', ')})`);
      startImport({ datasetIds: todo, scope: 'idf' });
    } catch (e) { console.error('[import] auto IDF', e.message); }
  };
  setInterval(tick, intervalMs).unref?.();
  setTimeout(tick, 5000);
}

module.exports = { autoImportIdf, startImport, jobs, refreshStats, currentJob, syncPopulations, populationSeries };
