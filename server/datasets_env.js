// Déchets (ADEME SINOE®) et émissions de gaz à effet de serre (Airparif) : données publiées à la maille de la collectivité
// compétente (EPT Grand-Orly Seine Bièvre), reportées sur ses communes membres.
const mesure = (values) => ({ MESURE: { label: 'Mesure', values } });

module.exports = [
  {
    id: 'sinoe_dma', provider: 'sinoe',
    label: 'Collecte des déchets ménagers et assimilés (ADEME SINOE®)',
    description: "ADEME, SINOE® Déchets : flux de collecte des déchets ménagers et assimilés (DMA) par collectivité compétente et par année : tonnages (DMA, ordures ménagères résiduelles, biodéchets, emballages et papiers, verre), population desservie, ratios en kg par habitant, part de valorisation matière. Depuis 2016 la collecte relève de l'EPT Grand-Orly Seine Bièvre : les valeurs (2016-2024) sont celles de l'EPT, reportées sur chacune de ses communes ; la série communale d'Ivry (2009-2015, commune compétente) est conservée à part.",
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
