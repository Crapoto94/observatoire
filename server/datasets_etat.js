// Données publiques d'agences de l'État : CAF (quotient familial des allocataires, commune et quartiers prioritaires),
// URSSAF (effectifs salariés du secteur privé par secteur depuis 2006).
const mesure = (values) => ({ MESURE: { label: 'Mesure', values } });
const QF = {
  'Moins de 400 euros': 'QF_LT400', 'Entre 400 et 799 euros': 'QF_400_799', 'Entre 800 et 1199 euros': 'QF_800_1199', 'Entre 1200 et 1599 euros': 'QF_1200_1599',
  'Entre 1600 et 1999 euros': 'QF_1600_1999', 'Entre 2000 et 3999 euros': 'QF_2000_3999', '4000 euros ou plus': 'QF_GE4000', Inconnu: 'QF_INCONNU',
};
const QF_LABELS = { label: 'Quotient familial', values: { _T: 'Tous allocataires', QF_LT400: 'Moins de 400 €', QF_400_799: '400 à 799 €', QF_800_1199: '800 à 1 199 €', QF_1200_1599: '1 200 à 1 599 €', QF_1600_1999: '1 600 à 1 999 €', QF_2000_3999: '2 000 à 3 999 €', QF_GE4000: '4 000 € ou plus', QF_INCONNU: 'Inconnu' } };
const CAF_COLS = [{ field: 'indfoy_ndur', measure: 'FOYERS' }, { field: 'indnbp_ndur', measure: 'PERSONNES' }];
const CAF_MES = mesure({ FOYERS: 'Foyers allocataires (au moins une prestation légale)', PERSONNES: 'Personnes couvertes' });
const YEARS = Array.from({ length: 20 }, (_, i) => 2006 + i);

module.exports = [
  {
    id: 'caf_qf', provider: 'ods', label: 'Allocataires CAF selon le quotient familial (communal)',
    description: "CAF (data.caf.fr), décembre 2020 à 2024 : foyers allocataires percevant au moins une prestation légale et personnes couvertes, par tranche de quotient familial mensuel (moins de 400 €, 400 à 799 €… 4 000 € ou plus). Le quotient familial rapporte les ressources du foyer au nombre de parts : il approche le niveau de vie des seuls allocataires. Effectifs arrondis à 5.",
    themes: ['cohesion'], doc_url: 'https://data.caf.fr/explore/dataset/ndur_s_qf_400_com_f/',
    link: [{ theme: 'cohesion', re: /quotient familial|bas revenus/ }],
    config: {
      base: 'https://data.caf.fr', dataset: 'ndur_s_qf_400_com_f', levels: { COM: 'numcomdo' }, marginals: true, sum: true, columns: CAF_COLS,
      queries: [{ periodField: 'dtreffre', periodYear: true, dimFields: [{ field: 'qf_400', dim: 'QF', map: QF }] }],
      labels: { ...CAF_MES, QF: QF_LABELS },
    },
  },
  {
    id: 'caf_qf_qpv', provider: 'ods', label: 'Allocataires CAF des quartiers prioritaires selon le quotient familial',
    description: "CAF (data.caf.fr), décembre 2024 : foyers allocataires et personnes couvertes des quartiers prioritaires de la politique de la ville (géographie 2024), par QPV et tranche de quotient familial. Rattachés à la commune du quartier ; Val-de-Marne et Île-de-France recalculés à partir des communes. Approche des revenus des habitants des QPV couverts par la CAF.",
    themes: ['cohesion', 'emploi'], doc_url: 'https://data.caf.fr/explore/dataset/ndur_s_qf_400_qpv_f/',
    link: [{ theme: 'emploi', re: /revenus qpv/ }],
    config: {
      base: 'https://data.caf.fr', dataset: 'ndur_s_qf_400_qpv_f', levels: { COM: 'numcomdo' }, marginals: true, sum: true, columns: CAF_COLS,
      queries: [{ periodField: 'dtreffre', periodYear: true, dimFields: [{ field: 'qf_400', dim: 'QF', map: QF }, { field: 'nomqpv', dim: 'QPV' }] }],
      labels: { ...CAF_MES, QF: QF_LABELS, QPV: { label: 'Quartier prioritaire', values: { _T: 'Ensemble des QPV de la commune' } } },
    },
  },
  {
    id: 'urssaf_effectifs', provider: 'urssaf', label: 'Effectifs salariés du secteur privé par secteur (URSSAF)',
    description: "URSSAF (open.urssaf.fr) : établissements employeurs et effectifs salariés du secteur privé au 31 décembre, de 2006 à la dernière année, par commune et secteur d'activité (nomenclature NA17). Champ : salariés du privé relevant du régime général (hors fonction publique, hors particuliers employeurs). Mesure calculée : effectifs des secteurs dont l'emploi a augmenté sur les cinq années précédentes.",
    themes: ['emploi'], doc_url: 'https://open.urssaf.fr/explore/dataset/etablissements-et-effectifs-salaries-au-niveau-commune-x-ape-last/',
    link: [{ theme: 'emploi', re: /secteurs a potentiel|emplois salaries|evolution du nombre d emplois/ }],
    config: {
      base: 'https://open.urssaf.fr', dataset: 'etablissements-et-effectifs-salaries-au-niveau-commune-x-ape-last', levels: { COM: 'code_commune', DEP: 'code_departement', REG: 'code_region' },
      marginals: true, sum: true,
      columns: YEARS.flatMap((y) => [{ field: `e${y}`, measure: 'EFFECTIFS', period: String(y) }, { field: `n${y}`, measure: 'ETABLISSEMENTS', period: String(y) }]),
      queries: [{
        select: ['secteur_na17', ...YEARS.flatMap((y) => [`sum(effectifs_salaries_${y}) as e${y}`, `sum(nombre_d_etablissements_${y}) as n${y}`])].join(', '),
        groupBy: 'secteur_na17', dimFields: [{ field: 'secteur_na17', dim: 'SECTEUR' }],
      }],
      labels: { ...mesure({ EFFECTIFS: 'Effectifs salariés au 31 décembre', ETABLISSEMENTS: 'Établissements employeurs', EFFECTIFS_CROISSANCE: 'Effectifs des secteurs en croissance sur 5 ans' }), SECTEUR: { label: "Secteur d'activité (NA17)", values: { _T: 'Tous secteurs' } } },
    },
  },
];
