// Authentification : comptes de l'annuaire Active Directory de la Ville (via l'API centrale APM)
// plus une entrée locale de secours « admin / admin ». Une session applicative (jeton opaque) est
// créée après authentification et conservée en base.
//
// Les identifiants de l'API centrale (APM_API_URL, APM_API_KEY) sont lus dans l'environnement —
// aucune URL ni clé en dur. La route APM consommée est POST /api/v1/ad/authenticate.
const crypto = require('crypto');
const { jsonRequest } = require('./httpsClient');
const { all, get, run } = require('./db');

const apmUrl = () => (process.env.APM_API_URL || 'https://api.ivry.local').replace(/\/+$/, '');
const apmKey = () => process.env.APM_API_KEY || '';
const LOCAL_USER = 'admin';
const LOCAL_PASSWORD = 'admin';
const SESSION_DAYS = 30;

const norm = (u) => String(u ?? '').trim();
const key = (u) => norm(u).toLowerCase();
const hash = (p) => crypto.createHash('sha256').update(`observatoire:${p}`).digest('hex');

function publicUser(u) {
  return {
    id: u.id, username: u.username, display_name: u.display_name, email: u.email,
    role: u.role, provider: u.provider, connections: u.connections, last_login: u.last_login,
  };
}

// Vérifie les identifiants auprès de l'Active Directory via l'API centrale (X-API-KEY).
async function adAuthenticate(username, password) {
  if (!apmKey()) return { ok: false, error: "APM_API_KEY non configurée : authentification AD indisponible" };
  try {
    const { status, data } = await jsonRequest(`${apmUrl()}/api/v1/ad/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apmKey() },
      body: { username, password },
    });
    if (status === 401 || status === 400 || data.success === false) {
      return { ok: false, error: data.error || 'Identifiant ou mot de passe incorrect' };
    }
    if (status !== 200 || data.success !== true) {
      // 403/404… : la clé n'a pas la permission ad_auth, ou la route a changé — ce n'est PAS un mot de passe faux
      return { ok: false, service: true, error: `API centrale : HTTP ${status} (permission ad_auth ?)` };
    }
    return { ok: true, dn: data.dn || null, info: data };
  } catch (e) {
    return { ok: false, service: true, error: `Annuaire Active Directory injoignable : ${e.message}` };
  }
}

// Recherche (facultative) des informations de l'agent : mail, service, nom affiché.
async function adSearch(username) {
  if (!apmKey()) return null;
  try {
    const { status, data } = await jsonRequest(`${apmUrl()}/api/v1/ad/user?identifier=${encodeURIComponent(username)}`, {
      headers: { 'X-API-KEY': apmKey() },
      timeoutMs: 10000,
    });
    if (status !== 200) return null;
    return data;
  } catch { return null; }
}

function displayFromDn(dn) {
  const m = /CN=([^,]+)/i.exec(dn || '');
  return m ? m[1] : null;
}

// Recherche par terme libre (nom, mail, identifiant). L'APM renvoie une liste d'entrées AD.
async function adSearchTerm(term) {
  if (!apmKey()) return [];
  try {
    const { status, data } = await jsonRequest(`${apmUrl()}/api/v1/ad/search?q=${encodeURIComponent(term)}`, {
      headers: { 'X-API-KEY': apmKey() },
      timeoutMs: 10000,
    });
    if (status !== 200) return [];
    const list = Array.isArray(data) ? data : data?.data ?? data?.users ?? data?.results ?? [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

// L'AD s'authentifie par sAMAccountName (login), PAS par l'adresse e-mail. Si l'utilisateur saisit
// une adresse (prenom.nom@ivry94.fr), on la résout vers le sAMAccountName via la recherche AD ;
// à défaut, on retire le domaine (la partie locale correspond en général au login).
async function resolveIdentifier(input) {
  const name = norm(input);
  if (!name.includes('@')) return name;
  const local = name.slice(0, name.indexOf('@'));
  const matches = await adSearchTerm(name); // recherche par adresse complète
  const byMail = matches.find((u) => String(u.mail || u.email || '').toLowerCase() === key(name));
  if (byMail?.sAMAccountName) return byMail.sAMAccountName;
  // repli : chercher par identité (partie locale) et confirmer le même mail
  const byLocal = (await adSearchTerm(local)).find((u) => (u.sAMAccountName || '').toLowerCase() === key(local) || String(u.mail || u.email || '').toLowerCase() === key(name));
  if (byLocal?.sAMAccountName) return byLocal.sAMAccountName;
  return local; // dernier repli : la partie locale est le login
}

function upsertUser(username, { provider, displayName = null, email = null, role } = {}) {
  const existing = get('SELECT * FROM users WHERE lower(username) = ?', key(username));
  if (existing) {
    run('UPDATE users SET display_name = COALESCE(?, display_name), email = COALESCE(?, email), provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      displayName, email, provider, existing.id);
    return get('SELECT * FROM users WHERE id = ?', existing.id);
  }
  const r = run('INSERT INTO users (username, display_name, email, role, provider, connections) VALUES (?,?,?,?,?,0)',
    norm(username), displayName, email, role || 'utilisateur', provider);
  return get('SELECT * FROM users WHERE id = ?', Number(r.lastInsertRowid));
}

// Compte les connexions et mémorise la date de dernière connexion (affichés dans le menu admin).
// À la première connexion d'un utilisateur, on lui crée son tableau de bord à partir du modèle
// par défaut (celui de l'administrateur).
function recordLogin(userId) {
  const first = !get('SELECT 1 AS x FROM user_settings WHERE user_id = ? AND key = ?', userId, 'board.init');
  run('UPDATE users SET connections = connections + 1, last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', userId);
  if (first) { try { require('./dashboard').initForUser(userId); } catch (e) { console.warn('[dashboard] modèle par défaut :', e.message); } }
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  run('INSERT INTO sessions (token, user_id, last_seen, expires_at) VALUES (?,?,CURRENT_TIMESTAMP,?)', token, userId, expires);
  return token;
}

// Récupère l'utilisateur de la session ; la met à jour ou la supprime si expirée.
function userForToken(token) {
  if (!token) return null;
  const row = get('SELECT * FROM sessions WHERE token = ?', token);
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    run('DELETE FROM sessions WHERE token = ?', token);
    return null;
  }
  run('UPDATE sessions SET last_seen = CURRENT_TIMESTAMP WHERE token = ?', token);
  return get('SELECT * FROM users WHERE id = ?', row.user_id);
}

const bearer = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : (req.query.token ? String(req.query.token) : null);
};

function logout(token) { if (token) run('DELETE FROM sessions WHERE token = ?', token); }

// Authentifie : entrée locale admin/admin, sinon annuaire Active Directory.
async function login(username, password) {
  const name = norm(username);
  if (!name || !password) return { error: 'Identifiant et mot de passe requis', status: 400 };

  if (key(name) === LOCAL_USER) {
    if (password !== LOCAL_PASSWORD) return { error: 'Identifiant ou mot de passe incorrect', status: 401 };
    const user = upsertUser(name, { provider: 'local', displayName: 'Administrateur local', role: 'admin' });
    recordLogin(user.id);
    return { user: publicUser(get('SELECT * FROM users WHERE id = ?', user.id)), token: createSession(user.id) };
  }

  // L'AD s'authentifie par login (sAMAccountName) : une adresse e-mail est résolue au préalable.
  const login = await resolveIdentifier(name);
  const check = await adAuthenticate(login, password);
  if (!check.ok) return { error: check.error || 'Identifiant ou mot de passe incorrect', status: check.service ? 502 : 401 };
  const info = await adSearch(login);
  const user = upsertUser(login, {
    provider: 'ad',
    displayName: info?.displayName || info?.cn || displayFromDn(check.dn),
    email: info?.mail || info?.email || (name.includes('@') ? name : null),
  });
  recordLogin(user.id);
  return { user: publicUser(get('SELECT * FROM users WHERE id = ?', user.id)), token: createSession(user.id) };
}

// Liste des comptes (menu admin) : nombre de connexions et date de dernière connexion.
const listUsers = () => all(`SELECT id, username, display_name, email, role, provider, connections, last_login, created_at
  FROM users ORDER BY connected_at DESC, username`.replace('connected_at', 'COALESCE(last_login, created_at)'))
  .map(publicUser);

function setRole(id, role) {
  if (!['utilisateur', 'admin'].includes(role)) return { error: 'Rôle inconnu', status: 400 };
  if (!get('SELECT id FROM users WHERE id = ?', id)) return { error: 'Utilisateur introuvable', status: 404 };
  run('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', role, id);
  return { user: publicUser(get('SELECT * FROM users WHERE id = ?', id)) };
}

// Middleware Express : attache req.user, rejette en 401 si non connecté.
function attach(req, _res, next) {
  const user = userForToken(bearer(req));
  if (user) req.user = publicUser(user);
  next();
}

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Authentification requise' }));
const requireAdmin = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Authentification requise' })
  : req.user.role !== 'admin' ? res.status(403).json({ error: 'Réservé aux administrateurs' }) : next());

module.exports = {
  attach, requireAuth, requireAdmin, login, logout, listUsers, setRole, publicUser,
  LOCAL_USER, SESSION_DAYS, _hash: hash,
};
