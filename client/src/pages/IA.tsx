import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { api } from '../api';

interface Consulted { outil: string; arguments: Record<string, unknown> }
interface Msg { role: 'user' | 'assistant'; content: string; consulted?: Consulted[]; error?: boolean; via?: string }
type Provider = 'groq' | 'local';
interface Status {
  selected: Provider;
  groq: { configured: boolean; model: string };
  local: { configured: boolean; kind: 'ollama' | 'vllm'; url: string; model: string };
}

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
  rank_communes: 'Classement des communes', list_layers: 'Couches', search_indicators: 'Indicateurs de la conception', contexte: 'Extrait préparé de l’observatoire',
};
const DEFAULT_URL = { ollama: 'http://localhost:11434', vllm: 'http://localhost:8000' } as const;

// Assistant IA : questions en langage naturel, réponses fondées uniquement sur les données de l'observatoire.
// Modèle au choix : Groq (en ligne) ou serveur local Ollama / vLLM.
export default function IA() {
  const [status, setStatus] = useState<Status | null>(null);
  const [provider, setProvider] = useState<Provider | null>(() => {
    try { const p = localStorage.getItem('ia-provider'); return p === 'groq' || p === 'local' ? p : null; } catch { return null; }
  });
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try { return JSON.parse(localStorage.getItem('ia-chat') || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [form, setForm] = useState({ kind: 'ollama' as 'ollama' | 'vllm', url: '', model: '', groqModel: '' });
  const [models, setModels] = useState<string[]>([]);
  const [cfgMsg, setCfgMsg] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const load = () => api<Status>('/ia/status').then((s) => {
    setStatus(s);
    setForm({ kind: s.local.kind, url: s.local.url, model: s.local.model, groqModel: s.groq.model });
    setProvider((p) => p ?? s.selected);
  }).catch(() => undefined);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    try { localStorage.setItem('ia-chat', JSON.stringify(msgs.slice(-30))); } catch { /* stockage indisponible */ }
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const choose = (p: Provider) => { setProvider(p); try { localStorage.setItem('ia-provider', p); } catch { /* stockage indisponible */ } };
  const ready = !!status && !!provider && (provider === 'groq' ? status.groq.configured : status.local.configured);
  const shown = provider === 'local' ? (status?.local.kind === 'vllm' ? 'vLLM' : 'Ollama') : 'Groq';

  const save = async () => {
    setCfgMsg('');
    try {
      const s = await api<Status>('/ia/settings', { method: 'PUT', body: { provider, groqModel: form.groqModel, local: { kind: form.kind, url: form.url, model: form.model } } });
      setStatus(s);
      setCfgMsg('Réglages enregistrés.');
    } catch (e) { setCfgMsg((e as Error).message); }
  };
  const detect = async () => {
    setCfgMsg('');
    try {
      await api('/ia/settings', { method: 'PUT', body: { local: { kind: form.kind, url: form.url } } });
      const r = await api<{ models: string[] }>('/ia/models?provider=local');
      setModels(r.models);
      setCfgMsg(r.models.length ? `${r.models.length} modèle(s) détecté(s).` : 'Serveur joint, mais aucun modèle listé.');
      if (r.models.length && !r.models.includes(form.model)) setForm((f) => ({ ...f, model: r.models[0] }));
    } catch (e) { setModels([]); setCfgMsg((e as Error).message); }
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy || !ready) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const r = await api<{ answer: string; consulted: Consulted[]; provider?: string; model?: string }>('/ia/chat', {
        body: { provider, messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })) },
      });
      setMsgs([...next, { role: 'assistant', content: r.answer, consulted: r.consulted, via: [r.provider, r.model].filter(Boolean).join(' · ') }]);
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

      <div className="ia-provider">
        <span className="muted small">Modèle :</span>
        <label className={`inline${provider === 'groq' ? ' on' : ''}`}>
          <input type="radio" name="prov" checked={provider === 'groq'} onChange={() => choose('groq')} /> Groq (en ligne){status && !status.groq.configured ? ' · non configuré' : status ? ` · ${status.groq.model}` : ''}
        </label>
        <label className={`inline${provider === 'local' ? ' on' : ''}`}>
          <input type="radio" name="prov" checked={provider === 'local'} onChange={() => choose('local')} /> Local (Ollama / vLLM){status && !status.local.configured ? ' · non configuré' : status ? ` · ${status.local.model}` : ''}
        </label>
        <button className="secondary" onClick={() => setCfgOpen(!cfgOpen)}>{cfgOpen ? 'Fermer' : 'Configurer'}</button>
      </div>

      {cfgOpen && (
        <div className="ia-config">
          <div className="filters">
            <label className="field small"><span>Type de serveur local</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'ollama' | 'vllm', url: form.url || DEFAULT_URL[e.target.value as 'ollama' | 'vllm'] })}>
                <option value="ollama">Ollama</option><option value="vllm">vLLM</option>
              </select>
            </label>
            <label className="field grow"><span>URL du serveur</span>
              <input value={form.url} placeholder={DEFAULT_URL[form.kind]} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </label>
            <button className="secondary" onClick={detect} disabled={!form.url}>Détecter les modèles</button>
          </div>
          <div className="filters">
            <label className="field grow"><span>Modèle local</span>
              <input list="ia-models" value={form.model} placeholder={form.kind === 'ollama' ? 'ex. qwen2.5:14b' : 'ex. Qwen/Qwen2.5-14B-Instruct'} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              <datalist id="ia-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
            </label>
            <label className="field grow"><span>Modèle Groq</span>
              <input value={form.groqModel} onChange={(e) => setForm({ ...form, groqModel: e.target.value })} />
            </label>
            <button onClick={save}>Enregistrer</button>
          </div>
          <p className="muted small">
            Le serveur local doit exposer l'API compatible OpenAI (Ollama : <code>http://hôte:11434</code> ; vLLM : <code>http://hôte:8000</code>, lancé avec <code>--enable-auto-tool-choice</code> et un
            <code> --tool-call-parser</code> pour les appels de fonctions). Depuis Docker, « localhost » désigne le conteneur : utilisez l'adresse IP du serveur. Un modèle sans appels de fonctions est géré :
            l'observatoire lui fournit alors directement un extrait des données. La clé Groq reste dans le fichier <code>.env</code> du serveur.
          </p>
          {cfgMsg && <div className="small">{cfgMsg}</div>}
        </div>
      )}

      <div className="note-box small">
        L'assistant répond <strong>uniquement à partir des données de l'observatoire</strong> (indicateurs de la conception, jeux importés, KPI, classements).{' '}
        {provider === 'local'
          ? `Les données consultées sont transmises à votre serveur ${shown}, et ne quittent pas votre réseau si celui-ci est interne.`
          : 'Les données consultées sont transmises à Groq pour rédiger la réponse.'}{' '}
        Vérifiez les chiffres importants dans les pages Données ou Tableau de bord.
      </div>
      {status && provider && !ready && (
        <div className="warn">
          {provider === 'groq'
            ? <>Groq n'est pas configuré : ajoutez <code>GROQ_API_KEY=votre_clé</code> dans le fichier <code>.env</code> à côté de <code>docker-compose.yml</code>, puis <code>docker compose up -d</code>.</>
            : <>Le modèle local n'est pas configuré : cliquez sur « Configurer » pour saisir l'URL du serveur et le modèle.</>}
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
          <div key={i} className={`bubble ${m.role}${m.error ? ' err' : ''}`}>
            {m.role === 'assistant' && !m.error ? <div className="markdown" dangerouslySetInnerHTML={{ __html: rendered[i] }} /> : <div>{m.content}</div>}
            {m.via && <div className="muted small">{m.via}</div>}
            {m.consulted && m.consulted.length > 0 && (
              <details className="small sources">
                <summary>Données consultées ({m.consulted.length})</summary>
                <ul>{m.consulted.map((c, k) => <li key={k}><strong>{TOOL_LABEL[c.outil] ?? c.outil}</strong> <code>{JSON.stringify(c.arguments)}</code></li>)}</ul>
              </details>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant muted">Analyse des données de l'observatoire ({shown})…</div>}
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
