import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Ctx, MapPick, MapRow, Sel, categoryOptions, mapConstraints, mapValues, quantileBreaks } from '../explorer';
import { DataRow } from '../types';
import { project, yearOf } from '../trend';

// Carte choroplèthe des communes d'Île-de-France pour la lecture courante (préréglage) d'un jeu de données.
// Contours : formes simplifiées servies par l'API (/api/shapes) ; aucun fond de carte externe (fonctionne hors connexion).
const PALETTE = ['#eef4fc', '#c6dbf5', '#92bdee', '#5a97df', '#2f6fc7', '#14418a'];
const NO_DATA = '#e3e5e8';
const SCOPES = [
  { k: 'idf', l: 'Île-de-France' }, { k: '75', l: 'Paris (75)' }, { k: '77', l: 'Seine-et-Marne (77)' }, { k: '78', l: 'Yvelines (78)' },
  { k: '91', l: 'Essonne (91)' }, { k: '92', l: 'Hauts-de-Seine (92)' }, { k: '93', l: 'Seine-Saint-Denis (93)' }, { k: '94', l: 'Val-de-Marne (94)' },
  { k: '95', l: "Val-d'Oise (95)" },
];

interface Shape { code: string; nom: string; dept: string; path: string }
interface Shapes { viewBox: number[]; items: Shape[] }

const fmt = (v: number) => {
  const a = Math.abs(v);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
};
type Display = 'value' | 'evol' | 'annual' | 'p1' | 'p5';
const DISPLAYS: { k: Display; l: string }[] = [
  { k: 'value', l: 'Valeur' }, { k: 'evol', l: 'Évolution depuis la période de départ' }, { k: 'annual', l: 'Évolution annuelle moyenne' },
  { k: 'p1', l: 'Projection à 1 an' }, { k: 'p5', l: 'Projection à 5 ans' },
];
const isDim = (v: string) => v !== '' && !v.startsWith('@');

interface Props {
  dsId: string;
  sel: Sel;
  ctx: Ctx;
  rows: DataRow[]; // lignes déjà chargées (Ivry et territoires de comparaison) : servent à lister les modalités
  title: string;
  refCode: string;
  compare: string;
  coverage: number; // communes d'Île-de-France disposant de données pour ce jeu
  totalCommunes: number;
  importing: boolean;
  onImport: (allDatasets: boolean) => void;
  onPick: (code: string) => void;
}

export default function CarteDonnees({ dsId, sel, ctx, rows, title, refCode, compare, coverage, totalCommunes, importing, onImport, onPick }: Props) {
  const [scope, setScope] = useState('94'); // Val-de-Marne par défaut
  const [shapes, setShapes] = useState<Shapes | null>(null);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState('');
  const [cat, setCat] = useState('');
  const [seriesVal, setSeriesVal] = useState('');
  // par défaut : pour 1 000 habitants, sauf pour les lectures qui sont déjà des prix, taux, parts, médianes ou moyennes
  const defaultPerK = !/prix|loyer|taux|part |parts |médian|niveau de vie|indice|moyen|€|%|densité|pour 1 000|pour 1000|surface|ratio/i.test(`${title} ${sel.ratio?.label ?? ''}`);
  const [perK, setPerK] = useState(defaultPerK);
  useEffect(() => { setPerK(defaultPerK); }, [title, dsId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [data, setData] = useState<MapRow[]>([]);
  const [display, setDisplay] = useState<Display>('value');
  const [basePeriod, setBasePeriod] = useState('');
  const [baseData, setBaseData] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const [vb, setVb] = useState<number[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const catKey = sel.x === '@HIER' ? '@HIER' : isDim(sel.x) ? sel.x : '';
  const catOptions = useMemo(() => (catKey ? categoryOptions(rows, catKey, sel, ctx) : []), [rows, catKey, sel, ctx]);
  const seriesOptions = useMemo(() => (isDim(sel.series) ? categoryOptions(rows, sel.series, sel, ctx) : []), [rows, sel, ctx]);
  const catLabel = (c: string) => (sel.x === '@HIER' && ctx.hier ? ctx.label(ctx.hier[sel.level], c) : ctx.label(sel.x, c));

  // valeurs par défaut quand la lecture change
  useEffect(() => { if (catOptions.length && !catOptions.includes(cat)) setCat(catOptions[0]); if (!catOptions.length) setCat(''); }, [catOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (seriesOptions.length && !seriesOptions.includes(seriesVal)) setSeriesVal(seriesOptions[0]); if (!seriesOptions.length) setSeriesVal(''); }, [seriesOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api<string[]>(`/datasets/${dsId}/periods`).then((p) => {
      setPeriods(p);
      setPeriod((cur) => (p.includes(cur) ? cur : p.includes(sel.period) ? sel.period : p[p.length - 1] ?? ''));
    }).catch(() => setPeriods([]));
  }, [dsId, coverage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // période de départ par défaut : la plus proche de cinq ans avant la période affichée
    const y = yearOf(period);
    const older = periods.filter((p) => yearOf(p) != null && (y == null || yearOf(p)! < y));
    if (!older.length) { setBasePeriod(''); return; }
    setBasePeriod((cur) => (older.includes(cur) ? cur : older.reduce((best, p) => (Math.abs(yearOf(p)! - ((y ?? 0) - 5)) < Math.abs(yearOf(best)! - ((y ?? 0) - 5)) ? p : best), older[0])));
  }, [periods, period]);

  useEffect(() => {
    api<Shapes>(`/shapes?scope=${scope}`).then((s) => { setShapes(s); setVb(s.viewBox); }).catch(() => setShapes(null));
  }, [scope]);

  const mapSel: Sel = useMemo(() => ({ ...sel, mode: perK ? 'pop' : 'brut' }), [sel, perK]);
  const pick: MapPick = { cat, seriesVal, period };
  const constraints = useMemo(() => mapConstraints(mapSel, ctx, pick), [mapSel, ctx, cat, seriesVal, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = JSON.stringify({ dsId, constraints, scope, period });

  useEffect(() => {
    if (!coverage) { setData([]); return; }
    let live = true;
    setLoading(true);
    api<{ rows: MapRow[] }>(`/datasets/${dsId}/map?scope=${scope}&period=${encodeURIComponent(period)}&dims=${encodeURIComponent(JSON.stringify(constraints))}`)
      .then((r) => { if (live) setData(r.rows); })
      .catch(() => { if (live) setData([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [key, coverage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (display === 'value' || !coverage || !basePeriod) { setBaseData([]); return; }
    let live = true;
    api<{ rows: MapRow[] }>(`/datasets/${dsId}/map?scope=${scope}&period=${encodeURIComponent(basePeriod)}&dims=${encodeURIComponent(JSON.stringify(constraints))}`)
      .then((r) => { if (live) setBaseData(r.rows); })
      .catch(() => { if (live) setBaseData([]); });
    return () => { live = false; };
  }, [key, coverage, display, basePeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = useMemo(() => mapValues(data, mapSel, ctx), [data, mapSel, ctx]);
  const baseValues = useMemo(() => mapValues(baseData, mapSel, ctx), [baseData, mapSel, ctx]);
  const dt = yearOf(period) != null && yearOf(basePeriod) != null ? yearOf(period)! - yearOf(basePeriod)! : 0;
  const isRatio = !!sel.ratio && (sel.ratio.factor ?? 100) === 100;
  const values = useMemo(() => {
    if (display === 'value' || dt <= 0) return current;
    const out = new Map<string, number>();
    for (const [g, v] of current) {
      const b = baseValues.get(g);
      if (b == null) continue;
      if (display === 'evol') { const r = isRatio ? v - b : b !== 0 ? ((v - b) / Math.abs(b)) * 100 : null; if (r != null) out.set(g, r); }
      else if (display === 'annual') {
        const r = isRatio ? (v - b) / dt : b > 0 && v > 0 ? (Math.pow(v / b, 1 / dt) - 1) * 100 : null;
        if (r != null) out.set(g, r);
      } else { const r = project({ t: 0, v: b }, { t: dt, v }, display === 'p1' ? 1 : 5); if (r != null) out.set(g, r); }
    }
    return out;
  }, [current, baseValues, display, dt, isRatio]);
  const inScope = useMemo(() => (shapes?.items ?? []).filter((s) => values.has(s.code)), [shapes, values]);
  const breaks = useMemo(() => quantileBreaks(inScope.map((s) => values.get(s.code)!), PALETTE.length), [inScope, values]);
  const classOf = (v: number) => { const i = breaks.findIndex((b) => v <= b); return i < 0 ? breaks.length - 1 : i; };
  const nameOf = (code: string) => shapes?.items.find((s) => s.code === code)?.nom ?? ctx.geoName(code);

  const ranking = useMemo(() => inScope.map((s) => ({ code: s.code, nom: s.nom, v: values.get(s.code)! })).sort((a, b) => b.v - a.v), [inScope, values]);
  const refRank = ranking.findIndex((r) => r.code === refCode);
  const median = ranking.length ? ranking[Math.floor(ranking.length / 2)].v : null;

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
        const px = v[0] + ((e.clientX - r.left) / r.width) * v[2];
        const py = v[1] + ((e.clientY - r.top) / r.height) * v[3];
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
  const onUp = () => { setTimeout(() => { drag.current = null; }, 0); };

  const coverageShort = coverage < Math.min(50, totalCommunes);
  const scale = vb && shapes ? vb[2] / shapes.viewBox[2] : 1;
  const evolMode = display === 'evol' || display === 'annual';
  const valueUnit = sel.ratio ? ((sel.ratio.factor ?? 100) === 100 ? ' %' : '') : '';
  const unit = evolMode ? (isRatio ? (display === 'annual' ? ' pts/an' : ' pts') : (display === 'annual' ? ' %/an' : ' %')) : valueUnit;

  return (
    <div className="mapview">
      {coverageShort && (
        <div className="warn">
          Les données d'Île-de-France de ce jeu ne sont pas chargées ({coverage} commune{coverage > 1 ? 's' : ''} sur {totalCommunes}).{' '}
          <button className="secondary" disabled={importing} onClick={() => onImport(false)}>Charger ce jeu pour toute l'Île-de-France</button>{' '}
          <button className="secondary" disabled={importing} onClick={() => onImport(true)}>Charger tous les jeux</button>
        </div>
      )}
      <div className="filters">
        <label className="field small"><span>Périmètre</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>{SCOPES.map((s) => <option key={s.k} value={s.k}>{s.l}</option>)}</select>
        </label>
        {periods.length > 1 && (
          <label className="field small"><span>Période</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>{periods.map((p) => <option key={p} value={p}>{p || '—'}</option>)}</select>
          </label>
        )}
        {catOptions.length > 0 && (
          <label className="field small"><span>{catKey === '@HIER' && ctx.hier ? ctx.hier[sel.level] : catKey}</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>{catOptions.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
          </label>
        )}
        {seriesOptions.length > 0 && (
          <label className="field small"><span>{sel.series}</span>
            <select value={seriesVal} onChange={(e) => setSeriesVal(e.target.value)}>{seriesOptions.map((c) => <option key={c} value={c}>{ctx.label(sel.series, c)}</option>)}</select>
          </label>
        )}
        <label className="field small"><span>Affichage</span>
          <select value={display} onChange={(e) => setDisplay(e.target.value as Display)}>{DISPLAYS.map((d) => <option key={d.k} value={d.k}>{d.l}</option>)}</select>
        </label>
        {display !== 'value' && (
          <label className="field small"><span>Période de départ</span>
            <select value={basePeriod} onChange={(e) => setBasePeriod(e.target.value)}>
              {periods.filter((p) => yearOf(p) != null && (yearOf(period) == null || yearOf(p)! < yearOf(period)!)).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        {!sel.ratio && <label className="inline small"><input type="checkbox" checked={perK} onChange={(e) => setPerK(e.target.checked)} /> Pour 1 000 habitants</label>}
        {loading && <span className="muted small">Chargement…</span>}
        {display !== 'value' && dt <= 0 && <span className="muted small">Au moins deux périodes sont nécessaires pour calculer une évolution.</span>}
      </div>

      <div className="map-layout">
        <div className="map-box" ref={box} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { drag.current = null; setHover(null); }}>
          {title && <div className="map-title">{title}{sel.ratio?.label ? <span className="muted"> · {sel.ratio.label}</span> : null}</div>}
          {shapes && vb ? (
            <svg ref={svgRef} className="map-svg" viewBox={vb.join(' ')} onMouseDown={onDown}>
              {shapes.items.map((s) => {
                const v = values.get(s.code);
                return (
                  <path
                    key={s.code} d={s.path} fill={v == null ? NO_DATA : PALETTE[classOf(v)]} stroke="#fff" strokeWidth={0.35 * scale}
                    onMouseEnter={(e) => { const r = box.current!.getBoundingClientRect(); setHover({ code: s.code, x: e.clientX - r.left, y: e.clientY - r.top }); }}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => { if (!drag.current?.moved) onPick(s.code); }}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
              {[compare, refCode].filter(Boolean).map((c) => {
                const s = shapes.items.find((x) => x.code === c);
                return s ? <path key={`o-${c}`} d={s.path} fill="none" stroke={c === refCode ? '#b91c1c' : '#16a34a'} strokeWidth={1.6 * scale} pointerEvents="none" /> : null;
              })}
            </svg>
          ) : <div className="empty">Chargement des contours…</div>}
          {hover && (
            <div className="map-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
              <strong>{nameOf(hover.code)}</strong>
              <div>{values.has(hover.code) ? `${fmt(values.get(hover.code)!)}${unit}` : 'donnée non disponible'}</div>
              {values.has(hover.code) && ranking.length > 0 && <div className="muted small">{ranking.findIndex((r) => r.code === hover.code) + 1}ᵉ sur {ranking.length}</div>}
            </div>
          )}
          <div className="map-legend">
            {breaks.map((b, i) => (
              <span key={i} className="lg"><i style={{ background: PALETTE[i] }} />{i === 0 ? '≤ ' : '≤ '}{fmt(b)}{unit}</span>
            ))}
            <span className="lg"><i style={{ background: NO_DATA }} />n.d.</span>
          </div>
        </div>

        <aside className="map-side">
          <h3>Classement ({ranking.length} communes)</h3>
          {refRank >= 0 && (
            <div className="ecart small">
              <strong>{nameOf(refCode)}</strong> : {fmt(ranking[refRank].v)}{unit}, {refRank + 1}ᵉ sur {ranking.length}
              {median != null && <> · médiane {fmt(median)}{unit}</>}
            </div>
          )}
          {ranking.length === 0 && <div className="muted small">Aucune valeur pour cette lecture et ce périmètre.</div>}
          {ranking.length > 0 && (
            <>
              <div className="muted small">Valeurs les plus élevées</div>
              <ol className="rank">{ranking.slice(0, 10).map((r) => <li key={r.code} onClick={() => onPick(r.code)}><span>{r.nom}</span><b>{fmt(r.v)}{unit}</b></li>)}</ol>
              <div className="muted small">Valeurs les plus faibles</div>
              <ol className="rank rev">{ranking.slice(-10).reverse().map((r) => <li key={r.code} onClick={() => onPick(r.code)}><span>{r.nom}</span><b>{fmt(r.v)}{unit}</b></li>)}</ol>
            </>
          )}
          <p className="muted small">Cliquez sur une commune pour la comparer à {nameOf(refCode)} dans l'onglet Graphique. Molette : zoom, glisser : déplacer.</p>
        </aside>
      </div>
    </div>
  );
}
