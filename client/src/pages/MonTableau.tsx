import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { DataRow, DatasetData, Geo } from '../types';
import { buildChart } from '../explorer';
import { buildConfigRows, ChartConfig, DEFAULT_TILE_STYLE, TileStyle, tileStyle } from '../dashConfig';
import { Card, Kpi } from './Dashboard';
import { isAdmin, useAuth } from '../auth';
import { useModal } from '../modal';
import TileSettings from './TileSettings';

export interface Item { id: number; kind: 'kpi' | 'chart'; title: string; config: ChartConfig & { kpiId?: string; trend?: 'spark' | 'background' | 'none' }; x: number; y: number; w: number; h: number }

const REF = '94041';
const COLS = 24;      // grille fine
const ROW_H = 16;     // rangées courtes : ajustement au plus près
const GUTTER = 4;
const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#475569', '#ea580c'];
const fmt = (v: number) => {
  const a = Math.abs(v);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
};

// Mon tableau de bord : KPI et graphiques personnalisables, déplaçables et redimensionnables sur une
// grille fine. Chaque tuile possède une roue dentée ouvrant un paramétrage fin (texte, éléments
// affichés, courbe, couleurs…).
export default function MonTableau() {
  const { user } = useAuth();
  const modal = useModal();
  const [items, setItems] = useState<Item[]>([]);
  const [kpis, setKpis] = useState<Record<string, Kpi>>({});
  const [charts, setCharts] = useState<Record<number, ReturnType<typeof buildChart>>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<number | null>(null);
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Item[]>([]);
  const action = useRef<{ mode: 'move' | 'resize'; id: number; startX: number; startY: number; orig: Item } | null>(null);
  itemsRef.current = items;

  useEffect(() => {
    Promise.all([api<Item[]>('/dashboard'), api<Geo[]>('/geos?all=1'), api<{ kpis: Kpi[] }>('/kpi')])
      .then(([it, g, k]) => {
        setItems(it);
        setKpis(Object.fromEntries(k.kpis.map((x) => [x.id, x])));
        return loadCharts(it, g);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const geoExtras = (list: Geo[]) => {
    const popSeries: Record<string, Record<string, number>> = {};
    const geoNames: Record<string, string> = {};
    for (const g of list) { geoNames[g.code] = g.nom; if (g.pop_series) popSeries[g.code] = g.pop_series; }
    return { popSeries, geoNames, geoName: (c: string) => geoNames[c] ?? c };
  };

  const loadCharts = async (list: Item[], geosList: Geo[]) => {
    const extras = geoExtras(geosList);
    for (const it of list.filter((i) => i.kind === 'chart')) {
      try {
        const rows = await fetchRows(it.config);
        setCharts((c) => ({ ...c, [it.id]: buildConfigRows(rows, it.config, extras) }));
      } catch (e) { setError((e as Error).message); }
    }
  };

  const fetchRows = async (cfg: ChartConfig): Promise<DataRow[]> => {
    const codes = cfg.geoCodes?.length ? cfg.geoCodes : [REF];
    const d = await api<DatasetData>(`/datasets/${cfg.ds}/data?geos=${codes.join(',')}`);
    return d.rows;
  };

  // ---------- déplacement et redimensionnement (écouteurs globaux uniques) ----------
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const a = action.current;
      const rect = board.current?.getBoundingClientRect();
      if (!a || !rect) return;
      const colW = rect.width / COLS;
      const it = a.orig;
      if (a.mode === 'move') {
        const nx = clamp(Math.round((e.clientX - a.startX) / colW) + it.x, 0, COLS - it.w);
        const ny = Math.max(0, Math.round((e.clientY - a.startY) / ROW_H) + it.y);
        setItems((list) => list.map((i) => (i.id === a.id ? { ...i, x: nx, y: ny } : i)));
      } else {
        const w = clamp(Math.round((e.clientX - a.startX) / colW) + it.w, 3, COLS - it.x);
        const h = Math.max(6, Math.round((e.clientY - a.startY) / ROW_H) + it.h);
        setItems((list) => list.map((i) => (i.id === a.id ? { ...i, w, h } : i)));
      }
    };
    const up = () => {
      const a = action.current;
      if (!a) return;
      const it = itemsRef.current.find((i) => i.id === a.id);
      if (it) save(it);
      action.current = null;
      setDragId(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDrag = (e: React.MouseEvent, it: Item) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    e.preventDefault();
    action.current = { mode: 'move', id: it.id, startX: e.clientX, startY: e.clientY, orig: { ...it } };
    setDragId(it.id);
  };
  const startResize = (e: React.MouseEvent, it: Item) => {
    e.preventDefault(); e.stopPropagation();
    action.current = { mode: 'resize', id: it.id, startX: e.clientX, startY: e.clientY, orig: { ...it } };
    setDragId(it.id);
  };

  const save = (it: Item) => api(`/dashboard/${it.id}`, { method: 'PUT', body: { x: it.x, y: it.y, w: it.w, h: it.h } }).catch(() => undefined);
  const patch = (it: Item, body: Partial<{ title: string; config: ChartConfig }>) => {
    setItems((list) => list.map((i) => (i.id === it.id ? { ...i, ...body } : i)));
    api(`/dashboard/${it.id}`, { method: 'PUT', body }).catch(() => undefined);
  };
  const remove = async (it: Item) => {
    const ok = await modal.confirm({ title: 'Retirer la tuile', message: `Retirer « ${it.title} » de mon tableau de bord ?`, okLabel: 'Retirer', danger: true });
    if (!ok) return;
    setItems((list) => list.filter((i) => i.id !== it.id));
    api(`/dashboard/${it.id}`, { method: 'DELETE' }).catch(() => undefined);
  };

  const emailBoard = async () => {
    const to = await modal.prompt({
      title: 'Envoyer mon tableau de bord par e-mail',
      message: 'Le tableau de bord sera joint en PDF (KPI et graphiques).',
      placeholder: 'prenom.nom@ivry94.fr', defaultValue: user?.email || '', okLabel: 'Envoyer',
    });
    if (!to) return;
    setSending(true);
    try {
      await api('/dashboard/email', { body: { to } });
      await modal.alert({ title: 'Courriel envoyé', message: `Le tableau de bord a été envoyé à ${to}.` });
    } catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  };

  const settingsItem = items.find((i) => i.id === settingsId) || null;
  const highest = useMemo(() => Math.max(40, ...items.map((i) => i.y + i.h)), [items]);
  if (loading) return <section className="page"><div className="page-head"><h1>Mon tableau de bord</h1></div><div className="empty">Chargement…</div></section>;

  return (
    <section className="page mon-tableau">
      <div className="page-head">
        <h1>Mon tableau de bord</h1>
        <div className="actions">
          <button className="secondary" disabled={sending || items.length === 0} onClick={emailBoard} title="Générer un PDF du tableau de bord et l'envoyer par courriel">
            {sending ? 'Envoi…' : '✉ Envoyer par e-mail'}
          </button>
          {isAdmin(user) && (
            <button className="secondary" title="Faire de ce tableau de bord le modèle hérité par tout nouvel utilisateur"
              onClick={async () => {
                const ok = await modal.confirm({ title: 'Modèle par défaut', message: 'Définir ce tableau de bord comme modèle hérité par tout nouvel utilisateur ?' });
                if (!ok) return;
                try { await api('/dashboard/default/from-current', { body: {} }); await modal.alert({ title: 'Enregistré', message: 'Le modèle par défaut a été mis à jour.' }); }
                catch (e) { setError((e as Error).message); }
              }}>Définir par défaut</button>
          )}
          <Link className="btn" to="/donnees" title="Choisir un graphique puis « Ajouter à mon tableau de bord »">+ Graphique depuis Données</Link>
          <Link className="btn" to="/tableau-de-bord" title="Choisir un KPI puis « + mon tableau »">+ KPI (Indicateurs)</Link>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {items.length === 0 && (
        <div className="empty">
          Votre tableau de bord est vide. Ajoutez des KPI depuis <Link to="/tableau-de-bord">Indicateurs</Link> ou
          des graphiques depuis <Link to="/donnees">Données</Link> (bouton « Ajouter à mon tableau de bord » sous le graphique).
        </div>
      )}

      <div className="board" ref={board} style={{ height: highest * ROW_H }}>
        {items.map((it) => {
          const st = tileStyle(it.config);
          return (
            <div
              key={it.id}
              className={`board-item${dragId === it.id ? ' dragging' : ''}${st.border !== false ? '' : ' no-border'}${st.accent ? ' accent' : ''}`}
              style={{
                left: `calc(${(it.x / COLS) * 100}% + ${GUTTER / 2}px)`, width: `calc(${(it.w / COLS) * 100}% - ${GUTTER + 1}px)`,
                top: it.y * ROW_H + GUTTER / 2, height: it.h * ROW_H - GUTTER - 1,
                background: st.background || undefined,
              }}
            >
              <div className="board-head" onMouseDown={(e) => startDrag(e, it)} title="Glisser pour déplacer">
                <span className="board-title" style={{ fontSize: st.titleSize, color: st.titleColor || st.textColor || undefined }}>{it.title}</span>
                <span className="board-tools no-drag">
                  <button className="icon" title="Paramètres de la tuile" onClick={() => setSettingsId(it.id)}>⚙</button>
                  <button className="icon" title="Retirer" onClick={() => remove(it)}>✕</button>
                </span>
              </div>
              <div className="board-body">
                {it.kind === 'kpi'
                  ? <KpiWidget ids={it.config.kpiIds?.length ? it.config.kpiIds : (it.config.kpiId ? [it.config.kpiId] : [])} kpis={kpis} style={st} />
                  : <ChartWidget cfg={it.config} chart={charts[it.id]} style={st} />}
              </div>
              <div className="resize-handle" onMouseDown={(e) => startResize(e, it)} title="Redimensionner" />
            </div>
          );
        })}
      </div>

      {settingsItem && (
        <TileSettings
          item={settingsItem}
          kpis={kpis}
          onClose={() => setSettingsId(null)}
          onSave={(title, style, kpiIds) => {
            const config: ChartConfig = { ...settingsItem.config, style };
            if (kpiIds) { config.kpiIds = kpiIds; config.kpiId = kpiIds[0]; }
            patch(settingsItem, { title, config });
            setSettingsId(null);
          }}
        />
      )}
    </section>
  );
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

// Tuile KPI : un ou plusieurs indicateurs (multi-indicateurs) affichés en mini-cartes.
function KpiWidget({ ids, kpis, style }: { ids: string[]; kpis: Record<string, Kpi>; style: TileStyle }) {
  const list = ids.map((id) => kpis[id]).filter(Boolean);
  if (!list.length) return <div className="empty small">Ce KPI n'est plus disponible dans les données actuelles.</div>;
  if (list.length === 1) return <div className="board-kpi"><Card k={list[0]} focus={false} style={style} /></div>;
  const perRow = Math.max(1, Math.min(4, style.multiRows || 2));
  return (
    <div className="board-kpi multi" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
      {list.map((k) => (
        <div key={k.id} className="multi-kpi">
          <div className="multi-kpi-head">
            <span className="multi-kpi-label" style={{ fontSize: Math.max(10, (style.titleSize || 13) - 1) }}>{k.label}</span>
            {k.value != null && <span className="multi-kpi-val" style={{ fontSize: Math.max(14, (style.valueSize || 28) * 0.6) }}>{fmt(k.value)}<span className="kpi-unit">{k.unit === '%' ? ' %' : k.unit ? ` ${k.unit}` : ''}</span></span>}
          </div>
          {k.period && <span className="muted small">{k.period}</span>}
        </div>
      ))}
    </div>
  );
}

const CHART_COLORS = COLORS;

function ChartWidget({ cfg, chart, style }: { cfg: ChartConfig; chart?: ReturnType<typeof buildChart>; style: TileStyle }) {
  if (!chart) return <div className="empty small">Chargement du graphique…</div>;
  if (!chart.data.length) return <div className="empty small">Aucune donnée pour ce graphique.</div>;
  const suffix = chart.unit === '%' ? ' %' : chart.unit === 'idx' ? ' (base 100)' : '';
  const base = style.chartColor || CHART_COLORS[0];
  const colorAt = (k: number) => (k === 0 ? base : CHART_COLORS[k % CHART_COLORS.length]);
  const legend = style.showLegend !== false;
  const grid = style.showGrid !== false;
  const axes = style.showAxes !== false;
  const values = !!style.showValues;
  const xTick = style.titleSize ? { fontSize: Math.max(9, style.titleSize - 2) } : undefined;
  const display = style.display || (cfg.x === '@PERIOD' ? 'line' : 'bar');
  // Chaque indicateur (série) a ses propres bornes : une échelle Y indépendante par série.
  const perSeries = style.boundsPerSeries !== false && chart.names.length > 1;

  // Histogramme : répartition des valeurs en classes. Une classe par indicateur (bornes propres).
  if (display === 'histo') {
    const bins = Number(style.histoBins) || 0;
    const series = perSeries || style.histoPerSeries ? chart.names : [''];
    return (
      <div className="histo-wrap" style={{ gridTemplateColumns: `repeat(${Math.min(series.length, 3)}, 1fr)` }}>
        {series.map((name, si) => {
          const values0 = chart.data.map((d) => (name ? d[name] : (d[chart.names[0]] ?? null)) as number | null).filter((v): v is number => v != null);
          if (!values0.length) return null;
          const min = Math.min(...values0), max = Math.max(...values0);
          const n = bins || Math.max(4, Math.min(12, Math.ceil(Math.sqrt(values0.length))));
          const span = max - min || 1;
          const buckets = Array.from({ length: n }, (_, i) => {
            const lo = min + (span * i) / n, hi = min + (span * (i + 1)) / n;
            const count = values0.filter((v) => (i === n - 1 ? v <= hi : v >= lo && v < hi)).length;
            return { x: n <= 8 ? `${fmt(lo)}–${fmt(hi)}` : fmt(lo), count };
          });
          const color = colorAt(si);
          return (
            <div key={name || 's'} className="histo-item">
              {(perSeries || style.histoPerSeries) && name && <div className="histo-name small">{name}</div>}
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buckets} margin={{ top: 6, right: 8, bottom: 2, left: 0 }}>
                  {grid && <CartesianGrid strokeDasharray="3 3" />}
                  {axes && <XAxis dataKey="x" interval={n > 8 ? 1 : 0} angle={n > 6 ? -35 : 0} textAnchor={n > 6 ? 'end' : 'middle'} height={n > 6 ? 48 : 24} tick={xTick} />}
                  {axes && <YAxis allowDecimals={false} width={36} tick={xTick} />}
                  <Tooltip formatter={(v: unknown) => `${fmt(Number(v))} obs.`} />
                  <Bar dataKey="count" fill={color}>
                    {values && <LabelList dataKey="count" position="top" fontSize={10} />}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    );
  }

  const Chart = display === 'line' ? LineChart : BarChart;
  const horizontal = display === 'bar' && chart.horizontal;
  const margin = horizontal ? { top: 4, right: 16, bottom: 4, left: 4 } : { top: 6, right: 12, bottom: 2, left: 0 };
  // axes Y : un par série si bornes indépendantes, sinon un seul (à gauche ou à droite).
  const yAxes = perSeries ? chart.names : [''];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={chart.data} layout={horizontal ? 'vertical' : 'horizontal'} margin={margin}>
        {grid && <CartesianGrid strokeDasharray="3 3" />}
        {horizontal ? (
          <>
            {axes && <XAxis type="number" tickFormatter={fmt} tick={xTick} />}
            {axes && <YAxis type="category" dataKey="x" width={Math.min(180, style.valueSize ? style.valueSize * 6 : 140)} interval={0} tick={xTick} />}
          </>
        ) : (
          <>
            {axes && <XAxis dataKey="x" interval={0} angle={cfg.x === '@PERIOD' ? 0 : -25} textAnchor={cfg.x === '@PERIOD' ? 'middle' : 'end'} height={cfg.x === '@PERIOD' ? 24 : 64} tick={xTick} />}
            {axes && yAxes.map((name, yi) => (
              <YAxis key={name || `y${yi}`} yAxisId={perSeries ? `y${yi}` : 'y'} orientation={perSeries && yi % 2 ? 'right' : 'left'} tickFormatter={fmt} width={perSeries ? 40 : 46} tick={xTick} stroke={perSeries ? colorAt(yi) : undefined} />
            ))}
          </>
        )}
        <Tooltip formatter={(v: unknown) => fmt(Number(v)) + suffix} />
        {legend && <Legend />}
        {display === 'line'
          ? chart.names.map((s, k) => <Line key={s} yAxisId={perSeries ? `y${k}` : 'y'} type="monotone" dataKey={s} stroke={colorAt(k)} strokeWidth={2} dot connectNulls />)
          : chart.names.map((s, k) => (
            <Bar key={s} yAxisId={perSeries ? `y${k}` : 'y'} dataKey={s} fill={colorAt(k)}>
              {values && <LabelList dataKey={s} position={horizontal ? 'right' : 'top'} formatter={(v: unknown) => fmt(Number(v))} fontSize={10} />}
            </Bar>
          ))}
      </Chart>
    </ResponsiveContainer>
  );
}
