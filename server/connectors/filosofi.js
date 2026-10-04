// Filosofi (INSEE) : revenus localisés sociaux et fiscaux par commune.
// Millésimes disponibles :
//  - 2023 et 2021 : jeux Melodi (DS_FILOSOFI_CC, DS_FILOSOFI_CC_2021), déjà au format long ;
//  - antérieurs à 2021 : plus diffusés par l'API, seulement en fichiers (« indice de structure et de
//    distribution des revenus »), lus ici puis ramenés au format long des observations Melodi.
// Les deux voies produisent les mêmes lignes { period, dims, measure, value } : une seule série par commune.
const JSZip = require('jszip');
const melodi = require('./melodi');
const bulk = require('./bulk');

const geoId = (g) => `2025-${g.level || 'COM'}-${g.code}`;

// Colonnes des fichiers larges -> codes FILOSOFI_MEASURE et unités de Melodi.
const COLONNES = {
  D1: ['D1_SL', 'EUR_YR'], D2: ['D2_SL', 'EUR_YR'], D3: ['D3_SL', 'EUR_YR'], D4: ['D4_SL', 'EUR_YR'],
  D6: ['D6_SL', 'EUR_YR'], D7: ['D7_SL', 'EUR_YR'], D8: ['D8_SL', 'EUR_YR'], D9: ['D9_SL', 'EUR_YR'],
  Q1: ['Q1_SL', 'EUR_YR'], Q2: ['MED_SL', 'EUR_YR'], Q3: ['Q3_SL', 'EUR_YR'], Q3_Q1: ['IQR_SL', 'EUR_YR'],
  RD: ['IR_D9_D1_SL', 'NR'], GI: ['GI_SL', 'NR'], S80S: ['S80S20_SL', 'NR'],
  PACT: ['S_EI_DI', 'PT'], PTSA: ['S_EI_DI_SAL', 'PT'], PCHO: ['S_EI_DI_UNE', 'PT'], PBEN: ['S_EI_DI_N_SAL', 'PT'],
  PPEN: ['S_RET_PEN_DI', 'PT'], PPAT: ['S_INC_ASS_DI', 'PT'], PPSOC: ['S_SOC_BEN_DI', 'PT'],
  PPFAM: ['S_SOC_BEN_DI_FAM_BEN', 'PT'], PPLOGT: ['S_SOC_BEN_DI_HOU_BEN', 'PT'], PPMINI: ['S_SOC_BEN_DI_MIN_SOC', 'PT'],
  PIMPOT: ['S_DIR_TAX_DI', 'PT'],
};
const PAUVRES = { TP60: 'PR_MD60' };

const nombre = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (!s || /^[sn]$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Découpe une ligne CSV (séparateur « ; », guillemets optionnels).
function cells(line, sep = ';') {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

// Lit un fichier large d'un millésime et range ses lignes par commune.
async function loadFichier(fichier, parCommune) {
  const res = await melodi.fetchRetry(fichier.url, { redirect: 'follow', signal: AbortSignal.timeout(900000) });
  if (!res.ok) throw new Error(`téléchargement Filosofi ${fichier.year} : HTTP ${res.status}`);
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const suffixe = String(fichier.year).slice(2);
  for (const [nom, entry] of Object.entries(zip.files)) {
    // seuls les fichiers « revenu disponible » (DISP) portent les mesures de Melodi : MED_SL, PR_MD60…
    const theme = /^FILO\d{4}_DISP(_PAUVRES)?_COM\.csv$/i.exec(nom);
    if (!theme || entry.dir) continue;
    const texte = await entry.async('string');
    const lignes = texte.replace(/^\uFEFF/, '').split(/\r?\n/);
    const entete = cells(lignes[0]);
    for (const ligne of lignes.slice(1)) {
      if (!ligne) continue;
      const valeurs = cells(ligne);
      const code = valeurs[0];
      if (!/^\d{4,5}$/.test(code)) continue;
      const rows = parCommune.get(code) || parCommune.set(code, []).get(code);
      const dims = (mesure, unite) => ({ FILOSOFI_MEASURE: mesure, UNIT_MEASURE: unite, UNIT_MULT: '0' });
      const pauvres = !!theme[1];
      const period = String(fichier.year);
      for (let i = 1; i < entete.length; i++) {
        const col = entete[i];
        const val = nombre(valeurs[i]);
        if (val == null) continue;
        // la plupart des colonnes portent le millésime en suffixe (Q220), pas toutes (RD, Q3_Q1)
        const base = new RegExp(`^([A-Z0-9_]+)${suffixe}$`).exec(col)?.[1] || col;
        if (pauvres && PAUVRES[base]) {
          rows.push({ period, dims: dims(PAUVRES[base], 'PT'), measure: 'OBS_VALUE_NIVEAU', value: val });
        } else if (!pauvres && COLONNES[base]) {
          const [mesure, unite] = COLONNES[base];
          rows.push({ period, dims: dims(mesure, unite), measure: 'OBS_VALUE_NIVEAU', value: val });
        }
      }
    }
  }
}

const jeuxOf = (config) => config.jeux || (config.ds ? [config.ds] : []);
const aFichiers = (config) => (config.fichiers || []).length > 0;

// Cache par liste de fichiers (le jeu API et le jeu « fichiers » sont distincts dans un même processus).
const caches = new Map(); // clé -> { at, parCommune }

async function load(config) {
  const cle = (config.fichiers || []).map((f) => f.url).join('|');
  const hit = caches.get(cle);
  if (hit && Date.now() - hit.at < 60 * 60000) return hit.parCommune;
  const parCommune = new Map();
  for (const fichier of config.fichiers || []) await loadFichier(fichier, parCommune);
  caches.set(cle, { at: Date.now(), parCommune });
  return parCommune;
}

const melodiRows = async (jeu, geo) => melodi.fetchGeo({ ds: jeu }, geoId(geo));

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  const rows = [];
  for (const jeu of jeuxOf(config)) rows.push(...(await melodiRows(jeu, geo)));
  if (aFichiers(config)) rows.push(...((await load(config)).get(geo.code) || []));
  return rows;
}

async function fetchMany(config, geos, log) {
  const melodiMap = new Map();
  for (const jeu of jeuxOf(config)) {
    const m = await bulk.melodiMany({ ds: jeu }, geos, geoId);
    for (const [code, rows] of m) (melodiMap.get(code) || melodiMap.set(code, []).get(code)).push(...rows);
  }
  const parCommune = aFichiers(config) ? await load(config) : new Map();
  if (log && aFichiers(config)) {
    const annees = [...new Set([...parCommune.values()].flat().map((r) => r.period))].sort();
    log(`millésimes importés par fichier : ${annees.join(', ') || 'aucun'}`);
  }
  return new Map(geos.map((g) => [g.code, [...(melodiMap.get(g.code) || []), ...(parCommune.get(g.code) || [])]]));
}

module.exports = { fetchGeo, fetchMany };
