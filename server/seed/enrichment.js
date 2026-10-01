// Enrichissement initial des indicateurs : liens corrigés, propositions de source, liens vers les données.
// Les règles sont appliquées dans l'ordre (les suivantes écrasent les précédentes) à la création de la base.
// ⚠ Seuls les liens API Melodi (INSEE) ont été testés. Les autres liens renvoient vers la page d'accueil ou une
//   recherche du portail concerné : à confirmer avant diffusion.

const MELODI_DOC = (ds) => `https://api.insee.fr/melodi/catalog/${ds}`;
const MELODI_DATA = (ds) => `https://api.insee.fr/melodi/data/${ds}?GEO=2025-COM-94041&maxResult=1000`;
const DG = (q) => `https://www.data.gouv.fr/datasets?q=${encodeURIComponent(q)}`;

const SHEET = {
  demo: 'demographie',
  emploi: 'emploi economie',
  cohesion: 'cohesion sociale santé',
  mobilite: 'Mobilite',
  logement: 'Logement urbanisme',
  env: 'Env et STE',
};

const RP_NOTE = 'Le classeur cite le recensement 2022 ; le millésime 2023 est disponible via l\'API Melodi.';

// [onglet, ligne(s) Excel, niveaux|null, regex libellé normalisé|null, champs]
const RULES = [
  // ---------------- Démographie ----------------
  [SHEET.demo, [2, 3, 4, 5], null, null, {
    lien_corrige: MELODI_DOC('DS_RP_TD_POPULATION_AGESEX_PRINC'),
    lien_donnees: MELODI_DATA('DS_RP_TD_POPULATION_AGESEX_PRINC'),
    proposition: `Le lien cité mène à « Évolution et structure de la population en 2022 » : le tableau « 6822 » n'y est pas confirmé. Utiliser POP1 (population par sexe et âge quinquennal). ${RP_NOTE}`,
  }],
  [SHEET.demo, [4], null, /natalite/, {
    lien_corrige: 'https://www.insee.fr/fr/statistiques/1893255',
    lien_donnees: MELODI_DATA('DS_ETAT_CIVIL_NAIS_COMMUNES'),
    proposition: 'La source citée (population par âge) ne contient pas les naissances. Utiliser « Naissances de 2008 à 2025 » (état civil).',
  }],
  [SHEET.demo, [5], null, /mortalite/, {
    lien_corrige: MELODI_DOC('DS_ETAT_CIVIL_DECES_COMMUNES'),
    lien_donnees: MELODI_DATA('DS_ETAT_CIVIL_DECES_COMMUNES'),
    proposition: 'La source citée (population par âge) ne contient pas les décès. Utiliser « Décès de 2008 à 2025 » (état civil).',
  }],
  [SHEET.demo, [4], null, /attractivite/, {
    lien_corrige: MELODI_DOC('DS_RP_MIGRES_PRINC'),
    lien_donnees: MELODI_DATA('DS_RP_MIGRES_PRINC'),
    proposition: 'Arrivées/départs : utiliser les migrations résidentielles (résidence un an auparavant), pas la structure par âge.',
  }],
  [SHEET.demo, [4], null, /non scolarises|besoins scolaires/, {
    lien_corrige: MELODI_DOC('DS_RP_TD_EDUCATION_PRINC'),
    lien_donnees: MELODI_DATA('DS_RP_TD_EDUCATION_PRINC'),
    proposition: 'Scolarisation par âge : tableau FOR1.',
  }],
  [SHEET.demo, [6], null, null, {
    lien_corrige: MELODI_DOC('DS_RP_TD_MENAGES_TPH_COMP'),
    lien_donnees: MELODI_DATA('DS_RP_TD_MENAGES_TPH_COMP'),
    proposition: `Millésime 2023 disponible (MEN5/MEN6). ${RP_NOTE}`,
  }],
  [SHEET.demo, [7], null, null, {
    lien_corrige: MELODI_DOC('DS_RP_TD_NAT_AGESEX_PRINC'),
    lien_donnees: MELODI_DATA('DS_RP_TD_NAT_AGESEX_PRINC'),
    proposition: 'IMG1A décrit les immigrés (situation quant à l\'immigration), pas les étrangers (nationalité). Pour la « part d\'étrangers », utiliser NAT1 (population par sexe, âge et nationalité).',
  }],
  [SHEET.demo, [8], null, null, {
    lien_donnees: MELODI_DATA('DS_ETAT_CIVIL_NAIS_COMMUNES'),
    proposition: 'Le lien cité couvre désormais « Naissances de 2008 à 2025 » (libellé du classeur : 2024). Le solde naturel suppose aussi les décès (Décès de 2008 à 2025).',
  }],
  [SHEET.demo, [9], null, null, {
    lien_donnees: MELODI_DATA('DS_POPULATIONS_HISTORIQUES'),
    proposition: 'Dossier complet désormais au millésime 2023 (publié le 27/08/2026). Les tableaux « POP T2M » ne sont pas retrouvés sur la page : à vérifier. Populations historiques 1968-2023 disponibles via Melodi.',
  }],
  [SHEET.demo, [10], null, null, {
    lien_corrige: MELODI_DOC('DS_RP_TD_MENAGES_NOC_COMP'),
    lien_donnees: MELODI_DATA('DS_RP_TD_MENAGES_NOC_COMP'),
    proposition: `Millésime 2023 disponible (MEN4). ${RP_NOTE}`,
  }],

  // ---------------- Emploi et revenus ----------------
  [SHEET.emploi, [2, 3], null, null, {
    lien_corrige: MELODI_DOC('DS_RP_EMPLOI_LR_PRINC'),
    lien_donnees: MELODI_DATA('DS_RP_EMPLOI_LR_PRINC'),
    proposition: RP_NOTE,
  }],
  [SHEET.emploi, [3], null, /creations fermetures/, {
    lien_corrige: MELODI_DOC('DS_SIDE_CREA_COM'),
    lien_donnees: MELODI_DATA('DS_SIDE_CREA_COM'),
    proposition: 'Absent de la source citée (recensement). Utiliser les créations d\'établissements Sirene/SIDE (et les stocks pour les fermetures).',
  }],
  [SHEET.emploi, [3], null, /demandeurs d emploi/, {
    lien_corrige: 'https://statistiques.francetravail.org/',
    lien_donnees: 'https://statistiques.francetravail.org/',
    proposition: 'Absent de la source citée (recensement). Source : France Travail, statistiques et analyses par commune (catégories A, B, C). Import à développer.',
  }],
  [SHEET.emploi, [4], null, null, {
    lien_corrige: MELODI_DOC('DS_RP_TD_POPULATION_PCSAGESEX_COMP'),
    lien_donnees: MELODI_DATA('DS_RP_TD_POPULATION_PCSAGESEX_COMP'),
    proposition: RP_NOTE,
  }],
  [SHEET.emploi, [5, 6], null, null, {
    lien_corrige: MELODI_DOC('DS_FILOSOFI_CC'),
    lien_donnees: MELODI_DATA('DS_FILOSOFI_CC'),
    proposition: 'Le lien cité est le millésime Filosofi 2021 ; le millésime 2023 figure au catalogue Melodi (jeu « Niveau de vie, taux de pauvreté… en 2023 »).',
  }],
  [SHEET.emploi, [6], null, /minima sociaux/, {
    lien_corrige: 'https://data.caf.fr/',
    lien_donnees: 'https://data.caf.fr/',
    proposition: 'Absent de Filosofi. Source : CAF (RSA, AAH, prime d\'activité par commune). Import à développer.',
  }],
  [SHEET.emploi, [6], null, /qpv/, {
    lien_donnees: DG('Filosofi QPV revenus quartiers prioritaires'),
    proposition: 'Absent du jeu communal Filosofi : prendre Filosofi niveau QPV (ANCT/INSEE).',
  }],
  [SHEET.emploi, [6], null, /contrats precaires/, {
    lien_donnees: MELODI_DATA('DS_RP_TD_ACTIVITE_PCSACTIVITY_COMP'),
    proposition: 'Absent de Filosofi. Source : recensement, statut et condition d\'emploi (tableaux ACT/EMP).',
  }],
  [SHEET.emploi, [7], null, null, {
    lien_donnees: MELODI_DATA('DS_RP_EMPLOI_LT_PRINC'),
    proposition: 'Emploi au lieu de travail (Melodi) ; le tableau « EMP T5 » du dossier complet n\'a pas été retrouvé sur la page.',
  }],
  [SHEET.emploi, [8, 9, 10, 11, 12, 13, 14, 15], null, null, {
    proposition: 'Sources AGDE/EPT sans lien : préciser le producteur (acronyme AGDE à définir), le jeu de données et la périodicité. Complément national : stocks et créations Sirene (SIDE).',
  }],
  [SHEET.emploi, [8, 9, 11, 12, 14, 15], null, null, {
    lien_donnees: MELODI_DATA('DS_SIDE_STOCKS_COM'),
  }],
  [SHEET.emploi, [10, 13], null, null, {
    proposition: 'Vacance commerciale : source à définir (AGDE/EPT, DGFiP locaux vacants, CCI Paris Île-de-France). Pas de source nationale communale ouverte identifiée.',
    lien_donnees: null,
  }],
  [SHEET.emploi, [14], null, null, {
    proposition: 'ESS : Observatoire national de l\'ESS (CRESS Île-de-France). Un jeu « L\'économie sociale et solidaire » existe sur Melodi mais ne renvoie rien pour la commune.',
    lien_donnees: null,
  }],

  // ---------------- Cohésion sociale et santé ----------------
  [SHEET.cohesion, [2], null, null, {
    lien_donnees: MELODI_DATA('DS_FILOSOFI_CC'),
    proposition: 'Taux de pauvreté : Filosofi 2023 (Melodi). Aides sociales : CAF / CCAS. IDSL : indice local, pas de source nationale (à calculer ou à demander au Département).',
  }],
  [SHEET.cohesion, [3], null, null, {
    lien_donnees: MELODI_DATA('DS_RP_LOGEMENT_PRINC'),
    proposition: 'Part des ménages en logement social : recensement (statut d\'occupation) et RPLS. Demandes/attributions : Système national d\'enregistrement (SNE), DRIHL.',
  }],
  [SHEET.cohesion, [4], null, null, {
    lien_donnees: MELODI_DATA('DS_RP_LOGEMENT_PRINC'),
    proposition: 'Sur-occupation : recensement (tableaux logement). Impayés de loyers/énergie : CCAS, fonds de solidarité logement du Département, bailleurs. Non-recours : CCAS/CAF.',
  }],
  [SHEET.cohesion, [5], null, null, {
    lien_donnees: MELODI_DATA('DS_BPE'),
    proposition: 'Équipements : Base permanente des équipements (INSEE) + calcul d\'isochrones (10 min). Fréquentation : données internes de la ville.',
  }],
  [SHEET.cohesion, [6, 7, 8], null, null, {
    lien_donnees: DG('répertoire national des associations RNA'),
    proposition: 'Associations : Répertoire national des associations (data.gouv). Adhérents/bénévoles : service vie associative (dossiers de subvention). Salariés : URSSAF/CRESS.',
  }],
  [SHEET.cohesion, [9, 10], null, null, {
    lien_donnees: 'https://data.ameli.fr/',
    proposition: 'CMU/C2S, AME, ALD : Assurance maladie (data.ameli.fr), CPAM, ORS Île-de-France. Souvent disponible seulement au niveau départemental.',
  }],
  [SHEET.cohesion, [11, 13], null, null, {
    lien_donnees: 'https://cartosante.atlasante.fr/',
    proposition: 'Offre de soins, praticiens, densité médicale : Cartosanté / DREES (APL), RPPS, ARS. Équipements de santé : BPE.',
  }],
  [SHEET.cohesion, [12], null, null, {
    proposition: '« Indice déterminant de santé » : indicateur à définir (je ne vois pas à quoi il correspond) ; source à préciser.',
  }],

  // ---------------- Mobilité ----------------
  [SHEET.mobilite, [2], null, null, {
    lien_donnees: MELODI_DATA('DS_RP_TD_NAVETTES_SEXTRANSPORT_COMP'),
    proposition: 'Part modale domicile-travail : recensement (NAV2). Part modale tous déplacements : enquête globale transport (Île-de-France Mobilités). Stationnements vélo : base nationale des stationnements cyclables, ville/EPT.',
  }],
  [SHEET.mobilite, [3], null, null, {
    lien_donnees: MELODI_DATA('DS_RP_LOGEMENT_PRINC'),
    proposition: 'Motorisation : recensement (voitures par ménage). Trafic : Département du Val-de-Marne / DRIEAT / comptages ville. Émissions : Airparif.',
  }],
  [SHEET.mobilite, [4], null, null, {
    lien_donnees: DG('accidents corporels de la circulation routière'),
    proposition: 'Temps de trajet : non fourni par le recensement (croiser les flux domicile-travail et un calcul d\'itinéraires, ou enquête transport). Accidents : fichier ONISR (BAAC).',
  }],
  [SHEET.mobilite, [5], null, null, {
    lien_donnees: 'https://data.iledefrance-mobilites.fr/',
    proposition: 'Fréquentation des lignes : Île-de-France Mobilités (open data). Accessibilité : isochrones sur données GTFS.',
  }],

  // ---------------- Logement et urbanisme ----------------
  [SHEET.logement, [2], null, null, {
    lien_donnees: MELODI_DATA('DS_RP_LOGEMENT_PRINC'),
    proposition: 'Parc : recensement. Logements commencés/achevés : Sit@del2 (SDES). PPPI : ANAH. Adéquation : croisement recensement + demande SNE.',
  }],
  [SHEET.logement, [3], null, null, {
    lien_donnees: 'https://www.demande-logement-social.gouv.fr/',
    proposition: 'SRU : inventaire annuel DRIHL. Demandes/attributions : SNE. Parc social : RPLS (SDES).',
  }],
  [SHEET.logement, [4], null, null, {
    lien_donnees: MELODI_DATA('DS_RP_LOGEMENT_PRINC'),
    proposition: 'Vacance : recensement + fichier LOVAC (logements vacants).',
  }],
  [SHEET.logement, [5], null, null, {
    lien_donnees: 'https://app.dvf.etalab.gouv.fr/',
    proposition: 'Prix : Demandes de valeurs foncières (DGFiP). Loyers : Observatoire des loyers de l\'agglomération parisienne. DIA : registre interne de la ville.',
  }],
  [SHEET.logement, [6], null, null, {
    proposition: 'Foncier : MOS de l\'IAU-îdF, fichiers fonciers (Cerema). Permis : Sit@del2 (SDES).',
    lien_donnees: 'https://www.institutparisregion.fr/',
  }],
  [SHEET.logement, [7], null, null, {
    proposition: 'Programmes livrés/prévus : Sit@del2, ville/EPT, promoteurs. Densité nette : calcul à partir du MOS.',
    lien_donnees: null,
  }],

  // ---------------- Environnement ----------------
  [SHEET.env, [2], null, null, {
    lien_donnees: 'https://www.airparif.fr/',
    proposition: 'Airparif (qualité de l\'air, inventaire des émissions de GES par commune).',
  }],
  [SHEET.env, [3, 4], null, null, {
    lien_donnees: 'https://www.institutparisregion.fr/',
    proposition: 'Espaces verts, arbres : SIG de la ville, MOS de l\'IAU-îdF. Îlots de chaleur : cartes ICU de l\'IAU-îdF.',
  }],
  [SHEET.env, [5], null, null, {
    lien_donnees: 'https://data.enedis.fr/',
    proposition: 'Énergie : SDES (consommations communales), Enedis, patrimoine communal. Énergies renouvelables : registre des installations (ODRE).',
  }],
  [SHEET.env, [6], null, null, {
    lien_donnees: 'https://www.bruitparif.fr/',
    proposition: 'Bruit : Bruitparif (cartes stratégiques de bruit).',
  }],
  [SHEET.env, [7, 8], null, null, {
    lien_donnees: 'https://artificialisation.developpement-durable.gouv.fr/',
    proposition: 'Artificialisation, étalement, imperméabilité : portail de l\'artificialisation (Cerema), OCS GE (IGN), MOS.',
  }],
  [SHEET.env, [9], null, null, {
    lien_donnees: 'https://www.sinoe.org/',
    proposition: 'Déchets : SINOE (ADEME), EPT Grand-Orly Seine Bièvre (compétence déchets).',
  }],

  // ---------------- Cas particuliers ----------------
  [SHEET.mobilite, [2], ['evaluation'], /stationnements velo/, {
    notes: 'Incohérence : en « évaluation » dans le classeur, en « suivi » dans la carte mentale.',
  }],
];

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function enrich(ind) {
  const out = {};
  const lib = norm(ind.libelle);
  for (const [sheet, rows, levels, re, fields] of RULES) {
    if (ind.excel_sheet !== sheet) continue;
    if (rows && !rows.includes(ind.excel_row)) continue;
    if (levels && !levels.includes(ind.niveau)) continue;
    if (re && !re.test(lib)) continue;
    Object.assign(out, fields);
  }
  if (ind.niveau === 'prospective') {
    out.proposition = 'Indicateur de projection : pas de source directe. À produire à partir des indicateurs de contexte et de suivi (projections INSEE Omphale à l\'échelle supra-communale, ou modèle local).';
    out.lien_donnees = null;
  }
  return out;
}

// ---------------- Origine de la donnée et cartographie ----------------
// origine : 'externe' (produite hors collectivité : INSEE, État, opérateurs), 'interne' (uniquement dans les SI de la collectivité),
//           'mixte' (source externe à compléter par les SI de la collectivité).
// cartographie : 'oui' (donnée géolocalisée ou à maille fine), 'possible' (agrégeable à une maille infra-communale : IRIS, quartier), 'non'.
const ORIGINE_RULES = [
  [/logements? vacants|^vacance$|vacance des logements|remis sur le marche/, 'externe'],
  [/frequentation des equipements|signalements? impayes|nb d adherents|nb de benevoles|nb de salaries|nombre de salaries|beneficiaires et publics|rayonnement|impact local|dia|nombre d arbres|consommations d energie communale|programmes livres|livraisons prevues|projets de construction/, 'interne'],
  [/demandes|attributions|non recours|aides sociales|developpement social|equipements|vacance|foncier|mutabilite|densite nette|permis de construire|stationnements velo|trafic routier|accessibilite en transports|poles majeurs|nouvelles liaisons|ilots de chaleur|espaces verts|adequation|surfaces a preserver|desimperm|nb d associations|temps moyen/, 'mixte'],
];
const CARTO_OUI = /stationnements velo|trafic routier|accidents|equipements|accessibilite|ilots de chaleur|nuisances sonores|espaces verts|arbres|imperm|foncier|mutabilite|densite nette|programmes|projets de construction|livraisons|permis|dia|indignes|logements sociaux|offre de soins|praticiens|densite medicale|nb de commerces|commerces|locaux|entreprises|qualite de l air|prix|loyers|batiments|etalement|espaces naturels|surfaces|nb de structures ess|nb d associations|poles majeurs|liaisons/;
const CARTO_NON = /solde naturel|solde migratoire|evolution annuelle de la population|taux de natalite|taux de mortalite|attractivite|indice de developpement|non recours|ges par habitant|gaz a effet de serre|emissions de gaz|production de dechets|part des dechets|biodechets|tri des dechets|sru|objectifs sru|rapport entre|part de la population concernee/;
const CARTO_POSSIBLE = /population|pyramide|age|menages|taux|revenu|pauvrete|bas revenus|chomage|activite|csp|emplois|parc de logements|logements|energetique|consommation|emissions|associations|beneficiaires|ald|cmu|dechets|part modale|motorisation|attractivite|salaries|adherents|etrangers|monoparentaux|minima sociaux|contrats precaires|indice/;

function classify(ind) {
  const lib = norm(ind.libelle);
  let origine = 'externe';
  for (const [re, v] of ORIGINE_RULES) if (re.test(lib)) { origine = v; break; }
  let carto = 'non';
  if (ind.niveau === 'prospective') {
    carto = /secteurs|surfaces|foncier|batiments|liaisons|identification/.test(lib) ? 'possible' : 'non';
  } else if (CARTO_NON.test(lib)) carto = 'non';
  else if (CARTO_OUI.test(lib)) carto = 'oui';
  else if (CARTO_POSSIBLE.test(lib)) carto = 'possible';
  return { origine, cartographie: carto };
}

module.exports = { enrich, norm, classify };
