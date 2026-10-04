import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, fmtDate } from '../api';
import CarteDonnees from './CarteDonnees';
import EvolutionDonnees from './EvolutionDonnees';
import { VIEWS } from '../datasetViews';
import { Mode, MAX_CATEGORIES, Ratio, Sel, buildChart, buildSelection, cellValue, distinct, initialSelection, isMeasureDim, natCompare, pinnedDims, selectRows } from '../explorer';
import { configFromSelection } from '../dashConfig';
import { useModal } from '../modal';
import { Couche, DataRow, Dataset, DatasetData, Geo, Indicator, Job, LEVEL_LABEL } from '../types';
import { SourceBadge } from '../badges';

const REF = '94041';
const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#475569', '#ea580c'];
const PAGE_SIZE = 100;
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fmt = (v: number) => {
  const a = Math.abs(v);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
};

export default function Donnees() {
  const modal = useModal();
  const [params, setParams] = useSearchParams();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [geos, setGeos] = useState<Geo[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [filter, setFilter] = useState('');
  const [liveCouches, setLiveCouches] = useState<Couche[]>([]);
  useEffect(() => { api<{ couches: Couche[] }>('/couches').then((r) => setLiveCouches(r.couches)).catch(() => setLiveCouches([])); }, []);
  const [data, setData] = useState<DatasetData | null>(null);
  const [onlyRef, setOnlyRef] = useState(true);
  const [compare, setCompare] = useState('');
  const [view, setView] = useState<'chart' | 'key' | 'table' | 'map' | 'evol'>('chart');
  const [idfCommunes, setIdfCommunes] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const poll = useRef<number | undefined>(undefined);

  // sélection de l'explorateur
  const [x, setX] = useState('@PERIOD');
  const [series, setSeries] = useState('');
  const [pins, setPins] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState('');
  const [level, setLevel] = useState(0);
  const [parents, setParents] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>('brut');
  const [withTotals, setWithTotals] = useState(false);
  const [keep, setKeep] = useState<Record<string, string[]>>({});
  const [ratio, setRatio] = useState<Ratio | null>(null);
  const [band5, setBand5] = useState(false);
  const [presetIdx, setPresetIdx] = useState<number | null>(null);
  const initFor = useRef('');

  // tableau brut
  const [rawFilters, setRawFilters] = useState<Record<string, string>>({});
  const [rawSearch, setRawSearch] = useState('');
  const [page, setPage] = useState(0);

  const dsId = params.get('ds') || '';
  const current = datasets.find((d) => d.id === dsId);
  const vcfg = VIEWS[dsId] ?? {};

  const loadMeta = useCallback(async () => {
    const [d, g, i] = await Promise.all([api<Dataset[]>('/datasets'), api<Geo[]>('/geos?all=1'), api<Indicator[]>('/indicators')]);
    setDatasets(d); setGeos(g); setIndicators(i);
    api<{ communes: number }>('/idf/status').then((s) => setIdfCommunes(s.communes)).catch(() => undefined);
    return d;
  }, []);

  useEffect(() => {
    loadMeta().then((d) => { if (!params.get('ds') && d.length) setParams({ ds: d[0].id }, { replace: true }); }).catch((e) => setError(e.message));
    // reprise du suivi si un import est déjà en cours (page rechargée, autre onglet)
    api<Job | null>('/jobs/current').then((j) => { if (j) follow(j); }).catch(() => undefined);
    return () => window.clearInterval(poll.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shownGeos = useMemo(() => {
    if (onlyRef) return [REF];
    if (compare) return [REF, compare];
    return geos.filter((g) => !g.bulk).map((g) => g.code);
  }, [onlyRef, compare, geos]);

  const loadData = useCallback(async () => {
    if (!dsId) return;
    try {
      setData(await api<DatasetData>(`/datasets/${dsId}/data?geos=${shownGeos.join(',')}`));
      setError('');
    } catch (e) { setError((e as Error).message); }
  }, [dsId, shownGeos]);

  useEffect(() => { setData(null); initFor.current = ''; setRawFilters({}); setRawSearch(''); setPage(0); setMode('brut'); setWithTotals(false); setLevel(0); setParents({}); }, [dsId]);
  useEffect(() => { loadData(); }, [loadData]);

  const follow = (j: Job) => {
    setJob(j);
    window.clearInterval(poll.current);
    poll.current = window.setInterval(async () => {
      try {
        const s = await api<Job>(`/jobs/${j.id}`);
        setJob(s);
        if (s.status !== 'en cours') { window.clearInterval(poll.current); await loadMeta(); await loadData(); }
      } catch { window.clearInterval(poll.current); }
    }, 1000);
  };
  // import de toutes les communes d'Île-de-France : un jeu ou tous les jeux
  const importIdf = async (allDatasets: boolean) => {
    const what = allDatasets ? `les ${datasets.length} jeux` : 'ce jeu';
    const ok = await modal.confirm({ title: "Charger / actualiser l'Île-de-France", message: `Charger ${what} pour les ${idfCommunes || 1266} communes d'Île-de-France ? L'opération télécharge de gros volumes (plusieurs dizaines de minutes pour tous les jeux).` });
    if (!ok) return;
    try { follow(await api<Job>('/import', { body: { scope: 'idf', datasets: allDatasets ? undefined : [dsId] } })); } catch (e) { setError((e as Error).message); }
  };
  const pickCommune = (code: string) => { setOnlyRef(false); setCompare(code); };

  // ---------- structure du jeu ----------
  const rows = data?.rows ?? [];
  const dimNames = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => Object.keys(r.dims).forEach((k) => s.add(k)));
    return [...s];
  }, [rows]);
  const dimValues = useMemo(() => {
    const m: Record<string, string[]> = {};
    dimNames.forEach((d) => { m[d] = distinct(rows, d); });
    return m;
  }, [rows, dimNames]);
  const lab = (dim: string, code: string) => data?.labels?.[dim]?.values?.[code] ?? (code === '_T' ? 'Total' : code === '_Z' ? 'Non renseigné' : code);
  const dimLabel = (dim: string) => (dim === '@PERIOD' ? 'Période' : data?.labels?.[dim]?.label ?? dim);
  const geoName = (code: string) => geos.find((g) => g.code === code)?.nom ?? code;
  // population du territoire au millésime du recensement le plus proche de la période (sinon la plus récente)
  const popOf = (code: string, per?: string | null) => {
    const g = geos.find((x) => x.code === code);
    if (!g) return null;
    const s = g.pop_series ?? {};
    const years = Object.keys(s);
    const y = Number(String(per ?? '').slice(0, 4));
    if (!years.length || !y) return g.population || null;
    const best = years.reduce((a, b) => (Math.abs(Number(b) - y) < Math.abs(Number(a) - y) ? b : a));
    return s[best];
  };
  const hier = vcfg.hier && vcfg.hier.every((h) => dimNames.includes(h)) ? vcfg.hier : null;
  const measureDim = dimNames.find(isMeasureDim);

  const ctx = useMemo(() => ({ dimNames, hier, label: lab, geoName, popOf }), [dimNames, hier, data, geos]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel: Sel = { x, series, pins, period, level, parents, mode, withTotals, keep, ratio, band5 };
  const applySel = (s: Sel, idx: number | null) => {
    setX(s.x); setSeries(s.series); setPins(s.pins); setPeriod(s.period); setLevel(s.level); setParents({}); setMode(s.mode);
    setWithTotals(false); setKeep(s.keep); setRatio(s.ratio); setBand5(s.band5); setPresetIdx(idx);
  };

  // initialisation de la sélection à l'ouverture d'un jeu
  useEffect(() => {
    if (!data || initFor.current === dsId || !rows.length) return;
    initFor.current = dsId;
    applySel(initialSelection(rows, ctx, vcfg), vcfg.presets?.length ? 0 : null);
    setView(vcfg.keyfigures ? 'key' : 'chart');
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- sélection de lignes ----------
  const pinned = useMemo(() => pinnedDims(sel, ctx), [x, series, ratio, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const basePeriods = useMemo(() => [...new Set(rows.map((r) => r.period ?? ''))].sort(), [rows]);
  const selected = useMemo(() => selectRows(rows, sel, ctx), [rows, x, series, pins, period, level, parents, withTotals, keep, ratio, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = (r: DataRow) => cellValue(r, mode, ctx);
  const noPop = mode === 'pop' ? [...new Set(selected.map((r) => r.geo))].filter((g) => !popOf(g)) : [];
  const preset = presetIdx != null ? vcfg.presets?.[presetIdx] : undefined;
  const measureText = ratio?.label ?? (measureDim && pins[measureDim] && ![x, series].includes(measureDim) ? lab(measureDim, pins[measureDim]) : '');
  const chart = useMemo(() => buildChart(selected, sel, ctx), [selected, mode, band5, ratio, keep, x, series, level, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const suffix = chart.unit === '%' ? ' %' : chart.unit === 'idx' ? ' (base 100)' : '';

  // onglet Évolution : lecture chronologique (axe période) ; on prend le premier préréglage dans le temps si besoin
  const openEvol = () => {
    setView('evol');
    if (x === '@PERIOD') return;
    const i = vcfg.presets?.findIndex((q) => q.x === '@PERIOD') ?? -1;
    if (i >= 0) applySel(buildSelection(rows, ctx, vcfg.presets![i]), i);
    else { setX('@PERIOD'); if (series === '@PERIOD') setSeries(''); setPresetIdx(null); }
  };

  // ---------- chiffres clés : une ligne par mesure ----------
  const keyTable = useMemo(() => {
    if (!measureDim) return null;
    const otherPins = dimNames.filter((d) => d !== measureDim && d !== 'UNIT_MEASURE');
    const base = rows.filter((r) => otherPins.every((d) => !pins[d] || r.dims[d] === pins[d]));
    const measures = [...new Set(base.map((r) => r.dims[measureDim]))].sort(natCompare);
    const geoList = shownGeos.filter((g) => base.some((r) => r.geo === g));
    const cell = (m: string, g: string) => {
      const list = base.filter((r) => r.dims[measureDim] === m && r.geo === g).sort((a, b) => (a.period ?? '').localeCompare(b.period ?? ''));
      const latest = list[list.length - 1];
      return latest ? { value: latest.value, period: latest.period, status: latest.status, unit: latest.dims.UNIT_MEASURE } : null;
    };
    return { measures, geoList, cell };
  }, [rows, dimNames, measureDim, pins, shownGeos]);

  // ---------- tableau brut ----------
  const rawRows = useMemo(() => {
    const q = norm(rawSearch);
    return rows.filter((r) =>
      Object.entries(rawFilters).every(([d, v]) => !v || r.dims[d] === v) &&
      (!q || norm(`${geoName(r.geo)} ${r.period} ${Object.entries(r.dims).map(([d, v]) => `${lab(d, v)} ${v}`).join(' ')}`).includes(q))
    );
  }, [rows, rawFilters, rawSearch, geos, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ajoute le graphique affiché (avec sa forme et son paramétrage actuels) à « Mon tableau de bord ».
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [dashTitle, setDashTitle] = useState('');
  const [dashOpen, setDashOpen] = useState(false);
  const defaultTitle = () => [preset?.label, measureText].filter(Boolean).join(' : ') || current?.label || dsId;
  const addToDashboard = async (title: string) => {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const popByGeo: Record<string, Record<string, number>> = {};
      const geoNames: Record<string, string> = {};
      for (const g of geos) { geoNames[g.code] = g.nom; if (g.pop_series) popByGeo[g.code] = g.pop_series; }
      const cfg = configFromSelection(dsId, dimNames, hier, sel, shownGeos, {
        dsLabel: current?.label, unit: measureText || preset?.label,
        labels: data?.labels, popByGeo, geoNames,
      });
      await api('/dashboard', { body: { kind: 'chart', title: title.trim(), config: cfg } });
      setNotice('Graphique ajouté à « Mon tableau de bord ».');
      setDashOpen(false); setDashTitle('');
    } catch (e) { setError((e as Error).message); }
    finally { setAdding(false); }
  };

  const exportCsv = () => {
    const cols = ['territoire', 'periode', ...dimNames, 'valeur', 'statut'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rawRows.map((r) => [geoName(r.geo), r.period, ...dimNames.map((d) => (r.dims[d] ? `${r.dims[d]} (${lab(d, r.dims[d])})` : '')), r.value, r.status].map(esc).join(';'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + [cols.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `${dsId}.csv`;
    a.click();
  };

  // ---------- écart avec le territoire de comparaison ----------
  const ecart = useMemo(() => {
    if (!compare || onlyRef || x !== '@PERIOD') return null;
    const sums = (g: string) => {
      const m = new Map<string, number>();
      selected.filter((r) => r.geo === g).forEach((r) => { const v = value(r); if (v != null) m.set(r.period ?? '', (m.get(r.period ?? '') ?? 0) + v); });
      return m;
    };
    const a = sums(REF), b = sums(compare);
    const common = [...a.keys()].filter((p) => b.has(p)).sort();
    if (!common.length) return null;
    const p = common[common.length - 1];
    const va = a.get(p)!, vb = b.get(p)!;
    return { period: p, ref: va, other: vb, diff: va - vb, pct: vb ? ((va - vb) / Math.abs(vb)) * 100 : null };
  }, [selected, compare, onlyRef, x, mode, geos]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- communes ----------
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ code: string; nom: string; dept: string; population: number }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => api<typeof hits>(`/geos/search?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const addGeo = async (h: (typeof hits)[number]) => {
    setQ(''); setHits([]);
    try {
      const r = await api<{ job: Job | null }>('/geos', { body: { ...h, import: true } });
      await loadMeta();
      setOnlyRef(false); setCompare(h.code);
      if (r.job) follow(r.job);
    } catch (e) { setError((e as Error).message); }
  };
  const removeGeo = async (code: string) => {
    const ok = await modal.confirm({ title: 'Retirer le territoire', message: `Retirer ${geoName(code)} et ses données importées ?`, okLabel: 'Retirer', danger: true });
    if (!ok) return;
    await api(`/geos/${code}`, { method: 'DELETE' });
    if (compare === code) setCompare('');
    await loadMeta(); await loadData();
  };

  const visibleDatasets = datasets.filter((d) => norm(`${d.label} ${d.description}`).includes(norm(filter)));
  const linked = indicators.filter((i) => current?.indicator_ids.includes(i.id));
  const pageRows = rawRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const missing = shownGeos.filter((g) => !(current?.geo_counts[g]));
  const levelOptions = hier ? hier.map((h, k) => ({ k, label: dimLabel(h) })) : [];
  const statusText = (s?: string | null) => (s?.startsWith('O') ? 'valeur non diffusée (secret statistique ou valeur manquante)' : s ?? '');
  const unitOf = (u?: string) => (u ? data?.labels?.UNIT_MEASURE?.values?.[u] ?? u : '');

  return (
    <section className="page donnees">
      <div className="page-head">
        <h1>Données</h1>
        <div className="actions">
          <button onClick={() => importIdf(true)} disabled={job?.status === 'en cours'} title="Charge ou actualise tous les jeux pour les communes d'Île-de-France">
            {job?.status === 'en cours' ? 'Import Île-de-France en cours…' : '⟳ Tout actualiser en Île-de-France'}
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {job && (
        <div className={`job ${job.status === 'en cours' ? 'run' : job.errors ? 'bad' : 'ok'}`}>
          <div className="job-line">
            <strong>{job.status === 'en cours' ? 'Mise à jour en cours' : job.status === 'arrêté' ? 'Import arrêté' : job.errors ? 'Mise à jour terminée avec erreurs' : 'Mise à jour terminée'}</strong>
            <span>{job.done} / {job.total}{job.scope === 'idf' ? ' jeux' : ''} ({job.total ? Math.round((100 * job.done) / job.total) : 0} %){job.errors ? ` · ${job.errors} erreur(s)` : ''}</span>
            {job.status !== 'en cours' && <button className="icon" onClick={() => setJob(null)}>✕</button>}
          </div>
          <div className="progress"><div style={{ width: `${job.total ? (100 * job.done) / job.total : 0}%` }} /></div>
          {job.status === 'en cours' && job.current && (
            <div className="job-current small">
              <div className="job-line">
                <span><strong>{job.current.label}</strong>{job.current.attempt > 1 ? ` · passage ${job.current.attempt}` : ''} <span className="muted">· {job.current.method}</span></span>
                <span>{job.current.done} / {job.current.total} territoires ({job.current.total ? Math.round((100 * job.current.done) / job.current.total) : 0} %)</span>
                <span>
                  <button className="secondary" onClick={() => api(`/jobs/${job.id}/skip`, { body: {} }).catch(() => undefined)} title="Abandonne ce jeu, passe au suivant et le reprendra plus tard">Passer ce jeu</button>{' '}
                  <button className="secondary" onClick={async () => { if (await modal.confirm({ title: "Arrêter l'import", message: "Arrêter l'import en cours ?", okLabel: 'Arrêter', danger: true })) api(`/jobs/${job.id}/cancel`, { body: {} }).catch(() => undefined); }}>Arrêter</button>
                </span>
              </div>
              <div className="progress thin"><div style={{ width: `${job.current.total ? (100 * job.current.done) / job.current.total : 0}%` }} /></div>
            </div>
          )}
          {job.status === 'en cours' && (job.deferred?.length ?? 0) > 0 && <div className="small muted">Jeux reportés (repris plus tard) : {job.deferred!.join(', ')}</div>}
          {job.status === 'en cours' && job.log.length > 0 && <div className="small">{job.log[job.log.length - 1]}</div>}
          {job.errors > 0 && (
            <details className="small">
              <summary>Voir les erreurs</summary>
              <ul>{job.log.filter((l) => l.includes('ERREUR')).map((l, k) => <li key={k}>{l}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      <div className="split">
        <aside className="side">
          <input className="search" placeholder="Filtrer les jeux de données…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul>
            {visibleDatasets.map((d) => (
              <li key={d.id} className={d.id === dsId ? 'active' : ''} onClick={() => setParams({ ds: d.id })}>
                <span className={`dot ${d.nb_rows ? 'ok' : 'none'}`} title={d.nb_rows ? 'Importé' : 'Pas encore importé'} />
                <div>
                  <div>{d.label}{d.map_capable && (
                    <span
                      className={`pill-map ${(d.map_communes ?? 0) >= 50 ? 'on' : 'off'}`}
                      title={(d.map_communes ?? 0) >= 50 ? `Carte disponible : ${d.map_communes} communes d'Île-de-France` : 'Carte possible : données d\'Île-de-France à charger'}
                    >🗺 carte</span>
                  )}</div>
                  <div className="muted small">{d.nb_rows ? <SourceBadge kind="import" title={`Importé le ${fmtDate(d.last_import)}`} /> : null} {d.nb_rows ? `${d.nb_rows} lignes · ${fmtDate(d.last_import)}` : 'non importé'} · {d.nb_indicateurs} indic.</div>
                </div>
              </li>
            ))}
          </ul>
          {liveCouches.length > 0 && (
            <>
              <div className="side-sep">Couches lues en direct (géoportail du Val-de-Marne)</div>
              <ul>
                {liveCouches.filter((c) => norm(`${c.label} ${c.theme}`).includes(norm(filter))).map((c) => (
                  <li key={c.id}>
                    <Link to={`/couches?couche=${c.id}`} className="live-link">
                      <div>{c.label}</div>
                      <div className="muted small"><SourceBadge kind="live" title={`WFS ${c.layer} : aucune donnée stockée`} /> {c.theme}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <div className="main">
          {!current && <div className="empty">Sélectionnez un jeu de données.</div>}
          {current && (
            <>
              <div className="ds-head">
                <div>
                  <h2>{current.label}</h2>
                  <p className="muted">{current.description}</p>
                  <p className="small muted">
                    Dernière mise à jour : <strong>{fmtDate(current.last_import)}</strong> · {current.nb_rows} lignes stockées
                    {current.doc_url && <> · <a href={current.doc_url} target="_blank" rel="noreferrer">Documentation du jeu ↗</a></>}
                  </p>
                </div>
                <button onClick={() => importIdf(false)} disabled={job?.status === 'en cours'}>
                  {current.nb_rows ? 'Mettre à jour (réimporter)' : 'Importer'}
                </button>
              </div>

              <div className="toolbar">
                <label className="inline switch">
                  <input type="checkbox" checked={onlyRef} onChange={(e) => setOnlyRef(e.target.checked)} /> Ivry-sur-Seine uniquement
                </label>
                <label className="inline">Comparer avec
                  <select value={compare} onChange={(e) => { setCompare(e.target.value); if (e.target.value) setOnlyRef(false); }}>
                    <option value="">— tous les territoires importés —</option>
                    {compare && geos.find((g) => g.code === compare)?.bulk ? <option value={compare}>{geoName(compare)} (carte)</option> : null}
                    <optgroup label="Territoires de référence">
                      {geos.filter((g) => !g.fixed && g.level !== 'COM' && !g.bulk).map((g) => <option key={g.code} value={g.code}>{g.nom} ({LEVEL_LABEL[g.level]})</option>)}
                    </optgroup>
                    <optgroup label="Communes">
                      {geos.filter((g) => !g.fixed && g.level === 'COM' && !g.bulk).map((g) => <option key={g.code} value={g.code}>{g.nom} ({g.dept})</option>)}
                    </optgroup>
                  </select>
                </label>
                {compare && !geos.find((g) => g.code === compare)?.bulk && <button className="icon" title="Retirer ce territoire" onClick={() => removeGeo(compare)}>🗑</button>}
                <div className="geo-search">
                  <input placeholder="Ajouter une commune (nom ou code INSEE)…" value={q} onChange={(e) => setQ(e.target.value)} />
                  {hits.length > 0 && (
                    <ul className="hits">
                      {hits.map((h) => <li key={h.code} onClick={() => addGeo(h)}>{h.nom} <span className="muted small">({h.dept}) · {h.population?.toLocaleString('fr-FR')} hab.</span></li>)}
                    </ul>
                  )}
                </div>
              </div>
              {missing.length > 0 && (
                <div className="warn small">
                  Aucune donnée pour : {missing.map(geoName).join(', ')}. Soit le jeu ne couvre pas ce niveau géographique, soit l'import n'a pas été fait ({current.nb_rows ? 'Mettre à jour' : 'Importer'}).
                </div>
              )}

              {data && rows.length > 0 && (
                <>
                  <div className="tabs">
                    <button className={view === 'chart' ? 'on' : ''} onClick={() => setView('chart')}>Graphique</button>
                    {measureDim && (dimValues[measureDim]?.length ?? 0) > 1 && <button className={view === 'key' ? 'on' : ''} onClick={() => setView('key')}>Chiffres clés</button>}
                    {basePeriods.length > 1 && <button className={view === 'evol' ? 'on' : ''} onClick={openEvol}>Évolution</button>}
                    {current.map_capable && <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>Carte</button>}
                    <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Données brutes ({rawRows.length})</button>
                    <span className="spacer" />
                    <button className="secondary" onClick={exportCsv}>Exporter CSV</button>
                  </div>

                  {(view === 'chart' || view === 'map' || view === 'evol') && vcfg.presets && (
                    <div className="presets">
                      {vcfg.presets.map((p, i) => (
                        <button key={i} className={presetIdx === i ? 'on' : ''} onClick={() => applySel(buildSelection(rows, ctx, p), i)}>{p.label}</button>
                      ))}
                    </div>
                  )}
                  {(view === 'chart' || view === 'map' || view === 'evol') && preset?.note && <div className="note-box small">{preset.note}</div>}
                  {vcfg.note && <div className="note-box small">{vcfg.note}</div>}
                  {view === 'chart' && x === '@GEO' && shownGeos.length < 2 && (
                    <div className="warn small">Ce graphique compare des territoires : décochez « Ivry-sur-Seine uniquement » (et choisissez un territoire, ou laissez « tous les territoires importés »).</div>
                  )}

                  {view !== 'table' && (
                    <div className="filters">
                      {view === 'chart' && (
                        <>
                          <label className="field small"><span>Axe horizontal</span>
                            <select value={x} onChange={(e) => { setX(e.target.value); setPresetIdx(null); if (series === e.target.value) setSeries(''); }}>
                              <option value="@PERIOD">Période</option>
                              <option value="@GEO">Territoire</option>
                              {hier && <option value="@HIER">{hier.map(dimLabel).join(' › ')}</option>}
                              {dimNames.filter((d) => d !== 'UNIT_MEASURE' && !(hier ?? []).includes(d)).map((d) => <option key={d} value={d}>{dimLabel(d)}{isMeasureDim(d) ? ' (mesure)' : ''}</option>)}
                            </select>
                          </label>
                          <label className="field small"><span>Séries</span>
                            <select value={series} onChange={(e) => { setSeries(e.target.value); setPresetIdx(null); }}>
                              <option value="">(aucune)</option>
                              {x !== '@PERIOD' && <option value="@PERIOD">Période</option>}
                              {dimNames.filter((d) => d !== x && d !== 'UNIT_MEASURE' && !(hier ?? []).includes(d)).map((d) => <option key={d} value={d}>{dimLabel(d)}{isMeasureDim(d) ? ' (mesure)' : ''}</option>)}
                            </select>
                          </label>
                          <label className="field small"><span>Valeurs</span>
                            <select value={mode} disabled={!!ratio} onChange={(e) => { setMode(e.target.value as Mode); setPresetIdx(null); }}>
                              <option value="brut">Valeurs brutes</option>
                              <option value="pop">Pour 1 000 habitants</option>
                              <option value="part" disabled={x === '@PERIOD'}>Répartition en %</option>
                              <option value="idx" disabled={x !== '@PERIOD'}>Indice (base 100 à la 1re période)</option>
                            </select>
                          </label>
                          {x === 'AGE' && dimValues.AGE?.some((v) => /^Y\d+$/.test(v)) && (
                            <label className="inline small"><input type="checkbox" checked={band5} onChange={(e) => setBand5(e.target.checked)} /> Tranches de 5 ans</label>
                          )}
                          {ratio && (
                            <span className="chip ds" title="Calcul d'un ratio entre deux groupes de modalités">
                              Calcul : {ratio.label} <button className="icon" onClick={() => { setRatio(null); setPresetIdx(null); }}>✕</button>
                            </span>
                          )}
                        </>
                      )}
                      {x === '@HIER' && hier && view === 'chart' && (
                        <>
                          <label className="field small"><span>Niveau de détail</span>
                            <select value={level} onChange={(e) => { setLevel(Number(e.target.value)); setParents({}); }}>
                              {levelOptions.map((o) => <option key={o.k} value={o.k}>{o.k + 1}. {o.label}</option>)}
                            </select>
                          </label>
                          {hier.slice(0, level).map((h) => (
                            <label key={h} className="field small"><span>Restreindre : {dimLabel(h)}</span>
                              <select value={parents[h] ?? ''} onChange={(e) => setParents({ ...parents, [h]: e.target.value })}>
                                <option value="">(tous)</option>
                                {dimValues[h].filter((v) => v !== '_T').map((v) => <option key={v} value={v}>{lab(h, v)}</option>)}
                              </select>
                            </label>
                          ))}
                        </>
                      )}
                      {view === 'chart' && x !== '@PERIOD' && basePeriods.length > 1 && (
                        <label className="field small"><span>Période</span>
                          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                            {basePeriods.map((p) => <option key={p} value={p}>{p || '—'}</option>)}
                          </select>
                        </label>
                      )}
                      {pinned.filter((d) => view === 'chart' || view === 'map' || d !== measureDim).map((d) => (
                        <label key={d} className="field small"><span title={d}>{dimLabel(d)}{isMeasureDim(d) ? ' (mesure)' : ''}</span>
                          <select value={pins[d] ?? ''} onChange={(e) => setPins({ ...pins, [d]: e.target.value })}>
                            {dimValues[d].map((v) => <option key={v} value={v}>{lab(d, v)}{lab(d, v) !== v && v !== '_T' ? ` [${v}]` : ''}</option>)}
                          </select>
                        </label>
                      ))}
                      {view === 'chart' && x !== '@PERIOD' && (
                        <label className="inline small"><input type="checkbox" checked={withTotals} onChange={(e) => setWithTotals(e.target.checked)} /> Inclure les totaux</label>
                      )}
                    </div>
                  )}

                  {view === 'evol' && (
                    <EvolutionDonnees chart={chart} suffix={suffix} title={[preset?.label, measureText].filter(Boolean).join(' : ')} />
                  )}

                  {view === 'map' && current && (
                    <CarteDonnees
                      dsId={dsId} sel={sel} ctx={ctx} rows={rows} title={preset?.label ?? current.label} refCode={REF} compare={compare}
                      coverage={current.map_communes ?? 0} totalCommunes={idfCommunes} importing={job?.status === 'en cours'}
                      onImport={importIdf} onPick={pickCommune}
                    />
                  )}

                  {view === 'chart' && (
                    <div className="chart">
                      {(preset || measureText) && <div className="chart-title">{preset?.label}{preset && measureText ? ' : ' : ''}<span className="muted">{measureText}</span></div>}
                      {chart.data.length === 0 ? <div className="empty">Aucune donnée pour cette sélection (essayez une autre combinaison de filtres).</div> : (
                        <ResponsiveContainer width="100%" height={chart.horizontal ? Math.max(380, chart.data.length * (chart.names.length * 16 + 10)) : 400}>
                          {x === '@PERIOD' ? (
                            <LineChart data={chart.data}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="x" />
                              <YAxis tickFormatter={fmt} width={70} />
                              <Tooltip formatter={(v) => fmt(Number(v)) + suffix} />
                              <Legend />
                              {chart.names.map((s, k) => <Line key={s} type="monotone" dataKey={s} stroke={COLORS[k % COLORS.length]} strokeWidth={2} dot connectNulls />)}
                            </LineChart>
                          ) : chart.horizontal ? (
                            <BarChart data={chart.data} layout="vertical" margin={{ left: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" tickFormatter={fmt} />
                              <YAxis type="category" dataKey="x" width={230} interval={0} tick={{ fontSize: 12 }} />
                              <Tooltip formatter={(v) => fmt(Number(v)) + suffix} />
                              <Legend />
                              {chart.names.map((s, k) => <Bar key={s} dataKey={s} fill={COLORS[k % COLORS.length]} />)}
                            </BarChart>
                          ) : (
                            <BarChart data={chart.data}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="x" interval={x === 'AGE' ? 4 : 0} angle={x === 'AGE' ? 0 : -25} textAnchor={x === 'AGE' ? 'middle' : 'end'} height={x === 'AGE' ? 40 : 90} />
                              <YAxis tickFormatter={fmt} width={70} />
                              <Tooltip formatter={(v) => fmt(Number(v)) + suffix} />
                              <Legend />
                              {chart.names.map((s, k) => <Bar key={s} dataKey={s} fill={COLORS[k % COLORS.length]} />)}
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      )}
                      {ecart && (
                        <div className="ecart">
                          <strong>Écart à {ecart.period}</strong> : {geoName(REF)} {fmt(ecart.ref)} · {geoName(compare)} {fmt(ecart.other)} · écart {ecart.diff >= 0 ? '+' : ''}{fmt(ecart.diff)}
                          {ecart.pct != null && <> ({ecart.pct >= 0 ? '+' : ''}{fmt(ecart.pct)} %)</>}
                          {mode === 'brut' && <span className="muted small"> — valeurs brutes : choisissez « Pour 1 000 habitants » pour comparer des territoires de tailles différentes</span>}
                        </div>
                      )}
                      {noPop.length > 0 && <div className="warn small">Population inconnue pour {noPop.map(geoName).join(', ')} : exclu du calcul « pour 1 000 habitants ».</div>}
                      {chart.data.length > 0 && shownGeos.filter((g) => current.geo_counts[g] && !chart.geos.includes(g)).map((g) => (
                        <div key={g} className="warn small">Aucune valeur pour {geoName(g)} avec cette sélection : changez la mesure ou les filtres (cette mesure n'est peut-être pas disponible pour ce territoire).</div>
                      ))}
                      {chart.truncated > 0 && <div className="warn small">Seules les {MAX_CATEGORIES} premières catégories (sur {MAX_CATEGORIES + chart.truncated}) sont affichées : restreignez avec les filtres ou le niveau de détail.</div>}
                      {chart.dupes > 0 && <div className="warn small">Plusieurs lignes correspondent à la même barre : leurs valeurs sont additionnées. Précisez les filtres pour éviter les doubles comptes.</div>}
                      {chart.data.length > 0 && (
                        <div className="add-dash">
                          {notice ? (
                            <div className="add-dash-done">
                              <span className="add-dash-check">✓</span> {notice}{' '}
                              <Link to="/mon-tableau" className="add-dash-link">Ouvrir mon tableau de bord →</Link>
                            </div>
                          ) : !dashOpen ? (
                            <button type="button" className="add-dash-btn" onClick={() => { setDashOpen(true); setDashTitle(defaultTitle()); }}>
                              <span className="add-dash-icon">＋</span>
                              <span>Ajouter à mon tableau de bord</span>
                            </button>
                          ) : (
                            <div className="add-dash-form">
                              <label className="add-dash-field">
                                <span className="muted small">Titre du graphique</span>
                                <input autoFocus value={dashTitle} placeholder={defaultTitle()}
                                  onChange={(e) => setDashTitle(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') addToDashboard(dashTitle); if (e.key === 'Escape') setDashOpen(false); }} />
                              </label>
                              <button type="button" disabled={adding || !dashTitle.trim()} onClick={() => addToDashboard(dashTitle)}>{adding ? 'Ajout…' : 'Ajouter'}</button>
                              <button type="button" className="secondary" onClick={() => setDashOpen(false)}>Annuler</button>
                              <span className="muted small">Le graphique reprend cette forme et ce paramétrage (comparatif, pour 1 000 habitants, filtres…).</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {view === 'key' && keyTable && (
                    <div className="table-wrap short">
                      <table className="grid compact">
                        <thead><tr><th>Mesure</th>{keyTable.geoList.map((g) => <th key={g} className="num">{geoName(g)}</th>)}<th>Unité</th></tr></thead>
                        <tbody>
                          {keyTable.measures.map((m) => {
                            const cells = keyTable.geoList.map((g) => keyTable.cell(m, g));
                            const unit = unitOf(cells.find((c) => c?.unit)?.unit);
                            return (
                              <tr key={m}>
                                <td>{lab(measureDim!, m)} <span className="muted small">{m}</span></td>
                                {cells.map((c, k) => (
                                  <td key={k} className="num" title={c?.status ? statusText(c.status) : ''}>
                                    {c == null || c.value == null ? <span className="muted">n.d.</span> : <>{fmt(c.value)}{c.period && <div className="muted small">{c.period}</div>}</>}
                                  </td>
                                ))}
                                <td className="small">{unit}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {view === 'table' && (
                    <>
                      <div className="filters">
                        <label className="field small"><span>Recherche</span><input value={rawSearch} onChange={(e) => { setRawSearch(e.target.value); setPage(0); }} /></label>
                        {dimNames.map((d) => (
                          <label key={d} className="field small"><span title={d}>{dimLabel(d)}</span>
                            <select value={rawFilters[d] ?? ''} onChange={(e) => { setRawFilters({ ...rawFilters, [d]: e.target.value }); setPage(0); }}>
                              <option value="">(toutes)</option>
                              {dimValues[d].map((v) => <option key={v} value={v}>{lab(d, v)}{lab(d, v) !== v && v !== '_T' ? ` [${v}]` : ''}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                      <div className="table-wrap short">
                        <table className="grid compact">
                          <thead><tr><th>Territoire</th><th>Période</th>{dimNames.map((d) => <th key={d} title={d}>{dimLabel(d)}</th>)}<th className="num">Valeur</th></tr></thead>
                          <tbody>
                            {pageRows.map((r, k) => (
                              <tr key={k}>
                                <td>{geoName(r.geo)}</td><td>{r.period ?? '—'}</td>
                                {dimNames.map((d) => <td key={d}>{r.dims[d] != null ? <>{lab(d, r.dims[d])} {lab(d, r.dims[d]) !== r.dims[d] && r.dims[d] !== '_T' && <span className="muted small">{r.dims[d]}</span>}</> : ''}</td>)}
                                <td className="num" title={r.status ? statusText(r.status) : ''}>{r.value == null ? <span className="muted">n.d.</span> : fmt(r.value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="pager">
                          <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
                          <span>{rawRows.length ? page * PAGE_SIZE + 1 : 0}–{Math.min(rawRows.length, (page + 1) * PAGE_SIZE)} / {rawRows.length}</span>
                          <button className="secondary" disabled={(page + 1) * PAGE_SIZE >= rawRows.length} onClick={() => setPage(page + 1)}>›</button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
              {data && rows.length === 0 && <div className="empty">Aucune ligne stockée pour la sélection de territoires.</div>}

              <div className="linked">
                <h3>Indicateurs alimentés ({linked.length})</h3>
                {linked.length === 0 && <span className="muted">Aucun indicateur rattaché.</span>}
                {linked.map((i) => (
                  <Link key={i.id} className="chip ds" to={`/indicateurs?edit=${i.id}`}>{i.libelle}</Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
