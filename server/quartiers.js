// Quartiers officiels de la Ville d'Ivry-sur-Seine : composition en IRIS et indicateurs par quartier.
// Les quartiers (seed/quartiers.geojson) regroupent plusieurs IRIS dont les limites ne coïncident pas toujours avec les leurs :
// chaque IRIS est affecté aux quartiers au prorata de la part de sa surface qui s'y trouve (pondération surfacique).
// Données à l'IRIS : bases infracommunales du recensement (INSEE, RP 2022), revenus Filosofi 2021 (INSEE) et allocataires
// de la CAF (décembre 2024). Les effectifs sont répartis au prorata de la surface puis additionnés ; les indicateurs
// de Filosofi (médiane, taux de pauvreté) sont des moyennes des IRIS pondérées par leur population répartie.
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { db, all, run, tx, get } = require('./db');
const { fetchRetry, fetchJson } = require('./connectors/melodi');
const { odsRecords } = require('./connectors/open');

const COMMUNE = '94041';
const QUARTIERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed', 'quartiers.geojson'), 'utf8')).features;
const IRIS_WFS = `https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=STATISTICALUNITS.IRIS:contours_iris&outputFormat=application/json&srsName=EPSG:4326&cql_filter=code_insee=%27${COMMUNE}%27`;
const INSEE = 'https://www.insee.fr/fr/statistiques/fichier';

// sources à l'IRIS : archive CSV de l'INSEE (colonne IRIS = code IRIS à 9 caractères), décimales à la virgule
const SOURCES = [
  { id: 'rp', label: 'Recensement 2022, population (INSEE, base infracommunale)', period: '2022', url: `${INSEE}/8647014/base-ic-evol-struct-pop-2022_csv.zip` },
  { id: 'rp', label: 'Recensement 2022, activité des résidents', period: '2022', url: `${INSEE}/8647006/base-ic-activite-residents-2022_csv.zip` },
  { id: 'rp', label: 'Recensement 2022, logement', period: '2022', url: `${INSEE}/8647012/base-ic-logement-2022_csv.zip` },
  { id: 'rp', label: 'Recensement 2022, couples, familles, ménages', period: '2022', url: `${INSEE}/8647008/base-ic-couples-familles-menages-2022_csv.zip` },
  { id: 'rp', label: 'Recensement 2022, diplômes et formation', period: '2022', url: `${INSEE}/8647010/base-ic-diplomes-formation-2022_csv.zip` },
  { id: 'filo', label: 'Filosofi 2021, revenus disponibles (INSEE)', period: '2021', url: `${INSEE}/8229323/BASE_TD_FILO_IRIS_2021_DISP_CSV.zip`, note: 'DISP_NOTE21' },
];
// revenus Filosofi 2021 des quartiers prioritaires (géographie 2015, seule publiée par l'INSEE pour 2021) ; appariés par nom aux QPV 2024
const QPV_FILO = { url: `${INSEE}/8243026/revenus_pauvrete_2021_qp15_csv.zip`, data: /revenu-disponible-qp15-2021_QP\.csv$/, meta: /^meta_indic-revenu-disponible-qp15-2021_QP\.csv$/, ens: /revenu-disponible-qp15-2021_ENSQP\.csv$/ };
const QPV_VARS = ['DISP_MED_A21', 'DISP_TP60_A21', 'DISP_PPSOC_A21', 'DISP_D1_A21', 'DISP_D9_A21', 'DISP_RD_A21'];
const DOCS = {
  rp: 'https://www.insee.fr/fr/statistiques/8647014', filo: 'https://www.insee.fr/fr/statistiques/8229323', caf: 'https://data.caf.fr/explore/dataset/ndur_s_qf_400_iris_f/',
  iris: 'https://geoservices.ign.fr/contoursiris', qpv: 'https://www.insee.fr/fr/statistiques/8243026',
};

db.exec(`
CREATE TABLE IF NOT EXISTS iris_shapes (code TEXT PRIMARY KEY, nom TEXT, geometry TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quartier_iris (quartier TEXT NOT NULL, iris TEXT NOT NULL, part REAL NOT NULL, PRIMARY KEY (quartier, iris));
CREATE TABLE IF NOT EXISTS iris_values (iris TEXT NOT NULL, source TEXT NOT NULL, variable TEXT NOT NULL, period TEXT, value REAL, PRIMARY KEY (iris, source, variable));
`);

// ---------------- géométrie : part de surface de chaque IRIS dans chaque quartier ----------------
const ringsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
function inRing(pt, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inGeom = (pt, g) => ringsOf(g).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)));

/** Parts de surface d'un IRIS dans chaque quartier, par échantillonnage régulier (grille de 120 × 120 points). */
function sharesOf(geometry, N = 120) {
  const pts = ringsOf(geometry).flatMap((p) => p[0]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cnt = {};
  let n = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const pt = [x0 + ((i + 0.5) / N) * (x1 - x0), y0 + ((j + 0.5) / N) * (y1 - y0)];
    if (!inGeom(pt, geometry)) continue;
    n++;
    const q = QUARTIERS.find((f) => inGeom(pt, f.geometry));
    if (q) cnt[q.properties.code] = (cnt[q.properties.code] || 0) + 1;
  }
  return Object.entries(cnt).map(([code, k]) => [code, k / n]).filter(([, p]) => p >= 0.01); // moins de 1 % : bord de tracé
}

async function loadIris(log) {
  const j = await fetchJson(IRIS_WFS);
  const feats = (j.features || []).filter((f) => f.geometry && f.properties?.code_iris);
  if (!feats.length) throw new Error('contours IRIS introuvables (IGN)');
  tx(() => {
    run('DELETE FROM iris_shapes'); run('DELETE FROM quartier_iris');
    for (const f of feats) {
      run('INSERT INTO iris_shapes (code, nom, geometry) VALUES (?,?,?)', f.properties.code_iris, f.properties.nom_iris, JSON.stringify(f.geometry));
      const sh = sharesOf(f.geometry);
      const tot = sh.reduce((a, [, p]) => a + p, 0) || 1; // la petite part hors quartiers (tracés) est redistribuée
      for (const [q, p] of sh) run('INSERT INTO quartier_iris (quartier, iris, part) VALUES (?,?,?)', q, f.properties.code_iris, p / tot);
    }
  });
  log(`IRIS : ${feats.length} contours, composition des quartiers recalculée`);
}

// ---------------- données à l'IRIS ----------------
const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

async function loadInsee(src, codes) {
  const r = await fetchRetry(src.url, { signal: AbortSignal.timeout(600000) });
  if (!r.ok) throw new Error(`${src.label} : HTTP ${r.status}`);
  const zip = await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()));
  const name = Object.keys(zip.files).find((n) => /\.csv$/i.test(n) && !/meta/i.test(n));
  const lines = (await zip.files[name].async('string')).replace(/^﻿/, '').split(/\r?\n/);
  const head = lines[0].split(';').map((h) => h.trim().replace(/^"|"$/g, ''));
  const iIris = head.indexOf('IRIS');
  const out = [];
  for (const l of lines.slice(1)) {
    if (!l.startsWith(COMMUNE) && !l.startsWith(`"${COMMUNE}`)) continue;
    const c = l.split(';').map((x) => x.trim().replace(/^"|"$/g, ''));
    if (!codes.has(c[iIris])) continue;
    const secret = src.note && c[head.indexOf(src.note)] && c[head.indexOf(src.note)] !== '0'; // valeurs non diffusées (secret statistique)
    head.forEach((h, k) => { if (k !== iIris && !/^(COM|TYP_IRIS|LAB_IRIS|LIBIRIS|LIBCOM|GRD_QUART|UU2020|REG|DEP|MODIF_IRIS|LAB_IRIS)$/.test(h)) { const v = secret ? null : num(c[k]); if (v != null) out.push([c[iIris], src.id, h, src.period, v]); } });
  }
  return out;
}

// CAF (data.caf.fr), décembre de la dernière année : foyers au RSA, aux aides au logement, quotient familial
async function loadCaf(codes) {
  const base = { base: 'https://data.caf.fr' };
  const where = `numcomdo="${COMMUNE}"`;
  const last = async (dataset) => {
    const r = await odsRecords({ ...base, dataset }, { where, select: 'max(dtreffre) as d' });
    return r[0]?.d ? String(r[0].d).slice(0, 10) : null;
  };
  const out = [];
  const put = (iris4, variable, period, v) => { const code = `${COMMUNE}${iris4}`; if (codes.has(code) && v != null) out.push([code, 'caf', variable, period, v]); };
  for (const [dataset, field, variable] of [['rsa_s_type_iris_f', 'indfoy_rsa', 'CAF_RSA_FOYERS'], ['al_s_type_parc_iris_f', 'indfoy_ndural', 'CAF_AL_FOYERS']]) {
    const d = await last(dataset);
    if (!d) continue;
    const recs = await odsRecords({ ...base, dataset }, { where: `${where} and dtreffre=date'${d}'`, select: `numirisd, sum(${field}) as v`, group_by: 'numirisd' });
    for (const r of recs) put(r.numirisd, variable, d.slice(0, 4), num(r.v));
  }
  const d = await last('ndur_s_qf_400_iris_f');
  if (d) {
    const recs = await odsRecords({ ...base, dataset: 'ndur_s_qf_400_iris_f' }, { where: `${where} and dtreffre=date'${d}'`, select: 'numirisd, qf_400, sum(indfoy_ndur) as v', group_by: 'numirisd, qf_400' });
    const acc = {};
    for (const r of recs) {
      const a = acc[r.numirisd] || (acc[r.numirisd] = { tot: 0, connu: 0, bas: 0 });
      const v = num(r.v) || 0;
      a.tot += v;
      if (r.qf_400 !== 'Inconnu') a.connu += v;
      if (/Moins de 400|Entre 400 et 799/.test(r.qf_400 || '')) a.bas += v;
    }
    for (const [k, a] of Object.entries(acc)) { put(k, 'CAF_FOYERS', d.slice(0, 4), a.tot); put(k, 'CAF_QF_CONNU', d.slice(0, 4), a.connu); put(k, 'CAF_QF_LT800', d.slice(0, 4), a.bas); }
  }
  return out;
}

// lignes d'un fichier texte (marque d'ordre des octets retirée)
const linesOf = (text) => text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
// QPV d'Ivry (géographie 2024) retrouvés par leur nom dans le fichier de 2015 ; ENSQP : ensemble des QPV de France métropolitaine
async function loadQpv() {
  const qpvs = all("SELECT code, nom FROM qpv_shapes WHERE communes LIKE ?", `%${COMMUNE}%`);
  if (!qpvs.length) return [];
  const r = await fetchRetry(QPV_FILO.url, { signal: AbortSignal.timeout(300000) });
  const zip = await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()));
  const file = async (re) => { const n = Object.keys(zip.files).find((x) => re.test(x)); return n ? linesOf(await zip.files[n].async('string')) : []; };
  const names = new Map((await file(QPV_FILO.meta)).map((l) => l.split(';')).filter((c) => c[0] === 'CODGEO').map((c) => [plain(c[3]), c[2]]));
  const out = [];
  const take = (lines, wanted) => {
    const head = lines[0].split(';');
    for (const l of lines.slice(1)) {
      const c = l.split(';');
      const code = wanted.get(c[0]);
      if (!code) continue;
      for (const v of QPV_VARS) { const x = num(c[head.indexOf(v)]); if (x != null) out.push([code, 'qpv', v, '2021', x]); }
    }
  };
  take(await file(QPV_FILO.data), new Map(qpvs.map((q) => [names.get(plain(q.nom)), q.code]).filter(([k]) => k)));
  take(await file(QPV_FILO.ens), new Map([['00', 'ENSQP']])); // 00 : ensemble des QPV de France métropolitaine
  return out;
}

// arrêts de transport en commun d'Île-de-France Mobilités (référentiel des arrêts) dans un rayon de 3,5 km autour d'Ivry :
// les stations des communes voisines (Paris 13e, Vitry, Charenton…) desservent aussi les habitants
const IDFM_ARRETS = 'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/arrets/exports/json';
async function loadArrets() {
  const where = "within_distance(arrgeopoint, geom'POINT(2.385 48.813)', 3.5km)";
  const list = await fetchJson(`${IDFM_ARRETS}?select=${encodeURIComponent('arrid,zdaid,arrname,arrtype,arrgeopoint')}&where=${encodeURIComponent(where)}`);
  const arrets = (Array.isArray(list) ? list : []).filter((a) => a.arrgeopoint).map((a) => ({ zda: a.zdaid, nom: a.arrname, type: a.arrtype, lon: a.arrgeopoint.lon, lat: a.arrgeopoint.lat }));
  if (!arrets.length) throw new Error('aucun arrêt renvoyé');
  run("INSERT INTO app_settings (key, value) VALUES ('quartiers_arrets', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify({ at: new Date().toISOString(), arrets }));
  return arrets.length;
}

// desserte : population de chaque IRIS supposée uniforme, répartie sur une grille de points ; distance de chaque point
// à la station lourde (métro, RER et train, tramway) et à l'arrêt de bus les plus proches (distance à vol d'oiseau)
function desserte(shapes, pop, byQuartier) {
  const raw = get("SELECT value FROM app_settings WHERE key = 'quartiers_arrets'")?.value;
  if (!raw) return null;
  const { arrets, at } = JSON.parse(raw);
  const lourds = arrets.filter((a) => a.type !== 'bus'), bus = arrets.filter((a) => a.type === 'bus');
  const lat0 = 48.81, kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const dist = (p, list) => list.reduce((m, a) => Math.min(m, Math.hypot((a.lon - p[0]) * kx, (a.lat - p[1]) * ky)), Infinity);
  const acc = new Map([...byQuartier.keys(), '_commune'].map((k) => [k, { w: 0, lourd: 0, bus: 0, d: 0 }]));
  const N = 40;
  for (const s of shapes) {
    const g = JSON.parse(s.geometry), p = pop(s.code);
    if (!p) continue;
    const pts = ringsOf(g).flatMap((r) => r[0]);
    const xs = pts.map((c) => c[0]), ys = pts.map((c) => c[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const inside = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const pt = [x0 + ((i + 0.5) / N) * (x1 - x0), y0 + ((j + 0.5) / N) * (y1 - y0)]; if (inGeom(pt, g)) inside.push(pt); }
    const w = p / (inside.length || 1);
    for (const pt of inside) {
      const dl = dist(pt, lourds), db = dist(pt, bus);
      const q = QUARTIERS.find((f) => inGeom(pt, f.geometry))?.properties.code;
      for (const k of q ? [q, '_commune'] : ['_commune']) {
        const a = acc.get(k);
        if (!a) continue;
        a.w += w; a.d += w * dl; if (dl <= 500) a.lourd += w; if (db <= 300) a.bus += w;
      }
    }
  }
  const inQ = (code) => QUARTIERS.find((f) => f.properties.code === code);
  const zones = (filter) => new Set(bus.filter(filter).map((a) => a.zda)).size;
  const val = (k, f) => { const a = acc.get(k); return a && a.w ? f(a) : null; };
  const mk = (id, label, unit, f, approx) => ({
    id, theme: 'Mobilité', label, unit, approx, source: 'idfm', period: at.slice(0, 4),
    valeurs: Object.fromEntries([...byQuartier.keys()].map((k) => [k, val(k, f)])), commune: val('_commune', f),
  });
  return [
    mk('acces_lourd', 'Part de la population à moins de 500 m d’une station de métro, RER, train ou tramway', '%', (a) => (a.lourd / a.w) * 100, 'distance à vol d’oiseau ; population supposée uniforme dans chaque IRIS'),
    mk('acces_bus', 'Part de la population à moins de 300 m d’un arrêt de bus', '%', (a) => (a.bus / a.w) * 100, 'distance à vol d’oiseau ; population supposée uniforme dans chaque IRIS'),
    mk('dist_station', 'Distance moyenne à la station de métro, RER, train ou tramway la plus proche', 'm', (a) => a.d / a.w, 'distance à vol d’oiseau, moyenne pondérée par la population'),
    { id: 'arrets_bus', theme: 'Mobilité', label: 'Arrêts de bus (zones d’arrêt) dans le quartier', unit: 'arrêts', approx: null, source: 'idfm', period: at.slice(0, 4),
      valeurs: Object.fromEntries([...byQuartier.keys()].map((k) => [k, zones((a) => inGeom([a.lon, a.lat], inQ(k).geometry))])),
      commune: zones((a) => QUARTIERS.some((f) => inGeom([a.lon, a.lat], f.geometry))) },
  ];
}

let running = null;
/** Recharge les contours IRIS, la composition des quartiers et les données à l'IRIS. */
function refresh({ log = (m) => console.log(`[quartiers] ${m}`) } = {}) {
  if (running) return running;
  running = (async () => {
    await loadIris(log);
    const codes = new Set(all('SELECT code FROM iris_shapes').map((r) => r.code));
    const rows = [];
    for (const src of SOURCES) {
      try { const r = await loadInsee(src, codes); rows.push(...r); log(`${src.label} : ${r.length} valeurs`); } catch (e) { log(`${src.label} : échec (${e.message})`); }
    }
    try { const r = await loadCaf(codes); rows.push(...r); log(`CAF : ${r.length} valeurs`); } catch (e) { log(`CAF : échec (${e.message})`); }
    try { const r = await loadQpv(); rows.push(...r); log(`Filosofi des QPV : ${r.length} valeurs`); } catch (e) { log(`Filosofi des QPV : échec (${e.message})`); }
    try { const n = await loadArrets(); log(`Arrêts de transport (IDFM) : ${n}`); } catch (e) { log(`Arrêts IDFM : échec (${e.message})`); }
    const sources = new Set(rows.map((r) => r[1]));
    tx(() => {
      for (const s of sources) run('DELETE FROM iris_values WHERE source = ?', s); // une source en échec garde ses valeurs précédentes
      const ins = db.prepare('INSERT OR REPLACE INTO iris_values (iris, source, variable, period, value) VALUES (?,?,?,?,?)');
      for (const r of rows) ins.run(...r);
    });
    run("INSERT INTO app_settings (key, value) VALUES ('quartiers_maj', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", new Date().toISOString());
    memo = null;
    return { iris: codes.size, valeurs: rows.length };
  })().finally(() => { running = null; });
  return running;
}

// ---------------- indicateurs par quartier ----------------
// num / den : variables « source:VARIABLE » additionnées ; factor : 100 pour une part, 1000 pour un taux pour 1 000 habitants
const S = (src, ...v) => v.map((x) => `${src}:${x}`);
const PCT = { factor: 100, unit: '%' };
const INDICATEURS = [
  { id: 'population', theme: 'Démographie', label: 'Population', num: S('rp', 'P22_POP'), unit: 'hab.' },
  { id: 'moins15', theme: 'Démographie', label: 'Part des moins de 15 ans', num: S('rp', 'P22_POP0014'), den: S('rp', 'P22_POP'), ...PCT },
  { id: 'j15_29', theme: 'Démographie', label: 'Part des 15-29 ans', num: S('rp', 'P22_POP1529'), den: S('rp', 'P22_POP'), ...PCT },
  { id: 'plus65', theme: 'Démographie', label: 'Part des 65 ans ou plus', num: S('rp', 'P22_POP65P'), den: S('rp', 'P22_POP'), ...PCT },
  { id: 'plus75', theme: 'Démographie', label: 'Part des 75 ans ou plus', num: S('rp', 'P22_POP75P'), den: S('rp', 'P22_POP'), ...PCT },
  { id: 'immigres', theme: 'Démographie', label: 'Part des immigrés', num: S('rp', 'P22_POP_IMM'), den: S('rp', 'P22_POP'), ...PCT },
  { id: 'etrangers', theme: 'Démographie', label: 'Part des étrangers', num: S('rp', 'P22_POP_ETR'), den: S('rp', 'P22_POP'), ...PCT },
  { id: 'menages_seuls', theme: 'Familles', label: 'Part des ménages d’une personne', num: S('rp', 'C22_MENPSEUL'), den: S('rp', 'C22_MEN'), ...PCT },
  { id: 'mono', theme: 'Familles', label: 'Part des familles monoparentales', num: S('rp', 'C22_FAMMONO'), den: S('rp', 'C22_FAM'), ...PCT },
  { id: 'taille_men', theme: 'Familles', label: 'Taille moyenne des ménages', num: S('rp', 'P22_PMEN'), den: S('rp', 'P22_MEN'), factor: 1, unit: 'pers.' },
  { id: 'chomage', theme: 'Emploi et revenus', label: 'Taux de chômage des 15-64 ans', num: S('rp', 'P22_CHOM1564'), den: S('rp', 'P22_ACT1564'), ...PCT },
  { id: 'activite', theme: 'Emploi et revenus', label: 'Taux d’activité des 15-64 ans', num: S('rp', 'P22_ACT1564'), den: S('rp', 'P22_POP1564'), ...PCT },
  { id: 'precaires', theme: 'Emploi et revenus', label: 'Part des salariés en contrat précaire (CDD, intérim, apprentissage, emplois aidés)', num: S('rp', 'P22_SAL15P_CDD', 'P22_SAL15P_INTERIM', 'P22_SAL15P_APPR', 'P22_SAL15P_EMPAID'), den: S('rp', 'P22_SAL15P'), ...PCT },
  { id: 'cadres', theme: 'Emploi et revenus', label: 'Part des cadres (15 ans ou plus)', num: S('rp', 'C22_POP15P_STAT_GSEC13_23'), den: S('rp', 'C22_POP15P'), ...PCT },
  { id: 'ouv_emp', theme: 'Emploi et revenus', label: 'Part des ouvriers et employés (15 ans ou plus)', num: S('rp', 'C22_POP15P_STAT_GSEC15_25', 'C22_POP15P_STAT_GSEC16_26'), den: S('rp', 'C22_POP15P'), ...PCT },
  { id: 'niveau_vie', theme: 'Emploi et revenus', label: 'Niveau de vie médian (moyenne des IRIS)', mean: 'filo:DISP_MED21', unit: '€', approx: 'moyenne des médianes des IRIS pondérée par leur population : ordre de grandeur, une médiane ne s’additionne pas' },
  { id: 'pauvrete', theme: 'Emploi et revenus', label: 'Taux de pauvreté (moyenne des IRIS)', mean: 'filo:DISP_TP6021', unit: '%', approx: 'moyenne des taux des IRIS pondérée par leur population ; IRIS soumis au secret exclus' },
  { id: 'prest_soc', theme: 'Emploi et revenus', label: 'Part des prestations sociales dans le revenu disponible (moyenne des IRIS)', mean: 'filo:DISP_PPSOC21', unit: '%', approx: 'moyenne des IRIS pondérée par leur population' },
  { id: 'sans_diplome', theme: 'Formation', label: 'Part des 15 ans ou plus non scolarisés sans diplôme', num: S('rp', 'P22_NSCOL15P_DIPLMIN'), den: S('rp', 'P22_NSCOL15P'), ...PCT },
  { id: 'diplome_sup', theme: 'Formation', label: 'Part des 15 ans ou plus non scolarisés diplômés du supérieur', num: S('rp', 'P22_NSCOL15P_SUP2', 'P22_NSCOL15P_SUP34', 'P22_NSCOL15P_SUP5'), den: S('rp', 'P22_NSCOL15P'), ...PCT },
  { id: 'scol_18_24', theme: 'Formation', label: 'Part des 18-24 ans scolarisés', num: S('rp', 'P22_SCOL1824'), den: S('rp', 'P22_POP1824'), ...PCT },
  { id: 'logements', theme: 'Logement', label: 'Logements', num: S('rp', 'P22_LOG'), unit: 'logements' },
  { id: 'vacance', theme: 'Logement', label: 'Part des logements vacants', num: S('rp', 'P22_LOGVAC'), den: S('rp', 'P22_LOG'), ...PCT },
  { id: 'hlm', theme: 'Logement', label: 'Part des ménages locataires d’un logement HLM', num: S('rp', 'P22_RP_LOCHLMV'), den: S('rp', 'P22_RP'), ...PCT },
  { id: 'proprietaires', theme: 'Logement', label: 'Part des ménages propriétaires', num: S('rp', 'P22_RP_PROP'), den: S('rp', 'P22_RP'), ...PCT },
  { id: 'suroccupation', theme: 'Logement', label: 'Part des résidences principales suroccupées', num: S('rp', 'C22_RP_SUROCC_MOD', 'C22_RP_SUROCC_ACC'), den: S('rp', 'C22_RP_NORME', 'C22_RP_SOUSOCC_MOD', 'C22_RP_SOUSOCC_ACC', 'C22_RP_SOUSOCC_TACC', 'C22_RP_SUROCC_MOD', 'C22_RP_SUROCC_ACC'), ...PCT },
  { id: 'petits_log', theme: 'Logement', label: 'Part des résidences principales d’une ou deux pièces', num: S('rp', 'P22_RP_1P', 'P22_RP_2P'), den: S('rp', 'P22_RP'), ...PCT },
  { id: 'sans_voiture', theme: 'Mobilité', label: 'Part des ménages sans voiture', num: S('rp', 'P22_RP'), minus: S('rp', 'P22_RP_VOIT1P'), den: S('rp', 'P22_RP'), ...PCT },
  { id: 'modes_actifs', theme: 'Mobilité', label: 'Part des actifs allant travailler à pied ou à vélo', num: S('rp', 'C22_ACTOCC15P_MAR', 'C22_ACTOCC15P_VELO'), den: S('rp', 'C22_ACTOCC15P'), ...PCT },
  { id: 'transports_commun', theme: 'Mobilité', label: 'Part des actifs allant travailler en transports en commun', num: S('rp', 'C22_ACTOCC15P_TCOM'), den: S('rp', 'C22_ACTOCC15P'), ...PCT },
  { id: 'caf_rsa', theme: 'Cohésion sociale', label: 'Foyers au RSA pour 1 000 habitants', num: S('caf', 'CAF_RSA_FOYERS'), den: S('rp', 'P22_POP'), factor: 1000, unit: 'pour 1 000 hab.' },
  { id: 'caf_al', theme: 'Cohésion sociale', label: 'Foyers percevant une aide au logement pour 1 000 habitants', num: S('caf', 'CAF_AL_FOYERS'), den: S('rp', 'P22_POP'), factor: 1000, unit: 'pour 1 000 hab.' },
  { id: 'caf_qf', theme: 'Cohésion sociale', label: 'Part des foyers allocataires au quotient familial inférieur à 800 €', num: S('caf', 'CAF_QF_LT800'), den: S('caf', 'CAF_QF_CONNU'), ...PCT },
];

let memo = null;
function build() {
  if (memo) return memo;
  const comp = all('SELECT quartier, iris, part FROM quartier_iris');
  const shapes = all('SELECT code, nom, geometry FROM iris_shapes');
  const vals = new Map(); // iris -> "source:VAR" -> { value, period }
  for (const r of all('SELECT iris, source, variable, period, value FROM iris_values')) {
    (vals.get(r.iris) || vals.set(r.iris, new Map()).get(r.iris)).set(`${r.source}:${r.variable}`, { value: r.value, period: r.period });
  }
  const v = (iris, key) => vals.get(iris)?.get(key)?.value ?? null;
  const sum = (members, keys) => {
    let s = 0, ok = false;
    for (const [iris, part] of members) for (const k of keys) { const x = v(iris, k); if (x != null) { s += x * part; ok = true; } }
    return ok ? s : null;
  };
  const periodOf = (keys) => { for (const m of vals.values()) for (const k of keys) if (m.get(k)) return m.get(k).period; return null; };
  const valueOf = (ind, members) => {
    if (ind.mean) { // moyenne des IRIS pondérée par leur population répartie
      let s = 0, w = 0;
      for (const [iris, part] of members) { const x = v(iris, ind.mean), p = v(iris, 'rp:P22_POP'); if (x != null && p) { s += x * p * part; w += p * part; } }
      return w ? s / w : null;
    }
    const n = sum(members, ind.num), m = ind.minus ? sum(members, ind.minus) : 0;
    if (n == null) return null;
    if (!ind.den) return n - (m || 0);
    const d = sum(members, ind.den);
    return d ? ((n - (m || 0)) / d) * (ind.factor ?? 1) : null;
  };
  const byQ = new Map(QUARTIERS.map((q) => [q.properties.code, []]));
  for (const c of comp) byQ.get(c.quartier)?.push([c.iris, c.part]);
  const commune = shapes.map((s) => [s.code, 1]);
  const nomIris = Object.fromEntries(shapes.map((s) => [s.code, s.nom]));
  memo = {
    maj: get("SELECT value FROM app_settings WHERE key = 'quartiers_maj'")?.value || null,
    quartiers: QUARTIERS.map((q) => ({
      code: q.properties.code, nom: q.properties.nom, geometry: q.geometry,
      iris: (byQ.get(q.properties.code) || []).map(([code, part]) => ({ code, nom: nomIris[code] || code, part })).sort((a, b) => b.part - a.part),
    })),
    iris: shapes.map((s) => ({ code: s.code, nom: s.nom, geometry: JSON.parse(s.geometry) })),
    qpv: (() => {
      const q = all("SELECT code, nom FROM qpv_shapes WHERE communes LIKE ? ORDER BY nom", `%${COMMUNE}%`);
      const row = (code) => Object.fromEntries(QPV_VARS.map((v) => [v, vals.get(code)?.get(`qpv:${v}`)?.value ?? null]));
      return { periode: '2021', geographie: 'quartiers prioritaires 2015 (périmètres proches de ceux de 2024, appariés par nom)', quartiers: q.map((x) => ({ code: x.code, nom: x.nom, ...row(x.code) })), ensemble: row('ENSQP') };
    })(),
    indicateurs: INDICATEURS.map((ind) => {
      const keys = ind.mean ? [ind.mean] : ind.num;
      const source = keys[0].split(':')[0];
      return {
        id: ind.id, theme: ind.theme, label: ind.label, unit: ind.unit || '', approx: ind.approx || null, source, period: periodOf(keys),
        valeurs: Object.fromEntries([...byQ].map(([code, members]) => [code, valueOf(ind, members)])),
        commune: valueOf(ind, commune),
      };
    }).concat(desserte(shapes, (iris) => v(iris, 'rp:P22_POP'), byQ) || []),
    sources: [
      { id: 'iris', label: 'Contours des IRIS (IGN, Contours… IRIS®)', url: DOCS.iris },
      ...[...new Map(SOURCES.map((s) => [s.id, s])).values()].map((s) => ({ id: s.id, label: s.id === 'rp' ? 'Recensement de la population 2022, bases infracommunales IRIS (INSEE)' : s.label, url: DOCS[s.id] })),
      { id: 'caf', label: 'Allocataires CAF par IRIS (data.caf.fr), décembre 2024', url: DOCS.caf },
      { id: 'idfm', label: 'Référentiel des arrêts de transport (Île-de-France Mobilités)', url: 'https://data.iledefrance-mobilites.fr/explore/dataset/arrets/' },
      { id: 'qpv', label: 'Revenus, pauvreté et niveau de vie en 2021 des quartiers prioritaires (INSEE, Filosofi)', url: DOCS.qpv },
    ],
  };
  return memo;
}

const isEmpty = () => (get('SELECT COUNT(*) AS n FROM iris_values').n === 0);
/** Recharge si la dernière mise à jour date de plus de `days` jours. */
function refreshIfOld(days) {
  const maj = get("SELECT value FROM app_settings WHERE key = 'quartiers_maj'")?.value;
  return !maj || Date.now() - Date.parse(maj) > days * 86400000 ? refresh() : Promise.resolve(null);
}

module.exports = { build, refresh, refreshIfOld, isEmpty, INDICATEURS, QUARTIERS, sharesOf };
