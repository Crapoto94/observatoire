import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { isAdmin, useAuth } from '../auth';
import { fmtVal } from '../fiabilite';

// Quartiers officiels de la Ville : carte des 6 quartiers colorée selon un indicateur, fiche du quartier sélectionné
// comparée à Ivry, tableau complet et composition en IRIS (parts de surface).

type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
interface Quartier { code: string; nom: string; geometry: Geometry; iris: { code: string; nom: string; part: number }[] }
interface Indicateur { id: string; theme: string; label: string; unit: string; approx: string | null; source: string; period: string | null; valeurs: Record<string, number | null>; commune: number | null }
interface Data { maj: string | null; quartiers: Quartier[]; iris: { code: string; nom: string; geometry: Geometry }[]; indicateurs: Indicateur[]; sources: { id: string; label: string; url: string }[] }

const W = 640, H = 470, PAD = 14;
const polys = (g: Geometry) => (g.type === 'Polygon' ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]));

function useProjection(qs: Quartier[]) {
  return useMemo(() => {
    const pts = qs.flatMap((q) => polys(q.geometry).flatMap((p) => p[0]));
    if (!pts.length) return null;
    const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length, k0 = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p[0] * k0), ys = pts.map((p) => -p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0));
    const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    const pr = ([lon, lat]: number[]) => [ox + (lon * k0 - x0) * s, oy + (-lat - y0) * s];
    const path = (g: Geometry) => polys(g).map((poly) => poly.map((r) => r.map((c, i) => `${i ? 'L' : 'M'}${pr(c).map((v) => v.toFixed(1)).join(',')}`).join('') + 'Z').join('')).join('');
    const center = (g: Geometry) => { const r = polys(g)[0][0]; const c = r.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]); return pr([c[0] / r.length, c[1] / r.length]); };
    return { path, center };
  }, [qs]);
}

const fmt = (v: number | null, unit: string) => (v == null ? '—' : `${fmtVal(v)}${unit === '%' ? ' %' : unit && !/^(hab\.|logements)$/.test(unit) ? ` ${unit}` : ''}`);
const SOURCE = { rp: 'Recensement', filo: 'Filosofi', caf: 'CAF' } as Record<string, string>;

export default function Quartiers() {
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [ind, setInd] = useState('hlm');
  const [sel, setSel] = useState<string | null>(null);
  const [showIris, setShowIris] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api<Data>('/quartiers', { timeoutMs: 60000 }).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const proj = useProjection(data?.quartiers || []);

  const cur = data?.indicateurs.find((i) => i.id === ind) || data?.indicateurs[0];
  const themes = useMemo(() => {
    const m = new Map<string, Indicateur[]>();
    for (const i of data?.indicateurs || []) (m.get(i.theme) || m.set(i.theme, []).get(i.theme)!).push(i);
    return [...m];
  }, [data]);
  const range = (i: Indicateur) => { const v = Object.values(i.valeurs).filter((x): x is number => x != null); return v.length ? [Math.min(...v), Math.max(...v)] : [0, 0]; };
  // teinte proportionnelle à la position de la valeur entre le minimum et le maximum des quartiers (carte : soutenue, tableau : légère)
  const shade = (i: Indicateur, v: number | null, max = 70) => {
    if (v == null) return 'var(--panel-3)';
    const [a, b] = range(i);
    const t = b > a ? (v - a) / (b - a) : 0.5;
    return `color-mix(in srgb, var(--accent) ${Math.round(max / 5 + t * max * 0.8)}%, var(--panel))`;
  };
  const refresh = async () => {
    setBusy(true);
    try { await api('/quartiers/rafraichir', { body: {}, timeoutMs: 900000 }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data || !cur || !proj) return <div className="page"><p className="muted">Chargement…</p></div>;
  const empty = !data.iris.length;
  const selQ = data.quartiers.find((q) => q.code === sel) || null;

  return (
    <div className="page quartiers">
      <div className="page-head">
        <div>
          <h1>Quartiers</h1>
          <p className="muted">Les 6 quartiers officiels de la Ville, reconstitués à partir des IRIS de l'INSEE. Recensement 2022, revenus Filosofi 2021, allocataires CAF 2024.</p>
        </div>
        {isAdmin(user) && <button className="secondary" onClick={refresh} disabled={busy} title="Recharger les contours IRIS et les données à l'IRIS">{busy ? 'Mise à jour…' : 'Mettre à jour les données'}</button>}
      </div>
      {empty && <p className="muted">Les données des IRIS sont en cours de chargement (premier démarrage). Revenez dans quelques minutes.</p>}

      <div className="q-layout">
        <section className="q-map-wrap">
          <div className="q-controls">
            <label htmlFor="q-ind" className="small muted">Indicateur</label>
            <select id="q-ind" value={cur.id} onChange={(e) => setInd(e.target.value)}>
              {themes.map(([t, list]) => <optgroup key={t} label={t}>{list.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>)}
            </select>
            <label className="small"><input type="checkbox" checked={showIris} onChange={(e) => setShowIris(e.target.checked)} /> Limites des IRIS</label>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="q-map" role="img" aria-label={`Carte des quartiers : ${cur.label}`}>
            {data.quartiers.map((q) => (
              <path key={q.code} d={proj.path(q.geometry)} fill={shade(cur, cur.valeurs[q.code])} className={`q-zone${sel === q.code ? ' on' : ''}`}
                onClick={() => setSel(sel === q.code ? null : q.code)}>
                <title>{`${q.nom} : ${fmt(cur.valeurs[q.code], cur.unit)}`}</title>
              </path>
            ))}
            {showIris && data.iris.map((i) => <path key={i.code} d={proj.path(i.geometry)} className="q-iris"><title>{`IRIS ${i.nom}`}</title></path>)}
            {data.quartiers.map((q) => { const [x, y] = proj.center(q.geometry); return (
              <g key={q.code} className="q-label" transform={`translate(${x.toFixed(0)},${y.toFixed(0)})`}>
                <text y={-4}>{q.nom}</text>
                <text y={13} className="v">{fmt(cur.valeurs[q.code], cur.unit)}</text>
              </g>
            ); })}
          </svg>
          <p className="small muted">{cur.label} · {SOURCE[cur.source] || cur.source} {cur.period} · Ivry : <b>{fmt(cur.commune, cur.unit)}</b>{cur.approx ? ` · ${cur.approx}` : ''}. Cliquez sur un quartier pour sa fiche.</p>
        </section>

        <aside className="q-fiche">
          {selQ ? (
            <>
              <h2>{selQ.nom}</h2>
              <p className="small muted">IRIS : {selQ.iris.map((i) => `${i.nom}${i.part < 0.99 ? ` (${Math.round(i.part * 100)} %)` : ''}`).join(', ')}</p>
              <table className="q-cmp">
                <thead><tr><th>Indicateur</th><th>Quartier</th><th>Ivry</th></tr></thead>
                <tbody>
                  {data.indicateurs.map((i) => {
                    const v = i.valeurs[selQ.code], c = i.commune;
                    const d = v != null && c != null && i.unit === '%' ? v - c : null;
                    return (
                      <tr key={i.id} className={i.id === cur.id ? 'on' : ''} onClick={() => setInd(i.id)}>
                        <td>{i.label}</td>
                        <td className="num">{fmt(v, i.unit)}{d != null && Math.abs(d) >= 2 && <span className={`q-ecart ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '+' : '−'}{fmtVal(Math.abs(d))} pt</span>}</td>
                        <td className="num muted">{fmt(c, i.unit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          ) : (
            <div className="muted">
              <h2>Fiche quartier</h2>
              <p>Sélectionnez un quartier sur la carte ou dans le tableau pour comparer tous ses indicateurs à ceux d'Ivry. Les écarts d'au moins 2 points sont signalés.</p>
            </div>
          )}
        </aside>
      </div>

      <section>
        <h2>Tous les indicateurs</h2>
        <div className="q-table-wrap">
          <table className="q-table">
            <thead>
              <tr><th>Indicateur</th>{data.quartiers.map((q) => <th key={q.code} className={sel === q.code ? 'on' : ''}><button className="link" onClick={() => setSel(q.code)}>{q.nom}</button></th>)}<th>Ivry</th><th>Source</th></tr>
            </thead>
            <tbody>
              {themes.map(([t, list]) => [
                <tr key={t} className="q-theme"><td colSpan={data.quartiers.length + 3}>{t}</td></tr>,
                ...list.map((i) => (
                  <tr key={i.id} className={i.id === cur.id ? 'on' : ''} onClick={() => setInd(i.id)}>
                    <td title={i.approx || undefined}>{i.label}{i.approx && <span className="muted"> *</span>}</td>
                    {data.quartiers.map((q) => <td key={q.code} className={`num${sel === q.code ? ' on' : ''}`} style={{ background: shade(i, i.valeurs[q.code], 34) }}>{fmt(i.valeurs[q.code], i.unit)}</td>)}
                    <td className="num"><b>{fmt(i.commune, i.unit)}</b></td>
                    <td className="small muted">{SOURCE[i.source] || i.source} {i.period}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <p className="small muted">* Moyenne des IRIS pondérée par leur population : ordre de grandeur (une médiane ou un taux de pauvreté ne s'additionnent pas). La colonne Ivry est calculée à partir des 22 IRIS ; elle peut différer légèrement des chiffres communaux publiés.</p>
      </section>

      <section>
        <h2>Composition et méthode</h2>
        <div className="q-compo">
          {data.quartiers.map((q) => (
            <div key={q.code} className="card">
              <b>{q.nom}</b>
              <ul className="small">{q.iris.map((i) => <li key={i.code}>{i.nom} <span className="muted">({i.code}){i.part < 0.99 ? ` · ${Math.round(i.part * 100)} %` : ''}</span></li>)}</ul>
            </div>
          ))}
        </div>
        <p className="small muted">Les limites des quartiers ne suivent pas toujours celles des IRIS. Un IRIS partagé est réparti entre les quartiers au prorata de sa surface (la population est supposée uniforme dans l'IRIS). Sources : {data.sources.map((s, k) => <span key={s.id}>{k ? ' ; ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}.{data.maj ? ` Mise à jour : ${new Date(data.maj).toLocaleDateString('fr-FR')}.` : ''}</p>
      </section>
    </div>
  );
}
