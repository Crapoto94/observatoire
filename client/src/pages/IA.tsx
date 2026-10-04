import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

interface Consulted { outil: string; arguments: Record<string, unknown> }
interface Source { type: 'dataset' | 'kpi' | 'map'; id: string; label: string; url: string }
interface Msg { role: 'user' | 'assistant'; content: string; consulted?: Consulted[]; sources?: Source[]; error?: boolean; via?: string; logId?: number; progress?: boolean; tokens?: number }
type Provider = 'groq' | 'local';
type Level = 'sommaire' | 'normal' | 'detaille';
interface Status {
  selected: Provider;
  levels: Level[];
  groq: { configured: boolean; model: string };
  local: { configured: boolean; model: string };
}
type ModelInfo = { source: string; models: string[]; defaultModel: string | null };

const SUGGESTIONS = [
  "Comment se situe Ivry par rapport au GOSB et au Val-de-Marne ?",
  "Quelles sont les évolutions du nombre de demandeurs d'emploi depuis 2017 ?",
  "Quelles communes du GOSB ont le plus de cambriolages pour 1 000 habitants ?",
  "Résume la situation financière de la commune (dette, personnel, équipement).",
  "Quels indicateurs prioritaires de la conception ne sont pas encore validés ?",
  "Quels sont les points de vigilance sur le logement à Ivry ?",
];

const LEVEL_LABEL: Record<Level, string> = {
  sommaire: 'Sommaire',
  normal: 'Normal',
  detaille: 'Approfondi',
};
const LEVEL_HINT: Record<Level, string> = {
  sommaire: 'Réponse très concise (2 à 4 phrases).',
  normal: 'Réponse équilibrée (par défaut).',
  detaille: 'Réponse développée, chiffres détaillés et limites.',
};

const renderer = new marked.Renderer();
renderer.html = () => ''; // le HTML brut produit par le modèle n'est jamais rendu
const md = (s: string) => marked.parse(s, { renderer, gfm: true, breaks: true, async: false }) as string;

const TOOL_LABEL: Record<string, string> = {
  get_kpis: 'Indicateurs clés', list_datasets: 'Liste des jeux', describe_dataset: 'Description d’un jeu', query_data: 'Données',
  rank_communes: 'Classement des communes', list_layers: 'Couches', search_indicators: 'Indicateurs de la conception', contexte: 'Extrait préparé de l’observatoire',
};

const POLL_MS = 1500;

// Fil de conversation personnel : rangé sous une clé propre à l'utilisateur connecté (jamais partagé entre comptes
// sur un même poste) ; sans connexion, il ne dure que le temps de l'onglet. L'ancienne clé commune est supprimée.
const chatKey = (userId: number | null) => (userId == null ? null : `ia-chat:${userId}`);
function loadChat(userId: number | null): Msg[] {
  try {
    localStorage.removeItem('ia-chat');
    const k = chatKey(userId);
    return JSON.parse((k ? localStorage.getItem(k) : sessionStorage.getItem('ia-chat-anonyme')) || '[]');
  } catch { return []; }
}
function saveChat(userId: number | null, msgs: Msg[]) {
  try {
    const k = chatKey(userId), v = JSON.stringify(msgs.slice(-30));
    if (k) localStorage.setItem(k, v); else sessionStorage.setItem('ia-chat-anonyme', v);
  } catch { /* stockage indisponible */ }
}

// Assistant IA : questions en langage naturel, réponses fondées uniquement sur les données de l'observatoire.
// Le fournisseur et le modèle se choisissent ici ; la configuration (clé, URL) est dans le .env du serveur.
// La réponse s'affiche progressivement (job + polling) puis l'utilisateur la note de 1 à 4 étoiles.
export default function IA() {
  const { user, ready: authReady } = useAuth();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<Status | null>(null);
  const [provider, setProvider] = useState<Provider | null>(() => {
    try { const p = localStorage.getItem('ia-provider'); return p === 'groq' || p === 'local' ? p : null; } catch { return null; }
  });
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>(() => { try { return localStorage.getItem('ia-model') || ''; } catch { return ''; } });
  const [level, setLevel] = useState<Level>(() => {
    try { const l = localStorage.getItem('ia-level'); return l === 'sommaire' || l === 'detaille' ? l : 'normal'; } catch { return 'normal'; }
  });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [owner, setOwner] = useState<number | null | undefined>(undefined); // utilisateur dont le fil est affiché
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Status>('/ia/status').then((s) => { setStatus(s); setProvider((p) => p ?? s.selected); }).catch(() => undefined);
  }, []);
  // changement d'utilisateur (connexion, déconnexion) : on recharge son propre fil, jamais celui du précédent
  useEffect(() => {
    if (!authReady) return;
    setMsgs(loadChat(userId));
    setOwner(userId);
  }, [authReady, userId]);
  useEffect(() => {
    if (owner === undefined || owner !== userId) return;
    saveChat(owner, msgs);
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, owner, userId]);

  // Modèles de la source active : l'« IA locale » (API Ville) en propose plusieurs, Groq un seul.
  useEffect(() => {
    if (!provider || !status) { setModels([]); return; }
    let live = true;
    api<ModelInfo>(`/ia/models?provider=${provider}`).then((r) => {
      if (!live) return;
      setModels(r.models);
      setModel((m) => (m && r.models.includes(m) ? m : (r.defaultModel || r.models[0] || '')));
    }).catch(() => { if (live) setModels([]); });
    return () => { live = false; };
  }, [provider, status]);

  const choose = (p: Provider) => { setProvider(p); try { localStorage.setItem('ia-provider', p); } catch { /* stockage indisponible */ } };
  const chooseModel = (m: string) => { setModel(m); try { localStorage.setItem('ia-model', m); } catch { /* stockage indisponible */ } };
  const chooseLevel = (l: Level) => { setLevel(l); try { localStorage.setItem('ia-level', l); } catch { /* stockage indisponible */ } };

  const ready = !!status && !!provider && (provider === 'groq' ? status.groq.configured : status.local.configured);
  const shown = provider === 'local' ? 'IA locale (API Ville)' : 'Groq';

  // Suit un job de génération en pollant son état et met à jour la bulle assistant au fil de l'eau.
  const pollJob = (jobId: string, q: string) => new Promise<void>((resolve) => {
    const tick = async () => {
      try {
        const j = await api<{ status: string; partialText?: string; tokensReceived?: number; answer?: string; consulted?: Consulted[]; sources?: Source[]; provider?: string; model?: string; error?: string; logId?: number }>(
          `/ia/job/${jobId}?question=${encodeURIComponent(q)}&provider=${provider}`,
        );
        if (j.status === 'completed') {
          setMsgs((cur) => cur.map((m, i) => (i === cur.length - 1 ? { ...m, role: 'assistant', content: j.answer || '', consulted: j.consulted, sources: j.sources, via: [j.provider, j.model].filter(Boolean).join(' · '), logId: j.logId, progress: false } : m)));
          resolve();
          return;
        }
        if (j.status === 'error') {
          setMsgs((cur) => cur.map((m, i) => (i === cur.length - 1 ? { ...m, role: 'assistant', content: j.error || 'Erreur inconnue', error: true, progress: false } : m)));
          resolve();
          return;
        }
        setMsgs((cur) => cur.map((m, i) => (i === cur.length - 1 ? { ...m, role: 'assistant', content: j.partialText || '', progress: true, tokens: j.tokensReceived } : m)));
      } catch (e) {
        setMsgs((cur) => cur.map((m, i) => (i === cur.length - 1 ? { ...m, role: 'assistant', content: (e as Error).message, error: true, progress: false } : m)));
        resolve();
        return;
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
  });

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy || !ready) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }, { role: 'assistant', content: '', progress: true }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const r = await api<{ jobId: string }>('/ia/chat/start', {
        method: 'POST',
        body: { provider, model: model || undefined, level, messages: next.filter((m) => !m.error && !m.progress).map((m) => ({ role: m.role, content: m.content })) },
      });
      if (!r.jobId) {
        setMsgs((cur) => cur.map((m, i) => (i === cur.length - 1 ? { ...m, content: 'Réponse vide du serveur.', error: true, progress: false } : m)));
        return;
      }
      await pollJob(r.jobId, q);
    } catch (e) {
      setMsgs((cur) => cur.map((m, i) => (i === cur.length - 1 ? { ...m, role: 'assistant', content: (e as Error).message, error: true, progress: false } : m)));
    } finally { setBusy(false); }
  };

  const rate = async (logId: number, rating: number, comment: string) => {
    await api(`/ia/logs/${logId}/rating`, { method: 'PUT', body: { rating, comment } });
    setMsgs((cur) => cur.map((m) => (m.logId === logId ? { ...m, rated: rating } as Msg & { rated: number } : m)));
  };

  const rendered = useMemo(() => msgs.map((m) => (m.role === 'assistant' && !m.error ? md(m.content) : '')), [msgs]);

  return (
    <section className="page ia">
      <div className="page-head">
        <h1>Assistant IA</h1>
        <div className="actions">{msgs.length > 0 && <button className="secondary" onClick={() => setMsgs([])}>Nouvelle conversation</button>}</div>
      </div>

      <div className="ia-controls">
        <div className="ia-provider">
          <span className="muted small">Modèle :</span>
          <label className={`inline${provider === 'groq' ? ' on' : ''}`}>
            <input type="radio" name="prov" checked={provider === 'groq'} onChange={() => choose('groq')} /> Groq{status ? (status.groq.configured ? ` · ${status.groq.model}` : ' · non configuré') : ''}
          </label>
          <label className={`inline${provider === 'local' ? ' on' : ''}`}>
            <input type="radio" name="prov" checked={provider === 'local'} onChange={() => choose('local')} /> IA locale (API Ville){status ? (status.local.configured ? '' : ' · non configurée') : ''}
          </label>
        </div>

        <div className="ia-selectors">
          <label className="field small">
            <span>Modèle</span>
            <select value={model} onChange={(e) => chooseModel(e.target.value)} disabled={busy || models.length === 0}>
              {models.length === 0 && <option value="">{models.length === 0 ? 'aucun modèle disponible' : ''}</option>}
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="field small" title={LEVEL_HINT[level]}>
            <span>Niveau de pensée</span>
            <select value={level} onChange={(e) => chooseLevel(e.target.value as Level)} disabled={busy}>
              {(status?.levels ?? (['sommaire', 'normal', 'detaille'] as Level[])).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="note-box small">
        <strong>Chaque demande est indépendante des précédentes</strong> : l'assistant ne conserve pas le fil de la conversation et repart des seules données de l'observatoire pour chaque question.{' '}
        L'assistant répond <strong>uniquement à partir des données de l'observatoire</strong> (indicateurs de la conception, jeux importés, KPI, classements).{' '}
        {provider === 'groq'
          ? 'Les données consultées sont transmises à Groq pour rédiger la réponse.'
          : "Les données consultées sont transmises à l'IA locale hébergée par la Ville (API centrale)."}{' '}
        Vérifiez les chiffres importants dans les pages Données ou Tableau de bord.
      </div>
      {status && provider && !ready && (
        <div className="warn">
          {provider === 'groq'
            ? <>Groq n'est pas configuré : ajoutez <code>GROQ_API_KEY=votre_clé</code> dans le fichier <code>.env</code> du serveur (à côté de <code>docker-compose.yml</code>), puis <code>docker compose up -d</code>.</>
            : <>L'IA locale (API Ville) n'est pas disponible : renseignez <code>APM_API_URL</code> et <code>APM_API_KEY</code> dans le fichier <code>.env</code> du serveur.</>}
        </div>
      )}

      <div className="chat">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <p className="muted">Posez une question sur Ivry-sur-Seine, le GOSB ou la conception des indicateurs. Exemples :</p>
            <div className="chips">{SUGGESTIONS.map((s) => <button key={s} className="chip ds" disabled={!ready} onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}${m.error ? ' err' : ''}${m.progress ? ' streaming' : ''}`}>
            {m.role === 'assistant' && !m.error
              ? <div className="markdown" dangerouslySetInnerHTML={{ __html: rendered[i] }} />
              : <div>{m.content}</div>}
            {m.progress && <div className="gen-inline muted small">{m.content ? '' : 'Analyse des données de l\'observatoire '}<span className="gen-cursor">▌</span>{m.tokens ? ` · ${m.tokens.toLocaleString('fr-FR')} jetons` : ''}</div>}
            {m.sources && m.sources.length > 0 && (
              <div className="ia-sources small">
                <strong>Jeux de données associés :</strong>{' '}
                {m.sources.map((x) => <Link key={`${x.type}-${x.id}`} className="chip ds" to={x.url} title={x.type === 'kpi' ? 'Voir ce KPI dans le tableau de bord' : x.type === 'map' ? 'Afficher cette couche sur la carte' : 'Ouvrir ce jeu de données'}>{x.type === 'kpi' ? 'KPI ▸ ' : x.type === 'map' ? 'Carte ▸ ' : ''}{x.label}</Link>)}
              </div>
            )}
            {m.via && <div className="muted small">{m.via}</div>}
            {m.consulted && m.consulted.length > 0 && (
              <details className="small sources">
                <summary>Données consultées ({m.consulted.length})</summary>
                <ul>{m.consulted.map((c, k) => <li key={k}><strong>{TOOL_LABEL[c.outil] ?? c.outil}</strong> <code>{JSON.stringify(c.arguments)}</code></li>)}</ul>
              </details>
            )}
            {m.role === 'assistant' && !m.error && !m.progress && m.logId != null && (
              <Feedback logId={m.logId} onRate={rate} />
            )}
          </div>
        ))}
        <div ref={end} />
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea value={input} rows={2} placeholder="Votre question…" disabled={busy || !ready}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button disabled={busy || !input.trim() || !ready}>Envoyer</button>
      </form>
    </section>
  );
}

// Évaluation de la réponse par le demandeur : note de 1 à 4 étoiles et commentaire facultatif.
function Feedback({ logId, onRate }: { logId: number; onRate: (logId: number, rating: number, comment: string) => Promise<void> }) {
  const [note, setNote] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  if (sent) return <div className="ia-feedback small muted">✓ Merci, votre évaluation ({note}/4) a été enregistrée.</div>;
  const submit = async (n: number) => {
    if (!n) return;
    setNote(n);
    try { await onRate(logId, n, text); setSent(true); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="ia-feedback">
      <span className="muted small">Cette réponse vous a-t-elle convenu ?</span>
      <span className="stars-input" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4].map((n) => (
          <button key={n} type="button" className={n <= (hover || note) ? 'on' : ''} title={`${n}/4`}
            onMouseEnter={() => setHover(n)} onClick={() => submit(n)}>★</button>
        ))}
      </span>
      <input className="ia-rating-comment" placeholder="Commentaire (facultatif)" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="secondary" disabled={!note} onClick={() => submit(note)}>Envoyer</button>
      {err && <span className="error small">{err}</span>}
    </div>
  );
}
