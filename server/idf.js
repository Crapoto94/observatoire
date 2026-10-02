// Île-de-France : liste des communes et contours simplifiés, pour la carte de la page Données.
// Sources : geo.api.gouv.fr (communes de la région 11 + contours). Les contours sont simplifiés (≈ 30 m) et projetés
// en chemins SVG une fois pour toutes, stockés dans geo_shapes.
const { all, get, run, tx } = require('./db');
const { fetchJson } = require('./connectors/melodi');

const URL_CONTOURS = 'https://geo.api.gouv.fr/communes?codeRegion=11&format=geojson&geometry=contour&fields=nom,code,population';
const K = 1000; // unités SVG par degré de latitude
const LAT0 = 48.7;
const LON0 = 1.4;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const TOLERANCE = 0.25; // en unités SVG (≈ 28 m)

const project = ([lon, lat]) => [(lon - LON0) * COS * K, (LAT0 - lat) * K];

function perpendicular(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  if (!len) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Douglas-Peucker itératif
function simplify(points, tol) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let max = 0, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = perpendicular(points[k], points[i], points[j]);
      if (d > max) { max = d; idx = k; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([i, idx], [idx, j]); }
  }
  return points.filter((_, k) => keep[k]);
}

function ringPath(ring) {
  let pts = simplify(ring.map(project), TOLERANCE);
  if (pts.length < 4) pts = ring.map(project);
  return 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L') + 'Z';
}

function shapeOf(feature) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const path = polys.map((rings) => rings.map((r) => {
    for (const c of r) {
      const [x, y] = project(c);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return ringPath(r);
  }).join('')).join('');
  return { path, x0, y0, x1, y1 };
}

const count = () => get(`SELECT COUNT(*) AS n FROM geo_shapes`).n;

/** Charge les communes d'Île-de-France et leurs contours (une seule fois, sauf force). */
async function bootstrapIdf({ force = false, log = () => {} } = {}) {
  if (!force && count() >= 1200) return { communes: count(), created: 0 };
  log('Île-de-France : téléchargement des communes et contours…');
  const j = await fetchJson(URL_CONTOURS);
  const features = (j.features || []).filter((f) => f.geometry && f.properties?.code);
  let created = 0;
  tx(() => {
    for (const f of features) {
      const { code, nom, population } = f.properties;
      const s = shapeOf(f);
      run(`INSERT INTO geo_shapes (code, path, x0, y0, x1, y1) VALUES (?,?,?,?,?,?)
           ON CONFLICT(code) DO UPDATE SET path = excluded.path, x0 = excluded.x0, y0 = excluded.y0, x1 = excluded.x1, y1 = excluded.y1`,
      code, s.path, s.x0, s.y0, s.x1, s.y1);
      created += run(`INSERT OR IGNORE INTO geos (code, nom, dept, population, fixed, level, bulk) VALUES (?,?,?,?,0,'COM',1)`,
        code, nom, code.slice(0, 2), population ?? null).changes;
    }
  });
  log(`Île-de-France : ${features.length} communes, ${created} ajoutées`);
  return { communes: features.length, created };
}

/** Formes d'un périmètre : 'idf' ou un code de département. */
function shapes(scope) {
  const rows = scope && scope !== 'idf'
    ? all(`SELECT s.code, g.nom, g.dept, s.path, s.x0, s.y0, s.x1, s.y1 FROM geo_shapes s JOIN geos g ON g.code = s.code WHERE g.dept = ?`, scope)
    : all(`SELECT s.code, g.nom, g.dept, s.path, s.x0, s.y0, s.x1, s.y1 FROM geo_shapes s JOIN geos g ON g.code = s.code`);
  if (!rows.length) return { viewBox: [0, 0, 100, 100], items: [] };
  const x0 = Math.min(...rows.map((r) => r.x0)), y0 = Math.min(...rows.map((r) => r.y0));
  const x1 = Math.max(...rows.map((r) => r.x1)), y1 = Math.max(...rows.map((r) => r.y1));
  const pad = Math.max(x1 - x0, y1 - y0) * 0.02;
  return {
    viewBox: [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad],
    items: rows.map((r) => ({ code: r.code, nom: r.nom, dept: r.dept, path: r.path })),
  };
}

module.exports = { bootstrapIdf, shapes };
