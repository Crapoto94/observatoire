// Professionnels de santé par commune : annuaire francilien (Région Île-de-France, 350 000 lignes, une ligne par acte).
// L'export CSV est téléchargé une fois ; les professionnels sont dédoublonnés (nom, adresse, profession) puis comptés par commune.
const { fetchRetry } = require('./melodi');

const URL = 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/annuaire-et-localisation-des-professionnels-de-sante/exports/csv';

const FAMILLE = (p) => {
  const t = String(p).toLowerCase();
  if (t.startsWith('médecin généraliste') || t.startsWith('medecin generaliste')) return 'GENERALISTE';
  if (t.startsWith('chirurgien-dentiste')) return 'DENTISTE';
  if (t.startsWith('sage-femme')) return 'SAGE_FEMME';
  if (t.startsWith('pédiatre') || t.startsWith('pediatre')) return 'PEDIATRE';
  if (t.startsWith('psychiatre')) return 'PSYCHIATRE';
  if (t.includes('gynécolog') || t.includes('gynecolog')) return 'GYNECOLOGUE';
  if (t.startsWith('ophtalmo')) return 'OPHTALMOLOGUE';
  return 'AUTRE_SPECIALISTE';
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

let cache = null;

async function load() {
  if (cache && Date.now() - cache.at < 60 * 60000) return cache.byCommune;
  const p = new URLSearchParams({
    select: 'code_insee,libelle_profession,nom,adresse', limit: '-1', delimiter: ';', use_labels: 'false',
    where: 'dep_code in ("75","77","78","91","92","93","94","95")',
  });
  const res = await fetchRetry(`${URL}?${p}`, { signal: AbortSignal.timeout(900000) });
  if (!res.ok) throw new Error(`export annuaire santé : HTTP ${res.status}`);
  const lines = (await res.text()).split('\n');
  const head = parseLine((lines.shift() || '').replace(/^﻿/, '').replace(/\r$/, '')).map((h) => h.trim());
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const seen = new Set();
  const counts = new Map(); // commune -> Map(famille -> n)
  for (const line of lines) {
    if (!line) continue;
    const c = parseLine(line.replace(/\r$/, ''));
    const code = c[ix.code_insee], prof = c[ix.libelle_profession];
    if (!code || !prof) continue;
    const key = `${code}|${c[ix.nom]}|${c[ix.adresse]}|${prof}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const m = counts.get(code) || counts.set(code, new Map()).get(code);
    for (const f of [FAMILLE(prof), '_T']) m.set(f, (m.get(f) ?? 0) + 1);
  }
  const period = String(new Date().getFullYear());
  const byCommune = new Map();
  for (const [code, m] of counts) {
    byCommune.set(code, [...m.entries()].map(([f, n]) => ({ period, dims: { MESURE: 'PROFESSIONNELS', PROFESSION: f }, measure: 'valeur', value: n })));
  }
  cache = { at: Date.now(), byCommune };
  return byCommune;
}

async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  return (await load()).get(geo.code) || [];
}
async function fetchMany(config, geos) {
  const idx = await load();
  return new Map(geos.map((g) => [g.code, idx.get(g.code) || []]));
}

module.exports = { fetchGeo, fetchMany };
