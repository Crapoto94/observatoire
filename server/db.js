const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DIR, { recursive: true });
const db = new DatabaseSync(path.join(DIR, 'observatoire.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

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
