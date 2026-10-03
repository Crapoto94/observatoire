import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api';

// Onglet « IA » des Paramètres : liste des prompts utilisés par l'assistant et journal des demandes
// (question, réponse, demandeur, modèle, sources) avec évaluation de la qualité (note + commentaire).
interface Tool { nom: string; description: string; parametres: unknown }
interface Prompts {
  system: string;
  regles: string[];
  territoires: Record<string, string>;
  outils: Tool[];
  profils: { groq: string; local: string };
  fournisseurs: { selectionne: string; groq: { configure: boolean; model: string; strategie: string }; local: { configure: boolean; model: string; api: string; strategie: string } };
}
interface Log {
  id: number; at: string; username: string | null; provider: string | null; model: string | null;
  question: string; answer: string; consulted: { outil: string; arguments: unknown }[]; sources: { label: string }[];
  duration_ms: number | null; status: string; error: string | null; rating: number | null; rating_comment: string | null;
}

export default function IaSettings() {
  const [prompts, setPrompts] = useState<Prompts | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'all' | 'none' | 'low'>('all');
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState('');

  const loadLogs = (f = filter) => {
    const q = f === 'none' ? '?rating=none' : f === 'low' ? '?low=1' : '';
    api<{ total: number; items: Log[] }>(`/ia/logs${q}`).then((r) => {
      setLogs(r.items); setTotal(r.total);
    }).catch((e) => setError(e.message));
  };
  useEffect(() => { api<Prompts>('/ia/prompts').then(setPrompts).catch((e) => setError(e.message)); loadLogs('all'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = async (log: Log, rating: number, comment: string) => {
    try { await api(`/ia/logs/${log.id}/rating`, { method: 'PUT', body: { rating, comment } }); loadLogs(); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="ia-settings">
      <div className="settings-card">
        <h2>Prompts de l'assistant</h2>
        <p className="muted small">L'assistant n'utilise que ces instructions et les données de l'observatoire, via les outils ci-dessous. Chaque demande est traitée indépendamment des précédentes.</p>
        <label className="field"><span>Prompt système</span>
          <textarea readOnly rows={6} value={prompts?.system ?? 'Chargement…'} /></label>
        {prompts && (
          <>
            <h3>Profils optimisés par fournisseur</h3>
            <div className="settings-grid">
              <label className="field"><span>IA locale · DGX Spark · {prompts.fournisseurs.local.model || 'modèle par défaut'}</span><textarea readOnly rows={4} value={prompts.fournisseurs.local.strategie} /></label>
              <label className="field"><span>Groq · {prompts.fournisseurs.groq.model || 'modèle non configuré'}</span><textarea readOnly rows={4} value={prompts.fournisseurs.groq.strategie} /></label>
            </div>
            <h3>Règles</h3>
            <ul className="small">{prompts.regles.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <h3>Territoires reconnus</h3>
            <dl className="kv small">{Object.entries(prompts.territoires).map(([k, v]) => <><dt key={k}>{k}</dt><dd>{v}</dd></>)}</dl>
            <h3>Outils (appelés avant toute réponse chiffrée)</h3>
            <div className="table-wrap short">
              <table className="grid compact">
                <thead><tr><th>Outil</th><th>Description</th></tr></thead>
                <tbody>{prompts.outils.map((t) => <tr key={t.nom}><td><code>{t.nom}</code></td><td className="small">{t.description}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="muted small">Fournisseur sélectionné : <b>{prompts.fournisseurs.selectionne}</b> · Groq : {prompts.fournisseurs.groq.configure ? 'configuré' : 'non configuré'} · Local : {prompts.fournisseurs.local.configure ? 'configuré' : 'non configuré'}</p>
          </>
        )}
      </div>

      <div className="settings-card">
        <h2>Journal des demandes</h2>
        {error && <div className="error">{error}</div>}
        <div className="runs-filters">
          <label className="field small"><span>Filtrer</span>
            <select value={filter} onChange={(e) => { const f = e.target.value as typeof filter; setFilter(f); loadLogs(f); }}>
              <option value="all">Toutes les demandes</option>
              <option value="none">Sans évaluation</option>
              <option value="low">Notes faibles (≤ 2)</option>
            </select>
          </label>
          <span className="muted small">{total} demande(s)</span>
          <button className="secondary" onClick={() => loadLogs()}>⟳ Actualiser</button>
        </div>
        <div className="ia-log-list">
          {logs.length === 0 && <div className="empty small">Aucune demande enregistrée.</div>}
          {logs.map((l) => (
            <div key={l.id} className={`ia-log-item${l.status !== 'ok' ? ' err' : ''}`}>
              <div className="ia-log-head" onClick={() => setOpen(open === l.id ? null : l.id)}>
                <span className="muted small">{fmtDate(l.at)}</span>
                <span className="ia-log-user">{l.username || 'anonyme'}</span>
                <span className="muted small">{l.provider} · {l.model}</span>
                {l.duration_ms != null && <span className="muted small">{l.duration_ms} ms</span>}
                <span className="spacer" />
                <Stars value={l.rating} />
              </div>
              <div className="ia-log-q">{l.question}</div>
              {open === l.id && (
                <div className="ia-log-body">
                  {l.status !== 'ok' && <div className="error small">Erreur : {l.error}</div>}
                  <div className="markdown small" style={{ whiteSpace: 'pre-wrap' }}>{l.answer}</div>
                  {l.sources?.length > 0 && <div className="muted small">Sources : {l.sources.map((s) => s.label).join(', ')}</div>}
                  {l.consulted?.length > 0 && <div className="muted small">Outils : {l.consulted.map((c) => c.outil).join(', ')}</div>}
                  <Rating onRate={(r, c) => rate(l, r, c)} current={l.rating} comment={l.rating_comment} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="muted small">non évaluée</span>;
  const v = Math.min(4, Math.max(0, value));
  return <span className="stars" title={`${value}/4`}>{'★'.repeat(v)}<span className="muted">{'★'.repeat(4 - v)}</span></span>;
}

// Évaluation de la qualité proposée au demandeur : note 1-4 étoiles et commentaire facultatif.
function Rating({ current, comment, onRate }: { current: number | null; comment: string | null; onRate: (rating: number, comment: string) => void }) {
  const [note, setNote] = useState(current ?? 0);
  const [text, setText] = useState(comment ?? '');
  const [done, setDone] = useState(false);
  return (
    <div className="ia-rating">
      <span className="muted small">Qualité de la réponse :</span>
      <span className="stars-input">
        {[1, 2, 3, 4].map((n) => (
          <button key={n} type="button" className={n <= note ? 'on' : ''} onClick={() => { setNote(n); setDone(false); }} title={`${n}/4`}>★</button>
        ))}
      </span>
      <input className="ia-rating-comment" placeholder="Commentaire (facultatif)" value={text} onChange={(e) => { setText(e.target.value); setDone(false); }} />
      <button className="secondary" disabled={!note || done} onClick={() => { onRate(note, text); setDone(true); }}>{done ? '✓ merci' : 'Noter'}</button>
    </div>
  );
}
