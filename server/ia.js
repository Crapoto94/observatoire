// Assistant IA : chat adossé à un modèle Groq (API compatible OpenAI). Le modèle n'a accès qu'aux données de l'observatoire,
// via des outils (appels de fonctions) exécutés ici : indicateurs de la conception, jeux importés, KPI, classements communaux.
// Les données renvoyées par les outils sont transmises à Groq pour la rédaction de la réponse.
const { all, get } = require('./db');

// URL d'un serveur compatible OpenAI : on ajoute /v1 si l'adresse n'a pas de chemin
function baseOf(url) {
  const u = String(url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  try { return new URL(u).pathname.replace(/\/+$/, '') ? u : `${u}/v1`; } catch { return u; }
}

/** Configuration d'un fournisseur :
 *  - 'local'  : IA locale de la Ville fournie par l'API centrale (APM) — modèles via /api/v1/ai/models,
 *               génération via /query-async + /query-progress (réponse progressive). Choix de modèle ici.
 *  - 'groq'   : API compatible OpenAI (Groq). */
function providerConfig(provider) {
  if (provider === 'local') {
    // L'« IA locale » désigne l'APM de la Ville : c'est elle qui héberge le modèle local.
    return { id: 'local', name: 'IA locale (API Ville)', apm: true, ok: require('./apmAi').enabled(), model: process.env.APM_AI_MODEL || '' };
  }
  const key = process.env.GROQ_API_KEY || '';
  return { id: 'groq', name: 'Groq', base: process.env.IA_BASE_URL || 'https://api.groq.com/openai/v1', model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', key, ok: !!key, local: false };
}

const defaultProvider = () => {
  const chosen = process.env.IA_PROVIDER;
  if (chosen === 'local' || chosen === 'groq') return chosen;
  // Priorité : Groq si configuré, sinon l'IA locale de la Ville (APM).
  return providerConfig('groq').ok ? 'groq' : 'local';
};

// Niveaux de détail proposés à l'utilisateur (même principe que le Transcript Manager) : la consigne
// est injectée en tête du prompt pour que le modèle ajuste directement la longueur de sa réponse.
const LEVEL_INSTRUCTIONS = {
  sommaire: "CONSIGNE DE NIVEAU DE DÉTAIL — SOMMAIRE : réponse TRÈS CONCISE. Va droit au but (2 à 4 phrases ou une liste courte), sans développement ni rappel de contexte.\n\n",
  normal: '',
  detaille: "CONSIGNE DE NIVEAU DE DÉTAIL — DÉTAILLÉ : réponse développée et pédagogique. Explique le contexte, détaille chaque chiffre clé, nuance les interprétations et signale les limites des données.\n\n",
};
const LEVELS = ['sommaire', 'normal', 'detaille'];
const MAX_STEPS = 5;
const MAX_ROWS = 60;
const MAX_HISTORY = 6;

// DGX Spark: contexte riche en une passe pour amortir le TTFT lent. Groq: appels
// ciblés et réponses compactes pour rester dans son budget de jetons.
const PROVIDER_INSTRUCTIONS = {
  local: `Profil d'exécution : IA locale sur NVIDIA DGX Spark. Le contexte disponible est ample, mais le démarrage de génération (TTFT) est lent. Exploite en une passe les données fournies, compare les sources pertinentes et formule une réponse utile et étayée. Évite les appels d'outils redondants.`,
  groq: `Profil d'exécution : Groq, génération rapide avec budget de contexte limité. Fais le minimum d'appels d'outils nécessaires, demande des résultats ciblés, puis réponds brièvement. N'inclus que les chiffres utiles et évite les répétitions.`,
};
const systemFor = (provider) => `${SYSTEM}\n\n${PROVIDER_INSTRUCTIONS[provider] || PROVIDER_INSTRUCTIONS.groq}`;

const SYSTEM = `Assistant de l'Observatoire de la ville d'Ivry-sur-Seine (94041, membre du GOSB = Grand-Orly Seine Bièvre).
Règles : réponds UNIQUEMENT avec les données renvoyées par les outils (aucune connaissance externe pour un chiffre ou un fait local). Appelle un outil avant toute réponse chiffrée ; si l'information manque, dis-le et propose le jeu le plus proche. Cite le jeu, le territoire et la période de chaque chiffre. Sépare faits et interprétation prudente. Classements : communes de plus de 5 000 habitants ; valeurs « pour 1 000 hab. » et moyennes du GOSB = ordres de grandeur. Les liens vers les jeux de données associés sont ajoutés automatiquement sous ta réponse : ne fabrique aucun lien, mais nomme les jeux utilisés. Français, concis : réponse d'abord, puis 3 à 6 chiffres clés, puis limites. Territoires : Ivry (94041), GOSB, Val-de-Marne (94), Île-de-France (11).`;

const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });
const TOOLS = [
  { type: 'function', function: { name: 'get_kpis', description: "KPI d'Ivry (dernière valeur, précédente) avec GOSB, Val-de-Marne, Île-de-France. Filtre facultatif par thème (Logement, Emploi, Sécurité, Finances locales, Santé, Cohésion sociale, Environnement, Démographie, Mobilité, Sport).", parameters: obj({ theme: { type: 'string' } }) } },
  { type: 'function', function: { name: 'list_datasets', description: 'Jeux importés. Recherche aussi les concepts proches : une demande sur pistes cyclables doit vérifier les stationnements vélo OpenStreetMap et les présenter comme données associées, pas comme pistes.', parameters: obj({ query: { type: 'string' } }) } },
  { type: 'function', function: { name: 'describe_dataset', description: "Dimensions, codes de modalités, périodes d'un jeu (à appeler avant query_data).", parameters: obj({ dataset_id: { type: 'string' } }, ['dataset_id']) } },
  { type: 'function', function: { name: 'query_data', description: "Valeurs d'un jeu pour des territoires (codes ou noms : Ivry, GOSB, Val-de-Marne, Île-de-France, commune) et des filtres {DIM:[codes]}. Max 60 lignes.", parameters: obj({ dataset_id: { type: 'string' }, territoires: { type: 'array', items: { type: 'string' } }, filtres: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } }, periode_min: { type: 'string' }, periode_max: { type: 'string' } }, ['dataset_id']) } },
  { type: 'function', function: { name: 'rank_communes', description: "Classement des communes (> 5 000 hab.) sur une couche (id issu de get_kpis/list_layers), tendance et rang d'Ivry. perimetre : gosb (défaut), 94, idf.", parameters: obj({ layer_id: { type: 'string' }, perimetre: { type: 'string' }, top: { type: 'integer' } }, ['layer_id']) } },
  { type: 'function', function: { name: 'list_layers', description: 'Couches utilisables avec rank_communes.', parameters: obj({}) } },
  { type: 'function', function: { name: 'search_indicators', description: 'Fiches de la conception (statut de validation, priorité, source, proposition). Mot-clé et/ou thème (demographie, emploi, cohesion, logement, environnement, mobilite).', parameters: obj({ query: { type: 'string' }, theme: { type: 'string' }, limit: { type: 'integer' } }) } },
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
    const f = (v) => (v == null ? '-' : String(round(v)));
    return {
      note: "Format : id | libellé | Ivry valeur (période) [précédent] | GOSB | Val-de-Marne | Île-de-France | unité. GOSB = agrégat des 24 communes.",
      kpis: ks.slice(0, 40).map((k) => `${k.id} | ${k.label} | ${f(k.value)} (${k.period})${k.prev ? ` [${f(k.prev.value)} en ${k.prev.period}]` : ''} | ${f(k.ept?.value)} | ${f(k.dep?.value)} | ${f(k.reg?.value)} | ${k.unit || ''}`),
      suite: ks.length > 40 ? 'liste tronquée : précise un thème' : undefined,
    };
  },
  list_datasets({ query } = {}) {
    let rows = all('SELECT id, label, description, themes, nb_rows FROM datasets WHERE nb_rows > 0 ORDER BY label');
    if (query) {
      const q = norm(query);
      const bikeQuery = /velo|cycl|piste|voie douce|mobilite douce/.test(q);
      rows = rows.filter((r) => norm(`${r.label} ${r.description} ${r.themes}`).includes(q) || (bikeQuery && r.id === 'velo_stationnement'));
    }
    return rows.map((r) => ({ id: r.id, libelle: r.label, themes: r.themes, lignes: r.nb_rows,
      resume: String(r.description || '').slice(0, 220),
      ...(r.id === 'velo_stationnement' ? { relation: 'Stationnement vélo, distinct des pistes cyclables.', carte: '/cartographie?couche=velo&perimetre=94' } : {}) }));
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
    const links = {};
    for (const l of all('SELECT indicator_id, dataset_id FROM indicator_datasets')) (links[l.indicator_id] ||= []).push(l.dataset_id);
    return { total: rows.length, indicateurs: rows.slice(0, Math.min(limit, 30)).map((r) => ({ jeux: links[r.id] || undefined, libelle: r.libelle, theme: r.theme_label, priorite: r.priorite, statut: r.statut, source: r.source, proposition: String(r.proposition || '').slice(0, 220) })) };
  },
};

/** Jeux de données (et KPI) associés à un appel d'outil, pour les liens affichés sous la réponse. */
function sourcesOf(name, args, out) {
  const ds = new Set(), kpis = new Set();
  const add = (id) => { if (id && get('SELECT 1 FROM datasets WHERE id = ?', id)) ds.add(id); };
  try {
    if (name === 'query_data' || name === 'describe_dataset') add(args.dataset_id);
    else if (name === 'get_kpis') {
      const byId = Object.fromEntries(require('./kpi').KPIS.map((k) => [k.id, k.dataset]));
      for (const line of out.kpis || []) { const id = String(line).split(' | ')[0]; if (byId[id]) { add(byId[id]); kpis.add(id); } }
    } else if (name === 'rank_communes') {
      const l = require('./cartographie').LAYERS.find((x) => x.id === args.layer_id);
      if (l) { add(l.dataset); kpis.add(l.id); }
    } else if (name === 'search_indicators') for (const i of out.indicateurs || []) (i.jeux || []).forEach(add);
    else if (name === 'contexte') (out.jeux || []).forEach(add);
  } catch { /* liens facultatifs */ }
  return { ds, kpis };
}

function sourceList(dsIds, kpiIds) {
  const labels = Object.fromEntries(all('SELECT id, label FROM datasets').map((d) => [d.id, d.label]));
  const kpiLabels = Object.fromEntries(require('./kpi').KPIS.map((k) => [k.id, k.label]));
  return [
    ...[...dsIds].slice(0, 8).flatMap((id) => [
      { type: 'dataset', id, label: labels[id] || id, url: `/donnees?ds=${id}` },
      ...(id === 'velo_stationnement' ? [{ type: 'map', id: 'velo', label: 'Carte · stationnements cyclables', url: '/cartographie?couche=velo&perimetre=94' }] : []),
    ]),
    ...[...kpiIds].slice(0, 6).map((id) => ({ type: 'kpi', id, label: kpiLabels[id] || id, url: `/tableau-de-bord?kpi=${id}` })),
  ];
}

const status = () => {
  const g = providerConfig('groq'), l = providerConfig('local');
  return {
    selected: defaultProvider(), levels: LEVELS,
    groq: { configured: g.ok, model: g.model },
    local: { configured: l.ok, model: l.model },
  };
};

/** Modèles proposés pour une source :
 *  - 'local' / 'ville' : liste de l'API IA de la Ville (APM).
 *  - sinon : modèle unique configuré (Groq). */
async function models(provider) {
  if (provider === 'local' || provider === 'ville') {
    if (!require('./apmAi').enabled()) return { source: 'local', models: [], defaultModel: null };
    const list = await require('./apmAi').listModels();
    // Les modèles de la Ville marqués « (local) » sont ceux hébergés en local ; l'IA locale = APM, donc
    // on propose toute la liste active en priorisant les modèles locaux (RGPD++ / (local)).
    const pref = list.filter((m) => /\(local\)|rgpd/i.test(m));
    return { source: 'local', models: list, defaultModel: process.env.APM_AI_MODEL || pref[0] || list[0] || null };
  }
  const cfg = providerConfig('groq');
  return { source: 'groq', models: cfg.model ? [cfg.model] : [], defaultModel: cfg.model || null };
}

const unreachable = (cfg, e) => new Error(`Impossible de joindre ${cfg.name} (${cfg.base}) : ${e.cause?.code || e.message}. Depuis Docker, « localhost » désigne le conteneur : utilisez l'adresse IP ou le nom du serveur qui héberge le modèle.`);

async function callModel(cfg, messages, { tools = true, attempt = 0 } = {}) {
  let res;
  try {
    res = await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) },
      body: JSON.stringify({ model: cfg.model, messages, ...(tools ? { tools: TOOLS, tool_choice: 'auto' } : {}), temperature: 0.2, max_tokens: cfg.local ? 1500 : 900 }),
      signal: AbortSignal.timeout(cfg.local ? 300000 : 120000),
    });
  } catch (e) { throw unreachable(cfg, e); }
  if (res.status === 429 && !cfg.local && attempt < 3) {
    const t = await res.text().catch(() => '');
    const m = /try again in ([\d.]+)s/i.exec(t) || /try again in (?:(\d+)m)?([\d.]+)s/i.exec(t);
    const wait = Math.min(25, Math.max(2, Number(m?.[m.length - 1]) || 8)) + 1;
    await new Promise((r) => setTimeout(r, wait * 1000));
    return callModel(cfg, messages, { tools, attempt: attempt + 1 });
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const noTools = res.status === 400 && /tool|function/i.test(t);
    const hint = res.status === 401 ? ' (clé API invalide)' : res.status === 429 ? ' (quota ou débit dépassé : réessayez dans une minute)' : res.status === 404 && cfg.local ? ' (modèle introuvable sur le serveur : vérifiez son nom)' : '';
    const err = new Error(`${cfg.name} HTTP ${res.status}${hint} ${t.slice(0, 200)}`);
    err.noTools = noTools;
    throw err;
  }
  return res.json();
}

const toMessages = (history, provider = 'groq') => [{ role: 'system', content: systemFor(provider) }, ...history.slice(-MAX_HISTORY).map((m, i, arr) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, m.role === 'assistant' && i < arr.length - 1 ? 600 : 2000) }))];

// Modèle sans appel de fonctions : on lui fournit directement un extrait pertinent des données de l'observatoire
function contextFor(question) {
  const words = [...new Set(norm(question).split(/[^a-z0-9]+/).filter((w) => w.length >= 4))];
  const kpis = TOOL_IMPL.get_kpis({});
  const found = TOOL_IMPL.search_indicators({ query: words.slice(0, 2).join(' '), limit: 8 });
  const ds = TOOL_IMPL.list_datasets({ query: question }).slice(0, 6);
  return { kpis, found, ds };
}

/** Conversation : history = [{role, content}], le dernier est la question.
 *  options : { provider: 'groq'|'local', model, level: 'sommaire'|'normal'|'detaille', job }.
 *  `job` (facultatif) : objet suivi par le front (polling) — reçoit partialText/tokensReceived
 *  pendant la génération APM, pour un affichage progressif de la réponse. */
async function chat(history, options) {
  // compatibilité : ancien appel chat(history, 'groq'|'local')
  const opt = typeof options === 'string' ? { provider: options } : (options || {});
  const question = String(history[history.length - 1]?.content || '');
  const level = LEVELS.includes(opt.level) ? opt.level : 'normal';
  const instruction = LEVEL_INSTRUCTIONS[level] || '';
  const providerId = ['groq', 'local'].includes(opt.provider) ? opt.provider : defaultProvider();
  const cfg = providerConfig(providerId);
  if (!cfg.ok) {
    throw new Error(cfg.apm ? "IA locale (API Ville) indisponible : APM_API_KEY non configurée dans le fichier .env du serveur."
      : "Clé Groq absente : définissez GROQ_API_KEY dans le fichier .env du serveur.");
  }

  // API IA de la Ville (APM) : pas d'appels de fonctions OpenAI — on prépare un contexte à partir des
  // outils de l'observatoire, avec le modèle choisi par l'utilisateur et le niveau de détail demandé.
  if (cfg.apm) {
    const ctx = contextFor(question);
    const prompt = `${instruction}${systemFor('local')}\n\nDonnées pertinentes de l'observatoire (seule source autorisée) :\n${JSON.stringify(ctx).slice(0, 48000)}\n\nQuestion : ${question}`;
    const model = opt.model || cfg.model || undefined;
    // Génération progressive : /query-async + polling de la progression (remonte le texte partiel dans le job).
    const answer = await require('./apmAi').queryWithProgress(prompt, model, opt.job);
    const ds = new Set();
    for (const r of [sourcesOf('contexte', {}, { jeux: ctx.ds.map((d) => d.id) }), sourcesOf('search_indicators', {}, ctx.found)]) r.ds.forEach((x) => ds.add(x));
    return {
      answer: answer || '',
      consulted: [{ outil: 'contexte', arguments: { mode: 'API IA de la Ville', niveau: level, modele: model || 'défaut', indicateurs: ctx.found.total, jeux: ctx.ds.map((d) => d.id) } }],
      sources: sourceList(ds, new Set()),
      model: (opt.job?.model) || model || 'défaut', provider: cfg.name,
    };
  }

  const maxChars = cfg.local ? 12000 : 2400;
  const maxSteps = providerId === 'groq' ? 3 : MAX_STEPS;
  const messages = toMessages(history, providerId);
  if (instruction) messages[0].content = instruction + messages[0].content;
  const consulted = [];
  const dsIds = new Set(), kpiIds = new Set();
  const collect = (name, args, out) => { const r = sourcesOf(name, args, out); r.ds.forEach((x) => dsIds.add(x)); r.kpis.forEach((x) => kpiIds.add(x)); };
  try {
    for (let step = 0; step < maxSteps; step++) {
      const j = await callModel(cfg, messages);
      const msg = j.choices?.[0]?.message;
      if (!msg) throw new Error('réponse vide du modèle');
      if (!msg.tool_calls?.length) return { answer: msg.content || '', consulted, sources: sourceList(dsIds, kpiIds), model: cfg.model, provider: cfg.name };
      messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        let args = {}, out;
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* arguments invalides */ }
        try {
          const fn = TOOL_IMPL[tc.function.name];
          out = fn ? fn(args) : { erreur: `outil inconnu : ${tc.function.name}` };
        } catch (e) { out = { erreur: e.message }; }
        consulted.push({ outil: tc.function.name, arguments: args });
        collect(tc.function.name, args, out);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out).slice(0, maxChars) });
      }
    }
    return { answer: "Je n'ai pas pu conclure en un nombre raisonnable d'étapes : reformulez ou précisez la question.", consulted, sources: sourceList(dsIds, kpiIds), model: cfg.model, provider: cfg.name };
  } catch (e) {
    if (!e.noTools) throw e;
    // le modèle ne gère pas les appels de fonctions : repli sur un contexte préparé par l'observatoire
    const question = String(history[history.length - 1].content);
    const ctx = contextFor(question);
    const base = toMessages(history.slice(0, -1), providerId);
    base.push({ role: 'user', content: `Données pertinentes de l'observatoire (seule source autorisée) :\n${JSON.stringify(ctx).slice(0, cfg.apm ? 48000 : 7000)}\n\nQuestion : ${question}` });
    const j = await callModel(cfg, base, { tools: false });
    return {
      answer: j.choices?.[0]?.message?.content || '',
      consulted: [{ outil: 'contexte', arguments: { mode: 'sans appel de fonctions', indicateurs: ctx.found.total, jeux: ctx.ds.map((d) => d.id) } }],
      sources: (() => { const ds = new Set(); for (const r of [sourcesOf('contexte', {}, { jeux: ctx.ds.map((d) => d.id) }), sourcesOf('search_indicators', {}, ctx.found)]) r.ds.forEach((x) => ds.add(x)); return sourceList(ds, new Set()); })(),
      model: cfg.model, provider: cfg.name,
    };
  }
}

// ---------------- Génération progressive (jobs en mémoire) ----------------
// L'API Ville (APM) génère de façon asynchrone ; le front suit la progression en pollant un état
// en mémoire, comme la « fenêtre de génération » du Transcript Manager. Le job expose le statut,
// le texte partiel et le nombre de jetons reçus tant que la réponse n'est pas achevée.
const jobs = new Map();
const JOB_TTL_MS = 35 * 60 * 1000;

function pruneJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, j] of jobs) if ((j.createdAt || 0) < cutoff) jobs.delete(id);
}

/** Démarre une conversation en arrière-plan : renvoie immédiatement un jobId. Le front suit
 *  l'avancement via getChatJob(jobId) (partialText, tokensReceived, status, answer, …). */
function startChat(history, options) {
  const jobId = `ia_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job = { id: jobId, status: 'starting', progress: 0, partialText: '', tokensReceived: 0, createdAt: Date.now() };
  jobs.set(jobId, job);
  pruneJobs();
  chat(history, { ...(options || {}), job })
    .then((r) => { job.status = 'completed'; job.progress = 100; job.result = r; })
    .catch((e) => { job.status = 'error'; job.error = e.message; });
  return jobId;
}

const getChatJob = (id) => jobs.get(id) || null;

// ---------------- Journal et traçabilité des demandes ----------------
const preview = (s, n) => String(s ?? '').slice(0, n);
function logChat(entry) {
  try {
    const r = require('./db').run(
      `INSERT INTO ia_logs (user_id, username, provider, model, question, answer, consulted, sources, duration_ms, status, error)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      entry.userId ?? null, entry.username ?? null, entry.provider ?? null, entry.model ?? null,
      preview(entry.question, 4000), preview(entry.answer, 12000),
      JSON.stringify(entry.consulted || []), JSON.stringify(entry.sources || []),
      entry.durationMs ?? null, entry.status || 'ok', entry.error ? preview(entry.error, 1000) : null);
    return Number(r.lastInsertRowid);
  } catch { return null; }
}

function listLogs({ limit = 50, offset = 0, user, rating, low } = {}) {
  const where = [], params = [];
  if (user) { where.push('username = ?'); params.push(String(user)); }
  if (rating === 'none') where.push('rating IS NULL');
  else if (rating != null && rating !== '') { where.push('rating = ?'); params.push(Number(rating)); }
  // Notes faibles : seuil « ≤ 2 étoiles » sur l'échelle 1-4 (anciennes notes 1-5 comprises).
  if (low) where.push('rating IS NOT NULL AND rating <= 2');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = require('./db').get(`SELECT COUNT(*) AS n FROM ia_logs ${w}`, ...params).n;
  const items = require('./db').all(
    `SELECT id, at, username, provider, model, question, answer, consulted, sources, duration_ms, status, error, rating, rating_comment, rated_at
     FROM ia_logs ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, Math.min(Number(limit) || 50, 200), Number(offset) || 0)
    .map((r) => ({ ...r, consulted: safeParse(r.consulted, []), sources: safeParse(r.sources, []) }));
  return { total, items };
}

const safeParse = (s, d) => { try { return JSON.parse(s || ''); } catch { return d; } };

function rateLog(id, rating, comment) {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 4) return { error: 'La note doit être comprise entre 1 et 4 étoiles', status: 400 };
  const row = require('./db').get('SELECT id FROM ia_logs WHERE id = ?', id);
  if (!row) return { error: 'Demande introuvable', status: 404 };
  require('./db').run('UPDATE ia_logs SET rating = ?, rating_comment = ?, rated_at = CURRENT_TIMESTAMP WHERE id = ?', r, preview(comment, 1000) || null, id);
  return { ok: true };
}

/** Liste des prompts utilisés par l'assistant et des données auxquelles ils s'adossent. */
function prompts() {
  return {
    system: systemFor(defaultProvider()),
    profils: { local: systemFor('local'), groq: systemFor('groq') },
    regles: [
      'Répondre uniquement à partir des données renvoyées par les outils de l’observatoire.',
      'Appeler un outil avant toute réponse chiffrée ; citer le jeu, le territoire et la période.',
      'Séparer les faits de l’interprétation ; signaler les données manquantes.',
      'Classements limités aux communes de plus de 5 000 habitants ; valeurs « pour 1 000 hab. » = ordres de grandeur.',
      'Répondre en français, de façon concise : réponse, puis chiffres clés, puis limites.',
    ],
    territoires: { Ivry: '94041', GOSB: 'agrégat des 24 communes', 'Val-de-Marne': '94', 'Île-de-France': '11' },
    outils: TOOLS.map((t) => ({ nom: t.function.name, description: t.function.description, parametres: t.function.parameters })),
    niveaux: { sommaire: LEVEL_INSTRUCTIONS.sommaire.trim(), normal: 'Comportement par défaut (consigne ajoutée : aucune)', detaille: LEVEL_INSTRUCTIONS.detaille.trim() },
    fournisseurs: {
      selectionne: defaultProvider(),
      groq: { configure: providerConfig('groq').ok, model: providerConfig('groq').model, strategie: PROVIDER_INSTRUCTIONS.groq },
      local: { configure: providerConfig('local').ok, model: providerConfig('local').model, api: 'API IA de la Ville (APM) · NVIDIA DGX Spark', strategie: PROVIDER_INSTRUCTIONS.local },
    },
  };
}

module.exports = { chat, startChat, getChatJob, status, models, TOOL_IMPL, logChat, listLogs, rateLog, prompts, SYSTEM };
