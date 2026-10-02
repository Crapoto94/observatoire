// Localisation d'un point (longitude, latitude) dans une commune d'Île-de-France : index en grille sur les contours simplifiés (geo_shapes).
const { all } = require('./db');
const { project } = require('./idf');

const CELL = 10; // unités SVG (≈ 1,1 km)
let index = null;

// 'M x y L x y … Z M …' -> liste d'anneaux [[x,y], …]
function rings(path) {
  return path.split('Z').filter(Boolean).map((part) => part.replace(/^M/, '').split('L').map((p) => p.trim().split(' ').map(Number)));
}

// Règle pair-impair sur l'ensemble des anneaux (les trous sont gérés)
function inside(polys, x, y) {
  let c = false;
  for (const ring of polys) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

function build() {
  const grid = new Map();
  const items = all('SELECT code, path, x0, y0, x1, y1 FROM geo_shapes').map((s) => ({ ...s, polys: rings(s.path) }));
  for (const s of items) {
    for (let gx = Math.floor(s.x0 / CELL); gx <= Math.floor(s.x1 / CELL); gx++) {
      for (let gy = Math.floor(s.y0 / CELL); gy <= Math.floor(s.y1 / CELL); gy++) {
        const k = `${gx}|${gy}`;
        (grid.get(k) || grid.set(k, []).get(k)).push(s);
      }
    }
  }
  return { grid, count: items.length };
}

/** Code INSEE de la commune qui contient le point, ou null. */
function locate(lon, lat) {
  if (!index) index = build();
  const [x, y] = project([lon, lat]);
  for (const s of index.grid.get(`${Math.floor(x / CELL)}|${Math.floor(y / CELL)}`) || []) {
    if (x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1 && inside(s.polys, x, y)) return s.code;
  }
  return null;
}

const ready = () => { if (!index) index = build(); return index.count; };

module.exports = { locate, ready };
