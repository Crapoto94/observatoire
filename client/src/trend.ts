// Évolution d'une série dans le temps : variation, taux annuel moyen, tendance et projections linéaires.
export interface Point { t: number; v: number }

/** Année (décimale pour les trimestres) d'une période : « 2023 » → 2023, « 2026-T1 » → 2026,0 ; null si non datable. */
export function yearOf(period: string | null | undefined): number | null {
  const m = /^(\d{4})(?:-(?:T|Q)([1-4]))?/.exec(String(period ?? ''));
  if (!m) return null;
  return Number(m[1]) + (m[2] ? (Number(m[2]) - 1) / 4 : 0);
}

export interface Trend {
  n: number;
  first: Point; last: Point;
  abs: number; // variation absolue
  pct: number | null; // variation relative (%)
  annual: number | null; // taux de croissance annuel moyen (%)
  dir: 'up' | 'down' | 'flat';
  slope: number; // pente par an (régression linéaire sur les derniers points)
  proj1: number | null;
  proj5: number | null;
  years: number;
}

const STABLE = 0.5; // % par an en deçà duquel la série est jugée stable

export function trendOf(points: Point[], window = 6): Trend | null {
  const pts = points.filter((p) => Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const years = last.t - first.t;
  if (years <= 0) return null;
  const abs = last.v - first.v;
  const pct = first.v !== 0 ? (abs / Math.abs(first.v)) * 100 : null;
  const annual = first.v > 0 && last.v > 0 ? (Math.pow(last.v / first.v, 1 / years) - 1) * 100 : null;
  // régression linéaire sur les derniers points
  const w = pts.slice(-window);
  let slope = (last.v - first.v) / years, proj1: number | null = null, proj5: number | null = null;
  if (w.length >= 3) {
    const mt = w.reduce((s, p) => s + p.t, 0) / w.length, mv = w.reduce((s, p) => s + p.v, 0) / w.length;
    const sxx = w.reduce((s, p) => s + (p.t - mt) ** 2, 0);
    if (sxx > 0) {
      slope = w.reduce((s, p) => s + (p.t - mt) * (p.v - mv), 0) / sxx;
      const nonNeg = pts.every((p) => p.v >= 0);
      const at = (t: number) => { const y = mv + slope * (t - mt); return nonNeg ? Math.max(0, y) : y; };
      proj1 = at(last.t + 1);
      proj5 = at(last.t + 5);
    }
  }
  const rel = annual ?? (first.v !== 0 ? (slope / Math.abs(first.v)) * 100 : 0);
  const dir: Trend['dir'] = Math.abs(rel) < STABLE ? 'flat' : rel > 0 ? 'up' : 'down';
  return { n: pts.length, first, last, abs, pct, annual, dir, slope, proj1, proj5, years };
}

/** Projection linéaire entre deux observations (carte) : valeur à +h années après la seconde. */
export function project(a: Point, b: Point, h: number): number | null {
  const dt = b.t - a.t;
  if (dt <= 0) return null;
  const y = b.v + ((b.v - a.v) / dt) * h;
  return a.v >= 0 && b.v >= 0 ? Math.max(0, y) : y;
}
