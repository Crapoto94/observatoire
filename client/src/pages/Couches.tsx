import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { SourceBadge } from '../badges';
import { FONDS, fondTiles } from '../fondsDePlan';
import type { Couche, CoucheStat, Indicator } from '../types';

// Couches géographiques du géoportail du Val-de-Marne, lues EN DIRECT (WFS) pour une commune du département :
// carte des objets (plusieurs couches superposables) et indicateurs calculés à la volée (nombre, pour 1 000 hab., sommes…).

type Geom = { type: string; coordinates: any };
interface Feature { g: Geom; p: Record<string, string | number | null> }
interface Ind { commune: Record<string, number | null>; dept: Record<string, number | null>; fetched_at: string; truncated: boolean; population: number; population94: number }
interface LayerData { couche: Couche; commune: { code: string; nom: string; population: number }; indicators: Ind; features: Feature[]; label_field: string; info: string[] }
interface Outline { code: string; nom: string; population: number; rings: number[][][]; bbox: [number, number, number, number] }
interface Commune { code: string; nom: string; population: number }

const REF = '94041';
// même projection que la cartographie régionale et le fond de plan IGN (fondsDePlan.ts, server/idf.js) : superposition exacte des tuiles
const K = 1000, LAT0 = 48.7, LON0 = 1.4, COS = Math.cos((LAT0 * Math.PI) / 180);
const project = ([lon, lat]: number[]) => [(lon - LON0) * COS * K, (LAT0 - lat) * K];
const THEME_OF: Record<string, [string, string]> = {
  'Équipements': ['cohesion', 'Cohésion sociale & santé'], 'Environnement': ['environnement', 'Environnement & STE'],
  'Urbanisme et logement': ['logement', 'Logement & urbanisme'], 'Mobilité': ['mobilite', 'Mobilité'], 'Indicateurs par IRIS (Babord)': ['cohesion', 'Cohésion sociale & santé'],
};
const CHORO = ['#eef2ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4338ca'];
// séparateur de milliers en espace insécable classique : l'espace fine (U+202F) n'est pas dessinée par toutes les polices
const fmt = (v: number | null | undefined, d = 1) => (v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : d }).replace(/ /g, ' '));
const labelOf = (k: string) => k.replace(/^(lib|nom|code|nb|pro_lib|pro)_/, '').replace(/_/g, ' ');

export default function Couches() {
  const [params, setParams] = useSearchParams();
  const [couches, setCouches] = useState<Couche[]>([]);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [commune, setCommune] = useState(params.get('commune') || REF);
  const [active, setActive] = useState<string[]>(() => (params.get('couche') || 'cd94_arbres').split(',').filter(Boolean));
  const [outline, setOutline] = useState<Outline | null>(null);
  const [data, setData] = useState<Record<string, LayerData>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Indicator[]>([]);
  const [hover, setHover] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);
  const [vb, setVb] = useState<number[] | null>(null);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vb: number[] } | null>(null);
  const [boxPx, setBoxPx] = useState({ w: 0, h: 0 });
  const [fondId, setFondId] = useState(() => { try { return localStorage.getItem('couches-fond') ?? 'plan'; } catch { return 'plan'; } });
  const fond = FONDS.find((f) => f.id === fondId) ?? null;
  useEffect(() => { try { localStorage.setItem('couches-fond', fondId); } catch { /* ignore */ } }, [fondId]);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(() => { const r = box.current!.getBoundingClientRect(); setBoxPx({ w: r.width, h: r.height }); });
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const current = useRef(commune);
  current.current = commune;

  useEffect(() => {
    api<{ couches: Couche[] }>('/couches').then((r) => setCouches(r.couches)).catch((e) => setError(e.message));
    api<Commune[]>('/couches/communes').then(setCommunes).catch((e) => setError(e.message));
    api<Indicator[]>('/indicators').then(setItems).catch(() => setItems([]));
  }, []);

  useEffect(() => {
    setOutline(null); setVb(null); setData({}); setLoading({});
    api<Outline>(`/couches/contour/${commune}`).then(setOutline).catch((e) => setError(e.message));
  }, [commune]);

  useEffect(() => {
    for (const id of active) {
      if (data[id] || loading[id]) continue;
      setLoading((l) => ({ ...l, [id]: true }));
      setErrors((x) => ({ ...x, [id]: '' }));
      api<LayerData>(`/couches/${id}?commune=${commune}`)
        .then((d) => { if (d.commune.code === current.current) setData((m) => ({ ...m, [id]: d })); })
        .catch((e) => setErrors((x) => ({ ...x, [id]: e.message })))
        .finally(() => setLoading((l) => ({ ...l, [id]: false })));
    }
  }, [active, commune, data, loading]);

  useEffect(() => {
    const p = new URLSearchParams(params);
    p.set('couche', active.join(',')); p.set('commune', commune);
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, commune]);

  // projection locale (équirectangulaire corrigée de la latitude), unités en mètres
  const proj = useMemo(() => {
    if (!outline) return null;
    const [x0, y0, x1, y1] = outline.bbox;
    const [ox, oy] = project([x0, y1]), [ex, ey] = project([x1, y0]);
    return { f: project, ox, oy, w: ex - ox, h: ey - oy };
  }, [outline]);
  const view = vb || (proj ? [proj.ox - proj.w * 0.03, proj.oy - proj.h * 0.03, proj.w * 1.06, proj.h * 1.06] : [0, 0, 100, 100]);
  const tuiles = useMemo(() => (fond && proj && boxPx.w ? fondTiles(view, boxPx, fond) : null), [fond, proj, boxPx, view.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = view[2] / Math.max(300, boxPx.w || 900); // taille d'un pixel écran environ

  const ringPath = (rings: number[][][]) => (proj ? rings.map((r) => 'M' + r.map((p) => proj.f(p).map((v) => v.toFixed(1)).join(' ')).join('L') + 'Z').join('') : '');
  const linePath = (lines: number[][][]) => (proj ? lines.map((l) => 'M' + l.map((p) => proj.f(p).map((v) => v.toFixed(1)).join(' ')).join('L')).join('') : '');

  const grouped = useMemo(() => {
    const m = new Map<string, Couche[]>();
    couches.forEach((c) => (m.get(c.theme) || m.set(c.theme, []).get(c.theme)!).push(c));
    return [...m.entries()];
  }, [couches]);
  const toggle = (id: string) => setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const onWheel = (e: React.WheelEvent) => {
    if (!box.current) return;
    const r = box.current.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const z = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    const [x, y, w, h] = view;
    const nw = w * z, nh = h * z;
    setVb([x + (w - nw) * fx, y + (h - nh) * fy, nw, nh]);
  };
  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, vb: view }; };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const [x, y, w, h] = drag.current.vb;
    setVb([x - ((e.clientX - drag.current.x) / r.width) * w, y - ((e.clientY - drag.current.y) / r.height) * h, w, h]);
  };

  const showTip = (e: React.MouseEvent, d: LayerData, f: Feature) => {
    if (!box.current) return;
    const r = box.current.getBoundingClientRect();
    const lines = d.info.map((k) => (f.p[k] == null || f.p[k] === '' ? null : `${labelOf(k)} : ${typeof f.p[k] === 'number' ? fmt(f.p[k] as number, 2) : f.p[k]}`)).filter(Boolean) as string[];
    setHover({ x: e.clientX - r.left, y: e.clientY - r.top, title: `${d.couche.label} · ${f.p[d.label_field] ?? ''}`, lines });
  };

  const choroColor = (d: LayerData, v: unknown) => {
    const vals = d.features.map((f) => Number(f.p[d.couche.choropleth!])).filter(Number.isFinite).sort((a, b) => a - b);
    const n = Number(v);
    if (!Number.isFinite(n) || !vals.length) return '#e5e7eb';
    const rank = vals.findIndex((x) => x >= n) / Math.max(1, vals.length - 1);
    return CHORO[Math.min(CHORO.length - 1, Math.floor(rank * CHORO.length))];
  };

  const renderLayer = (id: string) => {
    const d = data[id];
    if (!d || !proj) return null;
    const c = d.couche;
    return (
      <g key={id}>
        {d.features.map((f, k) => {
          const g = f.g;
          const ev = { onMouseMove: (e: React.MouseEvent) => showTip(e, d, f), onMouseLeave: () => setHover(null) };
          if (g.type === 'Point' || g.type === 'MultiPoint') {
            const pts: number[][] = g.type === 'Point' ? [g.coordinates] : g.coordinates;
            return pts.map((p, j) => { const [x, y] = proj.f(p); return <circle key={`${k}-${j}`} cx={x} cy={y} r={unit * (d.features.length > 800 ? 2.2 : 3.6)} fill={c.color} stroke="#fff" strokeWidth={unit * 0.6} {...ev} />; });
          }
          if (g.type === 'LineString' || g.type === 'MultiLineString') {
            return <path key={k} d={linePath(g.type === 'LineString' ? [g.coordinates] : g.coordinates)} fill="none" stroke={c.color} strokeWidth={unit * 2.4} strokeLinecap="round" {...ev} />;
          }
          const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
          const fill = c.choropleth ? choroColor(d, f.p[c.choropleth]) : c.color;
          return <path key={k} d={ringPath(rings)} fill={fill} fillOpacity={c.choropleth ? (fond ? 0.7 : 0.85) : (fond ? 0.4 : 0.45)} stroke={c.choropleth ? '#fff' : c.color} strokeWidth={unit * 0.8} fillRule="evenodd" {...ev} />;
        })}
      </g>
    );
  };

  // ajout d'une fiche à la conception à partir d'un indicateur de couche
  const adopted = (c: Couche, s: CoucheStat) => items.some((i) => i.couche_id === c.id && i.libelle === ficheLabel(c, s));
  const ficheLabel = (c: Couche, s: CoucheStat) => `${s.label} : ${c.label.charAt(0).toLowerCase()}${c.label.slice(1)}`;
  const adopt = async (c: Couche, s: CoucheStat) => {
    const [theme, theme_label] = THEME_OF[c.theme] || ['cohesion', 'Cohésion sociale & santé'];
    const created = await api<Indicator>('/indicators', {
      body: {
        theme, theme_label, groupe: 'couches-cd94', groupe_label: 'Indicateurs issus des couches géographiques (Val-de-Marne)', niveau: 'contexte',
        libelle: ficheLabel(c, s), source: `${c.source} : ${c.layer} (lecture en direct)`, lien_donnees: c.doc_url, periodicite: 'en continu (lecture en direct)',
        formule: s.formule, mode_calcul: 'calcule', unite: s.unit, perimetre: 'commune (Val-de-Marne)', origine: 'externe', cartographie: 'oui', statut: 'brouillon',
        couche_id: c.id, dataset_ids: [], ordre: 1000, sous_ligne: 0,
        proposition: `Indicateur calculé en direct à partir de la couche « ${c.label} » du géoportail du Val-de-Marne (aucun import). À valider : définition, périmètre et sens de lecture.`,
      },
    });
    setItems((x) => [...x, created]);
  };

  const com = communes.find((c) => c.code === commune);
  const activeData = active.map((id) => ({ id, c: couches.find((x) => x.id === id), d: data[id] })).filter((x) => x.c);

  return (
    <section className="page couches-page">
      <div className="page-head">
        <h1>Couches géographiques <span className="muted">· Val-de-Marne</span></h1>
        <div className="actions">
          <label className="inline">Commune
            <select value={commune} onChange={(e) => setCommune(e.target.value)}>
              {communes.map((c) => <option key={c.code} value={c.code}>{c.nom}</option>)}
              {!communes.length && <option value={REF}>Ivry-sur-Seine</option>}
            </select>
          </label>
          <label className="inline">Fond de plan
            <select value={fondId} onChange={(e) => setFondId(e.target.value)} title="Fond de carte raster (Géoplateforme de l'IGN)">
              {FONDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              <option value="aucun">Aucun</option>
            </select>
          </label>
          <a className="btn secondary" href="https://geo.valdemarne.fr/explorer/fr/recherche?scope=dataset" target="_blank" rel="noreferrer">Géoportail du Val-de-Marne ↗</a>
        </div>
      </div>
      <p className="muted small">
        Couches publiées par le Conseil départemental du Val-de-Marne (toutes communes du département), <strong>lues en direct</strong> par WFS au moment de l’affichage :
        rien n’est importé dans l’observatoire. Les objets sont filtrés sur le contour de la commune choisie ; les indicateurs (nombre, nombre pour 1 000 habitants, sommes)
        sont recalculés à chaque lecture et comparés au Val-de-Marne.
      </p>
      {error && <div className="error">{error}</div>}

      <div className="couches-layout">
        <aside className="couches-side">
          {grouped.map(([theme, list]) => (
            <div key={theme} className="couches-group">
              <div className="couches-theme">{theme}</div>
              {list.map((c) => (
                <label key={c.id} className="couches-item">
                  <input type="checkbox" checked={active.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span className="couches-swatch" style={{ background: c.choropleth ? 'linear-gradient(90deg,#c7d2fe,#4338ca)' : c.color, borderRadius: c.kind === 'point' ? '50%' : c.kind === 'line' ? 2 : 3, height: c.kind === 'line' ? 4 : 12 }} />
                  <span className="couches-name">{c.label}</span>
                  {loading[c.id] && <span className="muted small">…</span>}
                  {data[c.id] && <span className="muted small">{data[c.id].features.length}</span>}
                </label>
              ))}
            </div>
          ))}
        </aside>

        <div className="couches-map" ref={box} onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; setHover(null); }}>
          {!outline && <div className="empty">Chargement du contour communal…</div>}
          {outline && proj && (
            <svg viewBox={view.join(' ')} preserveAspectRatio="xMidYMid meet">
              {tuiles && (
                <g pointerEvents="none" className="fond-ign">
                  {tuiles.tuiles.map((t) => <image key={t.href} href={t.href} x={t.x} y={t.y} width={t.w} height={t.h} preserveAspectRatio="none" />)}
                </g>
              )}
              <path d={ringPath(outline.rings)} fill={fond ? 'none' : '#f8fafc'} stroke="#0f172a" strokeWidth={unit * 2.2} strokeDasharray={fond ? `${unit * 6} ${unit * 3}` : undefined} fillRule="evenodd" pointerEvents="none" />
              {active.filter((id) => data[id]?.couche.kind === 'polygon').map(renderLayer)}
              {active.filter((id) => data[id]?.couche.kind === 'line').map(renderLayer)}
              {active.filter((id) => data[id]?.couche.kind === 'point').map(renderLayer)}
            </svg>
          )}
          {fond && <a className="map-attrib" href={fond.href} target="_blank" rel="noreferrer noopener" title="Source du fond de carte">{fond.attribution}</a>}
          {hover && (
            <div className="map-tip" style={{ left: hover.x + 14, top: hover.y + 10 }}>
              <strong>{hover.title}</strong>
              {hover.lines.map((l, k) => <div key={k} className="small">{l}</div>)}
            </div>
          )}
          <div className="couches-hint muted small">Molette : zoom · glisser : déplacer {vb && <button className="link" onClick={() => setVb(null)}>recentrer</button>}</div>
        </div>
      </div>

      <h2>Indicateurs calculés en direct · {com?.nom || outline?.nom || ''}</h2>
      <div className="couches-cards">
        {activeData.map(({ id, c, d }) => (
          <div key={id} className="card couches-card">
            <div className="couches-card-head">
              <span className="couches-swatch" style={{ background: c!.color }} />
              <strong>{c!.label}</strong>
              <SourceBadge kind="live" title={`Lu en direct : ${c!.layer}${d ? ` à ${new Date(d.indicators.fetched_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}`} />
              {c!.doc_url && <a className="small" href={c!.doc_url} target="_blank" rel="noreferrer">source ↗</a>}
            </div>
            {errors[id] && <div className="error small">API indisponible : {errors[id]}</div>}
            {!d && !errors[id] && <div className="muted small">Lecture en cours…</div>}
            {d && (
              <table className="couches-stats">
                <thead><tr><th>Indicateur</th><th>{d.commune.nom}</th><th>Val-de-Marne</th><th /></tr></thead>
                <tbody>
                  {c!.stats.map((s) => (
                    <tr key={s.id}>
                      <td title={s.formule}>{s.label}{s.unit && !s.label.toLowerCase().includes(s.unit.replace(/\.$/, '').toLowerCase()) ? <span className="muted"> ({s.unit})</span> : null}</td>
                      <td><strong>{fmt(d.indicators.commune[s.id], 2)}</strong></td>
                      <td>{fmt(d.indicators.dept[s.id], 2)}</td>
                      <td>{adopted(c!, s)
                        ? <Link className="small trend-up" to={`/indicateurs?acces=live`}>✓ fiche</Link>
                        : <button className="fiche-btn" title="Créer une fiche (brouillon) dans la conception des indicateurs" onClick={() => adopt(c!, s)}>+ fiche</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {d?.indicators.truncated && <div className="note small">⚠ Lecture plafonnée : la couche dépasse le nombre d’objets lus en une requête.</div>}
            {d && c!.choropleth && <div className="muted small">Couleur : {c!.choroLabel} (du plus clair au plus foncé, quantiles des objets affichés).</div>}
          </div>
        ))}
        {!activeData.length && <div className="empty">Cochez une ou plusieurs couches.</div>}
      </div>
    </section>
  );
}
