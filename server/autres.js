// Onglet « Autres » : indicateurs calculables à partir des données ouvertes mais absents de la conception actuelle,
// avec une proposition de fiche prête à être ajoutée, et un éclairage emploi (France Travail).
const { build, KPIS, formulaOf } = require('./kpi');
const emploi = require('./emploi');
const { all } = require('./db');

const THEME = {
  'Démographie': ['demographie', 'Démographie'], 'Emploi': ['emploi', 'Emploi & économie'], 'Cohésion sociale': ['cohesion', 'Cohésion sociale & santé'],
  'Logement': ['logement', 'Logement & urbanisme'], 'Environnement': ['environnement', 'Environnement & STE'], 'Mobilité': ['mobilite', 'Mobilité'],
  'Vie associative': ['cohesion', 'Cohésion sociale & santé'], 'Sécurité': ['cohesion', 'Cohésion sociale & santé'], 'Finances locales': ['cohesion', 'Cohésion sociale & santé'], 'Santé': ['cohesion', 'Cohésion sociale & santé'], 'Sport': ['cohesion', 'Cohésion sociale & santé'], 'Éducation': ['cohesion', 'Cohésion sociale & santé'],
};

const f1 = (v) => (v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }));

function suggestion(k) {
  const [theme, theme_label] = THEME[k.theme] || ['cohesion', 'Cohésion sociale & santé'];
  const ref = k.ept ? `GOSB ${f1(k.ept.value)}` : k.dep ? `Val-de-Marne ${f1(k.dep.value)}` : '';
  return {
    theme, theme_label, groupe: 'autres', groupe_label: `Autres indicateurs proposés · ${k.theme}`,
    niveau: 'contexte', libelle: k.label.replace(/\s*\(pour 1 000 hab\.\)/, ' pour 1 000 habitants'),
    source: k.prive ? `${k.datasetLabel} (données NON PUBLIQUES, accès habilité)` : `${k.datasetLabel} (données ouvertes)`, periodicite: 'annuelle',
    proposition: `Donnée déjà importée dans l'observatoire (jeu « ${k.datasetLabel} »), dernière valeur pour Ivry-sur-Seine : ${f1(k.value)}${k.unit ? ' ' + k.unit : ''} (${k.period})${ref ? `, repère : ${ref}` : ''}. À valider : définition, périmètre et sens de lecture avec les services concernés.${k.prive ? ' Donnée non publique (API Entreprise, accès habilité) : ne pas diffuser telle quelle.' : ''}`,
    origine: 'externe', cartographie: 'oui', statut: 'brouillon', unite: k.unit || null, dataset_ids: [k.dataset],
    ...(() => { const spec = KPIS.find((x) => x.id === k.id); if (!spec) return {}; const { mode, formule } = formulaOf(spec); return { mode_calcul: mode, formule }; })(),
  };
}

function buildAutres() {
  const d = build();
  const extra = d.kpis.filter((k) => k.statut === 'sans_fiche' && k.value != null);
  const byTheme = new Map();
  for (const k of extra) (byTheme.get(k.theme) || byTheme.set(k.theme, []).get(k.theme)).push({ ...k, suggestion: suggestion(k) });
  const already = new Set(all("SELECT libelle FROM indicators WHERE groupe = 'autres'").map((r) => r.libelle));
  const groups = [...byTheme.entries()].map(([theme, kpis]) => ({ theme, kpis: kpis.map((k) => ({ ...k, adopted: already.has(k.suggestion.libelle) })) }));
  // jeux importés sans aucun indicateur de la conception rattaché
  const orphanDatasets = all(`SELECT d.id, d.label, d.nb_rows FROM datasets d WHERE d.nb_rows > 0 AND d.id NOT IN (SELECT dataset_id FROM indicator_datasets) ORDER BY d.label`);
  // couches du Val-de-Marne lues en direct : indicateurs disponibles (nombre, pour 1 000 hab., sommes) et fiches déjà créées
  const adoptedCouches = all('SELECT couche_id, libelle FROM indicators WHERE couche_id IS NOT NULL');
  const couches = require('./couches').list().couches.map((c) => ({
    id: c.id, label: c.label, theme: c.theme, color: c.color, doc_url: c.doc_url, stats: c.stats,
    fiches: adoptedCouches.filter((a) => a.couche_id === c.id).map((a) => a.libelle),
  }));
  const e = emploi.build(d);
  return { generated: d.generated, groups, orphanDatasets, couches, emploi: { insights: e.insights, ranking: e.ranking, kpis: e.kpis }, sources: e.sources };
}

module.exports = { build: buildAutres };
