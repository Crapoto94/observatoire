// Jeux « construction » (SDES, Sit@del2, fichiers CSV) et « énergie / mobilité électrique » (Agence ORE, Data Fair).
// Tous testés sur Ivry-sur-Seine (94041) et sur l'ensemble des communes d'Île-de-France.
const mesure = (values) => ({ MESURE: { label: "Mesure", values } });
const ORE = "https://opendata.agenceore.fr/data-fair/api/v1/datasets";

module.exports = [
  {
    id: "sitadel", provider: "dido", label: "Construction de logements (Sit@del2)",
    description: "SDES, base Sit@del2 : autorisations d'urbanisme créant des logements (permis de construire et déclarations préalables), téléchargées en CSV puis agrégées par année à l'import : logements autorisés (date d'autorisation), commencés (ouverture de chantier), achevés (déclaration d'achèvement), logements sociaux autorisés, nombre d'autorisations. Communes, départements, régions. L'année en cours est partielle.",
    themes: ["logement"], doc_url: "https://www.statistiques.developpement-durable.gouv.fr/catalogue?page=dataset&datasetId=6513f0189d7d312c80ec5b5b",
    link: [{ theme: "logement", re: /logements commences|production de logement|permis de construire|programmes livres/ }],
    config: {
      dataset: "6513f0189d7d312c80ec5b5b", rid: "8b35affb-55fc-4c1f-915b-7750f974446a",
      labels: {
        ...mesure({
          LGT_AUTORISES: "Logements autorisés (année d'autorisation)", LGT_COMMENCES: "Logements commencés (année d'ouverture de chantier)",
          LGT_ACHEVES: "Logements achevés (année de la déclaration d'achèvement)", LGT_SOCIAUX_AUTORISES: "Logements locatifs sociaux autorisés",
          LGT_DEMOLIS: "Logements démolis (autorisations de l'année)", NB_AUTORISATIONS: "Autorisations d'urbanisme créant des logements",
        }),
        TYPE_LOGEMENT: { label: "Type de logement", values: { _T: "Total", INDIVIDUEL: "Individuels", COLLECTIF: "Collectifs (y compris résidences)" } },
        TYPE_DAU: { label: "Type d'autorisation", values: { _T: "Total", PC: "Permis de construire", DP: "Déclaration préalable", PA: "Permis d'aménager" } },
      },
    },
  },
  {
    id: "ore_conso", provider: "datafair", label: "Consommation d'électricité et de gaz par commune",
    description: "Agence ORE (Enedis, GRDF et distributeurs locaux) : consommation annuelle d'électricité et de gaz par commune, secteur (résidentiel, tertiaire, industrie, agriculture) et année, de 2011 à 2024. Valeurs en MWh. Communes, départements, régions.",
    themes: ["environnement"], doc_url: `${ORE}/noxwlxv702-ohfyt76f-a3y9`,
    link: [{ theme: "environnement", re: /consommation energetique|consommations d energie|renovation energetique/ }],
    config: {
      dataset: "noxwlxv702-ohfyt76f-a3y9", levels: { COM: "code_commune", DEP: "code_departement", REG: "code_region" },
      select: ["code_commune", "annee", "filiere", "code_grand_secteur", "conso_totale_mwh", "nb_sites"],
      periodField: "annee", sum: true, marginals: true,
      columns: [{ field: "conso_totale_mwh", measure: "CONSO_MWH" }, { field: "nb_sites", measure: "NB_SITES" }],
      dimFields: [{ field: "filiere", dim: "FILIERE" }, { field: "code_grand_secteur", dim: "SECTEUR" }],
      labels: {
        ...mesure({ CONSO_MWH: "Consommation (MWh)", NB_SITES: "Nombre de sites de consommation" }),
        FILIERE: { label: "Énergie", values: { _T: "Électricité et gaz", Electricité: "Électricité", Gaz: "Gaz" } },
        SECTEUR: { label: "Secteur", values: { _T: "Tous secteurs", RESIDENTIEL: "Résidentiel", TERTIAIRE: "Tertiaire", INDUSTRIE: "Industrie", AGRICULTURE: "Agriculture", INCONNU: "Non classé" } },
      },
    },
  },
  {
    id: "ore_parc_auto", provider: "datafair", label: "Voitures particulières immatriculées par commune",
    description: "Agence ORE : stock trimestriel de voitures particulières immatriculées dans la commune (depuis le 4e trimestre 2020), dont véhicules rechargeables électriques et au gaz. Communes uniquement.",
    themes: ["mobilite"], doc_url: `${ORE}/h1alt47wy0mt88lu6ybebjf-`,
    link: [{ theme: "mobilite", re: /motorisation|emissions/ }],
    config: {
      dataset: "h1alt47wy0mt88lu6ybebjf-", levels: { COM: "codgeo" },
      select: ["codgeo", "date_arrete", "nb_vp", "nb_vp_rechargeables_el", "nb_vp_rechargeables_gaz"], periodField: "date_arrete",
      columns: [{ field: "nb_vp", measure: "VP" }, { field: "nb_vp_rechargeables_el", measure: "VP_ELECTRIQUES" }, { field: "nb_vp_rechargeables_gaz", measure: "VP_GAZ" }],
      labels: mesure({ VP: "Voitures particulières", VP_ELECTRIQUES: "Voitures rechargeables électriques", VP_GAZ: "Voitures rechargeables au gaz" }),
    },
  },
  {
    id: "ore_irve", provider: "datafair", label: "Points de recharge pour véhicules électriques (IRVE)",
    description: "Agence ORE, à partir du fichier consolidé data.gouv.fr des infrastructures de recharge : nombre de points de recharge de la commune, selon l'année de mise en service et le type d'implantation (voirie, parking public, etc.). Communes uniquement.",
    themes: ["mobilite", "environnement"], doc_url: `${ORE}/ehixq-fg4tjp8zbcdayorvqt`,
    link: [{ theme: "mobilite", re: /motorisation|emissions/ }],
    config: {
      dataset: "ehixq-fg4tjp8zbcdayorvqt", levels: { COM: "code_insee_commune" },
      select: ["code_insee_commune", "implantation_station", "date_mise_en_service"], periodField: "date_mise_en_service", periodYear: true,
      count: { measure: "PDC_MIS_EN_SERVICE" }, dimFields: [{ field: "implantation_station", dim: "IMPLANTATION" }],
      labels: { ...mesure({ PDC_MIS_EN_SERVICE: "Points de recharge mis en service" }), IMPLANTATION: { label: "Implantation", values: {} } },
    },
  },
];
