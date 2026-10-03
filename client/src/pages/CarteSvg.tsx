import { useRef } from 'react';

// Rendu SVG de la carte des communes : reprend À L'IDENTIQUE le rendu de la page Cartographie
// (couches colorées, contour du GOSB, contours des départements, QPV, contour d'Ivry, flèches de
// tendance, légende), afin d'être partagé entre la page Cartographie et les tuiles « Mon tableau de
// bord ». Le composant ne charge aucune donnée : il reçoit contours et valeurs déjà chargés.

export const PALETTE = ['#eef4fc', '#c6dbf5', '#92bdee', '#5a97df', '#2f6fc7', '#14418a'];
export const NO_DATA = '#e3e5e8';
export const ARROW = { up: '▲', down: '▼', flat: '►' } as const;
export const arrowColor = (dir: 'up' | 'down' | 'flat', sense: 'up' | 'down' | 'none') =>
  (sense === 'none' || dir === 'flat' ? '#2563eb' : (dir === 'up') === (sense === 'up') ? '#16a34a' : '#dc2626');

export interface Shape { code: string; nom: string; dept: string; path: string; cx?: number; cy?: number }
export interface Shapes { viewBox: number[]; items: Shape[] }
export interface Trend { dir: 'up' | 'down' | 'flat'; pct: number | null; abs: number }
export interface Val { v: number; prev: number | null; prevPeriod: string | null; trend: Trend | null }
export interface Qpv { code: string; nom: string; communes_noms: string; path: string }

export interface CarteSvgProps {
  items: Shape[];
  values: Record<string, Val>;
  gosbOutline: Shape[];                          // contours du GOSB (commun à tous les périmètres)
  viewBox: number[];
  palette?: string[];
  breaks: number[];                              // bornes des classes (quantiles)
  unit?: string;
  layerDir?: 'up' | 'down' | 'none';
  arrows?: boolean;
  depts?: boolean;
  qpv?: Qpv[];
  showNames?: boolean;
  interactive?: boolean;                         // souris/zoom/déplacement (page Cartographie)
  scale?: number;                                // référence de mise à l'échelle (900 en Cartographie)
}

const fmt = (v: number) => {
  const a = Math.abs(v);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
};

// centre approximatif d'un tracé SVG : milieu de sa boîte englobante
function center(path: string): [number, number] {
  const nums = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  return xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [0, 0];
}

export default function CarteSvg({
  items, values, gosbOutline, viewBox, palette = PALETTE, breaks, unit = '', layerDir = 'none',
  arrows = true, depts = true, qpv = [], showNames = false, interactive = false, scale = 900,
}: CarteSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const classOf = (v: number) => { const i = breaks.findIndex((b) => v <= b); return i < 0 ? breaks.length - 1 : i; };
  const deptCodes = [...new Set(items.map((s) => s.dept))].sort();
  const centers = new Map(items.map((s) => [s.code, center(s.path)]));
  // 1 pixel d'écran environ : le viewBox rend ~`scale` unités sur la largeur de la carte
  const u = viewBox[2] / scale;

  return (
    <svg ref={svgRef} className="map-svg" viewBox={viewBox.join(' ')}>
      <defs>
        {/* halo extérieur : le contour d'un département n'apparaît que sur son pourtour, pas entre ses communes */}
        {depts && deptCodes.map((d) => (
          <mask key={`m-${d}`} id={`dept-outside-${d}`} maskUnits="userSpaceOnUse" x={-100000} y={-100000} width={200000} height={200000}>
            <rect x={-100000} y={-100000} width={200000} height={200000} fill="white" />
            {items.filter((s) => s.dept === d).map((s) => <path key={s.code} d={s.path} fill="black" />)}
          </mask>
        ))}
        <mask id="gosb-outside" maskUnits="userSpaceOnUse" x={-100000} y={-100000} width={200000} height={200000}>
          <rect x={-100000} y={-100000} width={200000} height={200000} fill="white" />
          {gosbOutline.map((s) => <path key={s.code} d={s.path} fill="black" />)}
        </mask>
      </defs>
      {items.map((s) => {
        const val = values[s.code];
        return <path key={s.code} d={s.path} fill={val ? palette[classOf(val.v)] : NO_DATA} stroke="#fff" strokeWidth={0.6 * u} />;
      })}
      {depts && deptCodes.map((d) => (
        <g key={`d-${d}`} mask={`url(#dept-outside-${d})`} pointerEvents="none">
          {items.filter((s) => s.dept === d).map((s) => <path key={s.code} d={s.path} fill="none" stroke="#6b7280" strokeWidth={3 * u} />)}
        </g>
      ))}
      <g mask="url(#gosb-outside)" pointerEvents="none">
        {gosbOutline.map((s) => <path key={`g-${s.code}`} d={s.path} fill="none" stroke="#111827" strokeWidth={4 * u} />)}
      </g>
      {qpv.map((q) => (
        <path key={q.code} d={q.path} fill="rgba(124, 58, 237, 0.18)" stroke="#7c3aed" strokeWidth={1.2 * u} strokeDasharray={`${4 * u} ${2 * u}`} />
      ))}
      {(() => { const ivry = gosbOutline.find((s) => s.code === '94041'); return ivry ? <path d={ivry.path} fill="none" stroke="#dc2626" strokeWidth={2.2 * u} pointerEvents="none" /> : null; })()}
      {arrows && items.map((s) => {
        const t = values[s.code]?.trend;
        const c = centers.get(s.code);
        if (!t || !c) return null;
        return (
          <text key={`a-${s.code}`} x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="central"
            fontSize={(viewBox[2] < 300 ? 15 : viewBox[2] < 600 ? 13 : 11) * u} fill={arrowColor(t.dir, layerDir)}
            stroke="#fff" strokeWidth={2 * u} paintOrder="stroke" pointerEvents="none" fontWeight={700}>
            {ARROW[t.dir]}
          </text>
        );
      })}
      {showNames && items.map((s) => {
        const c = centers.get(s.code)!;
        return <text key={`n-${s.code}`} x={c[0]} y={c[1]} textAnchor="middle" fontSize={Math.max(2, viewBox[2] / 90)} fill="#1c2330" stroke="#fff" strokeWidth={0.4} paintOrder="stroke" pointerEvents="none">{s.nom}</text>;
      })}
      {/* légende des classes */}
      {breaks.length > 0 && (
        <g pointerEvents="none">
          {breaks.map((b, i) => (
            <g key={i} transform={`translate(${viewBox[0] + 6 * u}, ${viewBox[1] + viewBox[3] - (breaks.length + 1 - i) * 14 * u})`}>
              <rect width={11 * u} height={11 * u} fill={palette[i]} stroke="#00000022" />
              <text x={14 * u} y={9 * u} fontSize={10 * u} fill="#1c2330">≤ {fmt(b)}{unit}</text>
            </g>
          ))}
          <g transform={`translate(${viewBox[0] + 6 * u}, ${viewBox[1] + viewBox[3] - 14 * u})`}>
            <rect width={11 * u} height={11 * u} fill={NO_DATA} stroke="#00000022" />
            <text x={14 * u} y={9 * u} fontSize={10 * u} fill="#1c2330">n.d.</text>
          </g>
        </g>
      )}
    </svg>
  );
}

export { center };
