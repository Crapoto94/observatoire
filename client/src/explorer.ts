// Logique pure de l'explorateur de données (sans React) : sélection des lignes, découpage en catégories, ratios, séries, sélection par défaut.
// Testée par tools/test-explorer.mjs avec les données réelles de l'API.
import type { DataRow } from './types';
import type { Preset, View } from './datasetViews';

export type Mode = 'brut' | 'pop' | 'part' | 'idx';

// Ratio entre deux groupes de modalités d'une même dimension : somme(num) / somme(den) × 100
export interface Ratio { dim: string; num: string[]; den: string[]; label?: string; factor?: number } // factor : 100 (pourcentage) par défaut

export interface Sel {
  x: string; // '@PERIOD', '@HIER', '@GEO' ou le code d'une dimension
  series: string; // '' | '@PERIOD' | code d'une dimension
  pins: Record<string, string>;
  period: string;
  level: number;
  parents: Record<string, string>;
  mode: Mode;
  withTotals: boolean;
  keep: Record<string, string[]>; // modalités retenues (et leur ordre) par dimension
  ratio: Ratio | null;
  band5: boolean; // regroupe les âges par tranches de 5 ans
}

export interface Ctx {
  dimNames: string[];
  hier: string[] | null;
  label: (dim: string, code: string) => string;
  geoName: (code: string) => string;
  popOf: (code: string, period?: string | null) => number | null;
}

export const MAX_CATEGORIES = 30;
export const REF_GEO = '94041';
export const isMeasureDim = (d: string) => d !== 'UNIT_MEASURE' && (d === 'MESURE' || d.endsWith('_MEASURE'));

// ---------- tri naturel des codes ----------
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

// ---------- partition automatique : retire les catégories qui en contiennent d'autres ----------
// Codes « intervalle » : Y12 = [12,12], Y15T24 = [15,24], Y_GE65 = [65,∞], Y_LT15 = [-∞,14], C_GE1, R_GE5, 1T2…
function interval(code: string): [number, number] | null {
  const m = /^[A-Za-z]*?(_LT|_GE)?(\d+)(?:T(\d+))?$/.exec(code);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === '_LT') return [-Infinity, n - 1];
  if (m[1] === '_GE') return [n, Infinity];
  return [n, m[3] ? Number(m[3]) : n];
}

export function partition(codes: string[]): string[] {
  const iv = new Map(codes.map((c) => [c, interval(c)] as const));
  return codes.filter((c) => {
    const a = iv.get(c);
    if (!a) return true;
    return !codes.some((o) => {
      const b = iv.get(o);
      return o !== c && b && a[0] <= b[0] && a[1] >= b[1] && (a[0] < b[0] || a[1] > b[1]);
    });
  });
}

// ---------- sélection ----------
export function pinnedDims(sel: Sel, ctx: Ctx) {
  const axes = [sel.x, sel.series, ...(sel.x === '@HIER' && ctx.hier ? ctx.hier : []), sel.ratio?.dim];
  return ctx.dimNames.filter((d) => d !== 'UNIT_MEASURE' && !axes.includes(d));
}

const isDim = (v: string) => v !== '' && !v.startsWith('@');

export function selectRows(rows: DataRow[], sel: Sel, ctx: Ctx): DataRow[] {
  const pinned = pinnedDims(sel, ctx);
  const hier = ctx.hier;
  const ratioCodes = sel.ratio ? new Set([...sel.ratio.num, ...sel.ratio.den]) : null;
  let out = rows.filter((r) => {
    for (const d of pinned) if (sel.pins[d] && r.dims[d] !== sel.pins[d]) return false;
    if (ratioCodes && !ratioCodes.has(r.dims[sel.ratio!.dim])) return false;
    if (sel.x !== '@PERIOD' && sel.series !== '@PERIOD' && sel.period && (r.period ?? '') !== sel.period) return false;
    if (sel.x === '@HIER' && hier) {
      if (r.dims[hier[sel.level]] === '_T') return false;
      for (let k = sel.level + 1; k < hier.length; k++) if (r.dims[hier[k]] !== '_T') return false;
      for (let k = 0; k < sel.level; k++) if (sel.parents[hier[k]] && r.dims[hier[k]] !== sel.parents[hier[k]]) return false;
    }
    return true;
  });
  // axes portés par une dimension : modalités retenues (liste explicite ou partition automatique), sans le total
  for (const dim of [sel.x, sel.series]) {
    if (!isDim(dim)) continue;
    const present = distinct(out, dim);
    const codes = present.filter((c) => c !== '_T' || sel.withTotals);
    const allowed = new Set(sel.keep[dim] ?? (sel.ratio ? present : partition(codes)));
    out = out.filter((r) => allowed.has(r.dims[dim]));
  }
  return out;
}

export function cellValue(r: DataRow, mode: Mode, ctx: Ctx): number | null {
  if (r.value == null) return null;
  if (mode !== 'pop') return r.value;
  const p = ctx.popOf(r.geo, r.period);
  return p ? (r.value / p) * 1000 : null;
}

// ---------- graphique ----------
export interface Chart {
  data: Record<string, string | number | null>[];
  names: string[];
  truncated: number;
  dupes: number;
  horizontal: boolean;
  geos: string[];
  unit: '' | '%' | 'idx';
}

const bandOf = (code: string) => {
  const m = /^Y(\d+)$/.exec(code);
  return m ? Math.floor(Number(m[1]) / 5) * 5 : null;
};

export function buildChart(selected: DataRow[], sel: Sel, ctx: Ctx): Chart {
  const { hier } = ctx;
  const xCode = (r: DataRow): string => {
    if (sel.x === '@PERIOD') return r.period ?? '—';
    if (sel.x === '@GEO') return r.geo;
    if (sel.x === '@HIER' && hier) return r.dims[hier[sel.level]];
    const c = r.dims[sel.x];
    const b = sel.band5 ? bandOf(c) : null;
    return b == null ? c : `B${String(b).padStart(3, '0')}`;
  };
  const xLabel = (c: string) => {
    if (sel.x === '@PERIOD') return c;
    if (sel.x === '@GEO') return ctx.geoName(c);
    if (/^B\d{3}$/.test(c)) return `${Number(c.slice(1))}–${Number(c.slice(1)) + 4} ans`;
    return sel.x === '@HIER' && hier ? ctx.label(hier[sel.level], c) : ctx.label(sel.x, c);
  };
  const geos = [...new Set(selected.map((r) => r.geo))];
  const multiGeo = geos.length > 1 && sel.x !== '@GEO';
  const seriesLabel = (r: DataRow) => (sel.series === '@PERIOD' ? r.period ?? '—' : ctx.label(sel.series, r.dims[sel.series]));
  const sName = (r: DataRow) => [multiGeo ? ctx.geoName(r.geo) : '', sel.series ? seriesLabel(r) : ''].filter(Boolean).join(' · ') || 'Valeur';

  const num = new Map<string, Map<string, number>>(); // x -> série -> valeur (ou numérateur)
  const den = new Map<string, Map<string, number>>();
  const seen = new Set<string>();
  let dupes = 0;
  const add = (acc: Map<string, Map<string, number>>, xv: string, n: string, v: number) => {
    const m = acc.get(xv) ?? new Map<string, number>();
    m.set(n, (m.get(n) ?? 0) + v);
    acc.set(xv, m);
  };
  for (const r of selected) {
    const xv = xCode(r), n = sName(r);
    if (sel.ratio) {
      if (r.value == null) continue;
      const c = r.dims[sel.ratio.dim];
      if (sel.ratio.num.includes(c)) add(num, xv, n, r.value);
      if (sel.ratio.den.includes(c)) add(den, xv, n, r.value);
      continue;
    }
    const v = cellValue(r, sel.mode, ctx);
    if (v == null) continue;
    const k = `${xv}|${n}`;
    if (!sel.band5 && seen.has(k)) dupes++;
    seen.add(k);
    add(num, xv, n, v);
  }
  let acc = num;
  if (sel.ratio) {
    acc = new Map();
    for (const [xv, m] of num) {
      for (const [n, v] of m) {
        const d = den.get(xv)?.get(n);
        if (d) add(acc, xv, n, (v / d) * (sel.ratio.factor ?? 100));
      }
    }
  }
  let cats = [...acc.keys()];
  let names = [...new Set([...acc.values()].flatMap((m) => [...m.keys()]))];
  const seriesKeep = isDim(sel.series) ? sel.keep[sel.series] : undefined;
  if (seriesKeep) {
    const order = (n: string) => {
      const i = seriesKeep.findIndex((c) => n.endsWith(ctx.label(sel.series, c)));
      return i < 0 ? 99 : i;
    };
    names = [...names].sort((a, b) => order(a) - order(b));
  }

  const unit: Chart['unit'] = sel.ratio ? ((sel.ratio.factor ?? 100) === 100 ? '%' : '') : sel.mode === 'part' && sel.x !== '@PERIOD' ? '%' : sel.mode === 'idx' && sel.x === '@PERIOD' ? 'idx' : '';
  if (!sel.ratio && sel.mode === 'part' && sel.x !== '@PERIOD') {
    for (const n of names) {
      const tot = cats.reduce((s, c) => s + (acc.get(c)?.get(n) ?? 0), 0);
      if (tot) cats.forEach((c) => { const m = acc.get(c)!; if (m.has(n)) m.set(n, (m.get(n)! / tot) * 100); });
    }
  }
  let truncated = 0;
  const xKeep = isDim(sel.x) ? sel.keep[sel.x] : undefined;
  if (sel.x === '@PERIOD') cats.sort(natCompare);
  else if (sel.x === '@GEO') {
    const score = (c: string) => acc.get(c)?.get(names[0]) ?? 0;
    cats.sort((a, b) => (a === REF_GEO ? -1 : b === REF_GEO ? 1 : score(b) - score(a)));
  } else if (xKeep) cats.sort((a, b) => xKeep.indexOf(a) - xKeep.indexOf(b));
  else if (cats.length > MAX_CATEGORIES && sel.x !== 'AGE' && !sel.band5) {
    const score = (c: string) => names.reduce((s, n) => s + (acc.get(c)?.get(n) ?? 0), 0);
    cats.sort((a, b) => score(b) - score(a));
    truncated = cats.length - MAX_CATEGORIES;
    cats = cats.slice(0, MAX_CATEGORIES);
  } else cats.sort(natCompare);

  // indice base 100 : première valeur de chaque série
  if (sel.mode === 'idx' && sel.x === '@PERIOD' && !sel.ratio) {
    for (const n of names) {
      const base = cats.map((c) => acc.get(c)?.get(n)).find((v) => v != null && v !== 0);
      if (base) cats.forEach((c) => { const m = acc.get(c); if (m?.has(n)) m.set(n, (m.get(n)! / base) * 100); });
    }
  }
  const data = cats.map((c) => ({ x: xLabel(c), code: c, ...Object.fromEntries(names.map((n) => [n, acc.get(c)?.get(n) ?? null])) }));
  const longest = Math.max(0, ...data.map((d) => String(d.x).length));
  const horizontal = sel.x !== '@PERIOD' && sel.x !== 'AGE' && !sel.band5 && (cats.length > 8 || longest > 18);
  return { data, names, truncated, dupes, geos, unit, horizontal };
}

// ---------- sélection par défaut / par préréglage ----------
type Spec = Partial<Pick<Preset, 'x' | 'series' | 'pins' | 'keep' | 'ratio' | 'band5' | 'mode' | 'period' | 'level'>>;

export function buildSelection(rows: DataRow[], ctx: Ctx, spec: Spec): Sel {
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
    if (spec.pins?.[d] && values[d].includes(spec.pins[d])) pins[d] = spec.pins[d];
    else if (values[d].includes('_T') && !isMeasureDim(d)) pins[d] = '_T';
    else if (isMeasureDim(d)) pins[d] = values[d].find((v) => rows.some((r) => r.dims[d] === v && r.value != null)) ?? values[d][0] ?? '';
    else pins[d] = best(d);
  }
  const periods = [...new Set(rows.map((r) => r.period ?? ''))].sort();
  let x = spec.x ?? '@PERIOD';
  if (x === '@PERIOD' && periods.length < 2) {
    x = spec.ratio ? '@GEO' : ctx.hier ? '@HIER' : dimNames.find((d) => !isMeasureDim(d) && d !== 'UNIT_MEASURE' && values[d].length > 2) ?? '@GEO';
  }
  if (isDim(x) && !dimNames.includes(x)) x = '@PERIOD';
  const series = spec.series && (spec.series === '@PERIOD' || dimNames.includes(spec.series)) ? spec.series : '';
  return {
    x, series, pins, period: spec.period ?? periods[periods.length - 1] ?? '', level: spec.level ?? 0, parents: {}, mode: spec.mode ?? 'brut',
    withTotals: false, keep: spec.keep ?? {}, ratio: spec.ratio ?? null, band5: !!spec.band5,
  };
}

export const initialSelection = (rows: DataRow[], ctx: Ctx, view: View): Sel => buildSelection(rows, ctx, view.presets?.[0] ?? view);

// ---------- carte : une valeur par commune ----------
export interface MapPick { cat: string; seriesVal: string; period: string }
export interface MapRow { geo: string; period: string | null; dims: Record<string, string>; value: number | null }

// Modalités proposées pour une dimension portée par un axe (x ou séries) : liste explicite, sinon partition sans total
export function categoryOptions(rows: DataRow[], dim: string, sel: Sel, ctx: Ctx): string[] {
  const hier = ctx.hier;
  if (dim === '@HIER' && hier) {
    const d = hier[sel.level];
    const ok = rows.filter((r) => hier.slice(sel.level + 1).every((h) => r.dims[h] === '_T'));
    return distinct(ok, d).filter((c) => c !== '_T');
  }
  if (!isDim(dim)) return [];
  const present = distinct(rows, dim).filter((c) => c !== '_T');
  return sel.keep[dim] ? sel.keep[dim].filter((c) => present.includes(c)) : partition(present);
}

// Contraintes envoyées au serveur : on ne récupère que les lignes nécessaires à la carte
export function mapConstraints(sel: Sel, ctx: Ctx, pick: MapPick): Record<string, string[]> {
  const c: Record<string, string[]> = {};
  for (const d of pinnedDims(sel, ctx)) if (sel.pins[d]) c[d] = [sel.pins[d]];
  if (sel.ratio) c[sel.ratio.dim] = [...new Set([...sel.ratio.num, ...sel.ratio.den])];
  if (isDim(sel.x) && pick.cat) c[sel.x] = [pick.cat];
  if (sel.x === '@HIER' && ctx.hier && pick.cat) {
    c[ctx.hier[sel.level]] = [pick.cat];
    ctx.hier.slice(sel.level + 1).forEach((h) => { c[h] = ['_T']; });
  }
  if (isDim(sel.series) && pick.seriesVal) c[sel.series] = [pick.seriesVal];
  return c;
}

// Valeur de chaque commune : ratio (numérateur / dénominateur) ou somme des lignes reçues (éventuellement pour 1 000 habitants)
export function mapValues(rows: MapRow[], sel: Sel, ctx: Ctx): Map<string, number> {
  const num = new Map<string, number>();
  const den = new Map<string, number>();
  for (const r of rows) {
    if (r.value == null) continue;
    if (sel.ratio) {
      const c = r.dims[sel.ratio.dim];
      if (sel.ratio.num.includes(c)) num.set(r.geo, (num.get(r.geo) ?? 0) + r.value);
      if (sel.ratio.den.includes(c)) den.set(r.geo, (den.get(r.geo) ?? 0) + r.value);
    } else {
      const v = sel.mode === 'pop' ? cellValue({ geo: r.geo, period: r.period, dims: r.dims, measure: 'valeur', value: r.value }, 'pop', ctx) : r.value;
      if (v != null) num.set(r.geo, (num.get(r.geo) ?? 0) + v);
    }
  }
  const out = new Map<string, number>();
  if (sel.ratio) {
    for (const [g, n] of num) { const d = den.get(g); if (d) out.set(g, (n / d) * (sel.ratio.factor ?? 100)); }
  } else for (const [g, v] of num) out.set(g, v);
  return out;
}

// Classes par quantiles (valeurs égales regroupées) : bornes supérieures de chaque classe
export function quantileBreaks(values: number[], classes = 6): number[] {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return [];
  const breaks: number[] = [];
  for (let k = 1; k <= classes; k++) {
    const b = v[Math.min(v.length - 1, Math.ceil((k * v.length) / classes) - 1)];
    if (!breaks.length || b > breaks[breaks.length - 1]) breaks.push(b);
  }
  return breaks;
}
