const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DIR, { recursive: true });
const db = new DatabaseSync(path.join(DIR, 'observatoire.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 15000;');

db.exec(`
CREATE TABLE IF NOT EXISTS indicators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme TEXT NOT NULL,
  theme_label TEXT,
  groupe TEXT,
  groupe_label TEXT,
  excel_sheet TEXT,
  excel_row INTEGER,
  sous_ligne INTEGER DEFAULT 0,
  ordre INTEGER DEFAULT 0,
  niveau TEXT NOT NULL,
  libelle TEXT NOT NULL,
  libelle_carte TEXT,
  priorite INTEGER,
  source TEXT,
  lien_origine TEXT,
  lien_corrige TEXT,
  periodicite TEXT,
  proposition TEXT,
  lien_donnees TEXT,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  provider TEXT NOT NULL,
  config TEXT,
  description TEXT,
  themes TEXT,
  doc_url TEXT,
  labels TEXT,
  last_import TEXT,
  nb_rows INTEGER DEFAULT 0,
  status TEXT
);
CREATE TABLE IF NOT EXISTS indicator_datasets (
  indicator_id INTEGER NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  PRIMARY KEY (indicator_id, dataset_id)
);
CREATE TABLE IF NOT EXISTS geos (
  code TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  dept TEXT,
  population INTEGER,
  fixed INTEGER DEFAULT 0,
  added_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS data_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  geo TEXT NOT NULL,
  period TEXT,
  dims TEXT,
  measure TEXT,
  value REAL,
  imported_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rows_ds_geo ON data_rows(dataset_id, geo);
CREATE TABLE IF NOT EXISTS import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  geo TEXT,
  started TEXT,
  finished TEXT,
  status TEXT,
  rows INTEGER,
  message TEXT
);
`);

// Migration : niveau géographique (COM, DEP, EPCI, REG) pour comparer avec des territoires supra-communaux
try { db.exec("ALTER TABLE geos ADD COLUMN level TEXT DEFAULT 'COM'"); } catch { /* colonne déjà présente */ }

try { db.exec('ALTER TABLE data_rows ADD COLUMN status TEXT'); } catch { /* colonne déjà présente */ }

// Carte d'Île-de-France : communes chargées en masse (bulk = 1, absentes des listes de comparaison) et contours simplifiés
try { db.exec('ALTER TABLE geos ADD COLUMN bulk INTEGER DEFAULT 0'); } catch { /* colonne déjà présente */ }
db.exec(`
CREATE TABLE IF NOT EXISTS geo_shapes (
  code TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  x0 REAL, y0 REAL, x1 REAL, y1 REAL
);
`);

// Migrations : fiche indicateur, validation, faisabilité, hiérarchie, historique, versions de la carte
for (const col of [
  'definition TEXT', 'formule TEXT', 'unite TEXT', 'perimetre TEXT', 'porteur TEXT', 'cible TEXT',
  "statut TEXT DEFAULT 'brouillon'", 'decision TEXT', 'faisabilite INTEGER', 'parent_id INTEGER', 'origine TEXT', 'cartographie TEXT',
]) {
  try { db.exec(`ALTER TABLE indicators ADD COLUMN ${col}`); } catch { /* colonne déjà présente */ }
}
db.exec(`
CREATE TABLE IF NOT EXISTS indicator_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator_id INTEGER NOT NULL,
  at TEXT DEFAULT CURRENT_TIMESTAMP,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);
CREATE INDEX IF NOT EXISTS idx_hist_ind ON indicator_history(indicator_id);
CREATE TABLE IF NOT EXISTS carte_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  snapshot TEXT NOT NULL
);
`);

// Journal des imports : une ligne par jeu et par tentative (méthode, source, durée, volume, erreurs, détail)
db.exec(`
CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  scope TEXT,
  dataset_id TEXT NOT NULL,
  dataset_label TEXT,
  method TEXT,
  kind TEXT,
  source_url TEXT,
  started TEXT,
  finished TEXT,
  status TEXT,
  rows INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  attempt INTEGER DEFAULT 1,
  territories INTEGER,
  message TEXT,
  log TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_ds ON import_runs(dataset_id, started);
`);

// Comptes utilisateurs (annuaire Active Directory de la Ville, plus une entrée locale de secours),
// sessions applicatives (jeton opaque) et tableaux de bord personnels.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'utilisateur',
  provider TEXT NOT NULL DEFAULT 'ad',
  password_hash TEXT,
  connections INTEGER NOT NULL DEFAULT 0,
  last_login TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS dashboard_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT,
  config TEXT NOT NULL,
  x INTEGER NOT NULL DEFAULT 0,
  y INTEGER NOT NULL DEFAULT 0,
  w INTEGER NOT NULL DEFAULT 4,
  h INTEGER NOT NULL DEFAULT 3,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dashboard_user ON dashboard_items(user_id);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Journal de l'assistant IA : une ligne par demande utilisateur (question, réponse, demandeur,
-- modèle, sources, durée) et la note/commentaire de qualité proposés au demandeur.
CREATE TABLE IF NOT EXISTS ia_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  username TEXT,
  provider TEXT,
  model TEXT,
  question TEXT,
  answer TEXT,
  consulted TEXT,
  sources TEXT,
  duration_ms INTEGER,
  status TEXT DEFAULT 'ok',
  error TEXT,
  rating INTEGER,
  rating_comment TEXT,
  rated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ia_logs_at ON ia_logs(at);
`);

const clean = (params) => params.map((p) => (p === undefined ? null : p));

module.exports = {
  db,
  all: (sql, ...p) => db.prepare(sql).all(...clean(p)),
  get: (sql, ...p) => db.prepare(sql).get(...clean(p)),
  run: (sql, ...p) => db.prepare(sql).run(...clean(p)),
  tx(fn) {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },
};
