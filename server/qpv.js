// Quartiers prioritaires de la politique de la ville (QPV, ANCT, géographie 2024) d'Île-de-France : contours simplifiés pour la cartographie.
const JSZip = require('jszip');
const { db, all, get, run, tx } = require('./db');
const { fetchRetry } = require('./connectors/melodi');
const { shapeOf } = require('./idf');

// archive GeoJSON (WGS84) du jeu « Quartiers prioritaires de la politique de la ville » sur data.gouv.fr
const RESOURCE = '942d4ee8-8142-4556-8ea1-335537ce1119';

db.exec(`
CREATE TABLE IF NOT EXISTS qpv_shapes (
  code TEXT PRIMARY KEY, nom TEXT, communes TEXT, communes_noms TEXT, dept TEXT,
  path TEXT NOT NULL, x0 REAL, y0 REAL, x1 REAL, y1 REAL
);`);

let loading = null;

async function bootstrap({ force = false, log = () => {} } = {}) {
  if (!force && get('SELECT COUNT(*) AS n FROM qpv_shapes').n > 0) return;
  if (loading) return loading;
  loading = (async () => {
    log('QPV : téléchargement des périmètres…');
    const res = await fetchRetry(`https://www.data.gouv.fr/api/1/datasets/r/${RESOURCE}`, { redirect: 'follow', signal: AbortSignal.timeout(600000) });
    if (!res.ok) throw new Error(`téléchargement QPV : HTTP ${res.status}`);
    const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
    const entry = Object.values(zip.files).find((f) => /WGS84\.geojson$/i.test(f.name) && /Hexagonale/i.test(f.name));
    if (!entry) throw new Error('fichier GeoJSON WGS84 introuvable dans l’archive QPV');
    const gj = JSON.parse(await entry.async('string'));
    let n = 0;
    tx(() => {
      for (const f of gj.features) {
        const p = f.properties || {};
        if (p.insee_reg !== '11' || !f.geometry) continue;
        const s = shapeOf(f);
        run(`INSERT INTO qpv_shapes (code, nom, communes, communes_noms, dept, path, x0, y0, x1, y1) VALUES (?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(code) DO UPDATE SET nom = excluded.nom, communes = excluded.communes, communes_noms = excluded.communes_noms, dept = excluded.dept, path = excluded.path`,
        p.code_qp, p.lib_qp, String(p.insee_com || '').replace(/\s/g, ''), p.lib_com, p.insee_dep, s.path, s.x0, s.y0, s.x1, s.y1);
        n++;
      }
    });
    log(`QPV : ${n} quartiers d'Île-de-France chargés`);
  })().finally(() => { loading = null; });
  return loading;
}

/** QPV d'un périmètre : 'idf', code de département ou 'gosb'. */
function list(scope) {
  const members = require('./groups').membersOf(String(scope).toUpperCase());
  let rows = all('SELECT code, nom, communes, communes_noms, dept, path FROM qpv_shapes ORDER BY code');
  if (members.length) rows = rows.filter((r) => r.communes.split(',').some((c) => members.includes(c)));
  else if (scope && scope !== 'idf') rows = rows.filter((r) => r.dept === scope);
  return rows;
}

module.exports = { bootstrap, list };
