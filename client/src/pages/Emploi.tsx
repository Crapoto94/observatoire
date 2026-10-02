import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Card, Kpi } from './Dashboard';

interface Rank { code: string; nom: string; value: number; trend: { dir: 'up' | 'down' | 'flat'; pct: number | null } | null }
interface Src { statut: string; titre: string; detail: string; lien: string }
interface Data { kpis: Kpi[]; insights: { level: string; text: string }[]; ranking: { period: string; rows: Rank[] } | null; sources: Src[] }

const fmt = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const ARROW = { up: '▲', down: '▼', flat: '►' } as const;
const COLOR = { up: '#dc2626', down: '#16a34a', flat: '#2563eb' } as const; // pour les demandeurs d'emploi, une hausse est défavorable
const BADGE: Record<string, string> = { 'intégré': '#2e9d4f', piste: '#d97706', 'à vérifier': '#94a3b8' };

// Emploi : KPI emploi et demandeurs d'emploi (France Travail), lecture synthétique, classement du GOSB et pistes de sources
export default function Emploi() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Data>('/emploi').then(setD).catch((e) => setError(e.message)); }, []);
  if (!d) return <section className="page"><div className="page-head"><h1>Emploi</h1></div>{error ? <div className="error">{error}</div> : <div className="empty">Calcul en cours…</div>}</section>;

  return (
    <section className="page emploi">
      <div className="page-head">
        <h1>Emploi · Ivry-sur-Seine</h1>
        <div className="actions">
          <Link className="small" to="/cartographie?couche=defm_1000&perimetre=gosb">Carte des demandeurs d'emploi</Link>
          <Link className="small" to="/donnees?ds=ft_defm">Données détaillées</Link>
        </div>
      </div>

      <h2>Lecture synthétique</h2>
      {d.insights.length === 0 ? <div className="note-box small">Les données d'emploi ne sont pas encore toutes chargées : les éléments de lecture apparaîtront à la fin de l'import.</div> : (
        <ul className="insights">{d.insights.map((i, k) => <li key={k} className={i.level}>{i.text}</li>)}</ul>
      )}

      <h2>Indicateurs clés</h2>
      <div className="kpi-grid">{d.kpis.map((k) => <Card key={k.id} k={k} focus={false} />)}</div>

      {d.ranking && d.ranking.rows.length > 0 && (
        <>
          <h2>Les communes du GOSB : demandeurs d'emploi pour 1 000 habitants ({d.ranking.period})</h2>
          <div className="table-wrap short">
            <table className="grid compact">
              <thead><tr><th>#</th><th>Commune</th><th className="num">Pour 1 000 hab.</th><th>Évolution</th></tr></thead>
              <tbody>
                {d.ranking.rows.map((r, i) => (
                  <tr key={r.code} style={r.code === '94041' ? { fontWeight: 700, background: 'color-mix(in srgb, #dc2626 8%, transparent)' } : undefined}>
                    <td>{i + 1}</td><td>{r.nom}</td><td className="num">{fmt(r.value)}</td>
                    <td>{r.trend ? <span style={{ color: COLOR[r.trend.dir] }}>{ARROW[r.trend.dir]} {r.trend.pct != null ? `${r.trend.pct > 0 ? '+' : ''}${fmt(r.trend.pct)} %` : ''}</span> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Sources et pistes</h2>
      <ul className="src-list">
        {d.sources.map((s) => (
          <li key={s.titre}>
            <span className="st" style={{ background: BADGE[s.statut] ?? '#94a3b8' }}>{s.statut}</span>{' '}
            <strong>{s.titre}</strong>
            <div className="small">{s.detail}</div>
            <a className="small" href={s.lien} target="_blank" rel="noreferrer">{s.lien} ↗</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
