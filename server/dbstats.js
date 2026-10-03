// Informations synthétiques de la base. Aucun parcours de data_rows ici : cette table
// peut être volumineuse et l'écran Paramètres doit répondre rapidement.
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const FILE = path.join(__dirname, '..', 'data', 'observatoire.sqlite');
let all, get, currentJob = () => null;
if (isMainThread) {
  ({ all, get } = require('./db'));
  currentJob = require('./importer').currentJob;
} else {
  // Ouvre directement la base sans charger db.js (qui exécute le DDL de démarrage)
  // ni importer.js dans le worker.
  const { DatabaseSync } = require('node:sqlite');
  const workerDb = new DatabaseSync(FILE, { readOnly: true });
  all = (sql, ...params) => workerDb.prepare(sql).all(...params);
  get = (sql, ...params) => workerDb.prepare(sql).get(...params);
}
const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };

function stats() {
  const t0 = Date.now();
  const pageSize = get('PRAGMA page_size').page_size;
  const pages = get('PRAGMA page_count').page_count;
  const free = get('PRAGMA freelist_count').freelist_count;
  const datasets = all('SELECT id, label, provider, last_import, COALESCE(nb_rows, 0) AS rows FROM datasets ORDER BY nb_rows DESC, label')
    .map((d) => ({ ...d, geos: null, idf: null, errors: 0, last_error: null }));
  const totalRows = datasets.reduce((sum, d) => sum + Number(d.rows || 0), 0);
  const idfCommunes = get('SELECT COUNT(*) AS n FROM geo_shapes').n;
  const indicators = get('SELECT COUNT(*) AS n FROM indicators').n;
  const indicatorsWithoutDataset = get('SELECT COUNT(*) AS n FROM indicators i WHERE NOT EXISTS (SELECT 1 FROM indicator_datasets d WHERE d.indicator_id = i.id)').n;
  const geos = get('SELECT COUNT(*) AS n FROM geos WHERE bulk = 0').n;
  const history = get('SELECT COUNT(*) AS n FROM indicator_history').n;
  const versions = get('SELECT COUNT(*) AS n FROM carte_versions').n;
  const alerts = [];
  const empty = datasets.filter((d) => !d.rows);
  if (empty.length) alerts.push({ level: 'attention', text: `${empty.length} jeu(x) sans données : ${empty.map((d) => d.id).join(', ')}` });
  if (pages && free / pages > 0.2) alerts.push({ level: 'info', text: `${Math.round((100 * free) / pages)} % de la base est libre : un VACUUM réduirait le fichier` });
  const job = currentJob();

  return {
    generated: new Date().toISOString(), ms: Date.now() - t0,
    file: { path: 'data/observatoire.sqlite', bytes: size(FILE), wal: size(`${FILE}-wal`), pageSize, pages, free },
    sqlite: get('SELECT sqlite_version() AS v').v, check: null,
    process: { uptime: Math.round(process.uptime()), rss: process.memoryUsage().rss, node: process.version },
    job: job ? { scope: job.scope, done: job.done, total: job.total, errors: job.errors } : null,
    totals: { rows: totalRows, indicators, indicatorsWithoutDataset, geos, idfCommunes, datasets: datasets.length, history, versions },
    // Les compteurs proviennent des métadonnées d'import ; aucune requête COUNT(*) sur
    // les tables volumineuses n'est exécutée pour construire cette vue synthétique.
    tables: [
      { name: 'data_rows', rows: totalRows },
      { name: 'datasets', rows: datasets.length },
      { name: 'indicators', rows: indicators },
      { name: 'geos', rows: geos },
    ],
    datasets, alerts,
  };
}

function statsAsync() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename);
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Le calcul synthétique de la base a dépassé 15 secondes et a été arrêté.'));
    }, 15000);
    timeout.unref?.();
    worker.once('message', (result) => {
      clearTimeout(timeout);
      if (result?.__error) { reject(new Error(result.__error)); return; }
      result.job = currentJob() ? { scope: currentJob().scope, done: currentJob().done, total: currentJob().total, errors: currentJob().errors } : null;
      resolve(result);
    });
    worker.once('error', (e) => { clearTimeout(timeout); reject(e); });
    worker.once('exit', (code) => {
      if (code && code !== 0) { clearTimeout(timeout); reject(new Error(`Analyse de la base interrompue (code ${code})`)); }
    });
  });
}

if (!isMainThread) {
  try { parentPort.postMessage(stats()); }
  catch (e) { parentPort.postMessage({ __error: e.message }); }
}

module.exports = { stats, statsAsync };
