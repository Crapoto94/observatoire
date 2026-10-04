// Catalogue des jeux de données (menu « Jeux de données », accessible à tous) : jeux importés et couches lues en direct,
// avec pour chacun la source (producteur, icône), le périmètre, la granularité géographique et temporelle,
// les champs disponibles (dimensions et modalités) et les indicateurs de la conception qui y font référence.
const { all, get } = require('./db');
const { REF_GEO } = require('./seed');

// Producteurs : icône et couleur propres à chaque source
const SOURCES = {
  insee: { label: 'INSEE', icon: '📊', color: '#1e40af' },
  dgfip: { label: 'DGFiP', icon: '💶', color: '#065f46' },
  logement: { label: 'Ministère du Logement / SDES', icon: '🏗️', color: '#9a3412' },
  cerema: { label: 'Cerema', icon: '🛰️', color: '#0e7490' },
  ademe: { label: 'ADEME', icon: '🌿', color: '#15803d' },
  ipr: { label: 'Institut Paris Region', icon: '🌳', color: '#4d7c0f' },
  ademe: { label: 'ADEME (SINOE®)', icon: '♻️', color: '#15803d' },
  airparif: { label: 'Airparif', icon: '🌫️', color: '#0e7490' },
  urssaf: { label: 'URSSAF', icon: '💼', color: '#7c3aed' },
  education: { label: 'Éducation nationale', icon: '🎓', color: '#7c3aed' },
  caf: { label: 'CNAF (Caisses d’allocations familiales)', icon: '👪', color: '#be185d' },
  interieur: { label: 'Ministère de l’Intérieur (SSMSI, ONISR)', icon: '🛡️', color: '#334155' },
  entreprises: { label: 'API Recherche d’entreprises (DINUM)', icon: '🏢', color: '#475569' },
  ore: { label: 'Agence ORE (Enedis, GRDF)', icon: '⚡', color: '#ca8a04' },
  osm: { label: 'OpenStreetMap', icon: '🚲', color: '#16a34a' },
  idfm: { label: 'Île-de-France Mobilités', icon: '🚆', color: '#0369a1' },
  francetravail: { label: 'France Travail / DARES', icon: '💼', color: '#1d4ed8' },
  sante: { label: 'Ministère de la Santé / ARS', icon: '⚕️', color: '#dc2626' },
  ameli: { label: 'Assurance Maladie (Cnam)', icon: '🩺', color: '#0284c7' },
  sport: { label: 'Ministère des Sports', icon: '🏟️', color: '#ea580c' },
  georisques: { label: 'Géorisques (Ministère de la Transition écologique)', icon: '⚠️', color: '#b45309' },
  cd94: { label: 'Géoportail du Val-de-Marne (Conseil départemental)', icon: '🗺️', color: '#0f766e' },
  mgp: { label: 'Métropole du Grand Paris', icon: '🏙️', color: '#6d28d9' },
  apientreprise: { label: 'API Entreprise (DINUM), accès habilité', icon: '🔐', color: '#991b1b' },
  autre: { label: 'Autre source', icon: '📁', color: '#6b7280' },
};

const PRODUCER = {
  dvf: 'dgfip', finances: 'dgfip', ircom: 'dgfip', filosofi: 'insee', filosofi_fichier: 'insee',
  ameli_ald: 'ameli', ameli_ald_sans_mt: 'ameli', ameli_sas: 'ameli',
  sru: 'logement', loyers: 'logement', sitadel: 'logement', rpls: 'logement',
  artificialisation: 'cerema', lovac: 'cerema', dpe: 'ademe',
  mos: 'ipr', multiexposition: 'ipr', nuisances: 'ipr', icu: 'ipr',
  education_annuaire: 'education', education_effectifs: 'education', ips_ecoles: 'education',
  caf_rsa: 'caf', caf_prestations: 'caf', baac: 'interieur', ssmsi: 'interieur', entreprises: 'entreprises',
  ore_conso: 'ore', ore_parc_auto: 'ore', ore_irve: 'ore', velo_stationnement: 'osm', idfm_ferre: 'idfm',
  associations_api: 'apientreprise', subventions_asso: 'apientreprise', c2s_cnam: 'insee', apl_drees: 'sante', ipr_idh2: 'ipr', ipr_mortalite: 'ipr', sinoe_dma: 'ademe', airparif_ges: 'airparif', urssaf_effectifs: 'urssaf', caf_qf: 'caf', caf_qf_qpv: 'caf',
  ft_defm: 'francetravail', finess: 'sante', sante_pro: 'sante', equipements_sportifs: 'sport', gaspar: 'georisques',
};
const producerOf = (d) => PRODUCER[d.id] || (d.provider === 'melodi' ? 'insee' : /grand-?paris|metropolegrandparis/i.test(d.doc_url || '') ? 'mgp' : 'autre');

// Maille d'origine quand la donnée est agrégée à la commune à l'import
const MAILLE = {
  dvf: 'mutations (ventes) agrégées à la commune', mos: 'polygones d’occupation du sol agrégés à la commune', icu: 'îlots morphologiques agrégés à la commune',
  nuisances: 'carroyage de 500 m agrégé à la commune', multiexposition: 'carroyage agrégé à la commune', sante_pro: 'professionnels géolocalisés comptés par commune',
  finess: 'établissements géolocalisés comptés par commune', equipements_sportifs: 'équipements géolocalisés comptés par commune', bpe: 'équipements comptés par commune',
  velo_stationnement: 'points de stationnement comptés par commune', ore_irve: 'points de recharge comptés par commune', education_annuaire: 'établissements comptés par commune',
  baac: 'accidents localisés comptés par commune', sitadel: 'autorisations d’urbanisme agrégées par commune et par année', entreprises: 'établissements comptés par commune (stock du jour)',
  gaspar: 'arrêtés et risques par commune', idfm_ferre: 'validations par gare agrégées à la commune',
};

const LEVEL = { COM: 'Commune', DEP: 'Département', EPCI: 'Intercommunalité', REG: 'Région', EPT: 'Territoire (EPT)' };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };

function frequency(periods) {
  if (!periods.length) return null;
  if (periods.some((p) => /^\d{4}-T\d$/.test(p))) return 'trimestrielle';
  if (periods.some((p) => /^\d{4}-\d{2}$/.test(p))) return periods.length > 4 && new Set(periods.map((p) => p.slice(5))).size > 2 ? 'mensuelle' : 'annuelle (date d’observation)';
  if (periods.length === 1) return 'millésime unique (stock)';
  const years = periods.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const gaps = years.slice(1).map((y, i) => y - years[i]);
  if (gaps.length && gaps.every((g) => g === 1)) return 'annuelle';
  if (gaps.length && gaps.filter((g) => g >= 5).length >= gaps.length / 2) return 'recensements (tous les 5 ans environ)';
  return 'pluriannuelle';
}

const PRIVES = new Set(require('./datasets').filter((d) => d.prive).map((d) => d.id));

function importedDatasets() {
  const live = require('./live').etat();
  const { KPIS } = require('./kpi');
  const levelOf = Object.fromEntries(all('SELECT code, level FROM geos').map((g) => [g.code, g.level || 'COM']));
  const sample = all('SELECT code FROM geos WHERE bulk = 0').map((g) => g.code);
  const mapped = Object.fromEntries(all(`SELECT dataset_id, territories AS n FROM import_runs
    WHERE id IN (SELECT MAX(id) FROM import_runs WHERE scope = 'idf' GROUP BY dataset_id) AND status IN ('ok', 'partiel') AND rows > 0`).map((r) => [r.dataset_id, r.n || 0]));
  const links = all(`SELECT l.dataset_id, i.id, i.libelle, i.theme_label, i.niveau, i.statut, i.mode_calcul FROM indicator_datasets l JOIN indicators i ON i.id = l.indicator_id ORDER BY i.theme, i.groupe, i.ordre`);
  return all('SELECT id, label, provider, description, themes, doc_url, labels, last_import, nb_rows FROM datasets ORDER BY label').map((d) => {
    const geos = sample.filter((g) => get('SELECT 1 FROM data_rows WHERE dataset_id = ? AND geo = ? LIMIT 1', d.id, g));
    const levels = [...new Set(geos.map((g) => levelOf[g] || 'COM'))];
    const periods = all('SELECT DISTINCT period FROM data_rows WHERE dataset_id = ? AND geo = ?', d.id, REF_GEO.code).map((r) => r.period).filter((p) => p != null).map(String).sort();
    const labels = JSON.parse(d.labels || '{}');
    const fields = Object.entries(labels).filter(([k]) => !['OBS_STATUS', 'FREQ', 'UNIT_MULT', 'TIME_PERIOD', 'CONF_STATUS'].includes(k)).map(([k, v]) => ({
      code: k, label: v.label || k, measure: k === 'MESURE' || /_MEASURE$/.test(k), values: Object.entries(v.values || {}).map(([c, l]) => ({ code: c, label: l })),
    }));
    const src = producerOf(d);
    const idfOnly = /iledefrance/.test(host(d.doc_url) || '');
    return {
      id: d.id, label: d.label, description: d.description, mode: 'import', themes: JSON.parse(d.themes || '[]'), prive: PRIVES.has(d.id),
      source: { key: src, ...SOURCES[src] }, portail: host(d.doc_url), doc_url: d.doc_url, connecteur: d.provider,
      perimetre: {
        couverture: idfOnly ? 'Île-de-France' : 'France',
        stocke: `${geos.length} territoire(s) suivi(s)${mapped[d.id] ? ` + ${mapped[d.id]} communes d’Île-de-France (carte)` : ''}`,
      },
      granularite: {
        geo: levels.map((l) => LEVEL[l] || l).join(', ') || 'Commune', maille: MAILLE[d.id] || null,
        temps: frequency(periods), periodes: periods.length ? (periods.length > 1 ? `${periods[0]} → ${periods[periods.length - 1]} (${periods.length})` : periods[0]) : null,
      },
      fields, nb_rows: d.nb_rows || 0, last_import: d.last_import, etat: d.nb_rows ? 'ok' : 'vide',
      indicators: links.filter((l) => l.dataset_id === d.id).map(({ dataset_id, ...i }) => i),
      kpis: KPIS.filter((k) => k.dataset === d.id || (k.datasets || []).includes(d.id)).map((k) => ({ id: k.id, label: k.label })),
      link: `/donnees?ds=${d.id}`,
      live: live.jeux[d.id] || null, // mode (base / live), temps de réponse mesuré, proposition du mode live
    };
  });
}

function liveLayers() {
  const { COUCHES, list } = require('./couches');
  const pub = Object.fromEntries(list().couches.map((c) => [c.id, c]));
  const refs = all('SELECT id, libelle, theme_label, niveau, statut, mode_calcul, couche_id FROM indicators WHERE couche_id IS NOT NULL');
  return COUCHES.map((c) => {
    const p = pub[c.id];
    const iris = c.layer.includes('babord_iris');
    return {
      id: c.id, label: c.label, description: `Couche « ${c.label} » publiée par le Conseil départemental du Val-de-Marne, lue en direct (WFS ${p.layer}).`,
      mode: 'live', themes: [c.theme], source: { key: 'cd94', ...SOURCES.cd94 }, portail: 'geo.valdemarne.fr', doc_url: p.doc_url, connecteur: 'WFS',
      perimetre: { couverture: 'Val-de-Marne (47 communes)', stocke: 'aucune donnée stockée : lecture à chaque affichage' },
      granularite: {
        geo: iris ? 'IRIS' : { point: 'Objet ponctuel (adresse, équipement)', line: 'Objet linéaire (tronçon)', polygon: 'Objet surfacique (emprise, parcelle, îlot)' }[c.kind],
        maille: iris ? 'indicateurs Babord (INSEE RP 2018) par IRIS' : 'objets géolocalisés, filtrés sur le contour de la commune choisie', temps: 'mise à jour continue (état du jour)', periodes: null,
      },
      fields: null, // chargés en direct à l'ouverture (/api/jeux/:id/champs)
      indicators_live: p.stats.map((s) => ({ id: s.id, label: s.label, formule: s.formule })),
      indicators: refs.filter((r) => r.couche_id === c.id).map(({ couche_id, ...i }) => i), kpis: [],
      link: `/couches?couche=${c.id}`, etat: 'live',
    };
  });
}

function build() {
  const items = [...importedDatasets(), ...liveLayers()];
  const sources = Object.entries(SOURCES).map(([key, s]) => ({ key, ...s, count: items.filter((i) => i.source.key === key).length })).filter((s) => s.count);
  return { generated: new Date().toISOString(), items, sources, seuilLive: require('./live').SEUIL_MS };
}

// Champs d'une couche en direct : propriétés d'un objet lu sur le WFS (type et exemple de valeur)
async function liveFields(id) {
  const c = require('./couches').COUCHES.find((x) => x.id === id);
  if (!c) throw Object.assign(new Error('couche inconnue'), { status: 404 });
  const url = `https://geo.valdemarne.fr/geoserver/ows?${new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', outputFormat: 'application/json', count: '20', typeNames: `conseil-departemental-du-val-de-marne:${c.layer}` })}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`géoportail du Val-de-Marne : HTTP ${r.status}`);
  const feats = (await r.json()).features || [];
  const keys = [...new Set(feats.flatMap((f) => Object.keys(f.properties || {})))].filter((k) => !['gid', 'mi_prinx'].includes(k));
  return keys.map((k) => {
    const vals = feats.map((f) => f.properties?.[k]).filter((v) => v != null && v !== '');
    const type = vals.every((v) => typeof v === 'number') && vals.length ? 'nombre' : /date/i.test(k) ? 'date' : 'texte';
    return { code: k, label: k.replace(/_/g, ' '), type, values: [...new Set(vals.map(String))].slice(0, 8).map((v) => ({ code: v, label: v })) };
  });
}

module.exports = { build, liveFields, SOURCES };
