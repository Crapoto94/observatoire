// Institut Paris Region (data-iau-idf.opendata.arcgis.com) : indicateurs communaux servis par ses MapServer ArcGIS.
const IPR = 'https://geoweb.iau-idf.fr/agsmap1/rest/services/OPENDATA';
const mesure = (values) => ({ MESURE: { label: 'Mesure', values } });

module.exports = [
  {
    id: 'ipr_idh2', provider: 'arcgis',
    label: 'Indice de développement humain (IDH-2) des communes',
    description: "Institut Paris Region : indice de développement humain régionalisé (IDH-2) par commune, moyenne de trois indices plafonnés entre 0 et 1 : santé (espérance de vie), éducation (diplômes de la population de 15 ans ou plus non scolarisée) et revenu (revenu médian par unité de consommation). Millésimes 1999, 2006 et 2013 (dernière édition publiée). Moyenne du GOSB pondérée par la population de ses communes.",
    themes: ['cohesion'], doc_url: 'https://data-iau-idf.opendata.arcgis.com/',
    link: [{ groupe: 'conditions-vie', re: /developpement social/ }, { groupe: 'sante', re: /indice determinant de sante|evolution de l indice/ }],
    config: {
      url: `${IPR}/OpendataIAU2/MapServer`, layer: 59, idField: 'insee', idQuote: false, periodField: 'annee', marginals: false,
      measures: [
        { stat: 'avg', field: 'idh2', measure: 'IDH2' }, { stat: 'avg', field: 'sante_plaf', measure: 'IDH2_SANTE' },
        { stat: 'avg', field: 'educ_plaf', measure: 'IDH2_EDUCATION' }, { stat: 'avg', field: 'revenu_plaf', measure: 'IDH2_REVENU' },
      ],
      labels: mesure({ IDH2: 'IDH-2 (0 à 1)', IDH2_SANTE: 'Indice de santé (0 à 1)', IDH2_EDUCATION: 'Indice d’éducation (0 à 1)', IDH2_REVENU: 'Indice de revenu (0 à 1)' }),
    },
  },
  {
    id: 'ipr_mortalite', provider: 'iprmorta',
    label: 'Mortalité et espérance de vie 2019-2023 (ORS / Institut Paris Region)',
    description: "Institut Paris Region (ORS Île-de-France) : espérance de vie à la naissance, à 35 ans et à 65 ans par sexe, taux standardisés de mortalité générale et prématurée (décès avant 65 ans pour 100 000 habitants), période 2019-2023. Maille canton ou ville : une commune n'a de valeur que si elle forme un canton-ville à elle seule (Ivry-sur-Seine : oui) ; Val-de-Marne et intercommunalités disponibles. Moyenne du GOSB pondérée par la population de ses communes renseignées.",
    themes: ['cohesion'], doc_url: 'https://data-iau-idf.opendata.arcgis.com/',
    link: [{ groupe: 'sante', re: /indice determinant de sante|evolution de l indice|besoins specifiques/ }, { groupe: 'demographie', re: /taux de mortalite/ }],
    config: {
      url: `${IPR}/OpendataIAU4/MapServer`, period: '2023', layers: { canton: 26, dep: 27, interco: 28 },
      labels: mesure({
        ESPVIE0_H: 'Espérance de vie à la naissance, hommes (ans)', ESPVIE0_F: 'Espérance de vie à la naissance, femmes (ans)', ESPVIE35_H: 'Espérance de vie à 35 ans, hommes', ESPVIE35_F: 'Espérance de vie à 35 ans, femmes',
        ESPVIE65_H: 'Espérance de vie à 65 ans, hommes', ESPVIE65_F: 'Espérance de vie à 65 ans, femmes', MORT_PREMA: 'Mortalité prématurée (avant 65 ans, taux standardisé pour 100 000)',
        MORT_PREMA_H: 'Mortalité prématurée, hommes', MORT_PREMA_F: 'Mortalité prématurée, femmes', MORT_GEN: 'Mortalité générale (taux standardisé pour 100 000)', MORT_GEN_H: 'Mortalité générale, hommes', MORT_GEN_F: 'Mortalité générale, femmes',
      }),
    },
  },
];
