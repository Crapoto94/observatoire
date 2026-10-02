// Îlots de chaleur urbains (Institut Paris Région) : 237 000 îlots morphologiques urbains (IMU), sans code commune.
// L'export CSV complet (sans géométrie) est téléchargé une fois, chaque îlot est rattaché à sa commune par son point central
// (point dans polygone sur les contours de geo_shapes), puis les surfaces sont agrégées par commune, classe d'aléa, de vulnérabilité et type de zone climatique locale.
const readline = require('readline');
const { Readable } = require('stream');
const { bootstrapIdf } = require('../idf');
const { fetchRetry } = require('./melodi');
const spatial = require('../spatial');

const URL_EXPORT = 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/ilots-de-chaleur-urbains-icu-classification-des-imu-en-zone-climatique-locale-lc/exports/csv'
  + '?select=geo_point_2d,type_lcz,alea_j_cl,alea_n_cl,vulnj_note,vulnn_note,st_areasha&delimiter=%3B';

let cache = null; // { at, rows: Map code -> lignes }

async function aggregate(config) {
  await bootstrapIdf({});
  spatial.ready();
  const res = await fetchRetry(URL_EXPORT, { signal: AbortSignal.timeout(900000) });
  if (!res.ok) throw new Error(`export ICU : HTTP ${res.status}`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity });
  const acc = new Map(); // code -> Map(clé -> hectares)
  let first = true, located = 0, total = 0;
  // chaque ligne porte les deux dimensions (LCZ, CLASSE) ; _T = total
  const add = (code, mesure, lcz, cls, ha) => {
    const m = acc.get(code) || acc.set(code, new Map()).get(code);
    for (const [l, c] of [[lcz, cls], ['_T', '_T']]) {
      const k = `${mesure}|${l}|${c}`;
      m.set(k, (m.get(k) ?? 0) + ha);
    }
  };
  for await (const raw of rl) {
    if (first) { first = false; continue; }
    const [pt, lcz, aj, an, vj, vn, area] = raw.replace(/^﻿/, '').split(';');
    const [lat, lon] = pt.split(',').map(Number);
    total++;
    const code = spatial.locate(lon, lat);
    if (!code) continue;
    located++;
    const ha = (Number(area) || 0) / 10000;
    add(code, 'SURFACE_LCZ_HA', lcz || '_Z', '_T', ha);
    add(code, 'SURFACE_ALEA_JOUR_HA', '_T', aj, ha);
    add(code, 'SURFACE_ALEA_NUIT_HA', '_T', an, ha);
    add(code, 'SURFACE_VULNERABILITE_JOUR_HA', '_T', vj, ha);
    add(code, 'SURFACE_VULNERABILITE_NUIT_HA', '_T', vn, ha);
  }
  const rows = new Map();
  for (const [code, m] of acc) {
    rows.set(code, [...m.entries()].map(([k, value]) => {
      const [MESURE, LCZ, CLASSE] = k.split('|');
      return { period: config.period || '2021', dims: { MESURE, LCZ, CLASSE }, measure: 'valeur', value };
    }));
  }
  cache = { at: Date.now(), rows, located, total };
  return cache;
}

async function load(config) {
  if (cache && Date.now() - cache.at < 3600e3) return cache;
  return aggregate(config);
}

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  const c = await load(config);
  return c.rows.get(geo.code) || [];
}

async function fetchMany(config, geos) {
  const c = await load(config);
  return new Map(geos.map((g) => [g.code, c.rows.get(g.code) || []]));
}

module.exports = { fetchGeo, fetchMany };
