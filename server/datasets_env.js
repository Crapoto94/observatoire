// Déchets (ADEME SINOE®) et émissions de gaz à effet de serre (Airparif) : données publiées à la maille de la collectivité
// compétente (EPT Grand-Orly Seine Bièvre), reportées sur ses communes membres.
const mesure = (values) => ({ MESURE: { label: 'Mesure', values } });

module.exports = [
  {
    id: 'sinoe_dma', provider: 'sinoe',
    label: 'Collecte des déchets ménagers et assimilés du Grand-Orly Seine Bièvre (ADEME SINOE®)',
    description: "Grand-Orly Seine Bièvre (EPT T12, compétent pour la collecte des déchets) : tonnages déclarés chaque année à l'ADEME et publiés dans SINOE® Déchets. Flux de collecte des déchets ménagers et assimilés (DMA) par collectivité compétente et par année : tonnages (DMA, ordures ménagères résiduelles, biodéchets, emballages et papiers, verre), population desservie, ratios en kg par habitant, part de valorisation matière. Depuis 2016 la collecte relève de l'EPT Grand-Orly Seine Bièvre : les valeurs (2016-2024) sont celles de l'EPT, reportées sur chacune de ses communes ; la série communale d'Ivry (2009-2015, commune compétente) est conservée à part.",
    themes: ['environnement'], doc_url: 'https://data.ademe.fr/datasets/rsqxbwsxhk-ngmmu5fcasf5t',
    link: [{ groupe: 'environnement', re: /dechet|tri\b|biodechet/ }],
    config: {
      url: 'https://data.ademe.fr/data-fair/api/v1/datasets/rsqxbwsxhk-ngmmu5fcasf5t/lines', qs: 'c_dept:94', ept: { GOSB: 56933 },
      labels: {
        MAILLE: { label: 'Collectivité', values: { EPT: 'EPT compétent (Grand-Orly Seine Bièvre)', COM: 'Commune compétente (avant 2016)' } },
        ...mesure({
          TONNAGE_DMA: 'Déchets ménagers et assimilés collectés (t)', TONNAGE_OMR: 'Ordures ménagères résiduelles (t)', TONNAGE_BIO: 'Biodéchets collectés séparément (t)',
          TONNAGE_EMB: 'Emballages, journaux et papiers (t)', TONNAGE_VERRE: 'Verre (t)', PCT_VALO_MAT: 'Part de valorisation matière (%)', POP: 'Population desservie',
          DMA_KG_HAB: 'DMA collectés par habitant (kg)', OMR_KG_HAB: 'Ordures ménagères résiduelles par habitant (kg)',
        }),
      },
    },
  },
  {
    id: 'atmo_indices', provider: 'atmo',
    label: 'Indice ATMO de la qualité de l’air, historique communal (Airparif)',
    description: "Airparif : indice ATMO communal de chaque jour depuis 2021 (indice national : 1 bon, 2 moyen, 3 dégradé, 4 mauvais, 5 très mauvais, 6 extrêmement mauvais), constaté la veille. Agrégats annuels : jours renseignés, jours « dégradé » ou pire, jours « mauvais » ou pire, jours « dégradé » ou pire par polluant (dioxyde d'azote, ozone, particules PM10 et PM2,5), indice moyen. Année en cours incomplète. GOSB : moyenne de ses communes pondérée par la population.",
    themes: ['environnement'], doc_url: 'https://data-airparif-asso.opendata.arcgis.com/',
    link: [{ groupe: 'environnement', re: /pollution|qualite de l air/ }],
    config: {
      url: 'https://magellan.airparif.asso.fr/geoserver/siteweb/wfs', layer: 'siteweb:vue_indice_atmo_2020_histo', seuilDegrade: 3, seuilMauvais: 4,
      labels: mesure({
        JOURS: 'Jours renseignés', JOURS_DEGRADE: 'Jours dégradés ou pire (indice 3 ou plus)', JOURS_MAUVAIS: 'Jours mauvais ou pire (indice 4 ou plus)', INDICE_MOYEN: 'Indice moyen de l’année',
        DEGRADE_NO2: 'Jours dégradés ou pire pour le dioxyde d’azote', DEGRADE_O3: 'Jours dégradés ou pire pour l’ozone', DEGRADE_PM10: 'Jours dégradés ou pire pour les particules PM10', DEGRADE_PM25: 'Jours dégradés ou pire pour les particules PM2,5',
      }),
    },
  },
  {
    id: 'airparif_ges', provider: 'airparif',
    label: 'Émissions de gaz à effet de serre par secteur (Airparif)',
    description: "Airparif, inventaire régional des émissions : gaz à effet de serre (kt éq. CO2, scopes 1 et 2) et oxydes d'azote par secteur d'activité (résidentiel, tertiaire, transport routier, industrie, aérien, déchets…), années 2005, 2010, 2015, 2019 et 2022. Maille EPT pour les communes (valeurs du Grand-Orly Seine Bièvre), département et région. Ratio par habitant calculé avec la population du territoire au recensement le plus proche.",
    themes: ['environnement', 'mobilite'], doc_url: 'https://data-airparif-asso.opendata.arcgis.com/',
    link: [{ groupe: 'environnement', re: /gaz a effet de serre|emissions/ }, { groupe: 'mobilite', re: /emissions liees/ }],
    config: {
      layers: {
        epci: 'https://services8.arcgis.com/gtmasQsdfwbDAQSQ/arcgis/rest/services/%C3%A9missions_IDF_epci_2022/FeatureServer/0',
        dep: 'https://services8.arcgis.com/gtmasQsdfwbDAQSQ/arcgis/rest/services/%C3%A9missions_IDF_departement_2022/FeatureServer/0',
        reg: 'https://services8.arcgis.com/gtmasQsdfwbDAQSQ/arcgis/rest/services/%C3%A9missions_IDF_region_2022_fs/FeatureServer/0',
      },
      ept: { GOSB: 7500002 }, polluants: { GES125: 'GES', NOX: 'NOX' },
      labels: {
        POLLUANT: { label: 'Polluant', values: { GES: 'Gaz à effet de serre (éq. CO2, scopes 1 et 2)', NOX: 'Oxydes d’azote (NOx)' } },
        SECTEUR: { label: 'Secteur', values: { _T: 'Tous secteurs', RESI: 'Résidentiel', TERT: 'Tertiaire', TROUTE: 'Transport routier', INDUS: 'Industrie', AERO: 'Aérien', AGRI: 'Agriculture', ATRTRSP: 'Autres transports', CHANT: 'Chantiers', DECHET: 'Traitement des déchets', ENERG: 'Branche énergie' } },
        ...mesure({ EMISSIONS_KT: 'Émissions (kt)', EMISSIONS_T_HAB: 'Émissions par habitant (t)' }),
      },
    },
  },
];
