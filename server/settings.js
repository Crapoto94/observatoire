// Paramètres de l'application : état des services (IA, annuaire AD) et préférences par utilisateur.
const { get } = require('./db');

// Préférences utilisateur stockées dans une petite table clé/valeur JSON.
const ensure = () => {
  require('./db').db.exec(`CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, key)
  );`);
};

function getSettings(userId) {
  ensure();
  const rows = require('./db').all('SELECT key, value FROM user_settings WHERE user_id = ?', userId);
  const out = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
  return out;
}

function setSettings(userId, patch) {
  ensure();
  if (!patch || typeof patch !== 'object') return getSettings(userId);
  for (const [k, v] of Object.entries(patch)) {
    require('./db').run(`INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      userId, String(k), JSON.stringify(v));
  }
  return getSettings(userId);
}

// État des intégrations : indique si la clé APM (authentification AD) et le fournisseur IA sont configurés.
function services() {
  const apmReady = !!process.env.APM_API_KEY;
  const ia = (() => { try { return require('./ia').status(); } catch { return null; } })();
  return {
    apm: { configured: apmReady, url: (process.env.APM_API_URL || 'https://api.ivry.local').replace(/\/+$/, ''), ca: !!process.env.VILLE_CA_FILE, allowSelfSigned: process.env.VILLE_ALLOW_SELF_SIGNED_CERTS !== 'false' },
    ia,
    localAdmin: { enabled: true, username: 'admin' },
    version: require('./version').info().version,
    database: { users: get('SELECT COUNT(*) AS n FROM users').n, sessions: get('SELECT COUNT(*) AS n FROM sessions').n },
  };
}

module.exports = { getSettings, setSettings, services };
