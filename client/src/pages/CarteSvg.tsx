import { useRef, useState } from 'react';

// Rendu SVG de la carte des communes (couches, GOSB, départements, QPV, Ivry, flèches, légende),
// partagé entre la page Cartographie et les tuiles « Mon tableau de bord ». La légende est un
// overlay HTML à taille fixe (lisible quel que soit le zoom), déplaçable par glisser-déposer.

export const PALETTE = ['#eef4fc', '#c6dbf5', '#92bdee', '#5a97df', '#2f6fc7', '#14418a'];
export const NO_DATA = '#e3e5e8';
export const ARROW = { up: '▲', down: '▼', flat: '►' } as const;
export const arrowColor = (dir: 'up' | 'down' | 'flat', sense: 'up' | 'down' | 'none') =>
  (sense === 'none' || dir === 'flat' ? '#2563eb' : (dir === 'up') === (sense === 'up') ? '#16a34a' : '#dc2626');

export interface Shape { code: string; nom: string; dept: string; path: string; cx?: number; cy?: number }
export interface Shapes { viewBox: number[]; items: Shape[] }
export interface Trend { dir: 'up' | 'down' | 'flat'; pct: number | null; abs?: number }
export interface Val { v: number; prev: number | null; prevPeriod: string | null; trend: Trend | null }
export interface Qpv { code: string; nom: string; communes_noms: string; path: string }

export interface CarteSvgProps {
  items: Shape[];
  values: Record<string, Val>;
  gosbOutline: Shape[];
  viewBox: number[];
  palette?: string[];
  breaks: number[];
  unit?: string;
  layerDir?: 'up' | 'down' | 'none';
  arrows?: boolean;
  depts?: boolean;
  qpv?: Qpv[];
  showNames?: boolean;
  interactive?: boolean;
  scale?: number;
  legendTitle?: string;
  storageKey?: string;
  legendPosition?: { x: number; y: number };
  onLegendPositionChange?: (position: { x: number; y: number }) => void;
  boundaryColor?: string;
  boundaryWidth?: number;
  deptColor?: string;
  deptWidth?: number;
  gosbColor?: string;
  gosbWidth?: number;
  ivryColor?: string;
  qpvFill?: string;
  qpvStroke?: string;
  qpvWidth?: number;
  arrowScale?: number;
  nameScale?: number;
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

// Légende HTML superposée à la carte : taille fixe (lisible), déplaçable au doigt/à la souris.
function Legend({ palette, breaks, unit, title, storageKey, position, onPositionChange }: { palette: string[]; breaks: number[]; unit: string; title?: string; storageKey?: string; position?: { x: number; y: number }; onPositionChange?: (position: { x: number; y: number }) => void }) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (position) return position;
    if (storageKey) { try { const s = localStorage.getItem(`legend-pos-${storageKey}`); if (s) return JSON.parse(s); } catch { /* ignore */ } }
    return { x: 12, y: 12 };
  });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDown = (e: React.PointerEvent) => {
    setDragging(true);
    const r = ref.current?.getBoundingClientRect();
    drag.current = r ? { dx: e.clientX - r.left, dy: e.clientY - r.top } : { dx: 0, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos((p) => {
      const next = { x: p.x + e.movementX, y: p.y + e.movementY };
      return next;
    });
  };
  const onUp = (e: React.PointerEvent) => {
    drag.current = null; setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    onPositionChange?.(pos);
    if (storageKey) { try { localStorage.setItem(`legend-pos-${storageKey}`, JSON.stringify(pos)); } catch { /* ignore */ } }
  };

  if (!breaks.length) return null;
  return (
    <div ref={ref} className={`map-legend${dragging ? ' dragging' : ''}`}
      style={{ left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      title="Glisser pour déplacer la légende">
      <span className="lg-drag mi sm" aria-hidden>drag_indicator</span>
      {title && <div className="map-legend-title">{title}</div>}
      <div className="map-legend-body">
        {breaks.map((b, i) => <span key={i} className="lg"><i style={{ background: palette[i] }} />≤ {fmt(b)}{unit}</span>)}
        <span className="lg"><i style={{ background: NO_DATA }} />n.d.</span>
      </div>
    </div>
  );
}

export default function CarteSvg({
  items, values, gosbOutline, viewBox, palette = PALETTE, breaks, unit = '', layerDir = 'none',
  arrows = true, depts = true, qpv = [], showNames = false, interactive = false, scale = 900,
  legendTitle, storageKey, legendPosition, onLegendPositionChange,
  boundaryColor = '#ffffff', boundaryWidth = 0.6, deptColor = '#6b7280', deptWidth = 3,
  gosbColor = '#111827', gosbWidth = 4, ivryColor = '#dc2626', qpvFill = '#7c3aed',
  qpvStroke = '#7c3aed', qpvWidth = 1.2, arrowScale = 1, nameScale = 1,
}: CarteSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const classOf = (v: number) => { const i = breaks.findIndex((b) => v <= b); return i < 0 ? breaks.length - 1 : i; };
  const deptCodes = [...new Set(items.map((s) => s.dept))].sort();
  const centers = new Map(items.map((s) => [s.code, center(s.path)]));
  const u = viewBox[2] / scale;

  return (
    <div className="map-svg-wrap">
      <svg ref={svgRef} className="map-svg" viewBox={viewBox.join(' ')}>
        <defs>
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
          return <path key={s.code} d={s.path} fill={val ? palette[classOf(val.v)] : NO_DATA} stroke={boundaryColor} strokeWidth={boundaryWidth * u} />;
        })}
        {depts && deptCodes.map((d) => (
          <g key={`d-${d}`} mask={`url(#dept-outside-${d})`} pointerEvents="none">
            {items.filter((s) => s.dept === d).map((s) => <path key={s.code} d={s.path} fill="none" stroke={deptColor} strokeWidth={deptWidth * u} />)}
          </g>
        ))}
        <g mask="url(#gosb-outside)" pointerEvents="none">
          {gosbOutline.map((s) => <path key={`g-${s.code}`} d={s.path} fill="none" stroke={gosbColor} strokeWidth={gosbWidth * u} />)}
        </g>
        {qpv.map((q) => (
          <path key={q.code} d={q.path} fill={qpvFill} fillOpacity={0.18} stroke={qpvStroke} strokeWidth={qpvWidth * u} strokeDasharray={`${4 * u} ${2 * u}`} />
        ))}
        {(() => { const ivry = gosbOutline.find((s) => s.code === '94041'); return ivry ? <path d={ivry.path} fill="none" stroke={ivryColor} strokeWidth={2.2 * u} pointerEvents="none" /> : null; })()}
        {arrows && items.map((s) => {
          const t = values[s.code]?.trend;
          const c = centers.get(s.code);
          if (!t || !c) return null;
          return (
            <text key={`a-${s.code}`} x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="central"
              fontSize={(viewBox[2] < 300 ? 15 : viewBox[2] < 600 ? 13 : 11) * u * arrowScale} fill={arrowColor(t.dir, layerDir)}
              stroke="#fff" strokeWidth={2 * u} paintOrder="stroke" pointerEvents="none" fontWeight={700}>
              {ARROW[t.dir]}
            </text>
          );
        })}
        {showNames && items.map((s) => {
          const c = centers.get(s.code)!;
          return <text key={`n-${s.code}`} x={c[0]} y={c[1]} textAnchor="middle" fontSize={Math.max(2, viewBox[2] / 90) * nameScale} fill="#1c2330" stroke="#fff" strokeWidth={0.4 * u} paintOrder="stroke" pointerEvents="none">{s.nom}</text>;
        })}
      </svg>
      <Legend palette={palette} breaks={breaks} unit={unit} title={legendTitle} storageKey={storageKey} position={legendPosition} onPositionChange={onLegendPositionChange} />
    </div>
  );
}

export { center };
