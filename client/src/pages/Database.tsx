import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api';

interface DsStat { id: string; label: string; provider: string; last_import: string | null; rows: number; geos: number; idf: number; errors: number; last_error: string | null }
interface Stats {
  generated: string; ms: number;
  file: { path: string; bytes: number; wal: number; pageSize: number; pages: number; free: number };
  sqlite: string; check: string | string[] | null;
  process: { uptime: number; rss: number; node: string };
  job: { scope: string; done: number; total: number; errors: number } | null;
  totals: { rows: number; indicators: number; indicatorsWithoutDataset: number; geos: number; idfCommunes: number; datasets: number; history: number; versions: number };
  tables: { name: string; rows: number }[];
  datasets: DsStat[];
  alerts: { level: 'erreur' | 'attention' | 'info'; text: string }[];
}

const nf = (n: number) => n.toLocaleString('fr-FR');
const bytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} Go` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.round(n / 1e3)} Ko`);
const dur = (s: number) => (s >= 86400 ? `${Math.floor(s / 86400)} j ${Math.floor((s % 86400) / 3600)} h` : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)} min`);

// Page « Base de données » : volumétrie et santé de la base SQLite
export default function Database() {
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = (check = false) => {
    setBusy(true);
    api<Stats>(`/database${check ? '?check=1' : ''}`).then((r) => { setS(r); setError(''); }).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => { load(); }, []);

  if (!s) return <section className="page"><div className="page-head"><h1>Base de données</h1></div>{error ? <div className="error">{error}</div> : <div className="empty">Calcul en cours…</div>}</section>;

  const freePct = s.file.pages ? Math.round((100 * s.file.free) / s.file.pages) : 0;
  const covered = s.datasets.filter((d) => s.totals.idfCommunes && d.idf >= s.totals.idfCommunes * 0.95).length;
  const worst = s.alerts.some((a) => a.level === 'erreur') ? 'erreur' : s.alerts.some((a) => a.level === 'attention') ? 'attention' : 'ok';
  const maxRows = Math.max(1, ...s.datasets.map((d) => d.rows));

  const Card = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="db-card"><div className="muted small">{label}</div><div className="db-val">{value}</div>{sub && <div className="muted small">{sub}</div>}</div>
  );

  return (
    <section className="page database">
      <div className="page-head">
        <h1>Base de données</h1>
        <div className="actions">
          <button className="secondary" disabled={busy} onClick={() => load(true)} title="PRAGMA quick_check : parcourt toute la base, peut durer plusieurs minutes">Vérifier l'intégrité</button>
          <button disabled={busy} onClick={() => load()}>{busy ? 'Calcul…' : '⟳ Actualiser'}</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      <div className={`db-health ${worst}`}>
        <strong>{worst === 'ok' ? 'Base en bonne santé' : worst === 'attention' ? 'Points d\'attention' : 'Anomalie détectée'}</strong>
        <span className="small"> · SQLite {s.sqlite} · calculé en {s.ms} ms le {fmtDate(s.generated)}
          {s.check === 'ok' && ' · contrôle d\'intégrité OK'}
          {s.check && s.check !== 'ok' && ` · intégrité : ${(s.check as string[]).join(' ; ')}`}</span>
        {s.alerts.length > 0 && <ul>{s.alerts.map((a, i) => <li key={i} className={`al-${a.level}`}>{a.text}</li>)}</ul>}
      </div>

      {s.job && <div className="job run"><strong>Import en cours</strong> ({s.job.scope}) : {s.job.done} / {s.job.total}{s.job.errors ? ` · ${s.job.errors} erreur(s)` : ''}</div>}

      <div className="db-cards">
        <Card label="Taille du fichier" value={bytes(s.file.bytes)} sub={`journal WAL ${bytes(s.file.wal)} · ${freePct} % libre`} />
        <Card label="Observations" value={nf(s.totals.rows)} sub={`${s.totals.datasets} jeux de données`} />
        <Card label="Territoires suivis" value={nf(s.totals.geos)} sub={`+ ${nf(s.totals.idfCommunes)} communes d'Île-de-France (carte)`} />
        <Card label="Jeux complets pour l'Île-de-France" value={`${covered} / ${s.totals.datasets}`} sub="≥ 95 % des communes" />
        <Card label="Indicateurs" value={nf(s.totals.indicators)} sub={`${s.totals.indicatorsWithoutDataset} sans jeu rattaché`} />
        <Card label="Historique" value={nf(s.totals.history)} sub={`${s.totals.versions} version(s) de carte`} />
        <Card label="Serveur" value={dur(s.process.uptime)} sub={`mémoire ${bytes(s.process.rss)} · Node ${s.process.node}`} />
      </div>

      <h2>Jeux de données</h2>
      <div className="table-wrap">
        <table className="grid compact">
          <thead><tr><th>Jeu</th><th>Source</th><th className="num">Lignes</th><th className="num">Territoires</th><th className="num">Île-de-France</th><th>Dernier import</th><th>État</th></tr></thead>
          <tbody>
            {s.datasets.map((d) => {
              const idfPct = s.totals.idfCommunes ? Math.round((100 * d.idf) / s.totals.idfCommunes) : 0;
              return (
                <tr key={d.id}>
                  <td title={d.id}>{d.label}<div className="muted small">{d.id}</div></td>
                  <td className="small">{d.provider}</td>
                  <td className="num"><div>{nf(d.rows)}</div><div className="db-bar"><i style={{ width: `${(100 * d.rows) / maxRows}%` }} /></div></td>
                  <td className="num">{nf(d.geos)}</td>
                  <td className="num">{d.idf ? `${nf(d.idf)} (${idfPct} %)` : <span className="muted">—</span>}</td>
                  <td className="small">{fmtDate(d.last_import)}</td>
                  <td className="small">
                    {!d.rows ? <span className="al-attention">vide</span> : d.errors ? <span className="al-attention" title={d.last_error ?? ''}>{d.errors} erreur(s)</span> : <span className="trend-up">ok</span>}
                    {d.errors > 0 && d.last_error && <div className="muted small">{d.last_error.slice(0, 90)}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Tables</h2>
      <div className="table-wrap short">
        <table className="grid compact">
          <thead><tr><th>Table</th><th className="num">Lignes</th></tr></thead>
          <tbody>{s.tables.map((t) => <tr key={t.name}><td>{t.name}</td><td className="num">{nf(t.rows)}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
