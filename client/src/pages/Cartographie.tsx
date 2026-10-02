import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { quantileBreaks } from '../explorer';

// Cartographie : couches (jeux disponibles) en légende, carte des communes avec contour du GOSB et flèches de tendance.
const PALETTE = ['#eef4fc', '#c6dbf5', '#92bdee', '#5a97df', '#2f6fc7', '#14418a'];
const NO_DATA = '#e3e5e8';
const SCOPES = [
  { k: '94', l: 'Val-de-Marne' }, { k: 'gosb', l: 'GOSB (24 communes)' }, { k: 'idf', l: 'Île-de-France' }, { k: '75', l: 'Paris' }, { k: '77', l: 'Seine-et-Marne' },
  { k: '78', l: 'Yvelines' }, { k: '91', l: 'Essonne' }, { k: '92', l: 'Hauts-de-Seine' }, { k: '93', l: 'Seine-Saint-Denis' }, { k: '95', l: "Val-d'Oise" },
];

interface Layer { id: string; label: string; theme: string; dataset: string; unit: string; perK: boolean; dir: 'up' | 'down' | 'none'; communes: number }
interface Trend { dir: 'up' | 'down' | 'flat'; pct: number | null; abs: number }
interface Val { v: number; prev: number | null; prevPeriod: string | null; trend: Trend | null }
interface Sum { aggregated?: boolean; code: string; nom: string; value: number | null; period: string | null; prev: number | null; prevPeriod: string | null; trend: Trend | null }
interface LayerData { layer: Layer; scope: string; period: string; periods: string[]; values: Record<string, Val>; summary: Sum[]; gosb: string[] }
interface Shape { code: string; nom: string; dept: string; path: string; cx?: number; cy?: number }
interface Shapes { viewBox: number[]; items: Shape[] }

const fmt = (v: number) => {
  const a = Math.abs(v);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
};
const ARROW = { up: '▲', down: '▼', flat: '►' } as const;
// couleur de la flèche : favorable (vert) / défavorable (rouge) selon le sens de la couche ; bleu si neutre
const arrowColor = (dir: 'up' | 'down' | 'flat', sense: 'up' | 'down' | 'none') => (sense === 'none' || dir === 'flat' ? '#2563eb' : (dir === 'up') === (sense === 'up') ? '#16a34a' : '#dc2626');

// centre approximatif d'un tracé SVG : milieu de sa boîte englobante
function center(path: string): [number, number] {
  const nums = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  return xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [0, 0];
}

export default function Cartographie() {
  const [params, setParams] = useSearchParams();
  const [layers, setLayers] = useState<Layer[]>([]);
  const [layerId, setLayerId] = useState(params.get('couche') || 'chomage');
  const [scope, setScope] = useState(params.get('perimetre') || 'idf');
  const [period, setPeriod] = useState('');
  const [data, setData] = useState<LayerData | null>(null);
  const [shapes, setShapes] = useState<Shapes | null>(null);
  const [arrows, setArrows] = useState(true);
  const [depts, setDepts] = useState(true);
  const [gosbShapes, setGosbShapes] = useState<Shapes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const [vb, setVb] = useState<number[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => { api<Layer[]>('/cartographie/layers').then(setLayers).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    api<Shapes>(`/shapes?scope=${scope}`).then((s) => { setShapes(s); setVb(s.viewBox); }).catch(() => setShapes(null));
  }, [scope]);
  const gosbView = (): number[] | null => {
    const v = gosbShapes?.viewBox;
    if (!v) return null;
    const k = 1.35; // marge autour du GOSB pour voir ses voisins
    return [v[0] - (v[2] * (k - 1)) / 2, v[1] - (v[3] * (k - 1)) / 2, v[2] * k, v[3] * k];
  };
  useEffect(() => { if (scope === 'idf' && shapes && gosbShapes) setVb(gosbView() ?? shapes.viewBox); }, [shapes, gosbShapes]); // eslint-disable-line react-hooks/exhaustive-deps
  // contours du GOSB toujours disponibles, quel que soit le périmètre affiché
  useEffect(() => { api<Shapes>('/shapes?scope=gosb').then(setGosbShapes).catch(() => setGosbShapes(null)); }, []);

  useEffect(() => {
    setLoading(true);
    api<LayerData>(`/cartographie/layer/${layerId}?scope=${scope}${period ? `&period=${encodeURIComponent(period)}` : ''}`)
      .then((d) => { setData(d); setError(''); })
      .catch((e) => { setData(null); setError(e.message); })
      .finally(() => setLoading(false));
  }, [layerId, scope, period]);
  useEffect(() => { setPeriod(''); }, [layerId, scope]);
  useEffect(() => { setParams({ couche: layerId, perimetre: scope }, { replace: true }); }, [layerId, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const layer = data?.layer ?? layers.find((l) => l.id === layerId);
  const values = data?.values ?? {};
  const items = shapes?.items ?? [];
  const gosbSet = useMemo(() => new Set(data?.gosb ?? gosbShapes?.items.map((s) => s.code) ?? []), [data, gosbShapes]);
  const centers = useMemo(() => new Map(items.map((s) => [s.code, center(s.path)])), [items]);
  const inScope = items.filter((s) => values[s.code]);
  const breaks = useMemo(() => quantileBreaks(inScope.map((s) => values[s.code].v), PALETTE.length), [inScope]); // eslint-disable-line react-hooks/exhaustive-deps
  const classOf = (v: number) => { const i = breaks.findIndex((b) => v <= b); return i < 0 ? breaks.length - 1 : i; };
  const unit = layer?.unit === '€' ? ' €' : layer?.unit === '%' ? ' %' : layer?.unit ? ` ${layer.unit}` : '';
  const gosbSummary = data?.summary.find((s) => s.code === 'GOSB');
  // unité = 1 pixel d'écran environ, quel que soit le périmètre et le zoom (le viewBox rend ~900 unités sur la largeur de la carte)
  const u = vb ? vb[2] / 900 : 1;
  const byTheme = useMemo(() => {
    const m = new Map<string, Layer[]>();
    for (const l of layers) (m.get(l.theme) ?? m.set(l.theme, []).get(l.theme)!).push(l);
    return [...m.entries()];
  }, [layers]);
  const nameOf = (code: string) => items.find((s) => s.code === code)?.nom ?? code;
  const ranking = useMemo(() => inScope.map((s) => ({ code: s.code, nom: s.nom, v: values[s.code].v })).sort((a, b) => b.v - a.v), [inScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // zoom molette et déplacement
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const f = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      setVb((v) => {
        if (!v) return v;
        const px = v[0] + ((e.clientX - r.left) / r.width) * v[2], py = v[1] + ((e.clientY - r.top) / r.height) * v[3];
        const w = v[2] * f, h = v[3] * f;
        return [px - ((px - v[0]) / v[2]) * w, py - ((py - v[1]) / v[3]) * h, w, h];
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [shapes]);
  const onDown = (e: React.MouseEvent) => { if (vb) drag.current = { x: e.clientX, y: e.clientY, vx: vb[0], vy: vb[1], moved: false }; };
  const onMove = (e: React.MouseEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (drag.current && vb && svgRef.current) {
      const d = drag.current;
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
      const sr = svgRef.current.getBoundingClientRect();
      setVb([d.vx - ((e.clientX - d.x) / sr.width) * vb[2], d.vy - ((e.clientY - d.y) / sr.height) * vb[3], vb[2], vb[3]]);
    }
    if (r) setHover((h) => (h ? { ...h, x: e.clientX - r.left, y: e.clientY - r.top } : h));
  };

  const outline = gosbShapes?.items ?? [];
  const showArrows = arrows;
  const deptCodes = useMemo(() => [...new Set(items.map((s) => s.dept))].sort(), [items]);
  const ivry = gosbShapes?.items.find((s) => s.code === '94041');
  const inView = (c: [number, number] | undefined) => !!c; // pas de filtrage sur le viewBox : la zone réellement visible déborde du viewBox selon le format de l’écran

  return (
    <section className="page cartographie">
      <div className="page-head"><h1>Cartographie</h1></div>
      {error && <div className="error">{error}</div>}
      <div className="carto-layout">
        <aside className="carto-legend">
          <h3>Couches</h3>
          {byTheme.map(([theme, list]) => (
            <div key={theme} className="carto-group">
              <div className="muted small">{theme}</div>
              {list.map((l) => (
                <label key={l.id} className={`carto-layer${l.communes < 5 ? ' off' : ''}`} title={l.communes < 5 ? 'Données communales non chargées' : `${l.communes} communes`}>
                  <input type="radio" name="layer" checked={layerId === l.id} onChange={() => setLayerId(l.id)} /> {l.label}
                </label>
              ))}
            </div>
          ))}
          <div className="carto-key">
            <div className="muted small">Légende</div>
            <div className="small"><span className="gosb-swatch" /> Contour du GOSB (Grand-Orly Seine Bièvre)</div>
            <div className="small"><span className="gosb-swatch" style={{ borderColor: '#dc2626' }} /> Ivry-sur-Seine</div>
            <div className="small"><span className="gosb-swatch" style={{ borderColor: '#6b7280', borderWidth: 2 }} /> Départements</div>
            <div className="small"><b style={{ color: '#16a34a' }}>▲</b> <b style={{ color: '#dc2626' }}>▼</b> tendance favorable / défavorable · <b style={{ color: '#2563eb' }}>▲ ► ▼</b> neutre ou stable</div>
          </div>
        </aside>

        <div className="carto-main">
          <div className="filters">
            <label className="field small"><span>Périmètre</span>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>{SCOPES.map((s) => <option key={s.k} value={s.k}>{s.l}</option>)}</select>
            </label>
            {(data?.periods.length ?? 0) > 1 && (
              <label className="field small"><span>Période</span>
                <select value={data?.period ?? ''} onChange={(e) => setPeriod(e.target.value)}>{data!.periods.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              </label>
            )}
            <label className="inline small"><input type="checkbox" checked={depts} onChange={(e) => setDepts(e.target.checked)} /> Contours des départements</label>
            <button className="secondary" onClick={() => { const v = gosbView(); if (v) setVb(v); }}>Vue GOSB</button>
            <button className="secondary" onClick={() => shapes && setVb(shapes.viewBox)}>Vue complète</button>
            <label className="inline small"><input type="checkbox" checked={arrows} onChange={(e) => setArrows(e.target.checked)} /> Flèches de tendance par commune</label>
            {layer && <Link className="small" to={`/donnees?ds=${layer.dataset}`}>Voir les données du jeu</Link>}
            {loading && <span className="muted small">Chargement…</span>}
          </div>

          {layer && data && (
            <div className="carto-title">
              <strong>{layer.label}</strong> <span className="muted">· {data.period}</span>
              <div className="carto-trends">
                {data.summary.map((s) => (
                  <span key={s.code} className={`trend-chip${s.code === 'GOSB' ? ' gosb' : ''}`} title={s.prevPeriod ? `par rapport à ${s.prevPeriod} (${s.prev != null ? fmt(s.prev) : '—'})` : 'pas de période précédente'}>
                    {s.nom} <b>{s.value != null ? `${fmt(s.value)}${unit}` : 'n.d.'}</b>{s.aggregated ? <span className="muted" title="Somme des communes (le jeu n'existe pas à ce niveau)"> Σ</span> : null}
                    {s.trend && <span style={{ color: arrowColor(s.trend.dir, layer.dir), fontWeight: 700 }}> {ARROW[s.trend.dir]}{s.trend.pct != null ? ` ${s.trend.pct > 0 ? '+' : ''}${fmt(s.trend.pct)} %` : ''}</span>}
                  </span>
                ))}
              </div>
              {gosbSummary?.trend && (
                <div className="carto-bigarrow" style={{ color: arrowColor(gosbSummary.trend.dir, layer.dir) }} title={`Tendance du GOSB depuis ${gosbSummary.prevPeriod}`}>
                  {ARROW[gosbSummary.trend.dir]}
                  <span className="small"> GOSB {gosbSummary.trend.dir === 'up' ? 'en hausse' : gosbSummary.trend.dir === 'down' ? 'en baisse' : 'stable'}{gosbSummary.trend.pct != null ? ` (${gosbSummary.trend.pct > 0 ? '+' : ''}${fmt(gosbSummary.trend.pct)} % depuis ${gosbSummary.prevPeriod})` : ''}</span>
                </div>
              )}
              {!gosbSummary?.trend && <div className="muted small">Tendance du GOSB non disponible pour cette couche (une seule période ou données du GOSB non agrégées).</div>}
            </div>
          )}

          <div className="map-layout">
            <div className="map-box" ref={box} onMouseMove={onMove} onMouseUp={() => setTimeout(() => { drag.current = null; }, 0)} onMouseLeave={() => { drag.current = null; setHover(null); }}>
              {shapes && vb ? (
                <svg ref={svgRef} className="map-svg" viewBox={vb.join(' ')} onMouseDown={onDown}>
                  <defs>
                    {/* halo extérieur : le contour du GOSB n'apparaît que sur son pourtour, pas entre ses communes */}
                    {deptCodes.map((d) => (
                      <mask key={`m-${d}`} id={`dept-outside-${d}`} maskUnits="userSpaceOnUse" x={-100000} y={-100000} width={200000} height={200000}>
                        <rect x={-100000} y={-100000} width={200000} height={200000} fill="white" />
                        {items.filter((s) => s.dept === d).map((s) => <path key={s.code} d={s.path} fill="black" />)}
                      </mask>
                    ))}
                    <mask id="gosb-outside" maskUnits="userSpaceOnUse" x={-100000} y={-100000} width={200000} height={200000}>
                      <rect x={-100000} y={-100000} width={200000} height={200000} fill="white" />
                      {outline.map((s) => <path key={s.code} d={s.path} fill="black" />)}
                    </mask>
                  </defs>
                  {items.map((s) => {
                    const val = values[s.code];
                    return (
                      <path
                        key={s.code} d={s.path} fill={val ? PALETTE[classOf(val.v)] : NO_DATA} stroke="#fff" strokeWidth={0.6 * u}
                        onMouseEnter={(e) => { const r = box.current!.getBoundingClientRect(); setHover({ code: s.code, x: e.clientX - r.left, y: e.clientY - r.top }); }}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}
                  {depts && deptCodes.map((d) => (
                    <g key={`d-${d}`} mask={`url(#dept-outside-${d})`} pointerEvents="none">
                      {items.filter((s) => s.dept === d).map((s) => <path key={s.code} d={s.path} fill="none" stroke="#6b7280" strokeWidth={3 * u} />)}
                    </g>
                  ))}
                  <g mask="url(#gosb-outside)" pointerEvents="none">
                    {outline.map((s) => <path key={`g-${s.code}`} d={s.path} fill="none" stroke="#111827" strokeWidth={4 * u} />)}
                  </g>
                                  {ivry && <path d={ivry.path} fill="none" stroke="#dc2626" strokeWidth={2.2 * u} pointerEvents="none" />}
                  {showArrows && items.map((s) => {
                    const t = values[s.code]?.trend;
                    const c = centers.get(s.code);
                    if (!t || !c || !inView(c)) return null;
                    return (
                      <text key={`a-${s.code}`} x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="central" fontSize={(scope === 'gosb' ? 16 : scope === '94' ? 13 : vb && vb[2] < 300 ? 15 : vb && vb[2] < 600 ? 13 : 11) * u}
                        fill={arrowColor(t.dir, layer?.dir ?? 'none')} stroke="#fff" strokeWidth={2 * u} paintOrder="stroke" pointerEvents="none" fontWeight={700}>
                        {ARROW[t.dir]}
                      </text>
                    );
                  })}
                </svg>
              ) : <div className="empty">Chargement des contours…</div>}
              {hover && (
                <div className="map-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
                  <strong>{nameOf(hover.code)}</strong>{gosbSet.has(hover.code) ? ' · GOSB' : ''}
                  {values[hover.code] ? (
                    <>
                      <div>{fmt(values[hover.code].v)}{unit}</div>
                      {values[hover.code].trend && (
                        <div style={{ color: arrowColor(values[hover.code].trend!.dir, layer?.dir ?? 'none') }}>
                          {ARROW[values[hover.code].trend!.dir]} {values[hover.code].trend!.pct != null ? `${values[hover.code].trend!.pct! > 0 ? '+' : ''}${fmt(values[hover.code].trend!.pct!)} %` : ''}
                          <span className="muted small"> depuis {values[hover.code].prevPeriod}</span>
                        </div>
                      )}
                    </>
                  ) : <div>donnée non disponible</div>}
                </div>
              )}
              <div className="map-legend">
                {breaks.map((b, i) => <span key={i} className="lg"><i style={{ background: PALETTE[i] }} />≤ {fmt(b)}{unit}</span>)}
                <span className="lg"><i style={{ background: NO_DATA }} />n.d.</span>
              </div>
            </div>

            <aside className="map-side">
              <h3>Classement ({ranking.length} communes)</h3>
              {ranking.length === 0 && <div className="muted small">Aucune valeur pour cette couche et ce périmètre : les données communales ne sont peut-être pas encore chargées.</div>}
              {ranking.length > 0 && (
                <>
                  <div className="muted small">Valeurs les plus élevées</div>
                  <ol className="rank">{ranking.slice(0, 10).map((r) => <li key={r.code}><span>{gosbSet.has(r.code) ? '◆ ' : ''}{r.nom}</span><b>{fmt(r.v)}{unit}</b></li>)}</ol>
                  <div className="muted small">Valeurs les plus faibles</div>
                  <ol className="rank rev">{ranking.slice(-10).reverse().map((r) => <li key={r.code}><span>{gosbSet.has(r.code) ? '◆ ' : ''}{r.nom}</span><b>{fmt(r.v)}{unit}</b></li>)}</ol>
                  <p className="muted small">◆ commune du GOSB. Seules les communes de plus de 5 000 habitants sont classées et colorées (les données des plus petites communes ne sont pas exhaustives). Molette : zoom · glisser : déplacer.</p>
                </>
              )}
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
