// Usage de l'application par utilisateur : chaque requête API authentifiée est comptée et classée par « intensité ».
//  - consultation : lecture de listes, fiches, cartes, exports (usage simple) ;
//  - analyse      : lecture de données détaillées, graphiques, séries, exports volumineux (exploration) ;
//  - edition      : modification (indicateurs, tableaux de bord, réglages, rôles) ;
//  - exploration  : recherche avancée, data mining, assistant IA, imports.
// Les requêtes techniques (santé, polling des jobs, session) ne sont pas comptées.
const { all, get, run } = require('./db');

// Catégories de qualification, du plus simple au plus complexe.
const NIVEAUX = ['consultation', 'analyse', 'edition', 'exploration'];

// (méthode, motif de chemin) -> catégorie. Le premier motif qui correspond gagne.
const REGLES = [
  // techniques : jamais comptés
  [/^\/api\/(health|status|version)$/, null],
  [/^\/api\/jobs\//, null], [/^\/api\/auth\/me$/, null], [/^\/api\/auth\/logout$/, null],
  // exploration : IA, imports, recherche transverse
  [/^\/api\/ia/, 'exploration'],
  [/^\/api\/(import|import-runs|datasets\/[^/]+\/import)/, 'exploration'],
  [/^\/api\/explorer/, 'exploration'],
  [/^\/api\/catalogue/, 'analyse'],
  // édition : toute écriture, plus les pages de gestion
  [/^\/api\/admin\//, 'edition'],
  [/^\/api\/settings/, 'edition'],
  [/^\/api\/(indicators|dashboard|monTableau|dashboard-items)/, 'edition'], // GET inclus : vues de construction
  // analyse : données détaillées, séries, cartographie
  [/^\/api\/(datasets\/[^/]+\/(data|map|periods|rows)|cartographie|kpi|export|donnees)/, 'analyse'],
  // consultation : le reste (listes, fiches, couches en direct, géos…)
  [/^\/api\//, 'consultation'],
];

function classer(method, path) {
  for (const [re, cat] of REGLES) if (re.test(path)) return cat;
  return 'consultation';
}

// Le niveau « edit » ne s'applique qu'aux écritures ; les GET des vues d'édition restent des analyses.
function qualifier(method, path) {
  const cat = classer(method, path);
  if (cat === 'edition' && method === 'GET') return 'analyse';
  return cat;
}

const tablePrete = () => {
  try { run('SELECT 1 FROM usage_events LIMIT 1'); return true; } catch { return false; }
};

// Enregistrement d'un événement (appelé par le middleware). Ne lève jamais : l'usage ne doit pas casser l'API.
function record(userId, method, path, status = 200, ms = null) {
  try {
    const cat = qualifier(method, path);
    if (cat === null) return; // requête technique : non comptée
    const ressource = path.replace(/^\/api\//, '').split('?')[0].replace(/\/\d+/g, '/:id');
    run('INSERT INTO usage_events (user_id, method, path, ressource, categorie, status, ms) VALUES (?,?,?,?,?,?,?)',
      userId, method, path.split('?')[0], ressource, cat, status, ms);
  } catch { /* table absente ou base indisponible : on ignore */ }
}

// Middleware : compte la requête une fois la réponse envoyée (hors techniques).
function middleware(req, res, next) {
  const path = req.originalUrl ? req.originalUrl.split('?')[0] : req.path;
  if (!path.startsWith('/api/')) return next();
  const cat = classer(req.method, path);
  if (cat === null) return next();
  const t0 = Date.now();
  res.on('finish', () => { if (req.user) record(req.user.id, req.method, path, res.statusCode, Date.now() - t0); });
  next();
}

const JOURS = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// Statistiques par utilisateur pour le menu admin : volume de requêtes, répartition par usage, activité récente.
function build({ days = 30 } = {}) {
  if (!tablePrete()) return { generated: new Date().toISOString(), days, users: [], totaux: {} };
  const depuis = JOURS(days);
  const totaux = {
    requetes: get("SELECT COUNT(*) n FROM usage_events WHERE at >= ?", depuis).n,
    utilisateurs: get("SELECT COUNT(DISTINCT user_id) n FROM usage_events WHERE at >= ?", depuis).n,
    sessions: get("SELECT COUNT(*) n FROM usage_events WHERE categorie = 'edition' AND method != 'GET' AND at >= ?", depuis).n,
  };
  const parCat = Object.fromEntries(all("SELECT categorie, COUNT(*) n FROM usage_events WHERE at >= ? GROUP BY categorie", depuis).map((r) => [r.categorie, r.n]));
  const users = all(`
    SELECT u.id, u.username, u.display_name, u.role, u.provider, u.connections, u.last_login,
      COUNT(e.id) AS requetes,
      SUM(CASE WHEN e.categorie = 'analyse' THEN 1 ELSE 0 END) AS analyse,
      SUM(CASE WHEN e.categorie = 'edition' THEN 1 ELSE 0 END) AS edition,
      SUM(CASE WHEN e.categorie = 'exploration' THEN 1 ELSE 0 END) AS exploration,
      MAX(e.at) AS derniere_requete,
      COUNT(DISTINCT date(e.at)) AS jours_actifs
    FROM users u
    LEFT JOIN usage_events e ON e.user_id = u.id AND e.at >= ?
    GROUP BY u.id ORDER BY requetes DESC, u.last_login DESC`, depuis);
  // qualification du profil d'usage : proportion d'analyses / éditions / explorations
  for (const u of users) {
    const total = u.requetes || 0;
    const avance = (u.analyse + u.edition + u.exploration) / (total || 1);
    u.profil = total === 0 ? 'inactif' : u.exploration / total >= 0.15 ? 'explorateur'
      : u.edition / total >= 0.3 ? 'constructeur'
      : avance >= 0.4 ? 'analyste' : 'consultant';
    u.taux_avance = Math.round(avance * 100);
  }
  const parRessource = all("SELECT ressource, categorie, COUNT(*) n FROM usage_events WHERE at >= ? GROUP BY ressource, categorie ORDER BY n DESC LIMIT 40", depuis);
  const parJour = all("SELECT date(at) j, COUNT(*) n FROM usage_events WHERE at >= ? GROUP BY j ORDER BY j", depuis);
  return { generated: new Date().toISOString(), days, depuis, totaux, parCat, users, parRessource, parJour, niveaux: NIVEAUX };
}

module.exports = { middleware, record, classer, qualifier, build, NIVEAUX };
