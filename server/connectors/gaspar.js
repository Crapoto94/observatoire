// Risques par commune (Géorisques, base GASPAR) : archive nationale téléchargée une fois (8 Mo), filtrée sur l'Île-de-France.
//  - arrêtés de catastrophe naturelle (catnat) : nombre par année de début et par type de risque, et cumul sur 10 ans glissants ;
//  - risques majeurs recensés dans la commune (ddrm_risq) : un indicateur par risque de premier niveau.
const JSZip = require('jszip');
const { fetchRetry } = require('./melodi');

const IDF = new Set(['75', '77', '78', '91', '92', '93', '94', '95']);
const RISQUES_NIVEAU1 = new Set(['11', '12', '16', '17', '21', '22', '23', '24']);
const URL_ZIP = 'http://files.georisques.fr/GASPAR/gaspar.zip';

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

function* records(text) {
  let head = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cells = parseLine(line.replace(/\r$/, ''));
    if (!head) { head = cells.map((h) => h.replace(/^﻿/, '').trim()); continue; }
    const r = {};
    head.forEach((h, i) => { r[h] = cells[i]; });
    yield r;
  }
}

let cache = null;

async function load() {
  if (cache && Date.now() - cache.at < 30 * 60000) return cache.byCommune;
  const res = await fetchRetry(URL_ZIP, { redirect: 'follow', signal: AbortSignal.timeout(900000) });
  if (!res.ok) throw new Error(`téléchargement GASPAR : HTTP ${res.status}`);
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const file = (prefix) => Object.values(zip.files).find((f) => f.name.startsWith(prefix));
  const thisYear = new Date().getFullYear();

  // arrêtés de catastrophe naturelle
  const perYear = new Map(); // commune -> Map(`${année}|${risque}`) -> n
  const catnat = file('catnat_gaspar');
  if (catnat) {
    for (const r of records(await catnat.async('string'))) {
      const code = r.code_commune;
      if (!code || !IDF.has(code.slice(0, 2))) continue;
      const year = String(r.date_debut || '').slice(0, 4);
      if (!/^\d{4}$/.test(year)) continue;
      const m = perYear.get(code) || perYear.set(code, new Map()).get(code);
      for (const risque of [r.num_risque_jo || 'AUTRE', '_T']) m.set(`${year}|${risque}`, (m.get(`${year}|${risque}`) ?? 0) + 1);
    }
  }
  const byCommune = new Map();
  const rowsOf = (code) => byCommune.get(code) || byCommune.set(code, []).get(code);
  for (const [code, m] of perYear) {
    const rows = rowsOf(code);
    const years = [...m.keys()].map((k) => Number(k.split('|')[0]));
    const first = Math.min(...years);
    const risques = [...new Set([...m.keys()].map((k) => k.split('|')[1]))];
    for (const risque of risques) {
      for (let y = Math.max(first, 1982); y <= thisYear; y++) {
        const n = m.get(`${y}|${risque}`) ?? 0;
        let cumul = 0;
        for (let k = y - 9; k <= y; k++) cumul += m.get(`${k}|${risque}`) ?? 0;
        if (n || risque === '_T') rows.push({ period: String(y), dims: { MESURE: 'ARRETES_CATNAT', CATNAT_TYPE: risque }, measure: 'valeur', value: n });
        if (y >= 1995 && (risque === '_T' || cumul)) rows.push({ period: String(y), dims: { MESURE: 'ARRETES_10ANS', CATNAT_TYPE: risque }, measure: 'valeur', value: cumul });
      }
    }
  }

  // risques majeurs recensés (documents départementaux sur les risques majeurs)
  const ddrm = file('ddrm_risq_gaspar');
  if (ddrm) {
    const seen = new Map();
    for (const r of records(await ddrm.async('string'))) {
      const code = r.cod_commune;
      if (!code || !IDF.has(code.slice(0, 2)) || !RISQUES_NIVEAU1.has(r.num_risque)) continue;
      (seen.get(code) || seen.set(code, new Set()).get(code)).add(r.num_risque);
    }
    for (const [code, set] of seen) {
      const rows = rowsOf(code);
      const period = String(thisYear);
      for (const risque of set) rows.push({ period, dims: { MESURE: 'RISQUES_RECENSES', RISQUE_TYPE: risque }, measure: 'valeur', value: 1 });
      rows.push({ period, dims: { MESURE: 'RISQUES_RECENSES', RISQUE_TYPE: '_T' }, measure: 'valeur', value: set.size });
    }
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
