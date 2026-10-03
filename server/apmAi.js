// Client pour l'API IA de la Ville (APM) : l'IA locale est fournie par l'API centrale, avec le
// modèle choisi et un basculement automatique de fournisseur côté APM. Config via .env (APM_API_URL,
// APM_API_KEY) — aucune URL ni clé en dur. Le certificat auto-signé est géré par httpsClient.
//   GET  {APM}/api/v1/ai/models          -> modèles configurés (actifs)
//   POST {APM}/api/v1/ai/query { prompt, model? } -> réponse
const { jsonRequest } = require('./httpsClient');

const apmUrl = () => (process.env.APM_API_URL || 'https://api.ivry.local').replace(/\/+$/, '');
const apmKey = () => process.env.APM_API_KEY || '';
const enabled = () => !!apmKey();

/** Liste des modèles actifs exposés par l'API IA de la Ville (tableau de chaînes). */
async function listModels() {
  if (!enabled()) return [];
  const { status, data } = await jsonRequest(`${apmUrl()}/api/v1/ai/models`, {
    headers: { 'X-API-KEY': apmKey(), Accept: 'application/json' }, timeoutMs: 15000,
  });
  if (status !== 200) throw new Error(`API IA (APM) : HTTP ${status}`);
  const raw = Array.isArray(data) ? data : (Array.isArray(data?.models) ? data.models : (Array.isArray(data?.data) ? data.data : []));
  // L'APM peut renvoyer des entrées objet { name|id|label, active|is_active } : on ne garde que les actives.
  const active = raw.filter((m) => (typeof m !== 'object' || m === null ? true : (m.active ?? m.is_active) !== false));
  return active.map((m) => (typeof m === 'string' ? m : (m?.name || m?.id || m?.label || String(m)))).filter(Boolean);
}

/** Interroge l'API IA de la Ville : renvoie le texte de la réponse. Le modèle est facultatif (défaut APM sinon). */
async function query(prompt, model) {
  if (!enabled()) throw new Error("APM_API_KEY non configurée : API IA de la Ville indisponible");
  const { status, data } = await jsonRequest(`${apmUrl()}/api/v1/ai/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apmKey() },
    body: model ? { prompt, model } : { prompt },
    timeoutMs: 20 * 60 * 1000,
  });
  if (status < 200 || status >= 300) throw new Error(`API IA (APM) : HTTP ${status}${typeof data?.error === 'string' ? ' — ' + data.error : ''}`);
  if (typeof data === 'string') return data;
  return data?.response ?? data?.result ?? data?.answer ?? data?.text ?? data?.content ?? data?.message ?? JSON.stringify(data);
}

/** Démarre une génération asynchrone : renvoie immédiatement un queryId à suivre via queryProgress.
 *  Endpoint /query-async de l'API Ville — évite une seule connexion HTTP très longue, et permet
 *  d'afficher la réponse au fur et à mesure (cf. queryWithProgress). */
async function queryAsync(prompt, model) {
  if (!enabled()) throw new Error("APM_API_KEY non configurée : API IA de la Ville indisponible");
  const { status, data } = await jsonRequest(`${apmUrl()}/api/v1/ai/query-async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apmKey() },
    body: model ? { prompt, model } : { prompt },
    timeoutMs: 30000,
  });
  if (status < 200 || status >= 300) throw new Error(`API IA (APM) : HTTP ${status}${typeof data?.error === 'string' ? ' — ' + data.error : ''}`);
  const queryId = data?.queryId ?? data?.query_id ?? data?.id;
  if (!queryId) throw new Error("L'API IA (APM) n'a pas renvoyé de queryId — endpoint /query-async peut-être indisponible");
  return queryId;
}

/** État d'une génération démarrée via queryAsync :
 *  { status: 'running'|'completed'|'error', tokensReceived, charsReceived, response?, error?, model?, provider_label? }. */
async function queryProgress(queryId) {
  if (!enabled()) throw new Error("APM_API_KEY non configurée : API IA de la Ville indisponible");
  const { status, data } = await jsonRequest(`${apmUrl()}/api/v1/ai/query-progress/${encodeURIComponent(queryId)}`, {
    headers: { 'X-API-KEY': apmKey(), Accept: 'application/json' },
    timeoutMs: 15000,
  });
  if (status < 200 || status >= 300) throw new Error(`API IA (APM) : HTTP ${status}`);
  return data && typeof data === 'object' ? data : {};
}

/** Interroge l'API Ville en asynchrone (queryAsync + polling de queryProgress) en remontant la
 *  progression dans `job` (facultatif) : nombre de jetons/caractères reçus et texte partiel pendant
 *  que l'IA génère — permet au front d'afficher la réponse progressivement plutôt qu'en un bloc. */
async function queryWithProgress(prompt, model, job) {
  const queryId = await queryAsync(prompt, model);
  const POLL_MS = 1500;
  const MAX_WAIT_MS = 25 * 60 * 1000;
  const start = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const p = await queryProgress(queryId);
    if (job) {
      job.tokensReceived = p.tokensReceived || 0;
      job.charsReceived = p.charsReceived || 0;
      if (p.status === 'running' && typeof p.response === 'string') job.partialText = p.response;
      job.model = p.model || job.model || null;
      job.providerLabel = p.provider_label || null;
    }
    if (p.status === 'completed') return p.response ?? p.result ?? p.answer ?? '';
    if (p.status === 'error') throw new Error(p.error || "Erreur lors de l'interrogation de l'IA");
    if (Date.now() - start > MAX_WAIT_MS) throw new Error("Toujours aucune réponse de l'IA après un long délai — la génération a probablement échoué.");
  }
}

module.exports = { listModels, query, queryAsync, queryProgress, queryWithProgress, enabled };
