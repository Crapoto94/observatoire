// Tableau de bord des indicateurs clés : valeur la plus récente, évolution, comparaison Val-de-Marne / Île-de-France,
// et état de validation des fiches indicateurs correspondantes.
const { all } = require('./db');
const { REF_GEO } = require('./seed');

const IGNORED = new Set(['UNIT_MEASURE', 'OBS_STATUS']);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// dir : sens favorable (up = une hausse est positive, down = une hausse est défavorable, none = neutre)
// where : modalités retenues ; les autres dimensions doivent valoir _T (total). ratio : num / den sur une dimension.
// cmp : comparaison pertinente avec le Val-de-Marne et l'Île-de-France (taux, prix, niveaux de vie ; pas les effectifs bruts)
const KPIS = [
  { id: 'population', label: 'Population', theme: 'Démographie', dataset: 'rp_serie_historique', where: { RP_MEASURE: 'POP', OCS: '_T' }, dir: 'none', ind: /population/ },
  { id: 'naissances', label: 'Naissances domiciliées', theme: 'Démographie', dataset: 'etat_civil_nais', where: { EC_MEASURE: 'LVB' }, dir: 'none', ind: /naissance/ },
  { id: 'niveau_vie', label: 'Niveau de vie médian', theme: 'Cohésion sociale', dataset: 'filosofi', where: { FILOSOFI_MEASURE: 'MED_SL' }, unit: '€', cmp: true, dir: 'up', ind: /niveau de vie|revenu median/ },
  { id: 'pauvrete', label: 'Taux de pauvreté', theme: 'Cohésion sociale', dataset: 'filosofi', where: { FILOSOFI_MEASURE: 'PR_MD60' }, unit: '%', cmp: true, dir: 'down', ind: /pauvrete/ },
  { id: 'rsa', label: 'Foyers au RSA', theme: 'Cohésion sociale', dataset: 'caf_rsa', where: { MESURE: 'FOYERS_RSA', TYPE_RSA: '_T' }, dir: 'down', ind: /rsa|minima sociaux/ },
  { id: 'chomage', label: 'Taux de chômage (15-64 ans)', theme: 'Emploi', dataset: 'rp_activite_chomage', where: { SEX: '_T', EDUC: '_T', AGE: 'Y15T64', RP_MEASURE: 'POP' }, ratio: { dim: 'EMPSTA_ENQ', num: ['2'], den: ['1T2'] }, unit: '%', cmp: true, dir: 'down', ind: /chomage|demandeurs d emploi/ },
  { id: 'logements', label: 'Logements', theme: 'Logement', dataset: 'rp_logement', where: { RP_MEASURE: 'DWELLINGS', OCS: '_T' }, dir: 'none', ind: /nombre de logements|parc de logements/ },
  { id: 'vacance', label: 'Part de logements vacants (parc privé)', theme: 'Logement', dataset: 'lovac', where: {}, ratio: { dim: 'MESURE', num: ['PP_VACANT'], den: ['PP_TOTAL'] }, unit: '%', cmp: true, dir: 'down', ind: /vacan/ },
  { id: 'sru', label: 'Taux de logements sociaux (SRU)', theme: 'Logement', dataset: 'sru', where: { MESURE: 'TAUX_SRU' }, unit: '%', cmp: true, dir: 'up', ind: /sru|logements sociaux/ },
  { id: 'rpls', label: 'Logements locatifs sociaux (RPLS)', theme: 'Logement', dataset: 'rpls', where: { CRITERE: 'TOTAL', MODALITE: '_T' }, dir: 'up', ind: /logements sociaux|logement social/ },
  { id: 'autorises', label: 'Logements autorisés', theme: 'Logement', dataset: 'sitadel', where: { MESURE: 'LGT_AUTORISES', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' }, skipCurrent: true, dir: 'up', ind: /permis|autorises/ },
  { id: 'commences', label: 'Logements commencés', theme: 'Logement', dataset: 'sitadel', where: { MESURE: 'LGT_COMMENCES', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' }, skipCurrent: true, dir: 'up', ind: /commences/ },
  { id: 'prix', label: 'Prix médian des appartements (€/m²)', theme: 'Logement', dataset: 'dvf', where: { MESURE: 'PRIX_M2_MEDIAN', TYPE_LOCAL: 'Appartement' }, unit: '€/m²', cmp: true, dir: 'none', ind: /prix|evolution des prix/ },
  { id: 'loyer', label: 'Loyer médian des appartements (€/m²)', theme: 'Logement', dataset: 'loyers', where: { MESURE: 'LOYER_M2', TYPE_BIEN: 'APPARTEMENT' }, unit: '€/m²', cmp: true, dir: 'none', ind: /loyer/ },
  { id: 'conso', label: "Consommation d'énergie résidentielle (MWh)", theme: 'Environnement', dataset: 'ore_conso', where: { MESURE: 'CONSO_MWH', FILIERE: '_T', SECTEUR: 'RESIDENTIEL' }, dir: 'down', ind: /energie|consommation/ },
  { id: 'accidents', label: 'Accidents corporels', theme: 'Mobilité', dataset: 'baac', where: { MESURE: 'ACCIDENTS', LUMINOSITE: '_T', AGGLOMERATION: '_T' }, dir: 'down', ind: /accident/ },
  { id: 'associations', label: 'Associations (stock du jour)', theme: 'Vie associative', dataset: 'entreprises', where: { MESURE: 'ASSOCIATIONS' }, dir: 'none', ind: /association/ },
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
  const geos = [[REF_GEO.code, 'ref'], ['94', 'dep'], ['11', 'reg']];
  const indicators = all('SELECT id, libelle, statut, priorite, theme_label FROM indicators');
  const dsInfo = Object.fromEntries(all('SELECT id, label, last_import FROM datasets').map((d) => [d.id, d]));
  const withData = new Set(all('SELECT DISTINCT indicator_id FROM indicator_datasets').map((r) => r.indicator_id));

  const cache = new Map();
  const rowsOf = (ds, geo) => {
    const k = `${ds}|${geo}`;
    if (!cache.has(k)) cache.set(k, all('SELECT period, dims, value FROM data_rows WHERE dataset_id = ? AND geo = ?', ds, geo).map((r) => ({ ...r, dims: JSON.parse(r.dims || '{}') })));
    return cache.get(k);
  };

  const kpis = KPIS.map((spec) => {
    const res = {};
    for (const [geo, key] of geos) {
      if (key !== 'ref' && !spec.cmp) continue;
      res[key] = seriesOf(rowsOf(spec.dataset, geo), spec);
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
      dep: last && res.dep ? at(res.dep, last.period) : null, reg: last && res.reg ? at(res.reg, last.period) : null,
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

module.exports = { build, KPIS };
