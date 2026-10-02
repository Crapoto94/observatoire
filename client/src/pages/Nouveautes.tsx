import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

interface Entry { hash: string; date: string; type: string; label: string; scope: string | null; subject: string }
interface Version { version: string; commits: number | null; source: string; whatsnew: Entry[] }

const COLOR: Record<string, string> = { feat: '#2563eb', fix: '#dc2626', docs: '#64748b', perf: '#7c3aed', refactor: '#0891b2', chore: '#94a3b8', autre: '#94a3b8' };
const fmtDay = (d: string) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Nouveautés : historique des commits git regroupés par jour, avec le numéro de version courant
export default function Nouveautes() {
  const [v, setV] = useState<Version | null>(null);
  const [error, setError] = useState('');
  const [type, setType] = useState('');
  useEffect(() => { api<Version>('/version').then(setV).catch((e) => setError(e.message)); }, []);
  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of v?.whatsnew ?? []) if (!type || e.type === type) (m.get(e.date) ?? m.set(e.date, []).get(e.date)!).push(e);
    return [...m.entries()];
  }, [v, type]);

  return (
    <section className="page whatsnew">
      <div className="page-head"><h1>Nouveautés</h1></div>
      {error && <div className="error">{error}</div>}
      {v && (
        <>
          <p>Version actuelle : <strong>v{v.version}</strong> <span className="muted small">· {v.commits ?? '?'} commits · mis à jour automatiquement à chaque commit</span></p>
          <div className="presets">
            <button className={type === '' ? 'on' : ''} onClick={() => setType('')}>Tout</button>
            <button className={type === 'feat' ? 'on' : ''} onClick={() => setType('feat')}>Nouveautés</button>
            <button className={type === 'fix' ? 'on' : ''} onClick={() => setType('fix')}>Corrections</button>
            <button className={type === 'docs' ? 'on' : ''} onClick={() => setType('docs')}>Documentation</button>
          </div>
          {byDay.map(([day, list]) => (
            <div key={day} className="wn-day">
              <h3>{fmtDay(day)}</h3>
              <ul>
                {list.map((e) => (
                  <li key={e.hash}>
                    <span className="st" style={{ background: COLOR[e.type] }}>{e.label}</span>{' '}
                    {e.scope && <span className="muted small">[{e.scope}] </span>}
                    {e.subject}
                    <span className="muted small"> · {e.hash}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {byDay.length === 0 && <div className="empty">Aucune entrée.</div>}
        </>
      )}
    </section>
  );
}
