// Jeux NON PUBLICS : sources à accès habilité (clé délivrée à la Ville). `prive: true` les signale partout dans
// l'interface (catalogue, données, KPI, indicateurs) : les valeurs ne doivent pas être diffusées telles quelles.
const mesure = (values) => ({ MESURE: { label: 'Mesure', values } });

module.exports = [
  {
    id: 'associations_api', provider: 'apientreprise', prive: true,
    label: 'Vie associative : adhérents, bénévoles, salariés, comptes (API Entreprise, non public)',
    description: "API Entreprise (DINUM), fiches « association » de la DJEPVA (Le Compte Asso, RNA, Sirene), accès habilité réservé à la Ville. Pour chaque association active dont le siège est dans la commune : objet social, ressources humaines déclarées (adhérents, bénévoles, salariés, volontaires), comptes (subventions, dons, produits, charges), agréments, licenciés des réseaux d'affiliation. Seuls des agrégats communaux sont stockés (aucune donnée nominative). Les ressources humaines et les comptes ne sont connus que pour les associations qui les ont déclarés (demandes de subvention via Le Compte Asso) : ce sont des minima. Ivry-sur-Seine uniquement.",
    themes: ['cohesion'], doc_url: 'https://entreprise.api.gouv.fr/catalogue/djepva/associations',
    link: [{ groupe: 'vie-associative', re: /associations par type|adherents|benevoles|nb de salaries|evolution du nombre de salaries|publics touches/ }],
    config: {
      communes: ['94041'], timeoutMs: 10 * 60000,
      labels: {
        ...mesure({
          NB_ASSOCIATIONS: 'Associations actives dont le siège est dans la commune', NB_FICHES: 'Associations décrites par l’API (par objet social)',
          NB_RH_DECLAREES: 'Associations ayant déclaré leurs ressources humaines', NB_COMPTES_DECLARES: 'Associations ayant déclaré leurs comptes',
          NB_EMPLOYEUSES: 'Associations employeuses (tranche d’effectif Sirene)', NB_RUP: 'Associations reconnues d’utilité publique', NB_AGREMENTS: 'Associations agréées',
          NB_ESS: 'Associations de l’économie sociale et solidaire', NB_SUBVENTIONNEES: 'Associations ayant perçu une subvention (comptes déclarés)',
          ADHERENTS: 'Adhérents déclarés', BENEVOLES: 'Bénévoles déclarés', SALARIES: 'Salariés déclarés', SALARIES_ETPT: 'Salariés en équivalent temps plein travaillé',
          VOLONTAIRES: 'Volontaires (service civique…)', EMPLOIS_AIDES: 'Emplois aidés', SUBVENTIONS: 'Subventions perçues (€, dernier exercice déclaré)',
          DONS: 'Dons (€)', PRODUITS: 'Total des produits (€)', CHARGES: 'Total des charges (€)', LICENCIES: 'Licenciés des réseaux d’affiliation (fédérations)',
        }),
        OBJET: { label: 'Objet social', values: { _T: 'Tous objets' } },
      },
    },
  },
];
