import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import { DEFAULT_TILE_STYLE, TileStyle } from '../dashConfig';

interface Pt { period: string; value: number }
export interface Kpi {
  id: string; label: string; theme: string; unit: string; dir: 'up' | 'down' | 'none'; dataset: string; datasetLabel: string; last_import: string | null;
  value: number | null; period: string | null; prev: Pt | null; series: Pt[]; ept: Pt | null; dep: Pt | null; reg: Pt | null; age: number | null;
  indicators: { id: number; libelle: string; statut: string; priorite: number | null }[];
  statut: 'valide' | 'brouillon' | 'abandonne' | 'sans_fiche';
  states: { valide: number; brouillon: number; abandonne: number };
}
interface Priority { id: number; libelle: string; theme: string; statut: string; priorite: number; data: boolean }
interface Dash {
  generated: string;
  summary: { total: number; brouillon: number; valide: number; abandonne: number; priority: number; priorityWithData: number; priorityValid: number };
  kpis: Kpi[]; priority: Priority[];
}

const fmt = (v: number) => {
  const a = Math.abs(v);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
};
const BADGE: Record<string, { label: string; color: string }> = {
  valide: { label: 'Validé', color: '#18794e' },
  brouillon: { label: 'Brouillon', color: '#9a6700' },
  abandonne: { label: 'Abandonné', color: '#64748b' },
  sans_fiche: { label: 'Sans fiche', color: '#64748b' },
};

export type TrendStyle = 'spark' | 'background' | 'none';

export function Card({ k, focus, onAdd, trend, style }: { k: Kpi; focus: boolean; onAdd?: (k: Kpi) => void; trend?: TrendStyle; style?: TileStyle }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const st: TileStyle = { ...DEFAULT_TILE_STYLE, ...(style || {}) };
  const tr: TrendStyle = trend ?? st.trend ?? 'spark';
  const delta = k.value != null && k.prev ? k.value - k.prev.value : null;
  const pct = delta != null && k.prev && k.prev.value !== 0 ? (delta / Math.abs(k.prev.value)) * 100 : null;
  const good = delta == null || delta === 0 || k.dir === 'none' ? 'flat' : (delta > 0) === (k.dir === 'up') ? 'good' : 'bad';
  const unit = k.unit === '%' ? ' %' : k.unit ? ` ${k.unit}` : '';
  const b = BADGE[k.statut];
  const color = good === 'good' ? '#16a34a' : good === 'bad' ? '#dc2626' : '#2563eb';
  const hasSpark = k.series.length > 1 && tr !== 'none';
  const align = st.align || 'left';
  return (
    <div className={`kpi-card${focus ? ' focus' : ''}${tr === 'background' ? ' has-bg-trend' : ''}`} id={`kpi-${k.id}`} style={{ textAlign: align, color: st.textColor || undefined }}>
      {tr === 'background' && hasSpark && (
        <div className="kpi-bg-trend" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={k.series}><Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {(st.showTheme !== false || onAdd || st.showBadge !== false) && (
        <div className="kpi-top">
          {st.showTheme !== false && <span className="muted small">{k.theme}</span>}
          <span className="kpi-actions">
            {onAdd && (
              <button className="icon add-kpi" disabled={added} title="Ajouter ce KPI à mon tableau de bord"
                onClick={() => { onAdd(k); setAdded(true); }}>{added ? '✓ ajouté' : '+ mon tableau'}</button>
            )}
            {st.showBadge !== false && <span className="kpi-badge" style={{ background: b.color }} title={`${k.states.valide} validé(s), ${k.states.brouillon} brouillon(s) parmi ${k.indicators.length} fiche(s) rattachée(s)`}>{b.label}</span>}
          </span>
        </div>
      )}
      <div className="kpi-label" style={{ fontSize: st.titleSize, color: st.titleColor || st.textColor || undefined }}>{k.label}</div>
      {k.value == null ? (
        <div className="kpi-val muted">non disponible</div>
      ) : (
        <>
          <div className="kpi-main" style={{ justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }}>
            <div className="kpi-val" style={{ fontSize: st.valueSize, fontWeight: st.bold === false ? 400 : 700 }}>{fmt(k.value)}<span className="kpi-unit">{unit}</span></div>
            {tr === 'spark' && st.showTrend !== false && (
              <div className="kpi-spark">
                {hasSpark && (
                  <ResponsiveContainer width="100%" height={44}>
                    <LineChart data={k.series}><Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </div>
          {(st.showPeriod !== false || st.showDelta !== false) && (
            <div className="kpi-sub small">
              {st.showPeriod !== false && <span className="muted">{k.period}</span>}
              {st.showDelta !== false && delta != null && (
                <span className={`kpi-delta ${good}`}>
                  {delta > 0 ? '▲' : delta < 0 ? '▼' : '►'} {delta > 0 ? '+' : ''}{fmt(delta)}{k.unit === '%' ? ' pts' : ''}{pct != null && k.unit !== '%' ? ` (${pct > 0 ? '+' : ''}${fmt(pct)} %)` : ''}
                  <span className="muted"> vs {k.prev!.period}</span>
                </span>
              )}
            </div>
          )}
          {st.showCompare === true && (k.ept || k.dep || k.reg) && (
            <div className="kpi-cmp small">
              {k.ept && <span title="Grand-Orly Seine Bièvre : agrégation des 24 communes">GOSB <b>{fmt(k.ept.value)}</b></span>}
              {k.dep && <span>Val-de-Marne <b>{fmt(k.dep.value)}</b></span>}
              {k.reg && <span>Île-de-France <b>{fmt(k.reg.value)}</b></span>}
            </div>
          )}
        </>
      )}
      {(st.showLink !== false || k.indicators.length > 0) && (
        <div className="kpi-foot small">
          {st.showLink !== false && <Link to={`/donnees?ds=${k.dataset}`} title={k.datasetLabel}>Données</Link>}
          {k.age != null && k.age >= 3 && <span className="al-attention" title="Dernière période ancienne">· {k.age} ans</span>}
          {k.indicators.length > 0 && <button className="linklike" onClick={() => setOpen(!open)}>{open ? 'Masquer' : `${k.indicators.length} fiche(s)`}</button>}
        </div>
      )}
      {open && (
        <ul className="kpi-ind small">
          {k.indicators.map((i) => (
            <li key={i.id}><i className="dotc" style={{ background: BADGE[i.statut]?.color }} />{i.priorite ? <b>P{i.priorite} </b> : null}{i.libelle}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Tableau de bord : principaux indicateurs clés d'Ivry-sur-Seine et état de validation des fiches indicateurs
export default function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('');
  const [params] = useSearchParams();
  const focusId = params.get('kpi') || '';
  const [added, setAdded] = useState<string[]>([]);
  useEffect(() => { api<Dash>('/kpi').then(setD).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (d && focusId) document.getElementById(`kpi-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [d, focusId]);
  // Ajoute le KPI concerné à « Mon tableau de bord » (KPI figé : valeur et comparaisons suivent les données)
  const addKpi = async (k: Kpi) => {
    try {
      await api('/dashboard', { body: { kind: 'kpi', title: k.label, config: { kpiId: k.id } } });
      setAdded((a) => [...a, k.id]);
    } catch (e) { setError((e as Error).message); }
  };
  const themes = useMemo(() => [...new Set((d?.kpis ?? []).map((k) => k.theme))], [d]);
  const shown = (d?.kpis ?? []).filter((k) => !theme || k.theme === theme);
  const prioByTheme = useMemo(() => {
    const m = new Map<string, Priority[]>();
    for (const p of d?.priority ?? []) (m.get(p.theme || '—') ?? m.set(p.theme || '—', []).get(p.theme || '—')!).push(p);
    return [...m.entries()];
  }, [d]);

  if (!d) return <section className="page"><div className="page-head"><h1>Indicateurs</h1></div>{error ? <div className="error">{error}</div> : <div className="empty">Calcul des indicateurs…</div>}</section>;
  const s = d.summary;
  const pct = (n: number, t: number) => (t ? Math.round((100 * n) / t) : 0);
  const available = d.kpis.filter((k) => k.value != null).length;

  return (
    <section className="page dashboard">
      <div className="page-head"><h1>Indicateurs · Ivry-sur-Seine</h1></div>

      <div className="db-cards">
        <div className="db-card"><div className="muted small">Indicateurs suivis</div><div className="db-val">{s.total}</div><div className="muted small">{s.valide} validés · {s.brouillon} brouillons · {s.abandonne} abandonnés</div></div>
        <div className="db-card"><div className="muted small">Validation</div><div className="db-val">{pct(s.valide, s.total - s.abandonne)} %</div><div className="muted small">des indicateurs actifs sont validés</div></div>
        <div className="db-card"><div className="muted small">Priorités 1-2</div><div className="db-val">{s.priorityValid} / {s.priority}</div><div className="muted small">validées · {s.priorityWithData} avec données rattachées</div></div>
        <div className="db-card"><div className="muted small">KPI calculés</div><div className="db-val">{available} / {d.kpis.length}</div><div className="muted small">à partir des données importées</div></div>
      </div>

      <div className="presets">
        <button className={theme === '' ? 'on' : ''} onClick={() => setTheme('')}>Tous</button>
        {themes.map((t) => <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>{t}</button>)}
      </div>

      <div className="kpi-grid">{shown.map((k) => <Card key={k.id} k={k} focus={k.id === focusId} onAdd={addKpi} />)}</div>
      <p className="muted small">
        Valeur la plus récente disponible, évolution par rapport à la période précédente (vert : favorable, rouge : défavorable, bleu : neutre) et comparaison avec le Val-de-Marne et l'Île-de-France pour les taux et les prix.
        Le badge indique l'état de validation des fiches indicateurs correspondantes (rapprochement par intitulé).
        « + mon tableau » ajoute le KPI à <Link to="/mon-tableau">Mon tableau de bord</Link>, où vous pouvez le déplacer et le redimensionner.
        {added.length > 0 && <> <b>{added.length}</b> KPI ajouté(s) à cette session.</>}
      </p>

      <h2>Indicateurs prioritaires (P1 et P2) : état de validation</h2>
      <div className="prio-grid">
        {prioByTheme.map(([t, list]) => (
          <div key={t} className="prio-block">
            <h3>{t} <span className="muted small">{list.filter((p) => p.statut === 'valide').length} / {list.length} validés</span></h3>
            <ul className="small">
              {list.map((p) => (
                <li key={p.id}>
                  <i className="dotc" style={{ background: BADGE[p.statut]?.color }} title={BADGE[p.statut]?.label} />
                  <b>P{p.priorite}</b> {p.libelle}
                  {!p.data && <span className="muted"> · sans données</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
