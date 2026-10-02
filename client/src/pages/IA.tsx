import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { api } from '../api';

interface Consulted { outil: string; arguments: Record<string, unknown> }
interface Msg { role: 'user' | 'assistant'; content: string; consulted?: Consulted[]; error?: boolean }
interface Status { configured: boolean; model: string; provider: string }

const SUGGESTIONS = [
  "Comment se situe Ivry par rapport au GOSB et au Val-de-Marne ?",
  "Quelles sont les évolutions du nombre de demandeurs d'emploi depuis 2017 ?",
  "Quelles communes du GOSB ont le plus de cambriolages pour 1 000 habitants ?",
  "Résume la situation financière de la commune (dette, personnel, équipement).",
  "Quels indicateurs prioritaires de la conception ne sont pas encore validés ?",
  "Quels sont les points de vigilance sur le logement à Ivry ?",
];

const renderer = new marked.Renderer();
renderer.html = () => ''; // le HTML brut produit par le modèle n'est jamais rendu
const md = (s: string) => marked.parse(s, { renderer, gfm: true, breaks: true, async: false }) as string;

const TOOL_LABEL: Record<string, string> = {
  get_kpis: 'Indicateurs clés', list_datasets: 'Liste des jeux', describe_dataset: 'Description d’un jeu', query_data: 'Données',
  rank_communes: 'Classement des communes', list_layers: 'Couches', search_indicators: 'Indicateurs de la conception',
};

// Assistant IA : questions en langage naturel, réponses fondées uniquement sur les données de l'observatoire
export default function IA() {
  const [status, setStatus] = useState<Status | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try { return JSON.parse(localStorage.getItem('ia-chat') || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { api<Status>('/ia/status').then(setStatus).catch(() => setStatus({ configured: false, model: '', provider: '' })); }, []);
  useEffect(() => {
    try { localStorage.setItem('ia-chat', JSON.stringify(msgs.slice(-30))); } catch { /* stockage indisponible */ }
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const r = await api<{ answer: string; consulted: Consulted[] }>('/ia/chat', { body: { messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })) } });
      setMsgs([...next, { role: 'assistant', content: r.answer, consulted: r.consulted }]);
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: (e as Error).message, error: true }]);
    } finally { setBusy(false); }
  };

  const rendered = useMemo(() => msgs.map((m) => (m.role === 'assistant' && !m.error ? md(m.content) : '')), [msgs]);

  return (
    <section className="page ia">
      <div className="page-head">
        <h1>Assistant IA</h1>
        <div className="actions">{msgs.length > 0 && <button className="secondary" onClick={() => setMsgs([])}>Nouvelle conversation</button>}</div>
      </div>
      <div className="note-box small">
        L'assistant répond <strong>uniquement à partir des données de l'observatoire</strong> (indicateurs de la conception, jeux importés, KPI, classements). Pour répondre,
        les données consultées sont transmises à {status?.provider || 'Groq'}{status?.model ? ` (modèle ${status.model})` : ''}. Vérifiez les chiffres importants dans les pages Données ou Tableau de bord.
      </div>
      {status && !status.configured && (
        <div className="warn">
          L'assistant n'est pas configuré. Sur le serveur, ajoutez la ligne <code>GROQ_API_KEY=votre_clé</code> dans le fichier <code>.env</code> à côté de <code>docker-compose.yml</code>
          (facultatif : <code>GROQ_MODEL=llama-3.3-70b-versatile</code>), puis relancez avec <code>docker compose up -d</code>.
        </div>
      )}

      <div className="chat">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <p className="muted">Posez une question sur Ivry-sur-Seine, le GOSB ou la conception des indicateurs. Exemples :</p>
            <div className="chips">{SUGGESTIONS.map((s) => <button key={s} className="chip ds" disabled={!status?.configured} onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}${m.error ? ' err' : ''}`}>
            {m.role === 'assistant' && !m.error ? <div className="markdown" dangerouslySetInnerHTML={{ __html: rendered[i] }} /> : <div>{m.content}</div>}
            {m.consulted && m.consulted.length > 0 && (
              <details className="small sources">
                <summary>Données consultées ({m.consulted.length})</summary>
                <ul>{m.consulted.map((c, k) => <li key={k}><strong>{TOOL_LABEL[c.outil] ?? c.outil}</strong> <code>{JSON.stringify(c.arguments)}</code></li>)}</ul>
              </details>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant muted">Analyse des données de l'observatoire…</div>}
        <div ref={end} />
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea value={input} rows={2} placeholder="Votre question…" disabled={busy || !status?.configured}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button disabled={busy || !input.trim() || !status?.configured}>Envoyer</button>
      </form>
    </section>
  );
}
