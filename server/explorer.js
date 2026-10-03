// Portage serveur de client/src/explorer.ts : mêmes règles de sélection / agrégation, pour
// reconstruire les graphiques du tableau de bord côté serveur (génération de PDF, envoi par e-mail,
// tâches planifiées). Toute évolution doit rester synchronisée avec la version du navigateur.
const MAX_CATEGORIES = 30;
const REF_GEO = '94041';
const isMeasureDim = (d) => d !== 'UNIT_MEASURE' && (d === 'MESURE' || d.endsWith('_MEASURE'));

const codeRank = (c) => (c.includes('_LT') ? -1 : c.includes('_GE') ? 1 : 0);
function natCompare(a, b) {
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
const distinct = (rows, dim) => [...new Set(rows.map((r) => r.dims[dim]).filter((v) => v != null))].sort(natCompare);

function interval(code) {
  const m = /^[A-Za-z]*?(_LT|_GE)?(\d+)(?:T(\d+))?$/.exec(code);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === '_LT') return [-Infinity, n - 1];
  if (m[1] === '_GE') return [n, Infinity];
  return [n, m[3] ? Number(m[3]) : n];
}
function partition(codes) {
  const iv = new Map(codes.map((c) => [c, interval(c)]));
  return codes.filter((c) => {
    const a = iv.get(c);
    if (!a) return true;
    return !codes.some((o) => {
      const b = iv.get(o);
      return o !== c && b && a[0] <= b[0] && a[1] >= b[1] && (a[0] < b[0] || a[1] > b[1]);
    });
  });
}

function pinnedDims(sel, ctx) {
  const axes = [sel.x, sel.series, ...(sel.x === '@HIER' && ctx.hier ? ctx.hier : []), sel.ratio?.dim];
  return ctx.dimNames.filter((d) => d !== 'UNIT_MEASURE' && !axes.includes(d));
}
const isDim = (v) => v !== '' && !v.startsWith('@');

function selectRows(rows, sel, ctx) {
  const pinned = pinnedDims(sel, ctx);
  const hier = ctx.hier;
  const ratioCodes = sel.ratio ? new Set([...sel.ratio.num, ...sel.ratio.den]) : null;
  let out = rows.filter((r) => {
    for (const d of pinned) if (sel.pins[d] && r.dims[d] !== sel.pins[d]) return false;
    if (ratioCodes && !ratioCodes.has(r.dims[sel.ratio.dim])) return false;
    if (sel.x !== '@PERIOD' && sel.series !== '@PERIOD' && sel.period && (r.period ?? '') !== sel.period) return false;
    if (sel.x === '@HIER' && hier) {
      if (r.dims[hier[sel.level]] === '_T') return false;
      for (let k = sel.level + 1; k < hier.length; k++) if (r.dims[hier[k]] !== '_T') return false;
      for (let k = 0; k < sel.level; k++) if (sel.parents[hier[k]] && r.dims[hier[k]] !== sel.parents[hier[k]]) return false;
    }
    return true;
  });
  for (const dim of [sel.x, sel.series]) {
    if (!isDim(dim)) continue;
    const present = distinct(out, dim);
    const codes = present.filter((c) => c !== '_T' || sel.withTotals);
    const allowed = new Set(sel.keep[dim] ?? (sel.ratio ? present : partition(codes)));
    out = out.filter((r) => allowed.has(r.dims[dim]));
  }
  return out;
}

function cellValue(r, mode, ctx) {
  if (r.value == null) return null;
  if (mode !== 'pop') return r.value;
  const p = ctx.popOf(r.geo, r.period);
  return p ? (r.value / p) * 1000 : null;
}

const bandOf = (code) => { const m = /^Y(\d+)$/.exec(code); return m ? Math.floor(Number(m[1]) / 5) * 5 : null; };

function buildChart(selected, sel, ctx) {
  const { hier } = ctx;
  const xCode = (r) => {
    if (sel.x === '@PERIOD') return r.period ?? '—';
    if (sel.x === '@GEO') return r.geo;
    if (sel.x === '@HIER' && hier) return r.dims[hier[sel.level]];
    const c = r.dims[sel.x];
    const b = sel.band5 ? bandOf(c) : null;
    return b == null ? c : `B${String(b).padStart(3, '0')}`;
  };
  const xLabel = (c) => {
    if (sel.x === '@PERIOD') return c;
    if (sel.x === '@GEO') return ctx.geoName(c);
    if (/^B\d{3}$/.test(c)) return `${Number(c.slice(1))}–${Number(c.slice(1)) + 4} ans`;
    return sel.x === '@HIER' && hier ? ctx.label(hier[sel.level], c) : ctx.label(sel.x, c);
  };
  const geos = [...new Set(selected.map((r) => r.geo))];
  const multiGeo = geos.length > 1 && sel.x !== '@GEO';
  const seriesLabel = (r) => (sel.series === '@PERIOD' ? r.period ?? '—' : ctx.label(sel.series, r.dims[sel.series]));
  const sName = (r) => [multiGeo ? ctx.geoName(r.geo) : '', sel.series ? seriesLabel(r) : ''].filter(Boolean).join(' · ') || 'Valeur';

  const num = new Map(); const den = new Map(); const seen = new Set(); let dupes = 0;
  const add = (acc, xv, n, v) => { const m = acc.get(xv) ?? new Map(); m.set(n, (m.get(n) ?? 0) + v); acc.set(xv, m); };
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
    for (const [xv, m] of num) for (const [n, v] of m) { const d = den.get(xv)?.get(n); if (d) add(acc, xv, n, (v / d) * (sel.ratio.factor ?? 100)); }
  }
  let cats = [...acc.keys()];
  let names = [...new Set([...acc.values()].flatMap((m) => [...m.keys()]))];
  const seriesKeep = isDim(sel.series) ? sel.keep[sel.series] : undefined;
  if (seriesKeep) {
    const order = (n) => { const i = seriesKeep.findIndex((c) => n.endsWith(ctx.label(sel.series, c))); return i < 0 ? 99 : i; };
    names = [...names].sort((a, b) => order(a) - order(b));
  }
  const unit = sel.ratio ? ((sel.ratio.factor ?? 100) === 100 ? '%' : '') : sel.mode === 'part' && sel.x !== '@PERIOD' ? '%' : sel.mode === 'idx' && sel.x === '@PERIOD' ? 'idx' : '';
  if (!sel.ratio && sel.mode === 'part' && sel.x !== '@PERIOD') {
    for (const n of names) {
      const tot = cats.reduce((s, c) => s + (acc.get(c)?.get(n) ?? 0), 0);
      if (tot) cats.forEach((c) => { const m = acc.get(c); if (m.has(n)) m.set(n, (m.get(n) / tot) * 100); });
    }
  }
  let truncated = 0;
  const xKeep = isDim(sel.x) ? sel.keep[sel.x] : undefined;
  if (sel.x === '@PERIOD') cats.sort(natCompare);
  else if (sel.x === '@GEO') { const score = (c) => acc.get(c)?.get(names[0]) ?? 0; cats.sort((a, b) => (a === REF_GEO ? -1 : b === REF_GEO ? 1 : score(b) - score(a))); }
  else if (xKeep) cats.sort((a, b) => xKeep.indexOf(a) - xKeep.indexOf(b));
  else if (cats.length > MAX_CATEGORIES && sel.x !== 'AGE' && !sel.band5) {
    const score = (c) => names.reduce((s, n) => s + (acc.get(c)?.get(n) ?? 0), 0);
    cats.sort((a, b) => score(b) - score(a)); truncated = cats.length - MAX_CATEGORIES; cats = cats.slice(0, MAX_CATEGORIES);
  } else cats.sort(natCompare);

  if (sel.mode === 'idx' && sel.x === '@PERIOD' && !sel.ratio) {
    for (const n of names) {
      const base = cats.map((c) => acc.get(c)?.get(n)).find((v) => v != null && v !== 0);
      if (base) cats.forEach((c) => { const m = acc.get(c); if (m?.has(n)) m.set(n, (m.get(n) / base) * 100); });
    }
  }
  const data = cats.map((c) => ({ x: xLabel(c), code: c, ...Object.fromEntries(names.map((n) => [n, acc.get(c)?.get(n) ?? null])) }));
  const longest = Math.max(0, ...data.map((d) => String(d.x).length));
  const horizontal = sel.x !== '@PERIOD' && sel.x !== 'AGE' && !sel.band5 && (cats.length > 8 || longest > 18);
  return { data, names, truncated, dupes, geos, unit, horizontal };
}

// Reconstruit le graphique d'une tuile à partir des lignes stockées et de la configuration enregistrée.
function buildConfigRows(rows, cfg, extras = {}) {
  const sel = {
    x: cfg.x, series: cfg.series, pins: cfg.pins, period: cfg.period, level: cfg.level, parents: cfg.parents,
    mode: cfg.mode, withTotals: cfg.withTotals, keep: cfg.keep, ratio: cfg.ratio, band5: cfg.band5,
  };
  const keepGeos = new Set(cfg.geoCodes?.length ? cfg.geoCodes : []);
  const scoped = keepGeos.size ? rows.filter((r) => keepGeos.has(r.geo)) : rows;
  const dimNames = cfg.dimNames?.length ? cfg.dimNames : [...new Set(scoped.flatMap((r) => Object.keys(r.dims)))];
  const labels = cfg.labels ?? {};
  const label = (dim, code) => labels[dim]?.values?.[code] ?? (code === '_T' ? 'Total' : code === '_Z' ? 'Non renseigné' : code);
  const geoName = (code) => cfg.geoNames?.[code] ?? extras.geoNames?.[code] ?? extras.geoName?.(code) ?? code;
  const series = (code) => cfg.popSeries?.[code] ?? extras.popSeries?.[code];
  const popOf = (code, per) => {
    const s = series(code);
    if (!s) return null;
    const years = Object.keys(s);
    const y = Number(String(per ?? '').slice(0, 4));
    if (!years.length) return null;
    if (!y) return s[years[years.length - 1]] ?? null;
    const best = years.reduce((a, b) => (Math.abs(Number(b) - y) < Math.abs(Number(a) - y) ? b : a));
    return s[best] ?? null;
  };
  const ctx = { dimNames, hier: cfg.hier, label, geoName, popOf };
  const selected = selectRows(scoped, sel, ctx);
  return buildChart(selected, sel, ctx);
}

module.exports = { selectRows, buildChart, buildConfigRows, distinct, partition, natCompare, cellValue, isMeasureDim, MAX_CATEGORIES, REF_GEO };
