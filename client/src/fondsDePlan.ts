// Fond de plan raster IGN (Géoplateforme) superposé à la carte des communes.
//
// Les contours communaux ne sont pas des tuiles mais des tracés SVG déjà projetés par le serveur
// (voir server/idf.js). On ajoute donc l'IGN en peignant des tuiles raster *sous* ces tracés :
// pour chaque tuile on convertit son emprise géographique en coordonnées de notre projection
// équirectangulaire, ce qui garantit la superposition exacte fond / communes.
//
// Source : Géoplateforme (IGN), WMTS EPSG:3857, matrices « PM_0_19 » (0-19) et « PM_6_18 » (6-18),
// tuiles 256 px. Le service renvoie « Access-Control-Allow-Origin: * », donc les tuiles sont
// dessinables directement en <image> sans passer par le serveur.

const K = 1000; // unités SVG par degré de latitude (cf. server/idf.js)
const LAT0 = 48.7;
const LON0 = 1.4;
const COS = Math.cos((LAT0 * Math.PI) / 180);

const projectX = (lon: number) => (lon - LON0) * COS * K;
const projectY = (lat: number) => (LAT0 - lat) * K;
const unprojectLon = (x: number) => x / (COS * K) + LON0;
const unprojectLat = (y: number) => LAT0 - y / K;

// Web Mercator (EPSG:3857) : coordonnées de tuile normalisées, origine au nord-ouest.
const lonToTx = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const latToTy = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
const txToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tyToLat = (y: number, z: number) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z)));

export interface Fond {
  id: string;
  label: string;
  layer: string;
  tms: string;
  format: string;
  /** zooms IGN réellement servis pour ce fond */
  min: number;
  max: number;
  attribution: string;
  href: string;
}

export const FONDS: Fond[] = [
  { id: 'plan', label: 'Plan IGN', layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', tms: 'PM_0_19', format: 'image/png', min: 6, max: 18, attribution: '© IGN — Géoplateforme', href: 'https://www.geoplateforme.gouv.fr/' },
  { id: 'ortho', label: 'Photographies aériennes (20 cm)', layer: 'ORTHOIMAGERY.ORTHOPHOTOS', tms: 'PM_0_19', format: 'image/jpeg', min: 6, max: 19, attribution: '© IGN — Géoplateforme', href: 'https://www.geoplateforme.gouv.fr/' },
  { id: 'ortho50', label: 'Photographies aériennes (50 cm)', layer: 'ORTHOIMAGERY.ORTHOPHOTOS.BDORTHO', tms: 'PM_6_18', format: 'image/jpeg', min: 6, max: 18, attribution: '© IGN — Géoplateforme', href: 'https://www.geoplateforme.gouv.fr/' },
];

export interface Tuile { href: string; x: number; y: number; w: number; h: number }

const tileUrl = (f: Fond, z: number, c: number, r: number) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&LAYER=${f.layer}` +
  `&TILEMATRIXSET=${f.tms}&TILEMATRIX=${z}&TILEROW=${r}&TILECOL=${c}&FORMAT=${encodeURIComponent(f.format)}`;

const SEAM = 0.002; // débord relatif des tuiles, pour masquer les joints

/**
 * Rectangle réellement visible, en unités SVG. Le viewBox est cadré en « meet » : selon le format
 * de l'écran, la zone affichée déborde du viewBox sur un axe. Sans cette correction, les tuiles
 * demandées laisseraient des bandes blanches à l'écran.
 */
export function visibleRect(vb: number[], aspect: number): number[] {
  const w = vb[2], h = vb[3];
  const a = aspect > 0 ? aspect : w / h;
  const vw = a > w / h ? h * a : w;
  const vh = a > w / h ? h : w / a;
  return [vb[0] + (w - vw) / 2, vb[1] + (h - vh) / 2, vw, vh];
}

/** Tuiles couvrant `rect`, positionnées en unités SVG. */
function cover(rect: number[], f: Fond, z: number): Tuile[] {
  const n = 2 ** z;
  const lon0 = unprojectLon(rect[0]);
  const lon1 = unprojectLon(rect[0] + rect[2]);
  const north = unprojectLat(rect[1]); // bord supérieur = latitude la plus grande
  const south = unprojectLat(rect[1] + rect[3]);
  const c0 = Math.floor(lonToTx(lon0, z));
  const c1 = Math.floor(lonToTx(lon1, z));
  const r0 = Math.floor(latToTy(north, z));
  const r1 = Math.floor(latToTy(south, z));
  const out: Tuile[] = [];
  for (let r = r0; r <= r1; r++) {
    if (r < 0 || r >= n) continue;
    const y = projectY(tyToLat(r, z));
    const h = projectY(tyToLat(r + 1, z)) - y;
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || c >= n) continue;
      const x = projectX(txToLon(c, z));
      const w = projectX(txToLon(c + 1, z)) - x;
      // léger débord : évite les traits blancs entre tuiles adjacentes (rendu fractionnaire)
      out.push({ href: tileUrl(f, z, c, r), x: x - w * SEAM, y: y - h * SEAM, w: w * (1 + 2 * SEAM), h: h * (1 + 2 * SEAM) });
    }
  }
  return out;
}

/**
 * Tuiles du fond de plan pour la vue courante. Le niveau de zoom IGN est déduit de l'échelle
 * d'affichage : on choisit `z` pour qu'une tuile de 256 px couvre environ 256 px d'écran, donc
 * sans changement de résolution au fil du zoom molette. Si la vue demandait trop de tuiles
 * (format d'écran très différent de celui du viewBox), on descend d'un cran plutôt que de
 * saturer le navigateur.
 *
 * @param boxPx taille en pixels de l'élément SVG qui porte la carte
 */
export function fondTiles(vb: number[], boxPx: { w: number; h: number }, f: Fond, maxTuiles = 32): { z: number; tuiles: Tuile[] } {
  const rect = visibleRect(vb, boxPx.w > 0 && boxPx.h > 0 ? boxPx.w / boxPx.h : 1);
  // 2^z = largeur du monde (en unités SVG) × largeur écran / (taille native d'une tuile × vue)
  let z = Math.round(Math.log2(((360 * COS * K) / 256) * boxPx.w / rect[2]));
  z = Math.min(f.max, Math.max(f.min, z));
  for (;;) {
    const tuiles = cover(rect, f, z);
    if (tuiles.length <= maxTuiles || z <= f.min) return { z, tuiles };
    z--;
  }
}
