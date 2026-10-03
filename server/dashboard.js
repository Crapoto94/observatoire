// Tableaux de bord personnels : chaque utilisateur compose le sien à partir de KPI et de
// graphiques enregistrés depuis les pages « Tableau de bord » et « Données ». Chaque élément
// conserve son propre paramétrage (config JSON) et une position / taille dans la grille.
const { all, get, run } = require('./db');

const KIND = ['kpi', 'chart', 'map'];

const parse = (row) => ({
  id: row.id, kind: row.kind, title: row.title,
  config: (() => { try { return JSON.parse(row.config || '{}'); } catch { return {}; } })(),
  x: row.x, y: row.y, w: row.w, h: row.h, created_at: row.created_at,
});

const list = (userId) => all('SELECT * FROM dashboard_items WHERE user_id = ? ORDER BY y, x, id', userId).map(parse);

function add(userId, body) {
  const b = body || {};
  if (!KIND.includes(b.kind)) return { error: 'Type d\'élément inconnu', status: 400 };
  if (!b.config || typeof b.config !== 'object') return { error: 'Paramétrage manquant', status: 400 };
  const title = String(b.title ?? b.config?.title ?? '').trim() || (b.kind === 'kpi' ? 'KPI' : 'Graphique');
  const maxY = get('SELECT COALESCE(MAX(y + h), 0) AS y FROM dashboard_items WHERE user_id = ?', userId).y;
  const r = run('INSERT INTO dashboard_items (user_id, kind, title, config, x, y, w, h) VALUES (?,?,?,?,?,?,?,?)',
    userId, b.kind, title, JSON.stringify(b.config), Number(b.x) || 0, b.y != null ? Number(b.y) : maxY, Number(b.w) || 4, Number(b.h) || 3);
  return { item: parse(get('SELECT * FROM dashboard_items WHERE id = ?', Number(r.lastInsertRowid))) };
}

// Met à jour le titre seul ou la position / la taille (drag & drop, redimensionnement).
function update(userId, id, body) {
  const cur = get('SELECT * FROM dashboard_items WHERE id = ? AND user_id = ?', id, userId);
  if (!cur) return { error: 'Élément introuvable', status: 404 };
  const b = body || {};
  const cols = [], vals = [];
  if (b.title !== undefined) { cols.push('title = ?'); vals.push(String(b.title).slice(0, 200)); }
  for (const f of ['x', 'y', 'w', 'h']) if (b[f] !== undefined) {
    const n = Math.max(f === 'w' || f === 'h' ? 1 : 0, Number(b[f]) || 0);
    cols.push(`${f} = ?`); vals.push(n);
  }
  if (b.config !== undefined && typeof b.config === 'object') { cols.push('config = ?'); vals.push(JSON.stringify(b.config)); }
  if (cols.length) run(`UPDATE dashboard_items SET ${cols.join(', ')} WHERE id = ? AND user_id = ?`, ...vals, id, userId);
  return { item: parse(get('SELECT * FROM dashboard_items WHERE id = ?', id)) };
}

const remove = (userId, id) => run('DELETE FROM dashboard_items WHERE id = ? AND user_id = ?', id, userId);

// ---------------- Tableau de bord par défaut ----------------
// Le tableau de bord « par défaut » est celui de l'administrateur : à sa première connexion, tout
// nouvel utilisateur reçoit une copie de ce tableau de bord (KPI et disposition). Un administrateur
// peut y poser des KPI (depuis « Tableau de bord ») et les organiser ; les suivants en héritent.
const SETTINGS_KEY = 'dashboard.default';

function ensureSettings() {
  require('./db').db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);
}

const DEFAULT_KPIS = ['population', 'niveau_vie', 'pauvrete', 'chomage', 'rsa', 'dette_hab', 'logements', 'prix'];

// Modèle livré avec le code (server/default-dashboard.json) : permet de transporter le tableau de bord
// par défaut d'un environnement à l'autre (dev → prod) sans dépendre du contenu de la base.
function bundledTemplate() {
  try {
    const items = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'default-dashboard.json'), 'utf8'));
    if (Array.isArray(items) && items.length) return items;
  } catch { /* pas de modèle livré : repli sur la liste par défaut */ }
  return DEFAULT_KPIS.map((id, i) => ({ kind: 'kpi', title: '', config: { kpiId: id }, x: (i % 4) * 3, y: Math.floor(i / 4) * 3, w: 3, h: 3 }));
}

// Modèle par défaut : liste d'items { kind, title, config, x, y, w, h }. Priorité : base (réglé depuis
// l'app), sinon modèle livré avec le code, sinon liste de référence.
function defaultTemplate() {
  ensureSettings();
  const row = get('SELECT value FROM app_settings WHERE key = ?', SETTINGS_KEY);
  if (row?.value) { try { return JSON.parse(row.value); } catch { /* modèle illisible */ } }
  return bundledTemplate();
}

function setDefaultTemplate(items) {
  ensureSettings();
  const clean = (Array.isArray(items) ? items : []).map((it) => ({
    kind: it.kind, title: it.title ?? '', config: it.config ?? {}, x: Number(it.x) || 0, y: Number(it.y) || 0, w: Number(it.w) || 3, h: Number(it.h) || 3,
  }));
  run(`INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, SETTINGS_KEY, JSON.stringify(clean));
  return clean;
}

// Un utilisateur a-t-il déjà initialisé son tableau de bord ?
const isInitialized = (userId) => !!get('SELECT 1 AS x FROM user_settings WHERE user_id = ? AND key = ?', userId, 'board.init');

// Copie le modèle par défaut dans le tableau de bord d'un nouvel utilisateur (une seule fois).
function initForUser(userId) {
  const already = isInitialized(userId);
  if (already) return false;
  const tpl = defaultTemplate();
  for (const it of tpl) {
    run('INSERT INTO dashboard_items (user_id, kind, title, config, x, y, w, h) VALUES (?,?,?,?,?,?,?,?)',
      userId, it.kind, it.title || null, JSON.stringify(it.config || {}), it.x, it.y, it.w, it.h);
  }
  run(`INSERT INTO user_settings (user_id, key, value) VALUES (?,?,?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    userId, 'board.init', JSON.stringify(true));
  return true;
}

module.exports = { list, add, update, remove, defaultTemplate, setDefaultTemplate, initForUser };
