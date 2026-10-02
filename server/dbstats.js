// Volumétrie et santé de la base (page « Base de données »)
const fs = require('fs');
const path = require('path');
const { all, get, db } = require('./db');
const { currentJob } = require('./importer');

const FILE = path.join(__dirname, '..', 'data', 'observatoire.sqlite');
const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };

function stats({ check: withCheck = false } = {}) {
  const t0 = Date.now();
  const tablesRaw = all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((t) => t.name);
  const pageSize = get('PRAGMA page_size')['page_size'];
  const pages = get('PRAGMA page_count')['page_count'];
  const free = get('PRAGMA freelist_count')['freelist_count'];
  // contrôle complet : lent sur une grosse base, donc à la demande seulement
  const check = withCheck ? all('PRAGMA quick_check').map((r) => Object.values(r)[0]) : null;

  // un seul parcours de l'index (dataset_id, geo) : lignes, territoires et couverture Île-de-France par jeu
  const shapeCodes = new Set(all('SELECT code FROM geo_shapes').map((r) => r.code));
  const agg = new Map();
  for (const r of all('SELECT dataset_id, geo, COUNT(*) AS n FROM data_rows GROUP BY dataset_id, geo')) {
    const a = agg.get(r.dataset_id) || agg.set(r.dataset_id, { rows: 0, geos: 0, idf: 0 }).get(r.dataset_id);
    a.rows += r.n; a.geos += 1; if (shapeCodes.has(r.geo)) a.idf += 1;
  }
  const perDataset = all('SELECT id, label, provider, last_import FROM datasets').map((d) => ({ ...d, ...(agg.get(d.id) || { rows: 0, geos: 0, idf: 0 }) })).sort((a, b) => b.rows - a.rows);
  const errors = Object.fromEntries(all(`SELECT dataset_id, COUNT(*) AS n FROM import_log WHERE status != 'ok' AND id > (SELECT COALESCE(MAX(l.id), 0) FROM import_log l WHERE l.dataset_id = import_log.dataset_id AND l.status = 'ok' AND l.geo != 'IDF') GROUP BY dataset_id`).map((e) => [e.dataset_id, e.n]));
  const lastError = Object.fromEntries(all(`SELECT dataset_id, message FROM import_log WHERE status != 'ok' AND id IN (SELECT MAX(id) FROM import_log WHERE status != 'ok' GROUP BY dataset_id)`).map((e) => [e.dataset_id, e.message]));
  const idfCommunes = shapeCodes.size;

  const datasets = perDataset.map((d) => ({ ...d, errors: errors[d.id] || 0, last_error: lastError[d.id] || null }));
  const totalRows = datasets.reduce((s, d) => s + d.rows, 0);
  const alerts = [];
  if (check && (check.length !== 1 || check[0] !== 'ok')) alerts.push({ level: 'erreur', text: `Contrôle d'intégrité SQLite : ${check.slice(0, 3).join(' ; ')}` });
  const empty = datasets.filter((d) => !d.rows);
  if (empty.length) alerts.push({ level: 'attention', text: `${empty.length} jeu(x) sans données : ${empty.map((d) => d.id).join(', ')}` });
  const failing = datasets.filter((d) => d.errors);
  if (failing.length) alerts.push({ level: 'attention', text: `Erreurs d'import non résolues : ${failing.map((d) => `${d.id} (${d.errors})`).join(', ')}` });
  const partial = idfCommunes ? datasets.filter((d) => d.rows && d.idf < idfCommunes * 0.95 && d.idf > 0) : [];
  if (partial.length) alerts.push({ level: 'info', text: `${partial.length} jeu(x) partiellement chargé(s) pour l'Île-de-France : ${partial.map((d) => `${d.id} ${d.idf}/${idfCommunes}`).join(', ')}` });
  if (pages && free / pages > 0.2) alerts.push({ level: 'info', text: `${Math.round((100 * free) / pages)} % de la base est libre : un VACUUM réduirait le fichier` });
  const orphans = get('SELECT COUNT(*) AS n FROM indicators WHERE id NOT IN (SELECT indicator_id FROM indicator_datasets)').n;

  return {
    generated: new Date().toISOString(), ms: Date.now() - t0,
    file: { path: 'data/observatoire.sqlite', bytes: size(FILE), wal: size(`${FILE}-wal`), pageSize, pages, free },
    sqlite: get('SELECT sqlite_version() AS v').v, check: !check ? null : check[0] === 'ok' && check.length === 1 ? 'ok' : check.slice(0, 5),
    process: { uptime: Math.round(process.uptime()), rss: process.memoryUsage().rss, node: process.version },
    job: currentJob() ? { scope: currentJob().scope, done: currentJob().done, total: currentJob().total, errors: currentJob().errors } : null,
    totals: {
      rows: totalRows, indicators: get('SELECT COUNT(*) AS n FROM indicators').n, indicatorsWithoutDataset: orphans,
      geos: get('SELECT COUNT(*) AS n FROM geos WHERE bulk = 0').n, idfCommunes, datasets: datasets.length,
      history: get('SELECT COUNT(*) AS n FROM indicator_history').n, versions: get('SELECT COUNT(*) AS n FROM carte_versions').n,
    },
    tables: tablesRaw.map((name) => ({ name, rows: name === 'data_rows' ? totalRows : get(`SELECT COUNT(*) AS n FROM "${name}"`).n })), datasets, alerts,
  };
}

module.exports = { stats, db };
