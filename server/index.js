const express = require('express');
const path = require('path');
const fs = require('fs');
const { all, get, run, tx } = require('./db');
const { seed, REF_GEO } = require('./seed');
const { autoImportIdf, startImport, jobs, currentJob, syncPopulations, populationSeries } = require('./importer');
const { buildWorkbook } = require('./export');
const { shapes } = require('./idf');

seed();
require('./groups').ensureGroups();
try { const n = require('./propositions').apply(); if (n) console.log(`[propositions] ${n} fiche(s) mise(s) à jour avec les données disponibles`); } catch (e) { console.warn('[propositions]', e.message); }
syncPopulations();

const app = express();
app.use(express.json({ limit: '5mb' }));

const FIELDS = ['theme', 'theme_label', 'groupe', 'groupe_label', 'niveau', 'libelle', 'libelle_carte', 'priorite', 'source',
  'lien_origine', 'lien_corrige', 'periodicite', 'proposition', 'lien_donnees', 'notes', 'ordre', 'sous_ligne', 'excel_sheet', 'excel_row',
  'definition', 'formule', 'unite', 'perimetre', 'porteur', 'cible', 'statut', 'decision', 'faisabilite', 'parent_id', 'origine', 'cartographie'];
const ROW_FIELDS = ['source', 'lien_origine', 'lien_corrige', 'periodicite', 'proposition', 'lien_donnees'];
// champs dont les modifications sont historisées
const TRACKED = FIELDS.filter((f) => !['ordre', 'sous_ligne', 'excel_sheet', 'excel_row', 'theme_label', 'groupe_label'].includes(f));
const STATUTS = ['brouillon', 'valide', 'abandonne'];
const ORIGINES = ['externe', 'interne', 'mixte'];
const CARTOS = ['oui', 'possible', 'non'];
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(500).json({ error: e.message }));

// Date de la version déployée : fichier le plus récent du serveur et du client (permet de repérer une image Docker périmée)
function buildDate() {
  const roots = [__dirname, path.join(__dirname, 'connectors'), path.join(__dirname, '..', 'client', 'dist')];
  let latest = 0;
  for (const dir of roots) {
    try {
      for (const f of fs.readdirSync(dir)) {
        const st = fs.statSync(path.join(dir, f));
        if (st.isFile()) latest = Math.max(latest, st.mtimeMs);
      }
    } catch { /* dossier absent */ }
  }
  return latest ? new Date(latest).toISOString() : null;
}
const BUILD = buildDate();

// État de l'application et de sa base (utilisé par le HEALTHCHECK Docker et la supervision)
const status = (req, res) => {
  try {
    get('SELECT 1');
    res.json({ ok: true, status: 'ok', db: 'ok', uptime: Math.round(process.uptime()), build: BUILD, version: require('./version').info().version });
  } catch (e) {
    res.status(503).json({ ok: false, status: 'erreur', db: e.message });
  }
};
app.get('/api/health', status);
app.get('/api/status', status);
app.get('/api/version', (req, res) => res.json(require('./version').info()));
// Cartographie : couches communales, valeurs, tendances
app.get('/api/cartographie/layers', (req, res) => { try { res.json(require('./cartographie').list()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/cartographie/layer/:id', (req, res) => {
  try {
    const d = require('./cartographie').layerData(req.params.id, String(req.query.scope || '94'), String(req.query.period || ''));
    d ? res.json(d) : res.status(404).json({ error: 'couche introuvable' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Quartiers prioritaires de la politique de la ville (contours simplifiés, chargés au premier appel)
app.get('/api/qpv', async (req, res) => {
  try {
    const qpv = require('./qpv');
    await qpv.bootstrap();
    res.json({ items: qpv.list(String(req.query.scope || 'idf')) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Assistant IA (Groq) : réponses fondées sur les données de l'observatoire uniquement
app.get('/api/ia/status', (req, res) => res.json(require('./ia').status()));
app.post('/api/ia/chat', async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'question manquante' });
  try {
    res.json(await require('./ia').chat(messages, req.body?.provider));
  } catch (e) {
    console.warn('[ia]', e.message);
    res.status(502).json({ error: e.message });
  }
});
app.get('/api/autres', (req, res) => { try { res.json(require('./autres').build()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/emploi', (req, res) => { try { res.json(require('./emploi').build()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/kpi', (req, res) => { try { res.json(require('./kpi').build()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/database', (req, res) => { try { res.json(require('./dbstats').stats({ check: req.query.check === '1' })); } catch (e) { res.status(500).json({ error: e.message }); } });

// ---------------- Indicateurs ----------------
function withDatasets(rows) {
  const links = all('SELECT indicator_id, dataset_id FROM indicator_datasets');
  const by = new Map();
  for (const l of links) (by.get(l.indicator_id) || by.set(l.indicator_id, []).get(l.indicator_id)).push(l.dataset_id);
  const { kpiIdsFor } = require('./kpi');
  return rows.map((r) => ({ ...r, dataset_ids: by.get(r.id) || [], kpi_ids: kpiIdsFor(r.libelle) }));
}

app.get('/api/indicators', (req, res) => {
  res.json(withDatasets(all('SELECT * FROM indicators ORDER BY theme, groupe, ordre, sous_ligne, id')));
});

function saveLinks(id, datasetIds) {
  if (!Array.isArray(datasetIds)) return;
  run('DELETE FROM indicator_datasets WHERE indicator_id = ?', id);
  for (const d of datasetIds) run('INSERT OR IGNORE INTO indicator_datasets (indicator_id, dataset_id) VALUES (?,?)', id, d);
}

const checkStatut = (b) => {
  if (b.statut != null && !STATUTS.includes(b.statut)) return 'statut inconnu';
  if (b.origine != null && b.origine !== '' && !ORIGINES.includes(b.origine)) return 'origine inconnue';
  if (b.cartographie != null && b.cartographie !== '' && !CARTOS.includes(b.cartographie)) return 'valeur de cartographie inconnue';
  return null;
};

app.post('/api/indicators', (req, res) => {
  const b = req.body || {};
  if (!b.libelle || !b.niveau || !b.theme) return res.status(400).json({ error: 'theme, niveau et libelle sont obligatoires' });
  if (checkStatut(b)) return res.status(400).json({ error: checkStatut(b) });
  const cols = FIELDS.filter((f) => b[f] !== undefined);
  const id = tx(() => {
    const r = run(`INSERT INTO indicators (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => b[c]));
    const newId = Number(r.lastInsertRowid);
    saveLinks(newId, b.dataset_ids);
    run('INSERT INTO indicator_history (indicator_id, field, old_value, new_value) VALUES (?,?,?,?)', newId, 'création', null, b.libelle);
    return newId;
  });
  res.status(201).json(withDatasets(all('SELECT * FROM indicators WHERE id = ?', id))[0]);
});

app.put('/api/indicators/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = get('SELECT * FROM indicators WHERE id = ?', id);
  if (!cur) return res.status(404).json({ error: 'introuvable' });
  const b = req.body || {};
  if (checkStatut(b)) return res.status(400).json({ error: checkStatut(b) });
  if (b.parent_id != null && Number(b.parent_id) === id) return res.status(400).json({ error: 'un indicateur ne peut pas être son propre parent' });
  tx(() => {
    const cols = FIELDS.filter((f) => b[f] !== undefined);
    if (cols.length) {
      run(`UPDATE indicators SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...cols.map((c) => b[c]), id);
      for (const c of cols.filter((f) => TRACKED.includes(f))) {
        const o = cur[c] ?? null;
        const n = b[c] === '' ? null : b[c] ?? null;
        if (String(o ?? '') !== String(n ?? '')) {
          run('INSERT INTO indicator_history (indicator_id, field, old_value, new_value) VALUES (?,?,?,?)', id, c, o == null ? null : String(o), n == null ? null : String(n));
        }
      }
    }
    if (b.apply_to_row && cur.excel_sheet != null) {
      const sets = ROW_FIELDS.filter((f) => b[f] !== undefined);
      if (sets.length) {
        run(`UPDATE indicators SET ${sets.map((c) => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
             WHERE excel_sheet = ? AND excel_row = ? AND id <> ?`, ...sets.map((c) => b[c]), cur.excel_sheet, cur.excel_row, id);
      }
    }
    if (Array.isArray(b.dataset_ids)) {
      const before = all('SELECT dataset_id FROM indicator_datasets WHERE indicator_id = ? ORDER BY dataset_id', id).map((r) => r.dataset_id).join(', ');
      const after = [...b.dataset_ids].sort().join(', ');
      if (before !== after) run('INSERT INTO indicator_history (indicator_id, field, old_value, new_value) VALUES (?,?,?,?)', id, 'jeux de données', before || null, after || null);
      saveLinks(id, b.dataset_ids);
    }
  });
  res.json(withDatasets(all('SELECT * FROM indicators WHERE id = ?', id))[0]);
});

app.delete('/api/indicators/:id', (req, res) => {
  run('UPDATE indicators SET parent_id = NULL WHERE parent_id = ?', Number(req.params.id));
  run('DELETE FROM indicators WHERE id = ?', Number(req.params.id));
  run('DELETE FROM indicator_history WHERE indicator_id = ?', Number(req.params.id));
  res.status(204).end();
});

app.get('/api/indicators/:id/history', (req, res) => {
  res.json(all('SELECT * FROM indicator_history WHERE indicator_id = ? ORDER BY id DESC LIMIT 200', Number(req.params.id)));
});

// ---------------- Export Excel (même présentation que le classeur d'origine, colonnes de conception en plus) ----------------
app.get('/api/export.xlsx', wrap(async (req, res) => {
  const wb = buildWorkbook(withDatasets(all('SELECT * FROM indicators ORDER BY theme, groupe, ordre, sous_ligne, id')));
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="indicateurs_${stamp}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

// ---------------- Versions de la carte mentale ----------------
app.get('/api/carte/versions', (req, res) => {
  res.json(all('SELECT id, label, created_at FROM carte_versions ORDER BY id DESC'));
});
app.post('/api/carte/versions', (req, res) => {
  const label = String(req.body?.label || '').trim();
  if (!label) return res.status(400).json({ error: 'libellé requis' });
  const snap = all('SELECT * FROM indicators ORDER BY theme, groupe, ordre, sous_ligne, id');
  const r = run('INSERT INTO carte_versions (label, snapshot) VALUES (?,?)', label, JSON.stringify(snap));
  res.status(201).json(get('SELECT id, label, created_at FROM carte_versions WHERE id = ?', Number(r.lastInsertRowid)));
});
app.get('/api/carte/versions/:id', (req, res) => {
  const v = get('SELECT * FROM carte_versions WHERE id = ?', Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'introuvable' });
  res.json({ id: v.id, label: v.label, created_at: v.created_at, indicators: JSON.parse(v.snapshot).map((i) => ({ ...i, dataset_ids: [] })) });
});
app.delete('/api/carte/versions/:id', (req, res) => {
  run('DELETE FROM carte_versions WHERE id = ?', Number(req.params.id));
  res.status(204).end();
});

// ---------------- Jeux de données ----------------
// Le jeu sait-il fournir des données communales ? (condition pour afficher une carte)
function communalConfig(d) {
  try {
    const c = JSON.parse(d.config || '{}');
    if (d.provider === 'tabular') return (c.sources || []).some((s) => (s.level || 'COM') === 'COM');
    if (d.provider === 'ods' || d.provider === 'datafair') return !!c.levels?.COM;
    return true;
  } catch { return false; }
}

app.get('/api/datasets', (req, res) => {
  const rows = all(`SELECT d.id, d.label, d.provider, d.config, d.description, d.themes, d.doc_url, d.last_import, d.nb_rows, d.status,
      (SELECT COUNT(*) FROM indicator_datasets l WHERE l.dataset_id = d.id) AS nb_indicateurs
    FROM datasets d ORDER BY d.label`);
  // communes d'Île-de-France disposant de données pour chaque jeu
  const mapped = Object.fromEntries(all(`SELECT dataset_id, COUNT(DISTINCT geo) AS n FROM data_rows WHERE geo IN (SELECT code FROM geo_shapes) GROUP BY dataset_id`).map((r) => [r.dataset_id, r.n]));
  const perGeo = all('SELECT dataset_id, geo, COUNT(*) AS n FROM data_rows GROUP BY dataset_id, geo');
  const links = all('SELECT dataset_id, indicator_id FROM indicator_datasets');
  res.json(rows.map(({ config, ...d }) => ({
    ...d,
    map_capable: communalConfig({ provider: d.provider, config }),
    map_communes: mapped[d.id] || 0,
    themes: JSON.parse(d.themes || '[]'),
    geo_counts: Object.fromEntries(perGeo.filter((p) => p.dataset_id === d.id).map((p) => [p.geo, p.n])),
    indicator_ids: links.filter((l) => l.dataset_id === d.id).map((l) => l.indicator_id),
  })));
});

// Données brutes stockées pour un ou plusieurs territoires
app.get('/api/datasets/:id/data', (req, res) => {
  const d = get('SELECT id, label, description, doc_url, labels, last_import, nb_rows FROM datasets WHERE id = ?', req.params.id);
  if (!d) return res.status(404).json({ error: 'introuvable' });
  const geos = String(req.query.geos || REF_GEO.code).split(',').filter(Boolean);
  const rows = all(
    `SELECT geo, period, dims, measure, value, status FROM data_rows WHERE dataset_id = ? AND geo IN (${geos.map(() => '?').join(',')})`,
    d.id, ...geos
  ).map((r) => ({ ...r, dims: JSON.parse(r.dims || '{}') }));
  res.json({ ...d, labels: d.labels ? JSON.parse(d.labels) : {}, rows });
});

app.post('/api/datasets/:id/import', (req, res) => {
  if (!get('SELECT id FROM datasets WHERE id = ?', req.params.id)) return res.status(404).json({ error: 'introuvable' });
  res.status(202).json(startImport({ datasetIds: [req.params.id], geoCodes: req.body?.geos }));
});

app.post('/api/import', (req, res) => {
  res.status(202).json(startImport({ datasetIds: req.body?.datasets, geoCodes: req.body?.geos, scope: req.body?.scope }));
});

// Journal des imports : filtres dataset, statut, périmètre, méthode (api / csv), texte libre, dates
app.get('/api/import-runs', (req, res) => {
  const q = req.query, where = [], params = [];
  if (q.dataset) { where.push('dataset_id = ?'); params.push(String(q.dataset)); }
  if (q.status) { where.push('status = ?'); params.push(String(q.status)); }
  if (q.scope) { where.push('scope = ?'); params.push(String(q.scope)); }
  if (q.kind) { where.push('kind = ?'); params.push(String(q.kind)); }
  if (q.method) { where.push('method = ?'); params.push(String(q.method)); }
  if (q.from) { where.push('started >= ?'); params.push(String(q.from)); }
  if (q.to) { where.push('started <= ?'); params.push(String(q.to) + 'T23:59:59'); }
  if (q.q) { where.push('(dataset_label LIKE ? OR dataset_id LIKE ? OR message LIKE ? OR log LIKE ?)'); const l = '%' + String(q.q) + '%'; params.push(l, l, l, l); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(q.limit) || 100, 500), offset = Number(q.offset) || 0;
  res.json({
    total: get('SELECT COUNT(*) AS n FROM import_runs ' + w, ...params).n,
    items: all('SELECT id, job_id, scope, dataset_id, dataset_label, method, kind, source_url, started, finished, status, rows, errors, attempt, territories, message FROM import_runs ' + w + ' ORDER BY id DESC LIMIT ? OFFSET ?', ...params, limit, offset),
    facets: {
      status: all('SELECT status AS v, COUNT(*) AS n FROM import_runs GROUP BY status ORDER BY n DESC'),
      method: all('SELECT method AS v, kind, COUNT(*) AS n FROM import_runs GROUP BY method ORDER BY n DESC'),
      scope: all('SELECT scope AS v, COUNT(*) AS n FROM import_runs GROUP BY scope'),
      dataset: all('SELECT dataset_id AS v, dataset_label AS label, COUNT(*) AS n FROM import_runs GROUP BY dataset_id ORDER BY dataset_label'),
    },
  });
});
app.get('/api/import-runs/:id', (req, res) => {
  const r = get('SELECT * FROM import_runs WHERE id = ?', req.params.id);
  r ? res.json({ ...r, log: JSON.parse(r.log || '[]') }) : res.status(404).json({ error: 'introuvable' });
});

// Passer le jeu en cours (il sera repris plus tard) ou arrêter l'import
app.post('/api/jobs/:id/skip', (req, res) => {
  const j = jobs.get(Number(req.params.id));
  if (!j || j.status !== 'en cours') return res.status(404).json({ error: 'import introuvable ou terminé' });
  j.skip = j.current?.id || null;
  res.json({ ok: true, skipped: j.skip });
});
app.post('/api/jobs/:id/cancel', (req, res) => {
  const j = jobs.get(Number(req.params.id));
  if (!j || j.status !== 'en cours') return res.status(404).json({ error: 'import introuvable ou terminé' });
  j.cancelled = true;
  res.json({ ok: true });
});

app.get('/api/jobs/current', (req, res) => res.json(currentJob()));

app.get('/api/jobs/:id', (req, res) => {
  const j = jobs.get(Number(req.params.id));
  j ? res.json(j) : res.status(404).json({ error: 'introuvable' });
});

app.get('/api/import-log', (req, res) => {
  res.json(all('SELECT * FROM import_log ORDER BY id DESC LIMIT 100'));
});

// ---------------- Territoires (communes, département, EPCI, région) ----------------
app.get('/api/geos', (req, res) => {
  const series = populationSeries();
  const where = req.query.all ? '' : 'WHERE bulk = 0';
  res.json(all(`SELECT * FROM geos ${where} ORDER BY fixed DESC, CASE level WHEN 'COM' THEN 1 ELSE 0 END, nom`).map((g) => ({ ...g, pop_series: series[g.code] || {} })));
});

// ---------------- Carte d'Île-de-France ----------------
// Formes simplifiées des communes (périmètre : 'idf' ou code de département)
app.get('/api/shapes', (req, res) => res.json(shapes(String(req.query.scope || 'idf'))));

// Couverture de l'Île-de-France : nombre de communes chargées pour chaque jeu
app.get('/api/idf/status', (req, res) => {
  const communes = get('SELECT COUNT(*) AS n FROM geo_shapes').n;
  const loaded = Object.fromEntries(all(`SELECT dataset_id, COUNT(DISTINCT geo) AS n FROM data_rows WHERE geo IN (SELECT code FROM geo_shapes) GROUP BY dataset_id`).map((r) => [r.dataset_id, r.n]));
  res.json({ communes, loaded });
});

// Valeurs communales d'un jeu pour la carte : lignes filtrées par modalités (dims = { DIM: [codes] }) et période
app.get('/api/datasets/:id/map', (req, res) => {
  if (!get('SELECT id FROM datasets WHERE id = ?', req.params.id)) return res.status(404).json({ error: 'introuvable' });
  let dims = {};
  try { dims = JSON.parse(String(req.query.dims || '{}')); } catch { return res.status(400).json({ error: 'dims invalide' }); }
  const scope = String(req.query.scope || 'idf');
  const period = req.query.period != null ? String(req.query.period) : '';
  const params = [req.params.id];
  let sql = `SELECT r.geo, r.period, r.dims, r.value FROM data_rows r JOIN geos g ON g.code = r.geo
    WHERE r.dataset_id = ? AND g.level = 'COM' AND g.population >= 5000 AND r.geo IN (SELECT code FROM geo_shapes)`;
  const members = require('./groups').membersOf(scope.toUpperCase());
  if (members.length) { sql += ` AND r.geo IN (${members.map(() => '?').join(',')})`; params.push(...members); } else if (scope !== 'idf') { sql += ' AND g.dept = ?'; params.push(scope); }
  for (const [dim, codes] of Object.entries(dims)) {
    if (!/^[A-Z0-9_]+$/.test(dim) || !Array.isArray(codes) || !codes.length) return res.status(400).json({ error: 'dimension invalide' });
    sql += ` AND json_extract(r.dims, '$.${dim}') IN (${codes.map(() => '?').join(',')})`;
    params.push(...codes.map(String));
  }
  if (period) { sql += ' AND r.period = ?'; params.push(period); }
  res.json({ rows: all(sql, ...params).map((r) => ({ ...r, dims: JSON.parse(r.dims || '{}') })) });
});

// Périodes disponibles d'un jeu pour les communes d'Île-de-France
app.get('/api/datasets/:id/periods', (req, res) => {
  res.json(all(`SELECT DISTINCT period FROM data_rows WHERE dataset_id = ? AND geo IN (SELECT code FROM geo_shapes) ORDER BY period`, req.params.id).map((r) => r.period ?? ''));
});

// ---------------- Catalogue des données ouvertes (document Markdown) ----------------
app.get('/api/catalogue', (req, res) => {
  const file = path.join(__dirname, '..', 'CATALOGUE_DONNEES_OUVERTES.md');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'catalogue introuvable' });
  res.type('text/markdown; charset=utf-8').send(fs.readFileSync(file, 'utf8'));
});

app.get('/api/geos/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const url = `https://geo.api.gouv.fr/communes?${/^\d{5}$/.test(q) ? 'code' : 'nom'}=${encodeURIComponent(q)}&fields=nom,code,population,departement&boost=population&limit=8`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`geo.api.gouv.fr : HTTP ${r.status}`);
  const j = await r.json();
  res.json(j.map((c) => ({ code: c.code, nom: c.nom, dept: c.departement?.code, population: c.population })));
}));

app.post('/api/geos', (req, res) => {
  const { code, nom, dept, population, level = 'COM', import: doImport } = req.body || {};
  if (!['COM', 'DEP', 'EPCI', 'REG'].includes(level)) return res.status(400).json({ error: 'niveau inconnu' });
  if (level === 'COM' && !/^\d[0-9AB]\d{3}$/.test(code || '')) return res.status(400).json({ error: 'code INSEE de commune invalide' });
  if (!code || !nom) return res.status(400).json({ error: 'code et nom requis' });
  run(`INSERT INTO geos (code, nom, dept, population, level) VALUES (?,?,?,?,?)
       ON CONFLICT(code) DO UPDATE SET nom = excluded.nom, dept = excluded.dept, population = excluded.population, level = excluded.level`,
    code, nom, dept, population, level);
  const job = doImport ? startImport({ geoCodes: [code] }) : null;
  res.status(201).json({ geo: get('SELECT * FROM geos WHERE code = ?', code), job });
});

app.delete('/api/geos/:code', (req, res) => {
  const g = get('SELECT * FROM geos WHERE code = ?', req.params.code);
  if (!g) return res.status(404).json({ error: 'introuvable' });
  if (g.fixed) return res.status(400).json({ error: 'la commune de référence ne peut pas être retirée' });
  tx(() => {
    run('DELETE FROM data_rows WHERE geo = ?', g.code);
    run('DELETE FROM geos WHERE code = ?', g.code);
  });
  res.status(204).end();
});

// ---------------- Client (build de production) ----------------
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 2508;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Observatoire : http://localhost:${PORT}`);
  // Import automatique des territoires sans données (premier démarrage : commune de référence et territoires de comparaison)
  if (process.env.AUTO_IMPORT !== 'false') {
    const missing = all("SELECT code FROM geos WHERE bulk = 0 AND level != 'EPT' AND code NOT IN (SELECT DISTINCT geo FROM data_rows)").map((g) => g.code);
    const emptyDatasets = all('SELECT id FROM datasets WHERE id NOT IN (SELECT DISTINCT dataset_id FROM data_rows)').map((d) => d.id);
    if (missing.length && emptyDatasets.length) {
      console.log('[import] territoires et jeux sans données : import complet en cours');
      startImport({});
    } else if (missing.length) {
      console.log(`[import] ${missing.length} territoire(s) sans données : import initial en cours`);
      startImport({ geoCodes: missing });
    } else if (emptyDatasets.length) {
      console.log(`[import] ${emptyDatasets.length} jeu(x) sans données : import initial en cours`);
      startImport({ datasetIds: emptyDatasets });
    }
  }
  // Chargement de l'Île-de-France (carte) fait par le serveur, sans passer par le navigateur
  if (process.env.AUTO_IMPORT_IDF !== 'false') autoImportIdf();
  require('./qpv').bootstrap().catch((e) => console.warn('[qpv]', e.message));
  // recalcul des agrégats de l'EPT (GOSB) à chaque démarrage : suit d'éventuelles corrections de règles
  setTimeout(() => { try { require('./groups').aggregateAll(); } catch (e) { console.warn('[groupes]', e.message); } }, 15000);
});
