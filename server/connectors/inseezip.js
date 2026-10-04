// Fichiers CSV zippés publiés sur insee.fr (ex. bénéficiaires de l'assurance maladie et de la C2S dans les QPV et leurs communes).
// config.sources : [{ period, url, file (expression du nom du CSV dans l'archive) }] ; config.columns : [{ field, measure }] ;
// config.sum : [{ measure, fields }] mesures calculées par addition de colonnes. Archive gardée en mémoire 6 heures.
const JSZip = require('jszip');
const { fetchRetry } = require('./melodi');

const cache = new Map();
async function tableOf(src) {
  const c = cache.get(src.url);
  if (c && Date.now() - c.at < 6 * 3600 * 1000) return c.map;
  const r = await fetchRetry(src.url);
  const zip = await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()));
  const re = new RegExp(src.file, 'i');
  const name = Object.keys(zip.files).find((n) => re.test(n));
  if (!name) throw new Error(`fichier « ${src.file} » absent de l'archive ${src.url}`);
  const text = (await zip.files[name].async('string')).replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const unq = (v) => v.trim().replace(/^"(.*)"$/, '$1');
  const head = lines[0].split(';').map(unq);
  const map = new Map();
  for (const l of lines.slice(1)) {
    const cells = l.split(';').map(unq);
    map.set(cells[head.indexOf('CODGEO')], Object.fromEntries(head.map((h, k) => [h, cells[k]])));
  }
  cache.set(src.url, { at: Date.now(), map });
  return map;
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));

function rowsOf(config, rec, period) {
  if (!rec || (rec.NOTE && rec.NOTE !== '0')) return []; // NOTE ≠ 0 : valeurs non diffusées (secret statistique)
  const out = config.columns.map((c) => ({ period, dims: { MESURE: c.measure }, measure: 'valeur', value: num(rec[c.field]) })).filter((r) => r.value != null);
  for (const s of config.sum || []) {
    const vals = s.fields.map((f) => num(rec[f]));
    if (vals.every((v) => v != null)) out.push({ period, dims: { MESURE: s.measure }, measure: 'valeur', value: vals.reduce((a, b) => a + b, 0) });
  }
  return out;
}

/** Une commune (absente du fichier : aucune ligne, ex. commune sans quartier prioritaire). */
async function fetchGeo(config, geo) {
  if ((geo.level || 'COM') !== 'COM') return null;
  const rows = [];
  for (const src of config.sources) rows.push(...rowsOf(config, (await tableOf(src)).get(geo.code), src.period));
  return rows;
}

/** Plusieurs communes : un téléchargement par millésime. */
async function fetchMany(config, geos) {
  const comm = geos.filter((g) => (g.level || 'COM') === 'COM');
  const out = new Map(comm.map((g) => [g.code, []]));
  for (const src of config.sources) {
    const t = await tableOf(src);
    for (const g of comm) out.get(g.code).push(...rowsOf(config, t.get(g.code), src.period));
  }
  return out;
}

module.exports = { fetchGeo, fetchMany };
