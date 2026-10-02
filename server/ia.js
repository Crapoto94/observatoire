// Assistant IA : chat adossé à un modèle Groq (API compatible OpenAI). Le modèle n'a accès qu'aux données de l'observatoire,
// via des outils (appels de fonctions) exécutés ici : indicateurs de la conception, jeux importés, KPI, classements communaux.
// Les données renvoyées par les outils sont transmises à Groq pour la rédaction de la réponse.
const { all, get } = require('./db');

const API = process.env.IA_BASE_URL || 'https://api.groq.com/openai/v1';
const MODEL = () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const KEY = () => process.env.GROQ_API_KEY || '';
const MAX_STEPS = 6;
const MAX_ROWS = 150;

const SYSTEM = `Tu es l'assistant de l'Observatoire de la ville d'Ivry-sur-Seine (Val-de-Marne, code INSEE 94041, membre du Grand-Orly Seine Bièvre, « GOSB »).
Règles absolues :
- Tu t'appuies UNIQUEMENT sur les données renvoyées par les outils de l'observatoire. Tu n'as aucune autre source : n'utilise pas tes connaissances générales pour donner un chiffre, une date ou un fait local.
- Pour toute question chiffrée, appelle d'abord un ou plusieurs outils. Si les outils ne contiennent pas l'information, dis-le clairement et propose les jeux ou indicateurs les plus proches.
- Cite pour chaque chiffre le jeu de données (ou KPI), le territoire et la période.
- Distingue les faits (valeurs issues des outils) de ton interprétation, que tu présentes comme telle et avec prudence. Ne spécule pas sur les causes.
- Les classements ne portent que sur les communes de plus de 5 000 habitants (les autres données ne sont pas exhaustives).
- Les valeurs « pour 1 000 habitants » et les moyennes pondérées du GOSB sont des ordres de grandeur.
- Réponds en français, de façon concise : la réponse d'abord, puis les chiffres clés en liste courte, puis les limites éventuelles.
Territoires : Ivry-sur-Seine (94041), GOSB (code GOSB), Val-de-Marne (94), Île-de-France (11).`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_kpis',
      description: "Indicateurs clés calculés pour Ivry-sur-Seine : dernière valeur, période, période précédente, et valeurs du GOSB, du Val-de-Marne et de l'Île-de-France. À utiliser en premier pour une question générale ou une comparaison.",
      parameters: { type: 'object', properties: { theme: { type: 'string', description: "Filtre facultatif sur le thème (ex. Logement, Emploi, Sécurité, Finances locales, Santé, Cohésion sociale, Environnement, Démographie, Mobilité, Sport)" } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_datasets',
      description: "Liste des jeux de données importés dans l'observatoire (identifiant, libellé, thèmes, nombre de lignes). Filtre facultatif par mot-clé.",
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Mot-clé facultatif (libellé ou description)' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'describe_dataset',
      description: "Décrit un jeu de données : description, dimensions et libellés des modalités (codes à utiliser dans query_data), territoires et périodes disponibles.",
      parameters: { type: 'object', properties: { dataset_id: { type: 'string' } }, required: ['dataset_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_data',
      description: "Valeurs d'un jeu de données pour des territoires et des filtres de modalités. Les modalités non filtrées renvoient toutes les lignes (limité à 150). Utilise describe_dataset avant pour connaître les codes. Territoires : codes ou noms (Ivry, GOSB, Val-de-Marne, Île-de-France, ou une commune).",
      parameters: {
        type: 'object',
        properties: {
          dataset_id: { type: 'string' },
          territoires: { type: 'array', items: { type: 'string' }, description: 'Par défaut : Ivry-sur-Seine' },
          filtres: { type: 'object', description: 'Ex. {"MESURE":["DEFM_ABC"],"SEXE":["_T"]} (dimension -> liste de codes)', additionalProperties: { type: 'array', items: { type: 'string' } } },
          periode_min: { type: 'string' }, periode_max: { type: 'string' },
        },
        required: ['dataset_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rank_communes',
      description: "Classement des communes (plus de 5 000 habitants) sur une couche cartographique (identifiant d'un KPI, voir get_kpis ou list_layers), avec la tendance et le rang d'Ivry. Périmètre : idf, gosb, ou un département (94, 92…).",
      parameters: { type: 'object', properties: { layer_id: { type: 'string' }, perimetre: { type: 'string', description: 'gosb (défaut), 94, idf…' }, top: { type: 'integer' } }, required: ['layer_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_layers',
      description: "Liste des couches (KPI) utilisables avec rank_communes : identifiant, libellé, thème.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_indicators',
      description: "Indicateurs de la conception de l'observatoire (209 fiches) : libellé, thème, priorité, statut de validation, source, proposition. Recherche par mot-clé et/ou thème.",
      parameters: { type: 'object', properties: { query: { type: 'string' }, theme: { type: 'string', description: 'demographie, emploi, cohesion, logement, environnement, mobilite' }, limit: { type: 'integer' } } },
    },
  },
];

const round = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, ' ').toLowerCase();

function resolveGeo(t) {
  const x = String(t).trim();
  if (/^(gosb|grand[- ]orly)/i.test(x)) return 'GOSB';
  if (/^(idf|ile[- ]de[- ]france|île[- ]de[- ]france|region)/i.test(norm(x)) || x === '11') return '11';
  if (/^val[- ]de[- ]marne$/i.test(x) || x === '94') return '94';
  if (/^\d{2,5}$/.test(x)) return x;
  const hit = get('SELECT code FROM geos WHERE lower(nom) = lower(?) OR lower(nom) LIKE lower(?) ORDER BY bulk, fixed DESC LIMIT 1', x, `${x}%`);
  return hit?.code ?? null;
}

const TOOL_IMPL = {
  get_kpis({ theme } = {}) {
    const d = require('./kpi').build();
    let ks = d.kpis.filter((k) => k.value != null);
    if (theme) ks = ks.filter((k) => norm(k.theme).includes(norm(theme)));
    return {
      note: "Valeurs pour Ivry-sur-Seine ; 'GOSB' = agrégat des 24 communes ; unité dans 'unite'. Indicateurs pour 1 000 habitants : libellé le précise.",
      kpis: ks.map((k) => ({
        id: k.id, libelle: k.label, theme: k.theme, unite: k.unit || undefined, jeu: k.datasetLabel,
        ivry: { valeur: round(k.value), periode: k.period, precedent: k.prev ? { valeur: round(k.prev.value), periode: k.prev.period } : undefined },
        gosb: k.ept ? round(k.ept.value) : undefined, val_de_marne: k.dep ? round(k.dep.value) : undefined, ile_de_france: k.reg ? round(k.reg.value) : undefined,
        etat_validation_fiche: k.statut,
      })),
    };
  },
  list_datasets({ query } = {}) {
    let rows = all('SELECT id, label, description, themes, nb_rows FROM datasets WHERE nb_rows > 0 ORDER BY label');
    if (query) rows = rows.filter((r) => norm(`${r.label} ${r.description}`).includes(norm(query)));
    return rows.map((r) => ({ id: r.id, libelle: r.label, themes: r.themes, lignes: r.nb_rows, resume: String(r.description || '').slice(0, 160) }));
  },
  describe_dataset({ dataset_id }) {
    const d = get('SELECT * FROM datasets WHERE id = ?', dataset_id);
    if (!d) return { erreur: `jeu inconnu : ${dataset_id}` };
    const labels = d.labels ? JSON.parse(d.labels) : {};
    const dims = Object.entries(labels).map(([k, v]) => ({ dimension: k, libelle: v.label, modalites: Object.fromEntries(Object.entries(v.values || {}).slice(0, 40)) }));
    const per = all('SELECT DISTINCT period FROM data_rows WHERE dataset_id = ? ORDER BY period', dataset_id).map((r) => r.period);
    const geos = all('SELECT COUNT(DISTINCT geo) AS n FROM data_rows WHERE dataset_id = ?', dataset_id)[0].n;
    return { id: d.id, libelle: d.label, description: d.description, periodes: per.slice(-12), nb_territoires: geos, dimensions: dims };
  },
  query_data({ dataset_id, territoires, filtres, periode_min, periode_max }) {
    const d = get('SELECT id, label FROM datasets WHERE id = ?', dataset_id);
    if (!d) return { erreur: `jeu inconnu : ${dataset_id}` };
    const codes = (territoires?.length ? territoires : ['94041']).map(resolveGeo);
    const bad = (territoires || []).filter((_, i) => !codes[i]);
    const ok = codes.filter(Boolean);
    if (!ok.length) return { erreur: `territoire introuvable : ${bad.join(', ')}` };
    const names = Object.fromEntries(all(`SELECT code, nom FROM geos WHERE code IN (${ok.map(() => '?').join(',')})`, ...ok).map((r) => [r.code, r.nom]));
    const conds = [`dataset_id = ?`, `geo IN (${ok.map(() => '?').join(',')})`], params = [dataset_id, ...ok];
    for (const [dim, vals] of Object.entries(filtres || {})) {
      if (!/^[A-Z0-9_]+$/.test(dim) || !Array.isArray(vals) || !vals.length) continue;
      conds.push(`json_extract(dims, '$.${dim}') IN (${vals.map(() => '?').join(',')})`); params.push(...vals.map(String));
    }
    if (periode_min) { conds.push('period >= ?'); params.push(String(periode_min)); }
    if (periode_max) { conds.push('period <= ?'); params.push(String(periode_max)); }
    const rows = all(`SELECT geo, period, dims, value FROM data_rows WHERE ${conds.join(' AND ')} AND value IS NOT NULL ORDER BY period DESC, geo LIMIT ${MAX_ROWS + 1}`, ...params);
    return {
      jeu: d.label, truncated: rows.length > MAX_ROWS ? `limité à ${MAX_ROWS} lignes : ajoute des filtres` : undefined, territoires_non_trouves: bad.length ? bad : undefined,
      lignes: rows.slice(0, MAX_ROWS).map((r) => ({ territoire: names[r.geo] || r.geo, periode: r.period, ...JSON.parse(r.dims || '{}'), valeur: round(r.value) })),
    };
  },
  rank_communes({ layer_id, perimetre = 'gosb', top = 12 }) {
    const d = require('./cartographie').layerData(layer_id, perimetre);
    if (!d) return { erreur: `couche inconnue : ${layer_id} (voir list_layers)` };
    const names = Object.fromEntries(all('SELECT code, nom FROM geos').map((r) => [r.code, r.nom]));
    const rows = Object.entries(d.values).map(([code, v]) => ({ code, commune: names[code] || code, valeur: round(v.v), precedent: round(v.prev), tendance: v.trend?.dir, evolution_pct: round(v.trend?.pct) })).sort((a, b) => b.valeur - a.valeur);
    const ivry = rows.findIndex((r) => r.code === '94041');
    return {
      couche: d.layer.label, periode: d.period, perimetre, nb_communes: rows.length, rang_ivry: ivry >= 0 ? ivry + 1 : null, ivry: rows[ivry],
      plus_hautes: rows.slice(0, top), plus_basses: rows.slice(-Math.min(5, rows.length)),
      references: d.summary.map((s) => ({ territoire: s.nom, valeur: round(s.value), precedent: round(s.prev) })),
    };
  },
  list_layers() {
    return require('./cartographie').list().map((l) => ({ id: l.id, libelle: l.label, theme: l.theme }));
  },
  search_indicators({ query, theme, limit = 15 } = {}) {
    let rows = all('SELECT id, libelle, theme, theme_label, priorite, statut, source, periodicite, proposition FROM indicators');
    if (theme) rows = rows.filter((r) => r.theme === theme);
    if (query) { const q = norm(query).split(/\s+/).filter(Boolean); rows = rows.filter((r) => q.every((w) => norm(`${r.libelle} ${r.source} ${r.proposition}`).includes(w))); }
    return { total: rows.length, indicateurs: rows.slice(0, Math.min(limit, 30)).map((r) => ({ libelle: r.libelle, theme: r.theme_label, priorite: r.priorite, statut: r.statut, source: r.source, proposition: String(r.proposition || '').slice(0, 220) })) };
  },
};

const status = () => ({ configured: !!KEY(), model: MODEL(), provider: API.includes('groq') ? 'Groq' : API });

async function callModel(messages) {
  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
    body: JSON.stringify({ model: MODEL(), messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.2, max_tokens: 1200 }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const hint = res.status === 401 ? ' (clé API invalide)' : res.status === 429 ? ' (quota ou débit Groq dépassé : réessayez dans une minute)' : '';
    throw new Error(`Groq HTTP ${res.status}${hint} ${t.slice(0, 200)}`);
  }
  return res.json();
}

/** Conversation : messages = [{role:'user'|'assistant', content}], le dernier est la question. */
async function chat(history) {
  if (!KEY()) throw new Error("Clé Groq absente : définissez GROQ_API_KEY dans le fichier .env du serveur.");
  const messages = [{ role: 'system', content: SYSTEM }, ...history.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 4000) }))];
  const consulted = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const j = await callModel(messages);
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new Error('réponse vide du modèle');
    if (!msg.tool_calls?.length) return { answer: msg.content || '', consulted, model: MODEL() };
    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
    for (const tc of msg.tool_calls) {
      let args = {}, out;
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* arguments invalides */ }
      try {
        const fn = TOOL_IMPL[tc.function.name];
        out = fn ? fn(args) : { erreur: `outil inconnu : ${tc.function.name}` };
      } catch (e) { out = { erreur: e.message }; }
      consulted.push({ outil: tc.function.name, arguments: args });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 14000) });
    }
  }
  return { answer: "Je n'ai pas pu conclure en un nombre raisonnable d'étapes : reformulez ou précisez la question.", consulted, model: MODEL() };
}

module.exports = { chat, status, TOOL_IMPL };
