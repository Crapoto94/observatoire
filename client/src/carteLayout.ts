// Géométrie de la carte mentale, relevée sur la carte PDF d'origine (page de 3370 x 2376).
import { Indicator } from './types';

export const PAGE = { w: 3370, h: 2376 };
export type Rect = [number, number, number, number]; // x0, y0, x1, y1

export const CELL = { w: 185, gap: 32, padX: 24, padTop: 24, padBottom: 24, rowGap: 8, font: 17.8, lineH: 15, padY: 18 };

export interface GroupDef {
  key: string;
  theme: string;
  title: string;
  label?: Rect; // pastille de rubrique (si différente de la pastille du thème)
  color: string; // couleur de la pastille
  stroke: string; // couleur du cadre
  origin: [number, number]; // coin haut-gauche du cadre
  parent: string; // 'centre' | clé de thème | clé de thème (pour les rubriques)
}

export interface ThemeDef { key: string; title: string; label: Rect; color: string; size: number }

export const CENTER: Rect = [1370, 999, 1661, 1148];

export const THEMES: ThemeDef[] = [
  { key: 'environnement', title: 'Environnement & STE', label: [1052, 886, 1308, 973], color: '#4bacc6', size: 25 },
  { key: 'demographie', title: 'Démographie', label: [1407, 821, 1625, 886], color: '#4f81bd', size: 27 },
  { key: 'emploi', title: 'Emploi & économie', label: [1793, 811, 2012, 911], color: '#9bbb59', size: 27 },
  { key: 'cohesion', title: 'Cohésion sociale & santé', label: [1728, 1195, 2012, 1287], color: '#c0504d', size: 27 },
  { key: 'mobilite', title: 'Mobilité', label: [1408, 1300, 1623, 1364], color: '#8064a2', size: 27 },
  { key: 'logement', title: 'Logement & urbanisme', label: [1087, 1141, 1294, 1239], color: '#f79646', size: 25 },
];

export const GROUPS: GroupDef[] = [
  { key: 'environnement', theme: 'environnement', title: 'Environnement & STE', color: '#4bacc6', stroke: '#4bacc6', origin: [91, 249], parent: 'environnement' },
  { key: 'demographie', theme: 'demographie', title: 'Démographie', color: '#4f81bd', stroke: '#4f81bd', origin: [1075, 42], parent: 'demographie' },
  { key: 'emploi-revenus', theme: 'emploi', title: 'Emploi et revenus', label: [2055, 456, 2255, 499], color: '#9bbb59', stroke: '#9bbb59', origin: [2361, 94], parent: 'emploi' },
  { key: 'commerces', theme: 'emploi', title: 'Commerces et dével. éco.', label: [2084, 834, 2283, 888], color: '#9bbb59', stroke: '#9bbb59', origin: [2361, 572], parent: 'emploi' },
  { key: 'logement', theme: 'logement', title: 'Logement & urbanisme', color: '#f79646', stroke: '#f79646', origin: [95, 1160], parent: 'logement' },
  { key: 'mobilite', theme: 'mobilite', title: 'Mobilité', color: '#8064a2', stroke: '#8064a2', origin: [1080, 1480], parent: 'mobilite' },
  { key: 'conditions-vie', theme: 'cohesion', title: 'Conditions de vie', label: [2091, 1300, 2290, 1350], color: '#c0504d', stroke: '#a32929', origin: [2361, 1131], parent: 'cohesion' },
  { key: 'vie-associative', theme: 'cohesion', title: 'Vie associative', label: [2098, 1630, 2297, 1680], color: '#c0504d', stroke: '#a32929', origin: [2361, 1550], parent: 'cohesion' },
  { key: 'sante', theme: 'cohesion', title: 'Santé', label: [2091, 1899, 2290, 1949], color: '#c0504d', stroke: '#a32929', origin: [2361, 1785], parent: 'cohesion' },
];

export const FRAME_W = 4 * CELL.w + 3 * CELL.gap + 2 * CELL.padX;
export const LEVEL_ORDER = ['contexte', 'suivi', 'evaluation', 'prospective'] as const;

export interface PlacedCell { ind: Indicator; x: number; y: number; w: number; h: number; lines: string[] }
export interface PlacedGroup { def: GroupDef; frame: { x: number; y: number; w: number; h: number }; cells: PlacedCell[] }

let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, bold = false) {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  ctx.font = `${bold ? 'bold ' : ''}${CELL.font}px Arial, sans-serif`;
  return ctx.measureText(text).width;
}

export function wrapText(text: string, maxW: number, bold = false): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const test = cur ? `${cur} ${word}` : word;
    if (cur && measure(test, bold) > maxW) { out.push(cur); cur = word; } else cur = test;
  }
  if (cur) out.push(cur);
  return out;
}

export function placeGroup(def: GroupDef, inds: Indicator[]): PlacedGroup {
  const mine = inds.filter((i) => i.groupe === def.key);
  // une ligne de la carte = une ligne (de texte) du classeur ; les nouveaux indicateurs sans ordre ont leur propre ligne
  const rowKey = (i: Indicator) => (i.ordre != null ? `o${i.ordre}` : `id${i.id}`);
  const keys = [...new Set(mine.map(rowKey))];
  const orderOf = (k: string) => mine.find((i) => rowKey(i) === k)!.ordre ?? 1e9;
  keys.sort((a, b) => orderOf(a) - orderOf(b));

  const innerW = CELL.w - 6;
  const cells: PlacedCell[] = [];
  let y = def.origin[1] + CELL.padTop;
  for (const k of keys) {
    const rowInds = mine.filter((i) => rowKey(i) === k);
    const placed = rowInds.map((ind) => ({ ind, lines: wrapText(ind.libelle_carte || ind.libelle, innerW, ind.priorite === 1) }));
    const maxLines = Math.max(...placed.map((p) => p.lines.length));
    const h = CELL.padY + CELL.lineH * maxLines;
    for (const p of placed) {
      const col = LEVEL_ORDER.indexOf(p.ind.niveau);
      cells.push({ ind: p.ind, lines: p.lines, x: def.origin[0] + CELL.padX + col * (CELL.w + CELL.gap), y, w: CELL.w, h });
    }
    y += h + CELL.rowGap;
  }
  const h = Math.max(120, y - CELL.rowGap + CELL.padBottom - def.origin[1]);
  return { def, frame: { x: def.origin[0], y: def.origin[1], w: FRAME_W, h }, cells };
}

export const rectCenter = (r: Rect): [number, number] => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
export const clampToRect = (r: Rect, p: [number, number]): [number, number] => [
  Math.min(Math.max(p[0], r[0]), r[2]),
  Math.min(Math.max(p[1], r[1]), r[3]),
];
