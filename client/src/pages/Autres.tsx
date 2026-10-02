import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Card, Kpi } from './Dashboard';

interface Suggestion { libelle: string; [k: string]: unknown }
interface KpiX extends Kpi { suggestion: Suggestion; adopted: boolean }
interface Rank { code: string; nom: string; value: number; trend: { dir: 'up' | 'down' | 'flat'; pct: number | null } | null }
interface Src { statut: string; titre: string; detail: string; lien: string }
interface Data {
  groups: { theme: string; kpis: KpiX[] }[];
  orphanDatasets: { id: string; label: string; nb_rows: number }[];
  emploi: { insights: { level: string; text: string }[]; ranking: { period: string; rows: Rank[] } | null; kpis: Kpi[] };
  sources: Src[];
}

const fmt = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const ARROW = { up: '▲', down: '▼', flat: '►' } as const;
const COLOR = { up: '#dc2626', down: '#16a34a', flat: '#2563eb' } as const; // demandeurs d'emploi : une hausse est défavorable
const BADGE: Record<string, string> = { 'intégré': '#2e9d4f', piste: '#d97706', 'à vérifier': '#94a3b8' };

// Autres : indicateurs calculables à partir des données ouvertes mais non demandés par la conception, éclairage emploi, sources
export default function Autres() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());
  const load = () => api<Data>('/autres').then(setD).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const adopt = async (k: KpiX) => {
    try {
      await api('/indicators', { body: k.suggestion });
      setAdded((s) => new Set(s).add(k.suggestion.libelle));
    } catch (e) { setError((e as Error).message); }
  };

  if (!d) return <section className="page"><div className="page-head"><h1>Autres</h1></div>{error ? <div className="error">{error}</div> : <div className="empty">Calcul en cours…</div>}</section>;
  const total = d.groups.reduce((n, g) => n + g.kpis.length, 0);

  return (
    <section className="page autres">
      <div className="page-head"><h1>Autres indicateurs</h1></div>
      {error && <div className="error">{error}</div>}
      <p className="muted">
        Indicateurs calculables dès maintenant à partir des données ouvertes importées, mais <strong>non demandés par la conception actuelle</strong> ({total} proposés).
        « Ajouter à la conception » crée une fiche en brouillon (source, proposition et jeu de données rattaché déjà renseignés) à valider.
      </p>

      {d.groups.length === 0 && <div className="note-box small">Aucun indicateur complémentaire disponible : les données ne sont peut-être pas encore toutes chargées.</div>}
      {d.groups.map((g) => (
        <div key={g.theme}>
          <h2>{g.theme}</h2>
          <div className="kpi-grid">
            {g.kpis.map((k) => (
              <div key={k.id} className="autre-card">
                <Card k={k} focus={false} />
                {k.adopted || added.has(k.suggestion.libelle)
                  ? <div className="small trend-up">✓ Ajouté à la conception <Link to="/indicateurs">voir</Link></div>
                  : <button className="secondary" onClick={() => adopt(k)}>+ Ajouter à la conception</button>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {d.orphanDatasets.length > 0 && (
        <>
          <h2>Jeux importés sans indicateur de la conception</h2>
          <p className="muted small">Ces jeux sont disponibles dans Données mais ne nourrissent aucune fiche : candidats pour de nouveaux indicateurs.</p>
          <div className="chips">{d.orphanDatasets.map((o) => <Link key={o.id} className="chip ds" to={`/donnees?ds=${o.id}`} title={`${o.nb_rows} lignes`}>{o.label}</Link>)}</div>
        </>
      )}

      <h2>Emploi : lecture pour la décision</h2>
      {d.emploi.insights.length === 0 ? <div className="note-box small">Les données d'emploi ne sont pas encore toutes chargées.</div> : (
        <ul className="insights">{d.emploi.insights.map((i, k) => <li key={k} className={i.level}>{i.text}</li>)}</ul>
      )}
      <div className="kpi-grid">{d.emploi.kpis.map((k) => <Card key={k.id} k={k} focus={false} />)}</div>
      <p className="small">
        <Link to="/cartographie?couche=defm_1000&perimetre=gosb">Carte des demandeurs d'emploi</Link> · <Link to="/donnees?ds=ft_defm">Données détaillées</Link>
        {' '}· Les propositions des fiches « emploi » de la conception ont été complétées avec ces données (bloc « [Données disponibles] »).
      </p>

      {d.emploi.ranking && d.emploi.ranking.rows.length > 0 && (
        <>
          <h3>Communes du GOSB (plus de 5 000 habitants) : demandeurs d'emploi pour 1 000 habitants ({d.emploi.ranking.period})</h3>
          <div className="table-wrap short">
            <table className="grid compact">
              <thead><tr><th>#</th><th>Commune</th><th className="num">Pour 1 000 hab.</th><th>Évolution</th></tr></thead>
              <tbody>
                {d.emploi.ranking.rows.map((r, i) => (
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
