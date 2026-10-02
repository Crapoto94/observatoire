// Emploi : demandeurs d'emploi inscrits à France Travail par commune (statistique mensuelle du marché du travail, DARES / France Travail).
const mesure = (values) => ({ MESURE: { label: 'Mesure', values } });

module.exports = [
  {
    id: 'ft_defm', provider: 'ods', label: "Demandeurs d'emploi inscrits à France Travail (catégories A, B, C)",
    description: "DARES / France Travail (STMT) : demandeurs d'emploi inscrits en catégories A, B, C au 4ᵉ trimestre de chaque année, par commune, selon le sexe et la tranche d'âge (10 années glissantes). Données brutes arrondies au multiple de 5 : de petites différences peuvent apparaître entre la somme des détails et le total. Source ouverte, accès sans clé via le portail de la DARES (Opendatasoft).",
    themes: ['emploi', 'cohesion'], doc_url: 'https://www.data.gouv.fr/datasets/66df098924d76afbdd70938a',
    link: [{ theme: 'emploi', re: /demandeurs d emploi|france travail/ }],
    config: {
      base: 'https://data.dares.travail-emploi.gouv.fr', dataset: 'dares_defm_communales-brutes',
      levels: { COM: 'code_commune' },
      columns: [{ field: 'nombre_de_demandeurs_d_emploi', measure: 'DEFM_ABC' }],
      queries: [{
        where: 'type_de_donnees="Brutes" and categorie="ABC"',
        periodField: 'date',
        dimFields: [
          { field: 'sexe', dim: 'SEXE', map: { Total: '_T', Hommes: 'H', Femmes: 'F' } },
          { field: 'tranche_d_age', dim: 'AGE', map: { Total: '_T', 'Moins de 25 ans': 'Y_LT25', 'De 25 à 49 ans': 'Y25T49', '50 ans et plus': 'Y_GE50' } },
        ],
      }],
      labels: {
        ...mesure({ DEFM_ABC: "Demandeurs d'emploi inscrits (catégories A, B, C)" }),
        SEXE: { label: 'Sexe', values: { _T: 'Ensemble', H: 'Hommes', F: 'Femmes' } },
        AGE: { label: "Tranche d'âge", values: { _T: 'Tous âges', Y_LT25: 'Moins de 25 ans', Y25T49: '25 à 49 ans', Y_GE50: '50 ans et plus' } },
      },
    },
  },
];
