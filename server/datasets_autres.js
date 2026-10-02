// Jeux « autres » : thèmes absents de la conception actuelle mais utiles à l'éclairage des décisions (sécurité, finances locales).
const mesure = (values) => ({ MESURE: { label: 'Mesure', values } });

const INFRA = {
  VIOL_FAMILIALES: 'Violences physiques intrafamiliales', VIOL_HORS_FAMILLE: 'Violences physiques hors cadre familial', VIOL_SEXUELLES: 'Violences sexuelles',
  VOLS_ARMES: 'Vols avec armes', VOLS_VIOLENTS: 'Vols violents sans arme', VOLS_SANS_VIOLENCE: 'Vols sans violence contre des personnes',
  CAMBRIOLAGES: 'Cambriolages de logement', VOL_VEHICULE: 'Vols de véhicule', VOL_DANS_VEHICULE: 'Vols dans les véhicules', VOL_ACCESSOIRES: "Vols d'accessoires sur véhicules",
  DEGRADATIONS: 'Destructions et dégradations volontaires', STUP_USAGE: 'Usage de stupéfiants', STUP_USAGE_AFD: 'Usage de stupéfiants (amende forfaitaire délictuelle)',
  STUP_TRAFIC: 'Trafic de stupéfiants', ESCROQUERIES: 'Escroqueries et fraudes aux moyens de paiement',
};

const FIN = {
  PRODUITS_HAB: ['fprod', 'Produits de fonctionnement (€/hab.)'], CHARGES_HAB: ['fcharge', 'Charges de fonctionnement (€/hab.)'],
  PERSONNEL_HAB: ['fperso', 'Charges de personnel (€/hab.)'], IMPOTS_LOCAUX_HAB: ['fimpo1', 'Impôts locaux (€/hab.)'], DGF_HAB: ['fdgf', 'Dotation globale de fonctionnement (€/hab.)'],
  EQUIPEMENT_HAB: ['fequip', "Dépenses d'équipement (€/hab.)"], DETTE_HAB: ['fdette', 'Encours de la dette (€/hab.)'], CAF_HAB: ["fcaf", "Capacité d'autofinancement (€/hab.)"],
  PERSONNEL_PCT_CHARGES: ['rperso', 'Charges de personnel / charges de fonctionnement (%)'], DETTE_PCT_PRODUITS: ['rdette', 'Encours de la dette / produits de fonctionnement (%)'],
  POP_BUDGET: ['pop1', 'Population (budgétaire, DGF)'],
};
const STRATE = { PRODUITS: 'mprod', CHARGES: 'mcharge', PERSONNEL: 'mperso', IMPOTS_LOCAUX: 'mimpo1', EQUIPEMENT: 'mequip', DETTE: 'mdette', CAF: 'mcaf' };

module.exports = [
  {
    id: 'ssmsi', provider: 'ssmsi', label: 'Délinquance enregistrée (SSMSI, police et gendarmerie)',
    description: "Ministère de l'Intérieur (SSMSI) : faits de délinquance enregistrés par la police et la gendarmerie, par commune et par année (2016-2025), pour 15 catégories (cambriolages, violences, vols, stupéfiants…), en nombre et en taux pour 1 000 habitants. Le fichier national (40 Mo) est téléchargé une fois puis filtré sur l'Île-de-France. Les valeurs soumises au secret statistique ne sont pas diffusées. Un fait enregistré n'est pas un fait commis : les dépôts de plainte varient selon les territoires.",
    themes: ['cohesion'], doc_url: 'https://www.data.gouv.fr/datasets/621df2954fa5a3b5a023e23c',
    link: [],
    config: {
      resource: '44ef4323-1097-48d5-8719-3c544b55d294',
      labels: {
        ...mesure({ NOMBRE: 'Nombre de faits enregistrés', TAUX_MILLE: 'Taux pour 1 000 habitants' }),
        INFRACTION: { label: 'Catégorie', values: INFRA },
      },
    },
  },
  {
    id: 'finances', provider: 'finances', label: 'Finances de la commune (comptes individuels, DGFiP)',
    description: "DGFiP, comptes individuels des communes : produits et charges de fonctionnement, impôts locaux, charges de personnel, dépenses d'équipement, encours de la dette et capacité d'autofinancement, en euros par habitant, de 2011 à aujourd'hui, avec la moyenne des communes de même taille (strate). Fichiers annuels du portail data.economie.gouv.fr.",
    themes: ['cohesion'], doc_url: 'https://www.data.gouv.fr/datasets/?q=comptes+individuels+des+communes',
    link: [],
    config: {
      datasets: ['comptes-individuels-des-communes-fichier-global-2011-2015', 'comptes-individuels-des-communes-fichier-global-2016', 'comptes-individuels-des-communes-fichier-global-2017',
        'comptes-individuels-des-communes-fichier-global-2018', 'comptes-individuels-des-communes-fichier-global-2019-2020', 'comptes-individuels-des-communes-fichier-global-2021',
        'comptes-individuels-des-communes-fichier-global-2022', 'comptes-individuels-des-communes-fichier-global-2023-2024', 'comptes-individuels-des-communes-fichier-global-2025'],
      measures: [
        ...Object.entries(FIN).map(([measure, [field]]) => ({ field, measure })),
        ...Object.entries(STRATE).map(([k, field]) => ({ field, measure: `${k}_HAB_STRATE` })),
      ],
      labels: mesure({
        ...Object.fromEntries(Object.entries(FIN).map(([m, [, l]]) => [m, l])),
        ...Object.fromEntries(Object.keys(STRATE).map((k) => [`${k}_HAB_STRATE`, `${FIN[`${k}_HAB`]?.[1] || k} : moyenne de la strate`])),
      }),
    },
  },
  {
    id: 'finess', provider: 'ods', label: 'Offre sanitaire et sociale (FINESS)',
    description: "Fichier national des établissements sanitaires et sociaux (FINESS), extrait francilien publié par la Région Île-de-France : nombre d'établissements par commune et par catégorie (pharmacies, centres de santé, EHPAD, résidences autonomie, PMI, laboratoires, services à domicile…). Stock à la date de l'import. Il s'agit d'établissements, pas de places ni de professionnels.",
    themes: ['cohesion'], doc_url: 'https://data.iledefrance.fr/explore/dataset/finess/',
    link: [],
    config: {
      base: 'https://data.iledefrance.fr', dataset: 'finess', levels: { COM: 'com_code' }, marginals: true, sum: true,
      columns: [{ field: 'n', measure: 'ETABLISSEMENTS' }],
      queries: [{
        select: 'count(*) as n, libcategetab', groupBy: 'libcategetab', period: '$YEAR',
        dimFields: [{ field: 'libcategetab', dim: 'CATEGORIE', map: {
          "Pharmacie d'Officine": 'PHARMACIE', 'Centre de Santé': 'CENTRE_SANTE', 'Laboratoire de Biologie Médicale': 'LABORATOIRE',
          'Protection Maternelle et Infantile (P.M.I.)': 'PMI', 'Résidences autonomie': 'RESIDENCE_AUTONOMIE',
          "Etablissement d'hébergement pour personnes âgées dépendantes": 'EHPAD', 'Service de Soins Infirmiers A Domicile (S.S.I.A.D)': 'SSIAD',
          'Service autonomie aide (SAA)': 'SERVICE_AUTONOMIE',
        } }],
      }],
      labels: {
        ...mesure({ ETABLISSEMENTS: "Nombre d'établissements" }),
        CATEGORIE: { label: "Catégorie d'établissement", values: {
          _T: 'Toutes catégories', PHARMACIE: 'Pharmacies', CENTRE_SANTE: 'Centres de santé', LABORATOIRE: 'Laboratoires de biologie médicale', PMI: 'Protection maternelle et infantile',
          RESIDENCE_AUTONOMIE: 'Résidences autonomie', EHPAD: 'EHPAD', SSIAD: 'Soins infirmiers à domicile (SSIAD)', SERVICE_AUTONOMIE: 'Services autonomie aide à domicile',
        } },
      },
    },
  },
  {
    id: 'equipements_sportifs', provider: 'ods', label: 'Équipements sportifs (recensement national)',
    description: "Recensement des équipements sportifs (Data ES) publié par la Région Île-de-France : nombre d'équipements par commune et par famille (terrains de grands jeux, salles multisports, courts de tennis, bassins de natation, city-stades…). Stock à la date de l'import.",
    themes: ['cohesion', 'environnement'], doc_url: 'https://data.iledefrance.fr/explore/dataset/recensement-des-equipements-sportifs/',
    link: [],
    config: {
      base: 'https://data.iledefrance.fr', dataset: 'recensement-des-equipements-sportifs', levels: { COM: 'new_code' }, marginals: true, sum: true,
      columns: [{ field: 'n', measure: 'EQUIPEMENTS' }],
      queries: [{ select: 'count(*) as n, equip_type_famille', groupBy: 'equip_type_famille', period: '$YEAR', dimFields: [{ field: 'equip_type_famille', dim: 'FAMILLE' }] }],
      labels: { ...mesure({ EQUIPEMENTS: "Nombre d'équipements sportifs" }), FAMILLE: { label: "Famille d'équipement", values: { _T: 'Tous équipements' } } },
    },
  },
  {
    id: 'gaspar', provider: 'gaspar', label: 'Risques naturels et technologiques (Géorisques, GASPAR)',
    description: "Ministère de la Transition écologique, base GASPAR : arrêtés de reconnaissance de catastrophe naturelle par commune (année de début, type de risque, cumul sur 10 ans glissants) et risques majeurs recensés dans la commune (inondation, mouvements de terrain, transport de marchandises dangereuses, risque industriel…). Archive nationale téléchargée une fois. Un arrêté n'indique pas l'ampleur des dégâts.",
    themes: ['environnement'], doc_url: 'https://www.data.gouv.fr/datasets/536995eea3a729239d20486b',
    link: [{ theme: 'environnement', re: /risque|catastrophe|inondation/ }],
    config: {
      labels: {
        ...mesure({ ARRETES_CATNAT: 'Arrêtés de catastrophe naturelle (année de début)', ARRETES_10ANS: 'Arrêtés de catastrophe naturelle sur 10 ans glissants', RISQUES_RECENSES: 'Risques majeurs recensés' }),
        CATNAT_TYPE: { label: 'Type de catastrophe naturelle', values: { _T: 'Tous types', ICB: 'Inondations et coulées de boue', SEC: 'Sécheresse', MVT: 'Mouvement de terrain', GLT: 'Glissement de terrain', IRN: 'Inondations par remontée de nappe', TMP: 'Tempête', GRL: 'Grêle', EFA: 'Effondrement ou affaissement', ECB: 'Éboulement ou chute de blocs', AUTRE: 'Autre' } },
        RISQUE_TYPE: { label: 'Risque majeur recensé', values: { _T: 'Nombre de risques recensés', 11: 'Inondation', 12: 'Mouvement de terrain', 16: 'Feu de forêt', 17: 'Phénomène lié à l’atmosphère', 21: 'Risque industriel', 22: 'Nucléaire', 23: 'Rupture de barrage', 24: 'Transport de marchandises dangereuses' } },
      },
    },
  },
  {
    id: 'dpe', provider: 'tabular', label: 'Performance énergétique des logements (DPE, par commune)',
    description: "ADEME, base des diagnostics de performance énergétique des logements existants, agrégée par commune (Terralyse, millésime 2026) : nombre de diagnostics par étiquette de A à G. Seules les communes avec assez de diagnostics sont publiées (environ 5 500). Les diagnostics ne couvrent pas l'ensemble du parc : ils sont réalisés à la vente, à la location ou lors de travaux.",
    themes: ['logement', 'environnement'], doc_url: 'https://www.data.gouv.fr/datasets/6a9bea1e50326fc16ecb5bc7',
    link: [{ theme: 'logement', re: /passoire|dpe|etiquette|performance energetique/ }, { theme: 'environnement', re: /passoire|dpe|etiquette|performance energetique/ }],
    config: {
      sources: [{ level: 'COM', resource: '83713035-9e89-44b7-a148-7fa378c6ba91', geoField: 'code_insee', period: '$YEAR' }],
      columns: [
        { field: 'nb_dpe', measure: 'NB_DPE' }, { field: 'nb_a', measure: 'DPE_A' }, { field: 'nb_b', measure: 'DPE_B' }, { field: 'nb_c', measure: 'DPE_C' },
        { field: 'nb_d', measure: 'DPE_D' }, { field: 'nb_e', measure: 'DPE_E' }, { field: 'nb_f', measure: 'DPE_F' }, { field: 'nb_g', measure: 'DPE_G' },
      ],
      labels: mesure({ NB_DPE: 'Diagnostics valides', DPE_A: 'Étiquette A', DPE_B: 'Étiquette B', DPE_C: 'Étiquette C', DPE_D: 'Étiquette D', DPE_E: 'Étiquette E', DPE_F: 'Étiquette F', DPE_G: 'Étiquette G' }),
    },
  },
  {
    id: 'caf_prestations', provider: 'ods', label: 'Allocataires CAF par prestation (communal)',
    description: "CAF (data.caf.fr), toutes prestations, décembre de chaque année 2020-2024 : nombre de foyers allocataires et de personnes couvertes par commune, et foyers bénéficiaires des allocations familiales, du complément familial, de l'allocation de soutien familial, de la PAJE (allocation de base, complément de libre choix du mode de garde), des aides au logement (APL, ALS, ALF), du RSA et de la prime d'activité. Les effectifs sont arrondis à 5.",
    themes: ['cohesion'], doc_url: 'https://data.caf.fr/explore/dataset/s_ben_com_f/',
    link: [{ theme: 'cohesion', re: /minima sociaux|allocataires|aides sociales/ }],
    config: {
      base: 'https://data.caf.fr', dataset: 's_ben_com_f', levels: { COM: 'numcomdo' },
      columns: [
        { field: 'indfoy_ndur', measure: 'FOYERS_ALLOCATAIRES' }, { field: 'indnbp_ndur', measure: 'PERSONNES_COUVERTES' },
        { field: 'indfoy_af', measure: 'FOYERS_AF' }, { field: 'indfoy_cf', measure: 'FOYERS_CF' }, { field: 'indfoy_asf', measure: 'FOYERS_ASF' },
        { field: 'indfoy_ab', measure: 'FOYERS_PAJE_BASE' }, { field: 'indfoy_cmg', measure: 'FOYERS_CMG' },
        { field: 'indfoy_apl', measure: 'FOYERS_APL' }, { field: 'indfoy_als', measure: 'FOYERS_ALS' }, { field: 'indfoy_alf', measure: 'FOYERS_ALF' },
        { field: 'indfoy_rsa', measure: 'FOYERS_RSA' }, { field: 'indfoy_ppa', measure: 'FOYERS_PPA' },
      ],
      queries: [{ periodField: 'dtreffre', periodYear: true }],
      labels: mesure({
        FOYERS_ALLOCATAIRES: 'Foyers allocataires (toutes prestations)', PERSONNES_COUVERTES: 'Personnes couvertes par une prestation',
        FOYERS_AF: 'Foyers percevant des allocations familiales', FOYERS_CF: 'Foyers percevant le complément familial', FOYERS_ASF: "Foyers percevant l'allocation de soutien familial",
        FOYERS_PAJE_BASE: "Foyers percevant l'allocation de base de la PAJE", FOYERS_CMG: 'Foyers percevant le complément de libre choix du mode de garde',
        FOYERS_APL: 'Foyers percevant l’APL', FOYERS_ALS: 'Foyers percevant l’ALS', FOYERS_ALF: 'Foyers percevant l’ALF', FOYERS_RSA: 'Foyers au RSA', FOYERS_PPA: 'Foyers percevant la prime d’activité',
      }),
    },
  },
  {
    id: 'ips_ecoles', provider: 'ips', label: 'Indice de position sociale des écoles (IPS)',
    description: "Éducation nationale : indice de position sociale (IPS) des écoles, rentrées 2022 à aujourd'hui. L'IPS résume le niveau socio-économique des familles des élèves (plus il est élevé, plus le milieu est favorisé ; la moyenne nationale est d'environ 105). Moyenne des écoles de la commune, non pondérée par les effectifs, par secteur public et privé. Mesure la mixité sociale scolaire.",
    themes: ['cohesion'], doc_url: 'https://data.education.gouv.fr/explore/dataset/fr-en-ips-ecoles-ap2022/',
    link: [{ theme: 'cohesion', re: /mixite|position sociale|ips/ }],
    config: {
      labels: {
        ...mesure({ IPS_MOYEN: "IPS moyen des écoles", NB_ECOLES: "Écoles prises en compte" }),
        SECTEUR: { label: 'Secteur', values: { _T: 'Public et privé', public: 'Public', prive: 'Privé' } },
      },
    },
  },
];
