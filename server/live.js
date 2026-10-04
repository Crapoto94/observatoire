// Mode « live » des jeux importés : au lieu de servir la base, la source est interrogée à l'affichage (page Données),
// la base est mise à jour au passage et sert de repli si la source ne répond pas à temps.
// - mesure du temps de réponse de chaque source pour Ivry (au démarrage si la mesure a plus de 7 jours, ou à la demande) ;
// - « live proposé » quand la source répond en SEUIL_MS ou moins ; le choix base / live est fait par un administrateur ;
// - les KPI, la cartographie régionale et les agrégats restent calculés sur la base (rafraîchie par les lectures live).
const { all, get, run } = require('./db');
const { REF_GEO } = require('./seed');

const SEUIL_MS = 300; // temps de réponse maximal de la source pour proposer le mode live
const DELAI_MS = 1500; // au-delà, repli sur la base pour l'affichage en cours
const FRAIS_MS = 10 * 60 * 1000; // une lecture live par jeu et par territoire toutes les 10 minutes au plus
const MESURE_AGE = 7 * 24 * 3600 * 1000;
const EXCLUS = new Set(['apientreprise', 'apisubventions']); // accès habilité et débit limité : jamais en live

const setting = (key, def) => { try { return JSON.parse(get('SELECT value FROM app_settings WHERE key = ?', key)?.value || 'null') ?? def; } catch { return def; } };
const save = (key, v) => run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP', key, JSON.stringify(v));
const modes = () => setting('dataset_modes', {});
const latences = () => setting('dataset_latences', {});

function etat() {
  const m = modes(), l = latences();
  const out = {};
  for (const d of all('SELECT id, provider FROM datasets')) {
    const lat = l[d.id] || null;
    const exclu = EXCLUS.has(d.provider);
    out[d.id] = { mode: !exclu && m[d.id] === 'live' ? 'live' : 'base', latence: lat, eligible: !exclu && !!lat && lat.liveMs != null && !lat.erreur && lat.liveMs <= SEUIL_MS, exclu };
  }
  return { seuil: SEUIL_MS, delai: DELAI_MS, jeux: out };
}

function setMode(id, mode) {
  const d = get('SELECT id, provider FROM datasets WHERE id = ?', id);
  if (!d) throw Object.assign(new Error('jeu inconnu'), { status: 404 });
  if (EXCLUS.has(d.provider) && mode === 'live') throw Object.assign(new Error('ce jeu (accès habilité, débit limité) reste en base'), { status: 400 });
  const m = modes();
  if (mode === 'live') m[id] = 'live'; else delete m[id];
  save('dataset_modes', m);
  return etat().jeux[id];
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`pas de réponse en ${ms} ms`)), ms))]);

// temps de réponse de la source (Ivry) et de la base, sans écrire dans la base
async function mesurer(id) {
  const d = get('SELECT id, provider, config FROM datasets WHERE id = ?', id);
  if (!d || EXCLUS.has(d.provider)) return null;
  const geo = { code: REF_GEO.code, nom: REF_GEO.nom, level: 'COM', dept: REF_GEO.dept };
  const t0 = process.hrtime.bigint();
  all('SELECT period, dims, value FROM data_rows WHERE dataset_id = ? AND geo = ?', id, geo.code);
  const dbMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e5) / 10;
  const t1 = Date.now();
  let liveMs = null, erreur = null;
  try { await withTimeout(require('./importer').fetchLive(d, geo, { store: false }), 60000); liveMs = Date.now() - t1; }
  catch (e) { liveMs = Date.now() - t1; erreur = String(e.message).slice(0, 120); }
  const l = latences();
  l[id] = { liveMs, dbMs, erreur, at: new Date().toISOString() };
  save('dataset_latences', l);
  return l[id];
}

let campagne = null;
async function mesurerTout({ force = false } = {}) {
  if (campagne) return campagne;
  const l = latences();
  const ids = all('SELECT id, provider FROM datasets ORDER BY id').filter((d) => !EXCLUS.has(d.provider) && (force || !l[d.id] || Date.now() - Date.parse(l[d.id].at) > MESURE_AGE)).map((d) => d.id);
  campagne = (async () => {
    for (const id of ids) { try { await mesurer(id); } catch (e) { console.warn('[live]', id, e.message); } }
    if (ids.length) console.log(`[live] ${ids.length} temps de réponse mesurés (seuil du mode live : ${SEUIL_MS} ms)`);
  })().finally(() => { campagne = null; });
  return campagne;
}

// Lecture live pour l'affichage : chaque territoire est relu à la source (délai DELAI_MS), sinon la base est servie
const fraiches = new Map();
async function rafraichir(datasetId, geoCodes) {
  const st = etat().jeux[datasetId];
  if (!st || st.mode !== 'live') return { source: 'base' };
  const d = get('SELECT id, provider, config FROM datasets WHERE id = ?', datasetId);
  const geos = all(`SELECT code, nom, level, dept FROM geos WHERE code IN (${geoCodes.map(() => '?').join(',')})`, ...geoCodes).filter((g) => g.level !== 'EPT').slice(0, 20);
  const res = await Promise.all(geos.map(async (g) => {
    const k = `${datasetId}|${g.code}`;
    if (Date.now() - (fraiches.get(k) || 0) < FRAIS_MS) return 'live';
    try { await withTimeout(require('./importer').fetchLive(d, { ...g, level: g.level || 'COM' }), DELAI_MS); fraiches.set(k, Date.now()); return 'live'; }
    catch { return 'repli'; }
  }));
  const repli = geos.filter((g, i) => res[i] === 'repli').map((g) => g.code);
  return { source: repli.length === 0 ? 'live' : repli.length === geos.length ? 'repli' : 'mixte', repli, lu_le: new Date().toISOString() };
}

module.exports = { etat, setMode, mesurer, mesurerTout, rafraichir, SEUIL_MS };
