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

module.exports = { listModels, query, enabled };
