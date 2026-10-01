// Logique pure de l'explorateur de données (sans React) : sélection des lignes, construction des séries, sélection par défaut.
// Testée par tools/test-explorer.mjs avec les données réelles de l'API.
import type { DataRow } from './types';
import type { View } from './datasetViews';

export type Mode = 'brut' | 'pop' | 'part';

export interface Sel {
  x: string; // '@PERIOD', '@HIER' ou le code d'une dimension
  series: string;
  pins: Record<string, string>;
  period: string;
  level: number;
  parents: Record<string, string>;
  mode: Mode;
  withTotals: boolean;
}

export interface Ctx {
  dimNames: string[];
  hier: string[] | null;
  label: (dim: string, code: string) => string;
  geoName: (code: string) => string;
  popOf: (code: string) => number | null;
}

export const MAX_CATEGORIES = 30;
export const isMeasureDim = (d: string) => d !== 'UNIT_MEASURE' && (d === 'MESURE' || d.endsWith('_MEASURE'));

// tri naturel des codes (Y0, Y1, Y2, … Y10) avec « moins de » en tête et « ou plus » en queue
const codeRank = (c: string) => (c.includes('_LT') ? -1 : c.includes('_GE') ? 1 : 0);
export function natCompare(a: string, b: string) {
  const ra = codeRank(a), rb = codeRank(b);
  if (ra !== rb) return ra - rb;
  const pa = a.match(/\d+|\D+/g) ?? [], pb = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const na = Number(pa[i]), nb = Number(pb[i]);
    const d = Number.isNaN(na) || Number.isNaN(nb) ? pa[i].localeCompare(pb[i]) : na - nb;
    if (d) return d;
  }
  return pa.length - pb.length;
}

export const distinct = (rows: DataRow[], dim: string) => [...new Set(rows.map((r) => r.dims[dim]).filter((v) => v != null))].sort(natCompare);

// Dimensions « figées » à une seule modalité : toutes sauf celles portées par les axes
export function pinnedDims(sel: Sel, ctx: Ctx) {
  const axes = [sel.x, sel.series, ...(sel.x === '@HIER' && ctx.hier ? ctx.hier : [])];
  return ctx.dimNames.filter((d) => d !== 'UNIT_MEASURE' && !axes.includes(d));
}

export function selectRows(rows: DataRow[], sel: Sel, ctx: Ctx): DataRow[] {
  const pinned = pinnedDims(sel, ctx);
  const hier = ctx.hier;
  return rows.filter((r) => {
    for (const d of pinned) if (sel.pins[d] && r.dims[d] !== sel.pins[d]) return false;
    if (sel.x !== '@PERIOD' && sel.period && (r.period ?? '') !== sel.period) return false;
    if (!sel.withTotals) {
      if (sel.x !== '@PERIOD' && sel.x !== '@HIER' && r.dims[sel.x] === '_T') return false;
      if (sel.series && r.dims[sel.series] === '_T') return false;
    }
    if (sel.x === '@HIER' && hier) {
      if (r.dims[hier[sel.level]] === '_T') return false;
      for (let k = sel.level + 1; k < hier.length; k++) if (r.dims[hier[k]] !== '_T') return false;
      for (let k = 0; k < sel.level; k++) if (sel.parents[hier[k]] && r.dims[hier[k]] !== sel.parents[hier[k]]) return false;
    }
    return true;
  });
}

export function cellValue(r: DataRow, mode: Mode, ctx: Ctx): number | null {
  if (r.value == null) return null;
  if (mode !== 'pop') return r.value;
  const p = ctx.popOf(r.geo);
  return p ? (r.value / p) * 1000 : null;
}

export interface Chart {
  data: Record<string, string | number | null>[];
  names: string[];
  truncated: number;
  dupes: number;
  horizontal: boolean;
  geos: string[];
}

export function buildChart(selected: DataRow[], sel: Sel, ctx: Ctx): Chart {
  const { hier } = ctx;
  const xOf = (r: DataRow) => (sel.x === '@PERIOD' ? r.period ?? '—' : sel.x === '@HIER' && hier ? r.dims[hier[sel.level]] : r.dims[sel.x]);
  const xLabel = (c: string) => (sel.x === '@PERIOD' ? c : sel.x === '@HIER' && hier ? ctx.label(hier[sel.level], c) : ctx.label(sel.x, c));
  const geos = [...new Set(selected.map((r) => r.geo))];
  const multiGeo = geos.length > 1;
  const acc = new Map<string, Map<string, number>>(); // x -> série -> valeur
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of selected) {
    const v = cellValue(r, sel.mode, ctx);
    if (v == null) continue;
    const sName = [multiGeo ? ctx.geoName(r.geo) : '', sel.series ? ctx.label(sel.series, r.dims[sel.series]) : ''].filter(Boolean).join(' · ') || 'Valeur';
    const xv = xOf(r);
    const k = `${xv}|${sName}`;
    if (seen.has(k)) dupes++;
    seen.add(k);
    const m = acc.get(xv) ?? new Map<string, number>();
    m.set(sName, (m.get(sName) ?? 0) + v);
    acc.set(xv, m);
  }
  let cats = [...acc.keys()];
  const names = [...new Set([...acc.values()].flatMap((m) => [...m.keys()]))];
  if (sel.mode === 'part' && sel.x !== '@PERIOD') {
    for (const n of names) {
      const tot = cats.reduce((s, c) => s + (acc.get(c)?.get(n) ?? 0), 0);
      if (tot) cats.forEach((c) => { const m = acc.get(c)!; if (m.has(n)) m.set(n, (m.get(n)! / tot) * 100); });
    }
  }
  let truncated = 0;
  if (sel.x === '@PERIOD') cats.sort(natCompare);
  else if (cats.length > MAX_CATEGORIES && sel.x !== 'AGE') {
    const score = (c: string) => names.reduce((s, n) => s + (acc.get(c)?.get(n) ?? 0), 0);
    cats.sort((a, b) => score(b) - score(a));
    truncated = cats.length - MAX_CATEGORIES;
    cats = cats.slice(0, MAX_CATEGORIES);
  } else cats.sort(natCompare);
  const data = cats.map((c) => ({ x: xLabel(c), code: c, ...Object.fromEntries(names.map((n) => [n, acc.get(c)?.get(n) ?? null])) }));
  const longest = Math.max(0, ...data.map((d) => String(d.x).length));
  return { data, names, truncated, dupes, geos, horizontal: sel.x !== '@PERIOD' && (cats.length > 8 || longest > 18) && sel.x !== 'AGE' };
}

// Sélection par défaut à l'ouverture d'un jeu
export function initialSelection(rows: DataRow[], ctx: Ctx, view: View): Sel {
  const dimNames = ctx.dimNames;
  const values: Record<string, string[]> = {};
  dimNames.forEach((d) => { values[d] = distinct(rows, d); });
  const best = (dim: string) => {
    const sums = new Map<string, number>();
    rows.forEach((r) => { const v = r.dims[dim]; if (v != null && r.value != null) sums.set(v, (sums.get(v) ?? 0) + Math.abs(r.value)); });
    return [...sums.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  };
  const pins: Record<string, string> = {};
  for (const d of dimNames) {
    if (d === 'UNIT_MEASURE') continue;
    if (view.pins?.[d] && values[d].includes(view.pins[d])) pins[d] = view.pins[d];
    else if (values[d].includes('_T') && !isMeasureDim(d)) pins[d] = '_T';
    else if (isMeasureDim(d)) {
      // première mesure qui a réellement des valeurs (certaines ne sont pas diffusées)
      pins[d] = values[d].find((v) => rows.some((r) => r.dims[d] === v && r.value != null)) ?? values[d][0] ?? '';
    } else pins[d] = best(d);
  }
  const periods = [...new Set(rows.map((r) => r.period ?? ''))].sort();
  let x = view.x ?? '@PERIOD';
  if (x === '@PERIOD' && periods.length < 2) {
    x = ctx.hier ? '@HIER' : dimNames.find((d) => !isMeasureDim(d) && d !== 'UNIT_MEASURE' && values[d].length > 2) ?? '@PERIOD';
  }
  if (x !== '@PERIOD' && x !== '@HIER' && !dimNames.includes(x)) x = '@PERIOD';
  return { x, series: view.series && dimNames.includes(view.series) ? view.series : '', pins, period: periods[periods.length - 1] ?? '', level: 0, parents: {}, mode: 'brut', withTotals: false };
}
