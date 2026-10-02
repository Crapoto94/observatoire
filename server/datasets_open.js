// Jeux open data hors INSEE (data.gouv.fr, Opendatasoft, geo-dvf, API Recherche d'entreprises).
// Tous testés sur Ivry-sur-Seine (94041). `link` : rattachement automatique aux indicateurs (voir datasets.js).
const DG = (id) => `https://www.data.gouv.fr/datasets/${id}/`;
const THIS_YEAR = new Date().getFullYear();
const yearsFrom = (y) => Array.from({ length: THIS_YEAR - y + 1 }, (_, k) => y + k);
const mesure = (label, values) => ({ MESURE: { label, values } });

module.exports = [
  {
    id: 'sru', provider: 'tabular', label: 'Loi SRU : inventaire des logements sociaux',
    description: 'Ministère de la Transition écologique : inventaire annuel SRU par commune (logements locatifs sociaux, taux SRU, taux cible, carence). Communes uniquement.',
    themes: ['logement'], doc_url: DG('6564969d3579e21795ebd378'),
    link: [{ theme: 'logement', re: /sru|logements sociaux|logement social/ }],
    config: {
      sources: [
        {
          level: 'COM', resource: '2773f8ca-e06b-4a67-9844-ac165d52f47c', geoField: 'Code_INSEE_commune',
          spec: { columns: [
            { field: 'Nombre_lls_ Inventaire_au_01_01_2025', measure: 'LLS', period: '2025' },
            { field: 'Taux_SRU_au_01_01_2025', measure: 'TAUX_SRU', period: '2025' },
            { field: 'Taux_cible_commune', measure: 'TAUX_CIBLE', period: '2025' },
          ] },
        },
        {
          level: 'COM', resource: '59379519-0fa6-4510-be06-a97d02fdef18', geoField: 'Code_INSEE_commune',
          spec: { columns: [
            { field: 'Nombre_lls_ Inventaire_au_01_01_2024', measure: 'LLS', period: '2024' },
            { field: 'Taux_SRU_au_01_01_2024', measure: 'TAUX_SRU', period: '2024' },
            { field: 'Taux_cible_commune_2023_2025', measure: 'TAUX_CIBLE', period: '2024' },
          ] },
        },
      ],
      labels: mesure('Mesure', { LLS: 'Logements locatifs sociaux (inventaire au 1er janvier)', TAUX_SRU: 'Taux de logements sociaux SRU (%)', TAUX_CIBLE: 'Taux cible fixé à la commune (%)' }),
    },
  },
  {
    id: 'loyers', provider: 'tabular', label: 'Carte des loyers : loyers d\'annonce par commune',
    description: 'Ministère de la Transition écologique : loyer d\'annonce prédit au m² (charges comprises) par commune, avec intervalle de prédiction, selon le type de bien. Millésimes 2022, 2023 et 2025 (le fichier 2024 n\'est pas accessible par l\'API tabulaire). Communes uniquement.',
    themes: ['logement'], doc_url: DG('693aa2feed1bf4da603faa49'),
    link: [{ theme: 'logement', re: /prix|loyers/ }],
    config: {
      sources: [
        ['2025', '693aa2feed1bf4da603faa49'], ['2023', '65808cdcf9c212f5f056e2fa'], ['2022', '639c7cf4969f3318338df9a8'],
      ].flatMap(([period, dataset]) => [
        ['APPARTEMENT', '^Indicateurs? de loyers? appartement$'], ['APPARTEMENT_1_2P', 'appartement de 1 ou 2'],
        ['APPARTEMENT_3P_PLUS', 'appartement de 3 pi'], ['MAISON', '^Indicateurs? de loyers? maison$'],
      ].map(([type, title]) => ({ level: 'COM', dataset, title, period, geoField: 'INSEE_C', constDims: { TYPE_BIEN: type } }))),
      columns: [
        { field: 'loypredm2', measure: 'LOYER_M2' }, { field: 'lwr.IPm2', measure: 'LOYER_M2_BAS' },
        { field: 'upr.IPm2', measure: 'LOYER_M2_HAUT' }, { field: 'nbobs_com', measure: 'NB_ANNONCES' },
      ],
      labels: {
        ...mesure('Mesure', { LOYER_M2: 'Loyer d\'annonce prédit (€/m²/mois)', LOYER_M2_BAS: 'Borne basse de l\'intervalle (€/m²)', LOYER_M2_HAUT: 'Borne haute de l\'intervalle (€/m²)', NB_ANNONCES: 'Nombre d\'annonces observées' }),
        TYPE_BIEN: { label: 'Type de bien', values: { APPARTEMENT: 'Appartement', APPARTEMENT_1_2P: 'Appartement 1 ou 2 pièces', APPARTEMENT_3P_PLUS: 'Appartement 3 pièces ou plus', MAISON: 'Maison' } },
      },
    },
  },
  {
    id: 'dvf', provider: 'geodvf', label: 'Ventes immobilières (DVF) : prix au m²',
    description: 'DGFiP / Etalab (geo-dvf) : ventes de logements, calculées à l\'import : nombre de mutations, nombre de ventes d\'un seul logement, prix médian au m², surface et valeur médianes. Ventes de biens uniques, prix au m² entre 500 et 30 000 €. Communes uniquement.',
    themes: ['logement'], doc_url: DG('5c4ae55a634f4117716d5656'),
    link: [{ theme: 'logement', re: /prix|loyers|accessibilite du marche/ }],
    config: {
      years: yearsFrom(2020),
      labels: {
        ...mesure('Mesure', { NB_MUTATIONS: 'Nombre de mutations (ventes)', NB_VENTES: 'Ventes d\'un seul logement analysées', PRIX_M2_MEDIAN: 'Prix médian (€/m²)', SURFACE_MEDIANE: 'Surface bâtie médiane (m²)', VALEUR_MEDIANE: 'Prix de vente médian (€)' }),
        TYPE_LOCAL: { label: 'Type de local', values: { _T: 'Total', Appartement: 'Appartement', Maison: 'Maison' } },
      },
    },
  },
  {
    id: 'artificialisation', provider: 'tabular', label: 'Artificialisation des sols',
    description: 'Mon diagnostic artificialisation (Cerema / portail de l\'artificialisation) : part et surface de sols artificialisés par millésime, et flux entre deux millésimes. Commune, intercommunalité, département, région (pour les départements et régions, la part en % est illisible dans le fichier source : seules les surfaces sont exploitables).',
    themes: ['environnement'], doc_url: DG('697b4f4d51a9d53976e5a8c9'),
    link: [{ theme: 'environnement', re: /imperm|artificialis|espaces naturels|etalement/ }],
    config: {
      sources: [
        { level: 'COM', resource: 'ef27150e-a799-4fe5-90e2-52a50880ee99', geoField: 'commune_code' },
        { level: 'EPCI', resource: 'f06e3d0c-360c-4642-93f2-d2d1c8982d5a', geoField: 'epci_code' },
        { level: 'DEP', resource: '5c88e89d-c111-4ab4-b5c3-8a9fb1911678', geoField: 'departement_code' },
        { level: 'REG', resource: '5bd8fa12-6277-4c97-bbc2-d4bd1c5a1cbe', geoField: 'region_code' },
      ],
      columns: [
        { field: 'pourcent_artif_1', measure: 'PART_ARTIF', periodField: 'millesimes_1' }, { field: 'pourcent_artif_2', measure: 'PART_ARTIF', periodField: 'millesimes_2' },
        { field: 'surface_artif_1', measure: 'SURFACE_ARTIF_HA', periodField: 'millesimes_1', scale: 0.0001 }, { field: 'surface_artif_2', measure: 'SURFACE_ARTIF_HA', periodField: 'millesimes_2', scale: 0.0001 },
        { field: 'flux_surface_1_2', measure: 'FLUX_HA', periodField: 'millesimes_2', scale: 0.0001 },
      ],
      labels: mesure('Mesure', { PART_ARTIF: 'Part du territoire artificialisée (%)', SURFACE_ARTIF_HA: 'Surface artificialisée (ha)', FLUX_HA: 'Variation de surface artificialisée depuis le millésime précédent (ha)' }),
    },
  },
  {
    id: 'mos', provider: 'ods', label: 'Occupation du sol (MOS) en 79 postes',
    description: 'Institut Paris Région : mode d\'occupation du sol francilien 2021 et 2025, surfaces par poste (espaces verts, bois, habitat, équipements…) agrégées par commune. Communes d\'Île-de-France uniquement.',
    themes: ['environnement', 'logement'], doc_url: 'https://data.iledefrance.fr/explore/dataset/mos-occupation-du-sol-2025-and-2021-en-79-postes-de-la-region-ile-de-france/',
    link: [{ theme: 'environnement', re: /espaces verts|espaces naturels|surfaces|etalement|imperm/ }, { theme: 'logement', re: /foncier|densite nette/ }],
    config: {
      base: 'https://data.iledefrance.fr', dataset: 'mos-occupation-du-sol-2025-and-2021-en-79-postes-de-la-region-ile-de-france',
      levels: { COM: 'insee' }, geoQuote: false,
      marginals: true,
      columns: [{ field: 'surface', measure: 'SURFACE_HA', scale: 0.0001 }],
      queries: [
        { select: '`2025poste`, sum(st_area_sh) as surface', groupBy: '`2025poste`', period: '2025', dimFields: [{ field: '`2025poste`', dim: 'POSTE' }] },
        { select: '`2021poste`, sum(st_area_sh) as surface', groupBy: '`2021poste`', period: '2021', dimFields: [{ field: '`2021poste`', dim: 'POSTE' }] },
      ],
      labels: { ...mesure('Mesure', { SURFACE_HA: 'Surface (ha)' }), POSTE: { label: 'Poste d\'occupation du sol', values: {} } },
    },
  },
  {
    id: 'multiexposition', provider: 'ods', label: 'Multi-exposition environnementale (Île-de-France)',
    description: 'Institut Paris Région : répartition de la population communale selon des classes de cumul de nuisances environnementales (bruit, pollution de l\'air, etc.), dont la population vulnérable. Classes numérotées de 1 à 6 : se reporter à la documentation du jeu pour leur définition. Communes d\'Île-de-France.',
    themes: ['environnement'], doc_url: 'https://data.iledefrance.fr/explore/dataset/scores-multiexposition-environnementale-communes/',
    link: [{ theme: 'environnement', re: /nuisances sonores|qualite de l air|ilots de chaleur|exposition/ }],
    config: {
      base: 'https://data.iledefrance.fr', dataset: 'scores-multiexposition-environnementale-communes',
      levels: { COM: 'insee' },
      columns: [1, 2, 3, 4, 5, 6].flatMap((k) => [
        { field: `cl${k}env_pop`, measure: `CLASSE_${k}` }, { field: `cl${k}envuln_pop`, measure: `CLASSE_VULN_${k}` },
      ]).concat([{ field: 's_sens_med_insee', measure: 'SCORE_SENSIBILITE' }, { field: 'svul_med_insee', measure: 'SCORE_VULNERABILITE' }, { field: 'qtx_patho_med_insee', measure: 'TAUX_PATHO' }]),
      queries: [{}],
      labels: mesure('Mesure', Object.fromEntries([
        ...[1, 2, 3, 4, 5, 6].map((k) => [`CLASSE_${k}`, `Part de la population en classe ${k} de multi-exposition (%)`]),
        ...[1, 2, 3, 4, 5, 6].map((k) => [`CLASSE_VULN_${k}`, `Part de la population vulnérable en classe ${k} (%)`]),
        ['SCORE_SENSIBILITE', 'Score de sensibilité (médiane)'], ['SCORE_VULNERABILITE', 'Score de vulnérabilité (médiane)'], ['TAUX_PATHO', 'Taux de pathologies (médiane)'],
      ])),
    },
  },
  {
    id: 'education_annuaire', provider: 'ods', label: 'Établissements scolaires (annuaire de l\'éducation)',
    description: 'Ministère de l\'Éducation nationale : nombre d\'écoles, collèges et lycées de la commune, publics et privés (annuaire de l\'éducation). Communes uniquement.',
    themes: ['cohesion', 'demographie'], doc_url: 'https://data.education.gouv.fr/explore/dataset/fr-en-annuaire-education/',
    link: [{ groupe: 'conditions-vie', re: /equipements/ }, { theme: 'demographie', re: /besoins scolaires/ }],
    config: {
      base: 'https://data.education.gouv.fr', dataset: 'fr-en-annuaire-education', levels: { COM: 'code_commune' },
      columns: [{ field: 'n', measure: 'NB_ETABLISSEMENTS' }],
      marginals: true,
      queries: [{ select: 'type_etablissement, statut_public_prive, count(*) as n', groupBy: 'type_etablissement, statut_public_prive', where: 'type_etablissement is not null and statut_public_prive is not null', period: '$YEAR', dimFields: [{ field: 'type_etablissement', dim: 'TYPE' }, { field: 'statut_public_prive', dim: 'STATUT' }] }],
      labels: { ...mesure('Mesure', { NB_ETABLISSEMENTS: 'Nombre d\'établissements' }), TYPE: { label: 'Type d\'établissement', values: {} }, STATUT: { label: 'Statut', values: {} } },
    },
  },
  {
    id: 'education_effectifs', provider: 'ods', label: 'Effectifs d\'élèves des écoles',
    description: 'Ministère de l\'Éducation nationale : nombre d\'élèves et de classes dans les écoles de la commune par rentrée scolaire, selon le secteur (public / privé). Premier degré. Communes uniquement.',
    themes: ['demographie'], doc_url: 'https://data.education.gouv.fr/explore/dataset/fr-en-ecoles-effectifs-nb_classes/',
    link: [{ theme: 'demographie', re: /besoins scolaires|moins de 18/ }],
    config: {
      base: 'https://data.education.gouv.fr', dataset: 'fr-en-ecoles-effectifs-nb_classes', levels: { COM: 'commune' }, byName: { deptField: 'code_departement' },
      marginals: true,
      columns: [{ field: 'eleves', measure: 'ELEVES' }, { field: 'classes', measure: 'CLASSES' }],
      queries: [{ select: 'rentree_scolaire, secteur, sum(nombre_total_eleves) as eleves, sum(nombre_total_classes) as classes', groupBy: 'rentree_scolaire, secteur', periodField: 'rentree_scolaire', periodYear: true, dimFields: [{ field: 'secteur', dim: 'SECTEUR' }] }],
      labels: { ...mesure('Mesure', { ELEVES: 'Nombre d\'élèves', CLASSES: 'Nombre de classes' }), SECTEUR: { label: 'Secteur', values: {} } },
    },
  },
  {
    id: 'caf_rsa', provider: 'ods', label: 'CAF : foyers allocataires du RSA',
    description: 'Caisses d\'allocations familiales : foyers et personnes couvertes par le RSA (majoré / non majoré) par commune, fin d\'année. Communes uniquement.',
    themes: ['cohesion', 'emploi'], doc_url: 'https://data.caf.fr/explore/dataset/rsa_s_type_com_f-copy/',
    link: [{ groupe: 'conditions-vie', re: /aides sociales|pauvrete/ }, { theme: 'emploi', re: /minima sociaux/ }],
    config: {
      base: 'https://data.caf.fr', dataset: 'rsa_s_type_com_f-copy', levels: { COM: 'numcomdo' },
      periodField: 'dtreffre', marginals: true,
      columns: [{ field: 'indfoy_rsa', measure: 'FOYERS_RSA' }, { field: 'indnbp_rsa', measure: 'PERSONNES_RSA' }],
      dimFields: [{ field: 'rsa_type', dim: 'TYPE_RSA' }],
      queries: [{}],
      labels: { ...mesure('Mesure', { FOYERS_RSA: 'Foyers allocataires', PERSONNES_RSA: 'Personnes couvertes' }), TYPE_RSA: { label: 'Type de RSA', values: {} } },
    },
  },
  {
    id: 'baac', provider: 'tabular', label: 'Accidents corporels de la circulation (BAAC)',
    description: 'ONISR / ministère de l\'Intérieur : accidents corporels survenus sur la commune, par année (2019 à 2024), selon la luminosité et la localisation (agglomération ou non). Comptage des fiches « caractéristiques ». Communes uniquement.',
    themes: ['mobilite'], doc_url: DG('53698f4ca3a729239d2036df'),
    link: [{ theme: 'mobilite', re: /accidents/ }],
    config: {
      sources: [
        ['2024', '83f0fb0e-e0ef-47fe-93dd-9aaee851674a'], ['2023', '104dbb32-704f-4e99-a71e-43563cb604f2'], ['2022', '5fc299c0-4598-4c29-b74c-6a67b0cc27e7'],
        ['2021', '85cfdc0c-23e4-4674-9bcd-79a970d7269b'], ['2020', '07a88205-83c1-4123-a993-cba5331e8ae0'], ['2019', 'e22ba475-45a3-46ac-a0f7-9ca9ed1e283a'],
      ].map(([period, resource]) => ({ level: 'COM', resource, geoField: 'com', period })),
      count: { measure: 'ACCIDENTS' },
      dimFields: [{ field: 'lum', dim: 'LUMINOSITE' }, { field: 'agg', dim: 'AGGLOMERATION' }],
      labels: {
        ...mesure('Mesure', { ACCIDENTS: 'Accidents corporels' }),
        LUMINOSITE: { label: 'Conditions d\'éclairage', values: { _T: 'Total', 1: 'Plein jour', 2: 'Crépuscule ou aube', 3: 'Nuit sans éclairage public', 4: 'Nuit, éclairage public non allumé', 5: 'Nuit, éclairage public allumé' } },
        AGGLOMERATION: { label: 'Localisation', values: { _T: 'Total', 1: 'Hors agglomération', 2: 'En agglomération' } },
      },
    },
  },
  {
    id: 'entreprises', provider: 'entreprises', label: 'Associations, ESS et entreprises (stock du jour)',
    description: 'API Recherche d\'entreprises (DINUM / INSEE / INPI) : nombre d\'associations et de structures de l\'économie sociale et solidaire de la commune, à la date de l\'import (pas d\'historique : réimporter régulièrement). Communes uniquement.',
    themes: ['cohesion', 'emploi'], doc_url: 'https://recherche-entreprises.api.gouv.fr/docs/',
    link: [{ groupe: 'vie-associative', re: /nb d associations/ }, { groupe: 'commerces', re: /ess/ }],
    config: {
      counts: [
        { measure: 'ASSOCIATIONS', query: 'est_association=true' },
        { measure: 'ESS', query: 'est_ess=true' },
      ],
      labels: mesure('Mesure', { ASSOCIATIONS: 'Associations', ESS: 'Structures de l\'économie sociale et solidaire' }),
    },
  },
];
