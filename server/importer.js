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

// ---------------- journal des imports (table import_runs) ----------------
const METHODS = {
  melodi: { method: 'API REST Melodi (INSEE)', kind: 'api' },
  tabular: { method: 'API tabulaire data.gouv.fr', kind: 'api' },
  ods: { method: 'API Opendatasoft (explore v2.1)', kind: 'api' },
  geodvf: { method: 'Fichiers CSV geo-dvf (data.gouv.fr)', kind: 'csv' },
  entreprises: { method: "API Recherche d'entreprises", kind: 'api' },
  dido: { method: 'Téléchargement CSV filtré (DiDo, SDES)', kind: 'csv' },
  datafair: { method: 'API Data Fair (Agence ORE)', kind: 'api' },
  icu: { method: 'Export CSV + rattachement point dans polygone', kind: 'csv' },
  idfm: { method: 'API Opendatasoft (IDFM) + référentiel des zones d\'arrêts', kind: 'api' },
};
const methodOf = (d) => METHODS[d.provider] || { method: d.provider, kind: 'api' };

function startRun(job, d, scope, attempt, total) {
  const m = methodOf(d);
  const r = run(
    'INSERT INTO import_runs (job_id, scope, dataset_id, dataset_label, method, kind, source_url, started, status, attempt, territories) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    job.id, scope, d.id, d.label, m.method, m.kind, d.doc_url || null, now(), 'en cours', attempt, total
  );
  return Number(r.lastInsertRowid);
}
function endRun(id, { status, rows = 0, errors = 0, message = null, lines = [] }) {
  run('UPDATE import_runs SET finished = ?, status = ?, rows = ?, errors = ?, message = ?, log = ? WHERE id = ?',
    now(), status, rows, errors, message ? String(message).slice(0, 600) : null, JSON.stringify(lines.slice(-200)), id);
}
// les runs restés « en cours » après un redémarrage du serveur sont marqués interrompus
try { run("UPDATE import_runs SET status = 'interrompu', finished = ? WHERE status = 'en cours'", now()); } catch { /* table absente au premier démarrage */ }

// Chien de garde : un lot qui ne répond plus (ou qu'on demande de passer) est abandonné pour que l'import continue avec le jeu suivant
class Bypass extends Error {}
const withTimeout = (p, ms, label, shouldAbort = () => false) => new Promise((resolve, reject) => {
  const t = setTimeout(() => done(reject, new Error(`délai dépassé (${Math.round(ms / 60000)} min) : ${label}`)), ms);
  const poll = setInterval(() => { if (shouldAbort()) done(reject, new Bypass('jeu passé à la demande ou import arrêté')); }, 1000);
  const done = (fn, v) => { clearTimeout(t); clearInterval(poll); fn(v); };
  p.then((v) => done(resolve, v), (e) => done(reject, e));
});
const CHUNK_TIMEOUT = 15 * 60000; // un lot d'import en masse
const GEO_TIMEOUT = 3 * 60000; // une commune en mode unitaire
const MAX_PASSES = 3; // passages sur les jeux reportés
const RETRY_WAIT = 3 * 60000; // attente avant de reprendre les jeux reportés
const sleep = (ms, stop = () => false) => new Promise((res) => { const t0 = Date.now(); const i = setInterval(() => { if (stop() || Date.now() - t0 >= ms) { clearInterval(i); res(); } }, 1000); });

// Import d'un jeu pour des communes d'Île-de-France. Au premier échec d'un lot, le jeu est abandonné (statut « reporté ») ; les lots déjà
// enregistrés sont conservés et seules les communes sans données seront reprises au passage suivant.
async function importIdfDataset(d, geos, job, log, attempt) {
  const lines = [];
  const lg = (m) => { log(m); lines.push(`${new Date().toISOString().slice(11, 19)} ${m}`); };
  const runId = startRun(job, d, 'idf', attempt, geos.length);
  job.current = { id: d.id, label: d.label, done: 0, total: geos.length, attempt, method: methodOf(d).method };
  const cfg = JSON.parse(d.config || '{}');
  const b = BULK[d.provider];
  const aborted = () => job.cancelled || job.skip === d.id;
  let total = 0, errors = 0, failure = null;
  try {
    if (b) {
      for (const part of bulk.chunk(geos, b.size)) {
        if (aborted()) throw new Bypass('abandonné');
        const map = await withTimeout(b.fn(cfg, part, (m) => lg(`${d.id} : ${m}`)), b.size >= 100000 ? 3 * CHUNK_TIMEOUT : CHUNK_TIMEOUT, `${d.id} (${part.length} communes)`, aborted);
        if (map === null) { lg(`${d.id} : niveau communal non disponible`); job.current.done += part.length; continue; }
        total += storeRows(d.id, part.map((g) => g.code), (code) => map.get(code));
        job.current.done += part.length;
        lg(`${d.id} : ${job.current.done} / ${geos.length} communes traitées`);
      }
    } else {
      let consecutive = 0;
      await pool(geos, 4, async (g) => {
        if (failure) return;
        try {
          total += await withTimeout(importOne(d, g, () => {}), GEO_TIMEOUT, `${d.id} / ${g.nom}`, aborted);
          consecutive = 0;
        } catch (e) {
          errors++;
          if (e instanceof Bypass) failure = e.message;
          else if (++consecutive >= 8) failure = `${consecutive} erreurs consécutives (dernière : ${e.message})`;
          lg(`${d.id} / ${g.nom} : ERREUR ${e.message}`);
        }
        job.current.done++;
        if (job.current.done % 100 === 0) lg(`${d.id} : ${job.current.done} / ${geos.length} communes traitées`);
      });
      if (failure) throw new Error(failure);
    }
    endRun(runId, { status: errors ? 'partiel' : 'ok', rows: total, errors, lines });
    run('INSERT INTO import_log (dataset_id, geo, started, finished, status, rows) VALUES (?,?,?,?,?,?)', d.id, 'IDF', now(), now(), 'ok', total);
    refreshStats(d.id);
    return { ok: true, rows: total };
  } catch (e) {
    lg(`${d.id} : ERREUR ${e.message}`);
    endRun(runId, { status: e instanceof Bypass ? 'passé' : 'reporté', rows: total, errors: errors + 1, message: e.message, lines });
    refreshStats(d.id);
    return { ok: false, rows: total, error: e.message, bypassed: e instanceof Bypass };
  }
}

/**
 * Lance un import en tâche de fond.
 *  - par défaut : territoires favoris (bulk = 0) ou geoCodes ;
 *  - scope 'idf' : toutes les communes d'Île-de-France. Un jeu en difficulté est reporté, les suivants sont traités,
 *    puis les jeux reportés sont repris (jusqu'à MAX_PASSES passages).
 */
function startImport({ datasetIds, geoCodes, scope } = {}) {
  // un seul import à la fois : si un import tourne déjà, on renvoie celui-ci
  const running = currentJob();
  if (running) return { ...running, already: true };
  const datasets = selectDatasets(datasetIds);
  const id = ++jobSeq;
  const job = { id, scope: scope || 'favoris', status: 'en cours', total: 1, done: 0, errors: 0, log: [], started: now(), activity: Date.now(), current: null, deferred: [] };
  jobs.set(id, job);
  const log = (m) => { job.activity = Date.now(); job.log.push(m); if (job.log.length > 300) job.log.shift(); };
  const finish = () => {
    job.current = null;
    job.status = job.cancelled ? 'arrêté' : job.errors ? 'terminé avec erreurs' : 'terminé';
    job.finished = now();
  };

  if (scope === 'idf') {
    (async () => {
      try {
        await bootstrapIdf({ log });
        const allGeos = all('SELECT g.* FROM geos g JOIN geo_shapes s ON s.code = g.code ORDER BY g.code');
        job.total = datasets.length; // unité : le jeu (la progression du jeu en cours est dans job.current)
        let pending = datasets;
        for (let pass = 0; pass < MAX_PASSES && pending.length && !job.cancelled; pass++) {
          const next = [];
          for (const d of pending) {
            if (job.cancelled) break;
            job.skip = null;
            await ensureLabels(d, log);
            // aux passages suivants : seulement les communes encore sans données
            const have = pass ? new Set(all('SELECT DISTINCT geo FROM data_rows WHERE dataset_id = ?', d.id).map((r) => r.geo)) : null;
            const geos = have ? allGeos.filter((g) => !have.has(g.code)) : allGeos;
            if (!geos.length) { job.done++; continue; }
            log(`${d.id} : import de ${geos.length} communes${pass ? ` (passage ${pass + 1})` : '…'}`);
            const res = await importIdfDataset(d, geos, job, log, pass + 1);
            if (res.ok) job.done++;
            else if (pass + 1 < MAX_PASSES && !job.cancelled) { next.push(d); job.deferred = next.map((x) => x.id); log(`${d.id} : reporté, reprise plus tard`); } else { job.done++; job.errors++; }
          }
          pending = next;
          if (pending.length && !job.cancelled) {
            log(`${pending.length} jeu(x) reporté(s) : reprise dans ${RETRY_WAIT / 60000} min (${pending.map((d) => d.id).join(', ')})`);
            job.current = null;
            await sleep(RETRY_WAIT, () => job.cancelled);
          }
        }
        job.deferred = [];
        syncPopulations();
      } catch (e) {
        job.errors++;
        log(`ERREUR ${e.message}`);
      }
      finish();
    })();
    return job;
  }

  const geos = geoCodes?.length
    ? all(`SELECT * FROM geos WHERE code IN (${geoCodes.map(() => '?').join(',')})`, ...geoCodes)
    : all('SELECT * FROM geos WHERE bulk = 0');
  job.total = datasets.length * geos.length;
  (async () => {
    for (const d of datasets) {
      if (job.cancelled) break;
      job.skip = null;
      const lines = [];
      const lg = (m) => { log(m); lines.push(`${new Date().toISOString().slice(11, 19)} ${m}`); };
      const runId = startRun(job, d, 'favoris', 1, geos.length);
      job.current = { id: d.id, label: d.label, done: 0, total: geos.length, attempt: 1, method: methodOf(d).method };
      await ensureLabels(d, lg);
      let rows = 0, errors = 0, failure = null;
      const aborted = () => job.cancelled || job.skip === d.id;
      for (const g of geos) {
        if (aborted()) { failure = job.cancelled ? 'import arrêté' : 'jeu passé à la demande'; job.done += geos.length - job.current.done; break; }
        try { rows += await withTimeout(importOne(d, g, lg), GEO_TIMEOUT, `${d.id} / ${g.nom}`, aborted); } catch (e) { errors++; job.errors++; if (e instanceof Bypass) failure = e.message; }
        job.done++;
        job.current.done++;
      }
      endRun(runId, { status: failure ? 'passé' : errors ? 'partiel' : 'ok', rows, errors, message: failure, lines });
      refreshStats(d.id);
    }
    finish();
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
