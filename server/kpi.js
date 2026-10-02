// Tableau de bord des indicateurs clés : valeur la plus récente, évolution, comparaison Val-de-Marne / Île-de-France,
// et état de validation des fiches indicateurs correspondantes.
const { all } = require('./db');
const { REF_GEO } = require('./seed');

const IGNORED = new Set(['UNIT_MEASURE', 'OBS_STATUS']);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, ' ').toLowerCase();

// dir : sens favorable (up = une hausse est positive, down = une hausse est défavorable, none = neutre)
// where : modalités retenues ; les autres dimensions doivent valoir _T (total). ratio : num / den sur une dimension.
// cmp : comparaison pertinente avec le Val-de-Marne et l'Île-de-France (taux, prix, niveaux de vie ; pas les effectifs bruts)
const KPIS = [
  { id: 'population', label: 'Population', theme: 'Démographie', dataset: 'rp_serie_historique', where: { RP_MEASURE: 'POP', OCS: '_T' }, dir: 'none', ind: /population/ },
  { id: 'naissances', perK: true, label: 'Naissances domiciliées', theme: 'Démographie', dataset: 'etat_civil_nais', where: { EC_MEASURE: 'LVB' }, dir: 'none', ind: /naissance/ },
  { id: 'niveau_vie', label: 'Niveau de vie médian', theme: 'Cohésion sociale', dataset: 'filosofi', where: { FILOSOFI_MEASURE: 'MED_SL' }, unit: '€', cmp: true, dir: 'up', ind: /niveau de vie|revenu median/ },
  { id: 'pauvrete', label: 'Taux de pauvreté', theme: 'Cohésion sociale', dataset: 'filosofi', where: { FILOSOFI_MEASURE: 'PR_MD60' }, unit: '%', cmp: true, dir: 'down', ind: /pauvrete/ },
  { id: 'rsa', perK: true, label: 'Foyers au RSA', theme: 'Cohésion sociale', dataset: 'caf_rsa', where: { MESURE: 'FOYERS_RSA', TYPE_RSA: '_T' }, dir: 'down', ind: /rsa|minima sociaux/ },
  { id: 'chomage', label: 'Taux de chômage (15-64 ans)', theme: 'Emploi', dataset: 'rp_activite_chomage', where: { SEX: '_T', EDUC: '_T', AGE: 'Y15T64', RP_MEASURE: 'POP' }, ratio: { dim: 'EMPSTA_ENQ', num: ['2'], den: ['1T2'] }, unit: '%', cmp: true, dir: 'down', ind: /chomage|demandeurs d emploi/ },
  { id: 'defm', label: "Demandeurs d'emploi inscrits (catégories A, B, C)", theme: 'Emploi', dataset: 'ft_defm', where: { MESURE: 'DEFM_ABC', SEXE: '_T', AGE: '_T' }, dir: 'down', ind: /demandeurs d emploi|france travail/ },
  { id: 'defm_1000', label: "Demandeurs d'emploi pour 1 000 habitants", theme: 'Emploi', dataset: 'ft_defm', where: { MESURE: 'DEFM_ABC', SEXE: '_T', AGE: '_T' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /demandeurs d emploi|france travail/ },
  { id: 'defm_jeunes', label: "Part des moins de 25 ans parmi les demandeurs d'emploi", theme: 'Emploi', dataset: 'ft_defm', where: { MESURE: 'DEFM_ABC', SEXE: '_T' }, ratio: { dim: 'AGE', num: ['Y_LT25'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /demandeurs d emploi|jeunes|france travail/ },
  { id: 'defm_50', label: "Part des 50 ans et plus parmi les demandeurs d'emploi", theme: 'Emploi', dataset: 'ft_defm', where: { MESURE: 'DEFM_ABC', SEXE: '_T' }, ratio: { dim: 'AGE', num: ['Y_GE50'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /demandeurs d emploi|seniors|france travail/ },
  { id: 'defm_femmes', label: "Part des femmes parmi les demandeurs d'emploi", theme: 'Emploi', dataset: 'ft_defm', where: { MESURE: 'DEFM_ABC', AGE: '_T' }, ratio: { dim: 'SEXE', num: ['F'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /demandeurs d emploi|france travail/ },
  { id: 'emploi_lt', label: "Emplois au lieu de travail", theme: 'Emploi', dataset: 'rp_emploi_lt', where: { RP_MEASURE: 'NBEMP', EMPSTA_ENQ: '1', SEX: '_T', EMPFORM: '_T', WKTIME: '_T', AGE: '_T' }, dir: 'up', ind: /nombre d emplois|evolution du nombre d emplois|densite d emplois/ },
  { id: 'cambriolages', label: 'Cambriolages de logement (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'CAMBRIOLAGES' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'violences', label: 'Violences physiques hors cadre familial (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'VIOL_HORS_FAMILLE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'violences_fam', label: 'Violences intrafamiliales (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'VIOL_FAMILIALES' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'vols_sans_violence', label: 'Vols sans violence (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'VOLS_SANS_VIOLENCE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'stupefiants', label: 'Trafic de stupéfiants (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'STUP_TRAFIC' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'degradations', label: 'Destructions et dégradations (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'DEGRADATIONS' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'dette_hab', label: 'Encours de la dette (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'DETTE_HAB' }, unit: '€', cmp: true, dir: 'down', ind: /^$/ },
  { id: 'personnel_hab', label: 'Charges de personnel (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'PERSONNEL_HAB' }, unit: '€', cmp: true, dir: 'none', ind: /^$/ },
  { id: 'equipement_hab', label: 'Dépenses d’équipement (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'EQUIPEMENT_HAB' }, unit: '€', cmp: true, dir: 'up', ind: /^$/ },
  { id: 'caf_hab', label: 'Capacité d’autofinancement (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'CAF_HAB' }, unit: '€', cmp: true, dir: 'up', ind: /^$/ },
  { id: 'impots_hab', label: 'Impôts locaux (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'IMPOTS_LOCAUX_HAB' }, unit: '€', cmp: true, dir: 'none', ind: /^$/ },
  { id: 'pharmacies', label: 'Pharmacies (pour 1 000 hab.)', theme: 'Santé', dataset: 'finess', where: { MESURE: 'ETABLISSEMENTS', CATEGORIE: 'PHARMACIE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'centres_sante', label: 'Centres de santé (pour 1 000 hab.)', theme: 'Santé', dataset: 'finess', where: { MESURE: 'ETABLISSEMENTS', CATEGORIE: 'CENTRE_SANTE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'ehpad', label: 'EHPAD (pour 1 000 hab.)', theme: 'Santé', dataset: 'finess', where: { MESURE: 'ETABLISSEMENTS', CATEGORIE: 'EHPAD' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'equip_sport', label: 'Équipements sportifs (pour 1 000 hab.)', theme: 'Sport', dataset: 'equipements_sportifs', where: { MESURE: 'EQUIPEMENTS', FAMILLE: '_T' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'passoires', label: 'Part de logements classés F ou G (DPE)', theme: 'Logement', dataset: 'dpe', where: {}, ratio: { dim: 'MESURE', num: ['DPE_F', 'DPE_G'], den: ['NB_DPE'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /passoire|dpe|etiquette energ/ },
  { id: 'dpe_ab', label: 'Part de logements classés A ou B (DPE)', theme: 'Logement', dataset: 'dpe', where: {}, ratio: { dim: 'MESURE', num: ['DPE_A', 'DPE_B'], den: ['NB_DPE'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'catnat', label: 'Arrêtés de catastrophe naturelle sur 10 ans', theme: 'Environnement', dataset: 'gaspar', where: { MESURE: 'ARRETES_10ANS', CATNAT_TYPE: '_T' }, cmp: true, dir: 'down', ind: /risque|catastrophe|inondation/ },
  { id: 'risques_recenses', label: 'Risques majeurs recensés dans la commune', theme: 'Environnement', dataset: 'gaspar', where: { MESURE: 'RISQUES_RECENSES', RISQUE_TYPE: '_T' }, dir: 'down', ind: /risques recenses|risques majeurs/ },
  { id: 'allocataires_caf', label: 'Foyers allocataires CAF (pour 1 000 hab.)', theme: 'Cohésion sociale', dataset: 'caf_prestations', where: { MESURE: 'FOYERS_ALLOCATAIRES' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'ppa', label: 'Foyers percevant la prime d’activité (pour 1 000 hab.)', theme: 'Cohésion sociale', dataset: 'caf_prestations', where: { MESURE: 'FOYERS_PPA' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'aides_logement', label: 'Foyers percevant l’APL (pour 1 000 hab.)', theme: 'Logement', dataset: 'caf_prestations', where: { MESURE: 'FOYERS_APL' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'logements', label: 'Logements', theme: 'Logement', dataset: 'rp_logement', where: { RP_MEASURE: 'DWELLINGS', OCS: '_T' }, dir: 'none', ind: /nombre de logements|parc de logements/ },
  { id: 'vacance', label: 'Part de logements vacants (parc privé)', theme: 'Logement', dataset: 'lovac', where: {}, ratio: { dim: 'MESURE', num: ['PP_VACANT'], den: ['PP_TOTAL'] }, unit: '%', cmp: true, dir: 'down', ind: /vacan/ },
  { id: 'sru', label: 'Taux de logements sociaux (SRU)', theme: 'Logement', dataset: 'sru', where: { MESURE: 'TAUX_SRU' }, unit: '%', cmp: true, dir: 'up', ind: /sru|logements sociaux/ },
  { id: 'rpls', perK: true, label: 'Logements locatifs sociaux (RPLS)', theme: 'Logement', dataset: 'rpls', where: { CRITERE: 'TOTAL', MODALITE: '_T' }, dir: 'up', ind: /logements sociaux|logement social/ },
  { id: 'autorises', perK: true, label: 'Logements autorisés', theme: 'Logement', dataset: 'sitadel', where: { MESURE: 'LGT_AUTORISES', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' }, skipCurrent: true, dir: 'up', ind: /permis|autorises/ },
  { id: 'commences', perK: true, label: 'Logements commencés', theme: 'Logement', dataset: 'sitadel', where: { MESURE: 'LGT_COMMENCES', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' }, skipCurrent: true, dir: 'up', ind: /commences/ },
  { id: 'prix', label: 'Prix médian des appartements (€/m²)', theme: 'Logement', dataset: 'dvf', where: { MESURE: 'PRIX_M2_MEDIAN', TYPE_LOCAL: 'Appartement' }, unit: '€/m²', cmp: true, dir: 'none', ind: /prix|evolution des prix/ },
  { id: 'loyer', label: 'Loyer médian des appartements (€/m²)', theme: 'Logement', dataset: 'loyers', where: { MESURE: 'LOYER_M2', TYPE_BIEN: 'APPARTEMENT' }, unit: '€/m²', cmp: true, dir: 'none', ind: /loyer/ },
  { id: 'conso', perK: true, label: "Consommation d'énergie résidentielle (MWh)", theme: 'Environnement', dataset: 'ore_conso', where: { MESURE: 'CONSO_MWH', FILIERE: '_T', SECTEUR: 'RESIDENTIEL' }, dir: 'down', ind: /energie|consommation/ },
  { id: 'accidents', perK: true, label: 'Accidents corporels', theme: 'Mobilité', dataset: 'baac', where: { MESURE: 'ACCIDENTS', LUMINOSITE: '_T', AGGLOMERATION: '_T' }, dir: 'down', ind: /accident/ },
  { id: 'associations', perK: true, label: 'Associations (stock du jour)', theme: 'Vie associative', dataset: 'entreprises', where: { MESURE: 'ASSOCIATIONS' }, dir: 'none', ind: /association/ },
];

const matches = (r, where) => Object.entries(where).every(([d, v]) => r.dims[d] === v);
const totalOnly = (r, used) => Object.entries(r.dims).every(([d, v]) => used.has(d) || IGNORED.has(d) || v === '_T' || v === '_Z' || v == null);

function seriesOf(rows, spec) {
  const used = new Set([...Object.keys(spec.where), ...(spec.ratio ? [spec.ratio.dim] : [])]);
  const by = new Map();
  const slot = (p) => by.get(p) || by.set(p, { num: 0, den: 0, n: 0 }).get(p);
  for (const r of rows) {
    if (r.value == null || !matches(r, spec.where) || !totalOnly(r, used)) continue;
    const m = slot(r.period ?? '');
    if (spec.ratio) {
      const c = r.dims[spec.ratio.dim];
      if (spec.ratio.num.includes(c)) m.num += r.value;
      if (spec.ratio.den.includes(c)) m.den += r.value;
    } else { m.num += r.value; m.n++; }
  }
  const out = [];
  for (const [period, m] of by) {
    if (spec.ratio) { if (m.den) out.push({ period, value: (m.num / m.den) * 100 }); } else if (m.n) out.push({ period, value: m.num });
  }
  // année en cours : données encore incomplètes pour certaines sources (déclarations tardives)
  const thisYear = new Date().getFullYear();
  return out.filter((p) => !spec.skipCurrent || Number(String(p.period).slice(0, 4)) < thisYear).sort((a, b) => (a.period < b.period ? -1 : 1));
}

function build() {
  const geos = [[REF_GEO.code, 'ref'], ['GOSB', 'ept'], ['94', 'dep'], ['11', 'reg']];
  const indicators = all('SELECT id, libelle, statut, priorite, theme_label FROM indicators');
  const dsInfo = Object.fromEntries(all('SELECT id, label, last_import FROM datasets').map((d) => [d.id, d]));
  const withData = new Set(all('SELECT DISTINCT indicator_id FROM indicator_datasets').map((r) => r.indicator_id));

  const cache = new Map();
  const rowsOf = (ds, geo) => {
    const k = `${ds}|${geo}`;
    if (!cache.has(k)) cache.set(k, all('SELECT period, dims, value FROM data_rows WHERE dataset_id = ? AND geo = ?', ds, geo).map((r) => ({ ...r, dims: JSON.parse(r.dims || '{}') })));
    return cache.get(k);
  };

  const carto = require('./cartographie'); // chargé ici pour éviter la dépendance circulaire au démarrage
  const pops = require('./importer').populationSeries();
  const communesOf = (key) => (key === 'dep' ? all("SELECT s.code FROM geo_shapes s JOIN geos g ON g.code = s.code WHERE g.dept = '94'") : all('SELECT code FROM geo_shapes')).map((r) => r.code);
  const kpis = KPIS.map((spec) => {
    const res = {};
    for (const [geo, key] of geos) {
      if (key !== 'ref' && !spec.cmp) continue;
      let s = seriesOf(rowsOf(spec.dataset, geo), spec);
      // jeux communaux : le Val-de-Marne et l'Île-de-France sont recalculés à partir des communes (effectifs ou ratios de sommes)
      if (!s.length && spec.fromCommunes && (key === 'dep' || key === 'reg')) {
        const codes = communesOf(key);
        const byGeo = carto.rowsFor(spec, codes);
        // jeu encore peu chargé pour ce périmètre : une somme partielle serait trompeuse
        const imported = all("SELECT 1 FROM import_runs WHERE dataset_id = ? AND scope = 'idf' AND status IN ('ok', 'partiel') LIMIT 1", spec.dataset).length > 0; // jeu importé pour toute l'Île-de-France : l'absence de ligne signifie « aucun »
        if (imported || byGeo.size >= codes.length * 0.6) s = seriesOf([...byGeo.values()].flat(), spec);
      }
      if (spec.kpiPerK) s = s.map((p) => { const pop = carto.popAt(pops[geo], p.period); return pop ? { period: p.period, value: (p.value / pop) * 1000 } : null; }).filter(Boolean);
      res[key] = s;
    }
    const s = res.ref || [];
    const last = s[s.length - 1] || null, prev = s.length > 1 ? s[s.length - 2] : null;
    const at = (list, period) => (list || []).find((p) => p.period === period) || null;
    const cands = indicators.filter((i) => spec.ind.test(norm(i.libelle)));
    const states = { valide: 0, brouillon: 0, abandonne: 0 };
    cands.forEach((i) => { states[i.statut || 'brouillon']++; });
    const statut = states.valide ? 'valide' : states.brouillon ? 'brouillon' : cands.length ? 'abandonne' : 'sans_fiche';
    const year = last ? Number(String(last.period).slice(0, 4)) : null;
    return {
      id: spec.id, label: spec.label, theme: spec.theme, unit: spec.unit || '', dir: spec.dir, dataset: spec.dataset, datasetLabel: dsInfo[spec.dataset]?.label || spec.dataset,
      last_import: dsInfo[spec.dataset]?.last_import || null,
      value: last?.value ?? null, period: last?.period ?? null, prev, series: s.slice(-8),
      ept: last && res.ept ? at(res.ept, last.period) : null, dep: last && res.dep ? at(res.dep, last.period) : null, reg: last && res.reg ? at(res.reg, last.period) : null,
      age: year == null || Number.isNaN(year) ? null : new Date().getFullYear() - year,
      indicators: cands.slice(0, 8).map((i) => ({ id: i.id, libelle: i.libelle, statut: i.statut || 'brouillon', priorite: i.priorite })),
      statut, states,
    };
  });

  const byStatut = { brouillon: 0, valide: 0, abandonne: 0 };
  indicators.forEach((i) => { byStatut[i.statut || 'brouillon']++; });
  const priority = indicators.filter((i) => i.priorite && i.priorite <= 2 && i.statut !== 'abandonne')
    .map((i) => ({ id: i.id, libelle: i.libelle, theme: i.theme_label, statut: i.statut || 'brouillon', priorite: i.priorite, data: withData.has(i.id) }));
  return {
    generated: new Date().toISOString(),
    summary: { total: indicators.length, ...byStatut, priority: priority.length, priorityWithData: priority.filter((p) => p.data).length, priorityValid: priority.filter((p) => p.statut === 'valide').length },
    kpis, priority,
  };
}

// KPI du tableau de bord correspondant à un intitulé d'indicateur (rapprochement par intitulé)
function kpiIdsFor(libelle) {
  const t = norm(libelle);
  return KPIS.filter((k) => k.ind.test(t)).map((k) => k.id);
}

module.exports = { build, KPIS, kpiIdsFor, seriesOf, matches, totalOnly };
