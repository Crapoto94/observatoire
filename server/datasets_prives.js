// Jeux NON PUBLICS : sources à accès habilité (clé délivrée à la Ville). `prive: true` les signale partout dans
// l'interface (catalogue, données, KPI, indicateurs) : les valeurs ne doivent pas être diffusées telles quelles.
const mesure = (values) => ({ MESURE: { label: 'Mesure', values } });

module.exports = [
  {
    id: 'associations_api', provider: 'apientreprise', prive: true,
    label: 'Vie associative : adhérents, bénévoles, salariés, comptes (API Entreprise, non public)',
    description: "API Entreprise (DINUM), fiches « association » de la DJEPVA (Le Compte Asso, RNA, Sirene), accès habilité réservé à la Ville. Pour chaque association active dont le siège est dans la commune : objet social, ressources humaines déclarées (adhérents, bénévoles, salariés, volontaires), comptes (subventions, dons, produits, charges), agréments, affiliation à un réseau. Seuls des agrégats communaux sont stockés (aucune donnée nominative). Les chiffres retenus sont ceux du siège ; les têtes de réseau nationales domiciliées dans la commune (plusieurs établissements ailleurs, ou plus de 20 000 adhérents) sont exclues des totaux et comptées à part. Les ressources humaines et les comptes ne sont connus que pour les associations qui les ont déclarés (demandes de subvention via Le Compte Asso) : ce sont des minima. Unité d'analyse : les associations dont le siège est dans la commune (pour comparer, celles dont le siège est dans la commune comparée). Ivry-sur-Seine par défaut ; autres communes via API_ENTREPRISE_COMMUNES.",
    themes: ['cohesion'], doc_url: 'https://entreprise.api.gouv.fr/catalogue/djepva/associations',
    link: [{ groupe: 'vie-associative', re: /associations par type|adherents|benevoles|nb de salaries|evolution du nombre de salaries/ }],
    config: {
      communes: ['94041'], timeoutMs: 10 * 60000,
      labels: {
        ...mesure({
          NB_ASSOCIATIONS: 'Associations actives dont le siège est dans la commune', NB_FICHES: 'Associations décrites par l’API (par objet social)',
          NB_RH_DECLAREES: 'Associations ayant déclaré leurs ressources humaines', NB_COMPTES_DECLARES: 'Associations ayant déclaré leurs comptes',
          NB_EMPLOYEUSES: 'Associations employeuses (tranche d’effectif Sirene)', NB_RUP: 'Associations reconnues d’utilité publique', NB_AGREMENTS: 'Associations agréées',
          NB_TETES_RESEAU: 'Têtes de réseau nationales domiciliées dans la commune (exclues des totaux)', NB_AFFILIEES: 'Associations affiliées à une fédération ou un réseau', NB_SUBVENTIONNEES: 'Associations ayant perçu une subvention (comptes déclarés)',
          ADHERENTS: 'Adhérents déclarés', BENEVOLES: 'Bénévoles déclarés', SALARIES: 'Salariés déclarés', SALARIES_ETPT: 'Salariés en équivalent temps plein travaillé',
          VOLONTAIRES: 'Volontaires (service civique…)', EMPLOIS_AIDES: 'Emplois aidés', SUBVENTIONS: 'Subventions perçues (€, dernier exercice déclaré)',
          DONS: 'Dons (€)', PRODUITS: 'Total des produits (€)', CHARGES: 'Total des charges (€)',
        }),
        OBJET: { label: 'Objet social', values: { _T: 'Tous objets' } },
        CHAMP: { label: 'Champ d’action territorial', values: { _T: 'Tous', local: 'Local', 'départemental': 'Départemental', 'régional': 'Régional', national: 'National', international: 'International', 'non renseigné': 'Non renseigné' } },
      },
    },
  },
  {
    id: 'subventions_asso', provider: 'apisubventions', prive: true,
    label: 'Subventions publiques aux associations (API Entreprise, Data Subvention, non public)',
    description: "API Entreprise (DINUM), Data Subvention, accès habilité réservé à la Ville. Pour les associations actives dont le siège est dans la commune (têtes de réseau nationales exclues) : demandes de subvention (montants demandés et accordés, statut) et versements, par année, financeur et politique publique. Financeurs couverts : l'État et ses opérateurs (Chorus, Osiris dont l'Agence nationale du sport, Dauphin pour la politique de la ville, Fonjep) et les collectivités qui publient leurs subventions au format SCDL (Région Île-de-France, Ville de Paris…). Les subventions des autres financeurs, dont souvent celles de la Ville, n'y figurent pas : montants minimaux. Le fournisseur renvoie une erreur persistante pour environ un quart des associations (non renseignées, nouvel essai chaque semaine). Ivry-sur-Seine par défaut ; autres communes via API_ENTREPRISE_COMMUNES.",
    themes: ['cohesion'], doc_url: 'https://entreprise.api.gouv.fr/catalogue/data_subvention/subventions',
    link: [],
    config: {
      communes: ['94041'], timeoutMs: 25 * 60000,
      labels: {
        ...mesure({
          MONTANT_VERSE: 'Montants versés (€, année du versement)', MONTANT_ACCORDE: 'Montants accordés (€, année d’exercice)', MONTANT_DEMANDE: 'Montants demandés (€)',
          NB_DEMANDES: 'Demandes de subvention', NB_DECIDEES: 'Demandes instruites (accordées ou refusées)', NB_ACCORDEES: 'Demandes accordées',
          NB_ASSOCIATIONS_SOUTENUES: 'Associations ayant reçu un versement ou un accord',
        }),
        FINANCEUR: { label: 'Financeur', values: { _T: 'Tous financeurs couverts', ETAT: 'État et opérateurs', REGION: 'Région', DEPARTEMENT: 'Département', COMMUNE: 'Commune (siège de l’association)', EPT: 'EPT Grand-Orly Seine Bièvre', INTERCOMMUNALITE: 'Autre intercommunalité', AUTRE_COMMUNE: 'Autre commune', AUTRE: 'Autre financeur' } },
        DOMAINE: { label: 'Politique publique', values: { _T: 'Toutes', POLITIQUE_VILLE: 'Politique de la ville', SPORT: 'Sport', JEUNESSE_VIE_ASSO: 'Jeunesse, vie associative, éducation populaire', CULTURE: 'Culture', EMPLOI: 'Emploi, insertion', SOLIDARITES: 'Solidarités', INTEGRATION: 'Intégration', EGALITE: 'Égalité femmes-hommes', EDUCATION: 'Éducation', ENVIRONNEMENT: 'Environnement', SANTE: 'Santé', AUTRE: 'Autres' } },
      },
    },
  },
];
