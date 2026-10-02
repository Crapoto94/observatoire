// Jeux issus de téléchargements complets agrégés par commune à l'import : logements vacants (LOVAC), stationnements cyclables (OpenStreetMap),
// nuisances environnementales (grille de 500 m), îlots de chaleur urbains (rattachés aux communes par point dans polygone).
const DG = (id) => `https://www.data.gouv.fr/datasets/${id}/`;
const IDF = "https://data.iledefrance.fr/explore/dataset";
const mesure = (values) => ({ MESURE: { label: "Mesure", values } });

const lovacColumns = [];
for (let yy = 20; yy <= 26; yy++) {
  const period = `20${yy}`;
  lovacColumns.push({ field: `pp_vacant_${yy}`, measure: "PP_VACANT", period }, { field: `pp_vacant_plus_2ans_${yy}`, measure: "PP_VACANT_2ANS", period });
  if (yy <= 25) lovacColumns.push({ field: `ff_pp_total_${yy}`, measure: "PP_TOTAL", period });
}

module.exports = [
  {
    id: "lovac", provider: "tabular", label: "Logements vacants du parc privé (LOVAC)",
    description: "Ministère de la Transition écologique, fichier LOVAC en open data (fichiers fonciers de la DGFiP) : logements du parc privé, vacants et vacants depuis plus de deux ans, par commune, de 2020 à 2026. Le parc de référence change selon les millésimes : lire les évolutions avec prudence. Communes uniquement.",
    themes: ["logement"], doc_url: DG("61816c6e23197bb34835228e"),
    link: [{ theme: "logement", re: /vacance|logements vacants|remis sur le marche/ }],
    config: {
      sources: [{ level: "COM", resource: "2e0417b4-902d-4c60-90e7-bf5df148cb87", geoField: "CODGEO_26" }],
      columns: lovacColumns,
      labels: mesure({ PP_TOTAL: "Logements du parc privé", PP_VACANT: "Logements vacants du parc privé", PP_VACANT_2ANS: "Logements vacants depuis plus de 2 ans" }),
    },
  },
  {
    id: "velo_stationnement", provider: "tabular", label: "Stationnements cyclables (OpenStreetMap)",
    description: "Base des stationnements cyclables issus d'OpenStreetMap (data.gouv.fr) : nombre d'emplacements recensés et capacité totale par commune et type de mobilier. Données contributives : couverture variable selon les communes. Stock à la date de l'import.",
    themes: ["mobilite"], doc_url: DG("614d7cd3474124ea1fa212f1"),
    link: [{ theme: "mobilite", re: /stationnements velo/ }],
    config: {
      sources: [{ level: "COM", resource: "d04b4db1-e092-44e4-891d-b91a6ff479b8", geoField: "code_com", period: "$YEAR" }],
      sum: true, marginals: true,
      columns: [{ field: "@ONE", measure: "NB_STATIONNEMENTS" }, { field: "capacite", measure: "CAPACITE" }],
      dimFields: [{ field: "mobilier", dim: "MOBILIER" }],
      labels: { ...mesure({ NB_STATIONNEMENTS: "Emplacements de stationnement recensés", CAPACITE: "Capacité totale (places)" }), MOBILIER: { label: "Type de mobilier", values: { _T: "Tous types" } } },
    },
  },
  {
    id: "nuisances", provider: "ods", label: "Cumul de nuisances environnementales (grille de 500 m)",
    description: "Institut Paris Région : pour chaque commune, nombre de mailles de 500 m selon le nombre de nuisances cumulées (bruit, air, etc.) et présence d'un point noir environnemental. Agrégé par commune à partir de la grille régionale.",
    themes: ["environnement"], doc_url: `${IDF}/cumul-de-nuisances-environnementales-grille-regionale-au-pas-de-500m-dile-de-fra/`,
    link: [{ theme: "environnement", re: /nuisances sonores|qualite de l air|exposition/ }],
    config: {
      base: "https://data.iledefrance.fr", dataset: "cumul-de-nuisances-environnementales-grille-regionale-au-pas-de-500m-dile-de-fra",
      levels: { COM: "insee" }, marginals: true,
      columns: [{ field: "n", measure: "MAILLES_500M" }],
      queries: [{ select: "nb_nuis_po, pne, count(*) as n", groupBy: "nb_nuis_po, pne", period: "2022", dimFields: [{ field: "nb_nuis_po", dim: "NB_NUISANCES" }, { field: "pne", dim: "POINT_NOIR" }] }],
      labels: {
        ...mesure({ MAILLES_500M: "Mailles de 500 m" }),
        NB_NUISANCES: { label: "Nombre de nuisances cumulées", values: { _T: "Toutes" } },
        POINT_NOIR: { label: "Point noir environnemental", values: { _T: "Tous", 0: "Non", 1: "Oui" } },
      },
    },
  },
  {
    id: "icu", provider: "icu", label: "Îlots de chaleur urbains : aléa et vulnérabilité",
    description: "Institut Paris Région (2021) : 237 000 îlots morphologiques urbains classés en zones climatiques locales, avec aléa et vulnérabilité à la chaleur de jour et de nuit. Le fichier complet est téléchargé une fois, chaque îlot est rattaché à sa commune par son point central, puis les surfaces (hectares) sont agrégées par commune. Classe d'aléa : -1 non évalué, 1 faible à 3 fort.",
    themes: ["environnement"], doc_url: `${IDF}/ilots-de-chaleur-urbains-icu-classification-des-imu-en-zone-climatique-locale-lc/`,
    link: [{ theme: "environnement", re: /ilots de chaleur|surfaces imper/ }],
    config: {
      period: "2021",
      labels: {
        ...mesure({
          SURFACE_LCZ_HA: "Surface par zone climatique locale (ha)", SURFACE_ALEA_JOUR_HA: "Surface selon l'aléa de chaleur de jour (ha)",
          SURFACE_ALEA_NUIT_HA: "Surface selon l'aléa de chaleur de nuit (ha)", SURFACE_VULNERABILITE_JOUR_HA: "Surface selon la vulnérabilité de jour (ha)",
          SURFACE_VULNERABILITE_NUIT_HA: "Surface selon la vulnérabilité de nuit (ha)",
        }),
        LCZ: { label: "Zone climatique locale", values: { _T: "Toutes", 1: "1 Bâti compact de grande hauteur", 2: "2 Bâti compact de hauteur moyenne", 3: "3 Bâti compact de faible hauteur", 4: "4 Bâti ouvert de grande hauteur", 5: "5 Bâti ouvert de hauteur moyenne", 6: "6 Bâti ouvert de faible hauteur", 7: "7 Bâti léger de faible hauteur", 8: "8 Grands bâtiments de faible hauteur", 9: "9 Bâti dispersé", 10: "10 Industrie lourde", A: "A Arbres denses", B: "B Arbres dispersés", C: "C Buissons", D: "D Végétation basse", E: "E Roche ou sol imperméable", "E.b": "E.b Sol nu", F: "F Sol nu ou sable", G: "G Eau" } },
        CLASSE: { label: "Classe", values: { _T: "Toutes", "-1": "Non évalué" } },
      },
    },
  },
];
