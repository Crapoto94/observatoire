// Sérialisation du paramétrage d'un graphique de la page Données, pour le rejouer à l'identique
// dans « Mon tableau de bord ». La configuration enregistrée reprend la sélection complète
// (axe horizontal, séries, filtres, mesure, comparatif, etc.) **et** tout ce qui est nécessaire
// pour reconstruire le graphique hors de la page Données : libellés du jeu (codes → noms) et
// populations par territoire (pour le calcul « pour 1 000 habitants »).
import { DataRow } from './types';
import { Chart, Ctx, Sel, buildChart, selectRows } from './explorer';

// Paramétrage fin d'une tuile de tableau de bord, réglable par l'utilisateur (roue dentée).
// Ces options sont stockées dans la config de la tuile et appliquées au rendu et au PDF.
export interface TileStyle {
  // typographie
  titleSize?: number;        // taille du titre (px)
  valueSize?: number;        // taille de la valeur principale (px)
  textColor?: string;        // couleur du texte (valeur et titre)
  titleColor?: string;       // couleur du titre
  bold?: boolean;            // valeur en gras
  align?: 'left' | 'center' | 'right';
  // éléments affichés (KPI)
  showTheme?: boolean;       // thème au-dessus du titre
  showPeriod?: boolean;      // période de la donnée
  showDelta?: boolean;       // évolution vs période précédente
  showCompare?: boolean;     // comparaison GOSB / département / région
  showBadge?: boolean;       // pastille de statut de validation
  showLink?: boolean;        // lien vers les données
  showTrend?: boolean;       // mini-courbe (alias de trend)
  trend?: 'spark' | 'background' | 'none'; // position de la courbe
  // graphiques
  display?: 'line' | 'bar' | 'histo'; // type d'affichage : courbe, barres groupées, histogramme
  showLegend?: boolean;      // légende
  showGrid?: boolean;        // grille
  showAxes?: boolean;        // axes
  showValues?: boolean;      // étiquettes de valeur sur les barres
  chartColor?: string;       // couleur de base des séries
  // histogramme : regroupement des valeurs en classes (bornes calculées par indicateur/série)
  histoBins?: number;        // nombre de classes (0 = automatique)
  histoPerSeries?: boolean;  // un histogramme par indicateur (bornes propres à chacun)
  boundsPerSeries?: boolean; // chaque indicateur (série) a ses propres bornes d'axe (échelle indépendante)
  // Bornes d'axe personnalisées. Clé : '' (axe commun) ou l'index de la série (axe séparé par indicateur).
  // Chaque entrée : { min, max } facultatifs (vide = automatique).
  axisBounds?: Record<string, { min?: number | null; max?: number | null }>;
  // tuile multi-indicateurs : hauteur relative de chaque mini-carte
  multiRows?: number;        // nombre de KPI affichés par ligne (multi-KPI)
  // carte (tuile carto)
  palette?: string[];        // couleurs des classes choroplèthes (du plus clair au plus foncé)
  mapDisplay?: 'value' | 'evol'; // représentation : valeur ou évolution
  showCityNames?: boolean;   // afficher le nom des communes sur la carte
  // options visuelles de carte
  showMapArrows?: boolean;
  showDeptContours?: boolean;
  showQpv?: boolean;
  mapBoundaryColor?: string;
  mapBoundaryWidth?: number;
  mapDeptColor?: string;
  mapDeptWidth?: number;
  mapGosbColor?: string;
  mapGosbWidth?: number;
  mapIvryColor?: string;
  mapQpvFill?: string;
  mapQpvStroke?: string;
  mapQpvWidth?: number;
  mapArrowScale?: number;
  mapNameScale?: number;
  // cadre
  background?: string;       // couleur de fond de la tuile
  border?: boolean;          // bordure
  accent?: boolean;          // liseré d'accent en haut
}

export const DEFAULT_TILE_STYLE: TileStyle = {
  titleSize: 13, valueSize: 28, bold: true, align: 'left',
  showTheme: true, showPeriod: true, showDelta: true, showCompare: false, showBadge: true, showLink: true,
  trend: 'spark', display: 'line', showLegend: true, showGrid: true, showAxes: true, showValues: false,
  histoBins: 0, histoPerSeries: false, multiRows: 2,
  border: true,
};

export const tileStyle = (cfg: { style?: TileStyle; trend?: TileStyle['trend'] }): TileStyle =>
  ({ ...DEFAULT_TILE_STYLE, ...(cfg.trend ? { trend: cfg.trend } : {}), ...(cfg.style || {}) });

export interface ChartConfig {
  ds: string;               // identifiant du jeu de données
  dsLabel?: string;         // libellé du jeu (affichage)
  dimNames: string[];       // dimensions disponibles du jeu
  hier: string[] | null;    // hiérarchie éventuelle
  x: string;                // axe horizontal ('@PERIOD', '@GEO', '@HIER' ou dimension)
  series: string;
  pins: Record<string, string>;
  period: string;
  level: number;
  parents: Record<string, string>;
  mode: Sel['mode'];
  withTotals: boolean;
  keep: Record<string, string[]>;
  ratio: Sel['ratio'];
  band5: boolean;
  geoCodes: string[];       // territoires retenus (Ivry, comparaison, tous…)
  // --- éléments nécessaires à la reconstruction fidèle hors page Données ---
  labels?: Record<string, { label: string; values: Record<string, string> }>; // libellés dimensions/modalités
  popSeries?: Record<string, Record<string, number>>;                          // population par territoire et millésime
  geoNames?: Record<string, string>;                                           // nom lisible des territoires
  unit?: string;
  style?: TileStyle;        // paramétrage fin d'affichage de la tuile
  kpiId?: string;           // identifiant du KPI (tuiles KPI mono-indicateur)
  kpiIds?: string[];        // tuile multi-indicateurs : plusieurs KPI dans une même tuile
}

// Enveloppe la sélection courante de la page Données en configuration sérialisable.
// `labels` vient de data.labels, `popByGeo` des séries de population des territoires.
export function configFromSelection(
  ds: string, dimNames: string[], hier: string[] | null, sel: Sel, geoCodes: string[],
  opts: {
    dsLabel?: string; unit?: string;
    labels?: Record<string, { label: string; values: Record<string, string> }>;
    popByGeo?: Record<string, Record<string, number>>;
    geoNames?: Record<string, string>;
  } = {},
): ChartConfig {
  return {
    ds, dsLabel: opts.dsLabel, dimNames, hier, x: sel.x, series: sel.series, pins: sel.pins, period: sel.period,
    level: sel.level, parents: sel.parents, mode: sel.mode, withTotals: sel.withTotals, keep: sel.keep,
    ratio: sel.ratio, band5: sel.band5, geoCodes, unit: opts.unit,
    labels: opts.labels, popSeries: opts.popByGeo, geoNames: opts.geoNames,
  };
}

// Sources externes utilisées en complément de la configuration : utiles pour les graphiques
// enregistrés avant l'ajout des libellés / populations dans la config (rétro-compatibilité).
export interface RebuildExtras {
  geoName?: (c: string) => string;
  popSeries?: Record<string, Record<string, number>>;
  geoNames?: Record<string, string>;
}

// Reconstruit le graphique à partir des lignes brutes stockées pour le jeu, en appliquant exactement
// les mêmes règles de sélection / agrégation que la page Données (explorer.selectRows + buildChart).
export function buildConfigRows(rows: DataRow[], cfg: ChartConfig, extras: RebuildExtras = {}): Chart {
  const sel: Sel = {
    x: cfg.x, series: cfg.series, pins: cfg.pins, period: cfg.period, level: cfg.level, parents: cfg.parents,
    mode: cfg.mode, withTotals: cfg.withTotals, keep: cfg.keep, ratio: cfg.ratio, band5: cfg.band5,
  };
  const keepGeos = new Set(cfg.geoCodes?.length ? cfg.geoCodes : []);
  const scoped = keepGeos.size ? rows.filter((r) => keepGeos.has(r.geo)) : rows;

  const dimNames = cfg.dimNames?.length ? cfg.dimNames : [...new Set(scoped.flatMap((r) => Object.keys(r.dims)))];
  const labels = cfg.labels ?? {};
  const label = (dim: string, code: string) =>
    labels[dim]?.values?.[code] ?? (code === '_T' ? 'Total' : code === '_Z' ? 'Non renseigné' : code);
  const geoName = (code: string) => cfg.geoNames?.[code] ?? extras.geoNames?.[code] ?? extras.geoName?.(code) ?? code;
  // population : celle enregistrée dans la config, sinon fournie par l'appelant ; millésime le plus
  // proche de la période, sinon le plus récent (même règle que la page Données).
  const series = (code: string) => cfg.popSeries?.[code] ?? extras.popSeries?.[code];
  const popOf = (code: string, per?: string | null) => {
    const s = series(code);
    if (!s) return null;
    const years = Object.keys(s);
    const y = Number(String(per ?? '').slice(0, 4));
    if (!years.length) return null;
    if (!y) return s[years[years.length - 1]] ?? null;
    const best = years.reduce((a, b) => (Math.abs(Number(b) - y) < Math.abs(Number(a) - y) ? b : a));
    return s[best] ?? null;
  };
  const ctx: Ctx = { dimNames, hier: cfg.hier, label, geoName, popOf };
  const selected = selectRows(scoped, sel, ctx);
  return buildChart(selected, sel, ctx);
}
