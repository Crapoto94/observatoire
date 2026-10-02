import { Fragment, useEffect, useState } from 'react';
import { api, fmtDate } from '../api';

interface Run {
  id: number; job_id: number; scope: string; dataset_id: string; dataset_label: string; method: string; kind: string; source_url: string | null;
  started: string; finished: string | null; status: string; rows: number; errors: number; attempt: number; territories: number | null; message: string | null;
}
interface Facet { v: string; n: number; label?: string; kind?: string }
interface Res { total: number; items: Run[]; facets: { status: Facet[]; method: Facet[]; scope: Facet[]; dataset: Facet[] } }
interface Detail extends Run { log: string[] }

const PAGE = 50;
const nf = (n: number) => n.toLocaleString('fr-FR');
const duration = (a: string, b: string | null) => {
  if (!b) return '—';
  const s = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
};
const SCOPE: Record<string, string> = { idf: 'Île-de-France', favoris: 'Favoris' };

// Journal des imports : une ligne par jeu et par tentative, avec méthode, source et détail
export default function Imports() {
  const [res, setRes] = useState<Res | null>(null);
  const [f, setF] = useState({ dataset: '', status: '', scope: '', method: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    api<Res>(`/import-runs?${p}`).then((r) => { setRes(r); setError(''); }).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, [f, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(load, 15000); return () => clearInterval(t); }); // actualisation pendant un import
  const set = (k: keyof typeof f, v: string) => { setPage(0); setF((o) => ({ ...o, [k]: v })); };
  const toggle = (r: Run) => (open?.id === r.id ? setOpen(null) : api<Detail>(`/import-runs/${r.id}`).then(setOpen).catch(() => undefined));
  const pages = res ? Math.max(1, Math.ceil(res.total / PAGE)) : 1;

  return (
    <section className="page imports">
      <div className="page-head"><h1>Journal des imports</h1></div>
      {error && <div className="error">{error}</div>}
      <div className="runs-filters">
        <label className="field small"><span>Jeu</span>
          <select value={f.dataset} onChange={(e) => set('dataset', e.target.value)}>
            <option value="">Tous</option>{res?.facets.dataset.map((d) => <option key={d.v} value={d.v}>{d.label ?? d.v} ({d.n})</option>)}
          </select>
        </label>
        <label className="field small"><span>Statut</span>
          <select value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Tous</option>{res?.facets.status.map((s) => <option key={s.v} value={s.v}>{s.v} ({s.n})</option>)}
          </select>
        </label>
        <label className="field small"><span>Méthode</span>
          <select value={f.method} onChange={(e) => set('method', e.target.value)}>
            <option value="">Toutes</option>{res?.facets.method.map((m) => <option key={m.v} value={m.v}>{m.kind === 'csv' ? '⬇ ' : '⇄ '}{m.v} ({m.n})</option>)}
          </select>
        </label>
        <label className="field small"><span>Périmètre</span>
          <select value={f.scope} onChange={(e) => set('scope', e.target.value)}>
            <option value="">Tous</option>{res?.facets.scope.map((s) => <option key={s.v} value={s.v}>{SCOPE[s.v] ?? s.v} ({s.n})</option>)}
          </select>
        </label>
        <label className="field small"><span>Du</span><input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label className="field small"><span>Au</span><input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
        <label className="field small grow"><span>Recherche (jeu, message, détail)</span><input value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="ex. délai dépassé, 429, HTTP 504…" /></label>
        <button className="secondary" onClick={() => { setF({ dataset: '', status: '', scope: '', method: '', q: '', from: '', to: '' }); setPage(0); }}>Réinitialiser</button>
      </div>

      <div className="table-wrap">
        <table className="grid compact">
          <thead><tr><th>Début</th><th>Jeu</th><th>Périmètre</th><th>Méthode</th><th>Source</th><th className="num">Territoires</th><th className="num">Lignes</th><th>Durée</th><th>Statut</th></tr></thead>
          <tbody>
            {res?.items.map((r) => (
              <Fragment key={r.id}>
                <tr onClick={() => toggle(r)} style={{ cursor: 'pointer' }}>
                  <td className="small">{fmtDate(r.started)}</td>
                  <td>{r.dataset_label}<div className="muted small">{r.dataset_id}{r.attempt > 1 ? ` · passage ${r.attempt}` : ''}</div></td>
                  <td className="small">{SCOPE[r.scope] ?? r.scope}</td>
                  <td className="small">{r.kind === 'csv' ? '⬇ ' : '⇄ '}{r.method}</td>
                  <td className="small">{r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>documentation ↗</a> : '—'}</td>
                  <td className="num">{r.territories != null ? nf(r.territories) : '—'}</td>
                  <td className="num">{nf(r.rows)}</td>
                  <td className="small">{duration(r.started, r.finished)}</td>
                  <td><span className={`st st-${r.status.replace(' ', '-')}`}>{r.status}</span>{r.errors > 0 && <span className="muted small"> {r.errors} err.</span>}
                    {r.message && <div className="muted small">{r.message.slice(0, 80)}</div>}</td>
                </tr>
                {open?.id === r.id && (
                  <tr><td colSpan={9}>
                    <div className="small"><b>Import n°{open.job_id}</b> · méthode : {open.method} · {open.source_url && <a href={open.source_url} target="_blank" rel="noreferrer">{open.source_url}</a>}</div>
                    {open.message && <div className="error small">{open.message}</div>}
                    <pre className="run-log">{open.log.length ? open.log.join('\n') : 'Aucun détail enregistré.'}</pre>
                  </td></tr>
                )}
              </Fragment>
            ))}
            {res && res.items.length === 0 && <tr><td colSpan={9} className="muted">Aucun import ne correspond à ces filtres.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager small">
        <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
        <span> Page {page + 1} / {pages} · {res ? nf(res.total) : 0} import(s) </span>
        <button className="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>›</button>
      </div>
    </section>
  );
}
