// Import des données dans la base locale (les données ne sont jamais lues en direct par l'interface).
const { all, get, run, tx } = require('./db');
const melodi = require('./connectors/melodi');
const open = require('./connectors/open');

const CONNECTORS = {
  melodi: (config, geo) => melodi.fetchGeo(config, geoId(geo)),
  tabular: open.fetchTabular,
  ods: open.fetchOds,
  geodvf: open.fetchGeoDvf,
  entreprises: open.fetchEntreprises,
};

const jobs = new Map();
let jobSeq = 0;

const now = () => new Date().toISOString();
const GEO_YEAR = '2025'; // millésime de la géographie utilisé par Melodi
const geoId = (g) => `${GEO_YEAR}-${g.level || 'COM'}-${g.code}`;

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
    tx(() => {
      run('DELETE FROM data_rows WHERE dataset_id = ? AND geo = ?', dataset.id, geo.code);
      for (const r of rows) {
        run('INSERT INTO data_rows (dataset_id, geo, period, dims, measure, value, status) VALUES (?,?,?,?,?,?,?)',
          dataset.id, geo.code, r.period, JSON.stringify(r.dims), r.measure, r.value, r.status ?? null);
      }
    });
    run('INSERT INTO import_log (dataset_id, geo, started, finished, status, rows) VALUES (?,?,?,?,?,?)',
      dataset.id, geo.code, started, now(), 'ok', rows.length);
    log(`${dataset.id} / ${geo.nom} : ${rows.length} lignes`);
    return rows.length;
  } catch (e) {
    run('INSERT INTO import_log (dataset_id, geo, started, finished, status, rows, message) VALUES (?,?,?,?,?,?,?)',
      dataset.id, geo.code, started, now(), 'erreur', 0, String(e.message).slice(0, 500));
    log(`${dataset.id} / ${geo.nom} : ERREUR ${e.message}`);
    throw e;
  }
}

function refreshStats(datasetId) {
  const n = get('SELECT COUNT(*) AS n FROM data_rows WHERE dataset_id = ?', datasetId).n;
  const last = get(`SELECT MAX(finished) AS d FROM import_log WHERE dataset_id = ? AND status = 'ok'`, datasetId)?.d;
  const err = get(`SELECT message FROM import_log WHERE dataset_id = ? ORDER BY id DESC LIMIT 1`, datasetId);
  run('UPDATE datasets SET nb_rows = ?, last_import = ?, status = ? WHERE id = ?',
    n, last || null, err?.message ? 'erreur' : n ? 'ok' : null, datasetId);
}

/** Lance un import en tâche de fond. datasetIds / geoCodes vides = tout. */
function startImport({ datasetIds, geoCodes } = {}) {
  const datasets = datasetIds?.length
    ? all(`SELECT * FROM datasets WHERE id IN (${datasetIds.map(() => '?').join(',')})`, ...datasetIds)
    : all('SELECT * FROM datasets');
  const geos = geoCodes?.length
    ? all(`SELECT * FROM geos WHERE code IN (${geoCodes.map(() => '?').join(',')})`, ...geoCodes)
    : all('SELECT * FROM geos');
  const id = ++jobSeq;
  const job = { id, status: 'en cours', total: datasets.length * geos.length, done: 0, errors: 0, log: [], started: now() };
  jobs.set(id, job);
  (async () => {
    const log = (m) => { job.log.push(m); if (job.log.length > 200) job.log.shift(); };
    for (const d of datasets) {
      try {
        const cfg = JSON.parse(d.config || '{}');
        if (d.provider === 'melodi' && !d.labels) {
          const labels = await melodi.fetchLabels(cfg.ds);
          run('UPDATE datasets SET labels = ? WHERE id = ?', JSON.stringify(labels), d.id);
        } else if (d.provider !== 'melodi' && cfg.labels) {
          run('UPDATE datasets SET labels = ? WHERE id = ?', JSON.stringify(cfg.labels), d.id);
        }
      } catch (e) {
        log(`${d.id} : libellés indisponibles (${e.message})`);
      }
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

module.exports = { startImport, jobs, refreshStats };
