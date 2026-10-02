// Délinquance enregistrée par commune (SSMSI, ministère de l'Intérieur) : fichier CSV compressé national (40 Mo), téléchargé une fois,
// filtré sur l'Île-de-France puis indexé par commune. Aucune clé ni API : un seul téléchargement pour toutes les communes.
const readline = require('readline');
const zlib = require('zlib');
const { Readable } = require('stream');
const { fetchRetry } = require('./melodi');

const IDF = new Set(['75', '77', '78', '91', '92', '93', '94', '95']);
const CODES = {
  'Violences physiques intrafamiliales': 'VIOL_FAMILIALES',
  'Violences physiques hors cadre familial': 'VIOL_HORS_FAMILLE',
  'Violences sexuelles': 'VIOL_SEXUELLES',
  'Vols avec armes': 'VOLS_ARMES',
  'Vols violents sans arme': 'VOLS_VIOLENTS',
  'Vols sans violence contre des personnes': 'VOLS_SANS_VIOLENCE',
  'Cambriolages de logement': 'CAMBRIOLAGES',
  'Vols de véhicule': 'VOL_VEHICULE',
  'Vols dans les véhicules': 'VOL_DANS_VEHICULE',
  "Vols d'accessoires sur véhicules": 'VOL_ACCESSOIRES',
  'Destructions et dégradations volontaires': 'DEGRADATIONS',
  'Usage de stupéfiants': 'STUP_USAGE',
  'Usage de stupéfiants (AFD)': 'STUP_USAGE_AFD',
  'Trafic de stupéfiants': 'STUP_TRAFIC',
  'Escroqueries et fraudes aux moyens de paiement': 'ESCROQUERIES',
};

function parseLine(line) {
  const cells = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ';') { cells.push(cur); cur = ''; } else cur += c;
  }
  cells.push(cur);
  return cells;
}
const num = (v) => (v == null || v === '' || v === 'NA' ? null : Number(String(v).replace(',', '.')));

let cache = null; // { at, byCommune: Map code -> lignes }

async function load(config) {
  if (cache && Date.now() - cache.at < 30 * 60000) return cache.byCommune;
  const res = await fetchRetry(`https://www.data.gouv.fr/api/1/datasets/r/${config.resource}`, { redirect: 'follow', signal: AbortSignal.timeout(1200000) });
  if (!res.ok) throw new Error(`téléchargement SSMSI : HTTP ${res.status}`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  const byCommune = new Map();
  let head = null;
  for await (const line of rl) {
    const c = parseLine(line);
    if (!head) { head = Object.fromEntries(c.map((h, i) => [h.replace(/^﻿/, ''), i])); continue; }
    const code = c[0];
    if (!IDF.has(code.slice(0, 2))) continue;
    if (c[head.est_diffuse] !== 'diff') continue; // secret statistique : valeur non diffusée
    const infra = CODES[c[head.indicateur]];
    if (!infra) continue;
    const period = c[head.annee];
    const nombre = num(c[head.nombre]), taux = num(c[head.taux_pour_mille]);
    const rows = byCommune.get(code) || byCommune.set(code, []).get(code);
    if (nombre != null) rows.push({ period, dims: { MESURE: 'NOMBRE', INFRACTION: infra }, measure: 'valeur', value: nombre });
    if (taux != null) rows.push({ period, dims: { MESURE: 'TAUX_MILLE', INFRACTION: infra }, measure: 'valeur', value: taux });
  }
  cache = { at: Date.now(), byCommune };
  return byCommune;
}

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  return (await load(config)).get(geo.code) || [];
}

async function fetchMany(config, geos) {
  const idx = await load(config);
  return new Map(geos.map((g) => [g.code, idx.get(g.code) || []]));
}

module.exports = { fetchGeo, fetchMany, CODES };
