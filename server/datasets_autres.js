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
];
