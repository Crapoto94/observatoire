import type { Multi } from './badges';
import type { Indicator } from './types';

// Valeur calculée d'une fiche de conception (KPI rattaché) et fiabilité : règles communes à la conception et au pilotage.

export interface KpiVal {
  prive?: boolean; multi?: Multi; id: string; label: string; unit: string; value: number | null; period: string | null;
  prev: { period: string; value: number } | null; dep: { value: number } | null; dataset: string;
}

export const fmtVal = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2 }).replace(/ /g, ' ');

// fiches « évolution… » : la valeur est la variation par rapport à la période précédente (points pour un pourcentage, % sinon)
export const isEvolution = (libelle: string) => /^[ée]volution/i.test(libelle.trim());
export function evolutionOf(k: KpiVal) {
  if (!k.prev || k.value == null) return null;
  const d = k.value - k.prev.value;
  if (k.unit === '%') return { d, txt: `${d >= 0 ? '+' : '−'}${fmtVal(Math.abs(d))}`, unit: 'pt' };
  if (!k.prev.value) return null;
  const pct = (d / Math.abs(k.prev.value)) * 100;
  return { d, txt: `${pct >= 0 ? '+' : '−'}${fmtVal(Math.abs(pct))}`, unit: '%' };
}

export type FiabEff = 'fiable' | 'partielle' | 'approchee' | 'aucune' | 'live';

/** Fiabilité effective d'une fiche : celle du premier KPI rattaché qui a une valeur ; une évolution sans période précédente est approchée. */
export function fiabOf(i: Indicator, kpis: Map<string, KpiVal> | null): FiabEff {
  const m = i.kpi_matches?.find((x) => kpis?.get(x.id)?.value != null);
  if (!m) return i.couche_id ? 'live' : 'aucune';
  const k = kpis?.get(m.id);
  if (k && isEvolution(i.libelle) && !evolutionOf(k)) return 'approchee';
  return m.fiabilite;
}

// Taux de fiabilité estimé : moyenne pondérée des valeurs calculées (fiable 1, partielle 0,6, approchée 0,4)
export const POIDS: Record<'fiable' | 'partielle' | 'approchee', number> = { fiable: 1, partielle: 0.6, approchee: 0.4 };
export function synthese(list: Indicator[], kpis: Map<string, KpiVal> | null) {
  const n = { fiable: 0, partielle: 0, approchee: 0, aucune: 0, live: 0, multiEcart: 0, multiIncoherent: 0 };
  for (const i of list) {
    const f = fiabOf(i, kpis);
    n[f]++;
    const m = i.kpi_matches?.find((x) => kpis?.get(x.id)?.value != null);
    const multi = m ? kpis?.get(m.id)?.multi : undefined;
    if (multi?.niveau === 'ecart') n.multiEcart++;
    if (multi?.niveau === 'incoherent') n.multiIncoherent++;
  }
  const calcules = n.fiable + n.partielle + n.approchee;
  const score = calcules ? (n.fiable * POIDS.fiable + n.partielle * POIDS.partielle + n.approchee * POIDS.approchee) / calcules : null;
  return { ...n, total: list.length, calcules, couverture: list.length ? calcules / list.length : 0, score };
}
