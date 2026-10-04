// Nature et formule de calcul des indicateurs de la conception, et sources identifiées pour ceux qui n'ont pas encore de données.
//  - mode_calcul : « direct » = la valeur est lue telle quelle dans un jeu (une mesure), « calcule » = ratio, différence, projection ou agrégat.
//  - formule : renseignée seulement si le champ est vide (une formule saisie à la main n'est jamais écrasée).
//  - rattachements supplémentaires (jeux importés ou couches géographiques en direct) : appliqués une seule fois (un retrait manuel est respecté).
//  - bloc « [Sources identifiées] » de la proposition : remplacé à chaque démarrage, le texte saisi avant lui est conservé.
const { all, get, run, tx } = require('./db');

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’-]/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
const MARK = '[Sources identifiées]';
const PROP_MARK = '[Données disponibles]'; // bloc géré par propositions.js, toujours placé en dernier

const POP = 'population municipale (pop_hist PMUN)';
const PER_K = `× 1 000 / ${POP}`;

// [rubrique, libellé normalisé, nature, formule, jeux importés à rattacher, couche géographique en direct]
const F = [
  // ---------------- Cohésion sociale : conditions de vie ----------------
  ['conditions-vie', /^taux de pauvrete$/, 'direct', 'Filosofi FILOSOFI_MEASURE = PR_MD60 : part des personnes dont le niveau de vie est inférieur à 60 % du niveau de vie médian national (en %).'],
  ['conditions-vie', /^evolution du taux de pauvrete$/, 'calcule', 'PR_MD60(n) − PR_MD60(n − k), en points de pourcentage (Filosofi ; millésimes 2021 et 2023 par l’API Melodi (jeu filosofi) et 2020 téléchargé depuis insee.fr (jeu filosofi_fichier) ; le KPI d’évolution combine les deux jeux). Complément annuel : évolution des foyers RSA (caf_rsa FOYERS_RSA(n) / FOYERS_RSA(n − 1) − 1).'],
  ['conditions-vie', /^indice de developpement social local$/, 'calcule', 'Type IDH-2 : moyenne de trois indices normalisés (x − min) / (max − min) : santé (espérance de vie ou indice comparatif de mortalité, ORS), éducation (part des 15 ans ou plus non scolarisés diplômés du supérieur, rp_diplomes EDUC 500T702_RP / EDUC _T), revenu (log du niveau de vie médian, Filosofi MED_SL).', ['rp_diplomes', 'filosofi']],
  ['conditions-vie', /^projection des publics en difficulte$/, 'calcule', 'Tendance linéaire (moindres carrés) sur la série des foyers RSA (caf_rsa FOYERS_RSA) et des allocataires à bas revenus, prolongée à 5 ans : V(n + h) = a + b × (n + h).', ['caf_rsa']],
  ['conditions-vie', /^nombre de beneficiaires d aides sociales$/, 'direct', 'CAF : FOYERS_ALLOCATAIRES (caf_prestations) et FOYERS_RSA (caf_rsa), en nombre de foyers ; détail par prestation (AF, APL, PPA, AAH…).'],
  ['conditions-vie', /^part des menages en logement social$/, 'calcule', 'Résidences principales louées vides dans le parc social / résidences principales × 100 : rp_logement DWELLINGS [OCS = DW_MAIN, TSH = 221] / DWELLINGS [OCS = DW_MAIN, TSH = _T] × 100.'],
  ['conditions-vie', /^evolution du nombre de menages en logement social$/, 'calcule', 'RP parc social (TSH = 221)(n) − RP parc social(n − 5) au recensement ; annuellement : RPLS LOGEMENTS_SOCIAUX(n) − LOGEMENTS_SOCIAUX(n − 1).'],
  ['conditions-vie', /^rapport entre les demandes et les attributions/, 'calcule', 'Demandes de logement social actives au 31/12 / attributions de l’année (SNE). Lecture : nombre de demandes pour une attribution.'],
  ['conditions-vie', /^besoins en logements sociaux$/, 'calcule', 'Demandes actives (SNE) − attributions annuelles − livraisons de logements sociaux programmées (Sit@del LGT_SOCIAUX_AUTORISES) ; à rapporter à l’objectif SRU (TAUX_CIBLE × résidences principales − LLS).'],
  ['conditions-vie', /^part des menages sur occupes$/, 'calcule', 'Résidences principales sur-occupées / résidences principales × 100 (norme INSEE : une pièce de séjour + une pièce par couple, par adulte hors couple et par paire d’enfants). À défaut : personnes par pièce = rp_logement DWELLINGS_POPSIZE / DWELLINGS_ROOMS (OCS = DW_MAIN).'],
  ['conditions-vie', /^signalements d impayes/, 'direct', 'Nombre annuel de signalements d’impayés (CCAPEX, commandements de payer) et d’aides FSL énergie accordées, éventuellement pour 1 000 ménages.'],
  ['conditions-vie', /^taux de non recours/, 'calcule', '1 − bénéficiaires / éligibles estimés × 100 (éligibles estimés par micro-simulation DREES / CAF ou à partir des ménages sous le seuil de pauvreté).'],
  ['conditions-vie', /^evolution du nombre de logements\/menages en sur occupation$/, 'calcule', 'Part de résidences principales sur-occupées(n) − part(n − 5), en points ; à défaut évolution du nombre de personnes par pièce (DWELLINGS_POPSIZE / DWELLINGS_ROOMS).'],
  ['conditions-vie', /^acces aux equipements/, 'calcule', 'Part de la population à moins de 10 minutes à pied (≈ 800 m) d’un équipement de chaque gamme (école, santé, culture, sport), calculée par carroyage ; approximation : équipements BPE par gamme pour 1 000 habitants. Couches en direct : équipements publics du Val-de-Marne.', [], 'cd94_ecoles'],
  ['conditions-vie', /^frequentation des equipements$/, 'calcule', 'Entrées ou inscrits annuels (SI des services) / capacité ; pour les écoles : élèves par classe = education_effectifs ELEVES / CLASSES.', ['education_effectifs']],
  ['conditions-vie', /^accesssibilite des habitants aux equipements$/, 'calcule', 'Équipements BPE (par gamme, FACILITY_DOM) pour 1 000 habitants, comparés au Val-de-Marne ; distance moyenne au plus proche équipement si carroyage disponible.'],
  ['conditions-vie', /^projection des besoins en equipements$/, 'calcule', 'Population projetée × taux d’équipement actuel (équipements BPE / 1 000 hab.) − équipements existants ; écoles : enfants de 3-10 ans projetés / effectif cible par classe − classes existantes.'],

  // ---------------- Cohésion sociale : santé ----------------
  ['sante', /^nb beneficiaires cmu et ame$/, 'direct', 'Nombre de bénéficiaires de la Complémentaire santé solidaire (C2S, ex-CMU-C) au 1er janvier (INSEE / Cnam, communes avec QPV) et de l’AME (Cnam, sur demande).'],
  ['sante', /^evolution du nombre de beneficiaires cmu et ame$/, 'calcule', 'Bénéficiaires C2S(n) / bénéficiaires C2S(n − 1) − 1, en %.'],
  ['sante', /^part de la population concernee$/, 'calcule', 'Bénéficiaires (C2S ou ALD) / population couverte par le régime général × 100.'],
  ['sante', /^besoins specifiques en matiere de sante/, 'calcule', 'Croisement des besoins (part C2S, part ALD, part des 75 ans ou plus) et de l’offre (professionnels libéraux pour 1 000 hab., sante_pro PROFESSIONNELS) ; écart à la moyenne départementale de chaque composante.'],
  ['sante', /^nb ald/, 'direct', 'Nombre de personnes en affection de longue durée (Cnam, cartographie des pathologies ; maille départementale en open data, communale sur demande à l’ORS / CPAM).'],
  ['sante', /^evolution du nombre d ald$/, 'calcule', 'Personnes en ALD(n) / personnes en ALD(n − 1) − 1, en %.'],
  ['sante', /^offre de soin$/, 'direct', 'Professionnels de santé libéraux par profession (sante_pro PROFESSIONNELS) et établissements sanitaires et sociaux (FINESS ETABLISSEMENTS par catégorie), en nombre.', ['sante_pro', 'finess'], 'cd94_centres_sante'],
  ['sante', /^evolution de l offre de soins$/, 'calcule', 'PROFESSIONNELS(n) − PROFESSIONNELS(n − 1) par profession (sante_pro, stock du jour historisé à chaque import) ; BPE domaine D (santé) entre deux millésimes.'],
  ['sante', /^rapport entre l offre et la demande en soins$/, 'calcule', 'Accessibilité potentielle localisée (APL, DREES) : consultations accessibles par habitant standardisé par âge ; approximation : médecins généralistes / population × 1 000 (sante_pro PROFESSION = GENERALISTE).', ['sante_pro']],
  ['sante', /^identification des secteurs en deficit d offre$/, 'calcule', 'Communes ou IRIS dont l’APL médecins généralistes est inférieure à 2,5 consultations par an et par habitant (seuil de zone sous-dense) ; zonage ARS (zones d’intervention prioritaire).', ['sante_pro']],
  ['sante', /^indice determinant de sante$/, 'calcule', 'Indice composite : moyenne des scores normalisés (x − min) / (max − min) de la densité médicale, de la part C2S, du taux de pauvreté (PR_MD60) et de la part des 75 ans ou plus.'],
  ['sante', /^evolution de l indice$/, 'calcule', 'Indice(n) − indice(n − 1), composantes recalculées à périmètre constant.', ['sante_pro', 'filosofi']],
  ['sante', /^nb de praticiens$/, 'direct', 'Professionnels de santé libéraux (sante_pro PROFESSIONNELS, PROFESSION = _T) ; BPE domaine D (fonctions médicales et paramédicales).', ['sante_pro']],
  ['sante', /^evolution du nombre de praticiens$/, 'calcule', 'PROFESSIONNELS(n) − PROFESSIONNELS(n − 1) ; BPE domaine D entre deux millésimes.', ['sante_pro']],
  ['sante', /^densite medicale$/, 'calcule', `Médecins généralistes libéraux (sante_pro PROFESSION = GENERALISTE) ${PER_K} ; idem par spécialité.`],

  // ---------------- Cohésion sociale : vie associative ----------------
  ['vie-associative', /^nb d associations par type$/, 'direct', 'Associations actives dont le siège est à Ivry, par objet social (API Entreprise, jeu associations_api MESURE = NB_FICHES par OBJET, non public) ; stock tous établissements : jeu entreprises MESURE = ASSOCIATIONS.', ['associations_api']],
  ['vie-associative', /^beneficiaires et publics touches$/, 'direct', 'Nombre de bénéficiaires déclarés dans les dossiers de subvention et bilans d’activité (SI de la collectivité) ; l’API Entreprise ne fournit pas les publics touchés.'],
  ['vie-associative', /^rayonnement/, 'calcule', 'Adhérents non ivryens / adhérents × 100 (dossiers de subvention).'],
  ['vie-associative', /^nb d adherents$/, 'calcule', 'Nombre moyen d’adhérents par association = adhérents déclarés (dernière année, siège) / associations ayant déclaré leurs ressources humaines, pour les associations dont le siège est à Ivry, têtes de réseau nationales exclues (API Entreprise, jeu associations_api ADHERENTS / NB_RH_DECLAREES, non public).', ['associations_api']],
  ['vie-associative', /^nb benevoles impliques$/, 'direct', 'Somme des bénévoles déclarés (dernière année) par les associations ayant leur siège à Ivry (API Entreprise, jeu associations_api MESURE = BENEVOLES, non public).', ['associations_api']],
  ['vie-associative', /^impact local/, 'calcule', 'Adhérents ivryens / adhérents × 100 (dossiers de subvention).'],
  ['vie-associative', /^nb de salaries$/, 'calcule', 'Effectifs salariés au 31/12 des établissements de l’activité « organisations associatives » (Flores A88, ACTIVITY = 94, FLORES_MEASURE = EMPL3112). Les associations employeuses d’autres secteurs (action sociale, sport) ne sont pas isolées.', ['flores']],
  ['vie-associative', /^evolution du nombre de salaries$/, 'calcule', 'EMPL3112(n) − EMPL3112(n − 1) pour l’activité 94 (Flores A88).', ['flores']],

  // ---------------- Démographie ----------------
  ['demographie', /^population totale$/, 'direct', 'Population municipale (pop_hist POPREF_MEASURE = PMUN ; rp_serie_historique RP_MEASURE = POP).'],
  ['demographie', /^evolution annuelle de la population$/, 'calcule', 'Taux de croissance annuel moyen = ((P(n) / P(n − k))^(1/k) − 1) × 100, P = population municipale.'],
  ['demographie', /^indicateur de vieillissement/, 'calcule', 'Population de 65 ans ou plus / population de 0 à 19 ans × 100 (rp_pop_agesex, somme des âges détaillés, SEX = _T).'],
  ['demographie', /^projection de population/, 'calcule', 'P(n + h) = P(n) × (1 + TCAM)^h, TCAM calculé sur les 3 derniers recensements (pop_hist) ; à comparer au scénario central OMPHALE (INSEE).'],
  ['demographie', /^pyramide des ages$/, 'direct', 'Population par sexe et âge (rp_pop_agesex RP_MEASURE = POP, SEX = M / F, AGE détaillé).'],
  ['demographie', /^evolution par tranche d age$/, 'calcule', 'Population de la tranche(n) − population de la tranche(n − k), et part de la tranche dans la population ; tranches : 0-19, 20-64, 65 ans ou plus.'],
  ['demographie', /^taux de dependance demographique$/, 'calcule', '(Population de 0-19 ans + population de 65 ans ou plus) / population de 20-64 ans × 100 (rp_pop_agesex).'],
  ['demographie', /^projections par tranche d age$/, 'calcule', 'Vieillissement des générations (méthode des composantes simplifiée) : effectifs par âge décalés de k ans, survie et solde migratoire par âge constants.'],
  ['demographie', /^part des moins de 18 ans$/, 'calcule', 'Population de 0 à 17 ans / population totale × 100 (rp_pop_agesex).'],
  ['demographie', /^taux de natalite$/, 'calcule', `Naissances domiciliées (etat_civil_nais EC_MEASURE = LVB) ${PER_K}, en ‰.`],
  ['demographie', /^attractivite residentielle/, 'calcule', 'Arrivants = population d’un an ou plus qui résidait dans une autre commune un an auparavant (rp_migrations PREV_RES_AREA = 20_30) / population d’un an ou plus × 100 ; les départs ne sont pas publiés à la commune (solde migratoire apparent pour le bilan).'],
  ['demographie', /^besoins scolaires$/, 'calcule', 'Enfants de 3-10 ans (rp_pop_agesex, projetés) / effectif cible par classe − classes existantes (education_effectifs CLASSES) ; idem 11-14 ans pour les collèges.'],
  ['demographie', /^part des moins de 18 ans non scolarises$/, 'calcule', '(Population de 3 à 17 ans − population scolarisée de 3 à 17 ans) / population de 3 à 17 ans × 100 (rp_pop_agesex, rp_scolarisation).'],
  ['demographie', /^evolution du nombre et de la part des moins de 18 ans$/, 'calcule', 'Population de 0-17 ans(n) − (n − k) et part(n) − part(n − k), en points.'],
  ['demographie', /^indice de jeunesse$/, 'calcule', 'Population de moins de 20 ans / population de 60 ans ou plus (rp_pop_agesex).'],
  ['demographie', /^part des 65 ans et plus$/, 'calcule', 'Population de 65 ans ou plus / population totale × 100 (rp_pop_agesex).'],
  ['demographie', /^taux de mortalite$/, 'calcule', `Décès domiciliés (etat_civil_deces EC_MEASURE = DTH) ${PER_K}, en ‰.`],
  ['demographie', /^impact de la part des \+ de 65 ans/, 'calcule', 'Contribution des 65 ans ou plus à la croissance = (P65+(n) − P65+(n − k)) / (P(n) − P(n − k)) × 100.'],
  ['demographie', /^personnes agees projetes$/, 'calcule', 'Effectifs de 65 ans ou plus projetés par vieillissement des générations (55-64 ans actuels × taux de survie), complétés du solde migratoire par âge.'],
  ['demographie', /^evolution du nombre et de la part des \+ de 65 ans$/, 'calcule', 'P65+(n) − P65+(n − k) et part(n) − part(n − k), en points.'],
  ['demographie', /^menages monoparentaux$/, 'direct', 'Ménages dont la famille principale est monoparentale (rp_menages_type TPH = MF21, RP_MEASURE = DWELLINGS).'],
  ['demographie', /^evolution du nombre et de la part des menages monoparentaux$/, 'calcule', 'Ménages monoparentaux (TPH = MF21) / ménages (TPH = _T) × 100, évolution entre deux recensements.'],
  ['demographie', /^besoins specifiques des familles monoparentales$/, 'calcule', 'Ménages monoparentaux (TPH = MF21) × taux de pauvreté des familles monoparentales (Filosofi par type de ménage) ; part de ces familles parmi les allocataires (CAF).'],
  ['demographie', /^part d etrangers$/, 'calcule', 'Population étrangère (rp_nationalite NATIONALITY_TYPE = 100) / population totale (_T) × 100.'],
  ['demographie', /^evolution de la part d etrangers$/, 'calcule', 'Part d’étrangers(n) − part(n − k), en points.'],
  ['demographie', /^besoins en matiere d acces aux droits/, 'calcule', 'Indice composite : part d’étrangers, part des 15 ans ou plus sans diplôme, part des ménages sans voiture, part des allocataires CAF dépendants des prestations ; rapporté aux lieux d’accès aux droits (France Services, CCAS, permanences).'],
  ['demographie', /^solde naturel$/, 'calcule', 'Naissances − décès de l’année (etat_civil_nais LVB − etat_civil_deces DTH) ; entre deux recensements : rp_serie_historique BRTH − DEATH.'],
  ['demographie', /^evolution du solde naturel$/, 'calcule', 'Solde naturel(n) − solde naturel(n − 1) ; taux annuel = (naissances − décès) / population moyenne × 100.'],
  ['demographie', /^impact du solde naturel/, 'calcule', 'Part de la variation de population due au solde naturel = (BRTH − DEATH) / (P(n) − P(n − k)) × 100 ; taux annuel dû au solde naturel = (BRTH − DEATH) / (population moyenne × k) × 100.'],
  ['demographie', /^tendances demographiques projetees$/, 'calcule', 'Projection par composantes : P(n + 1) = P(n) + naissances − décès + solde migratoire, avec taux moyens des 5 dernières années.', ['rp_serie_historique', 'pop_hist']],
  ['demographie', /^solde migratoire$/, 'calcule', 'Solde migratoire apparent = (P(n) − P(n − k)) − (naissances − décès sur la période) (rp_serie_historique POP, BRTH, DEATH).'],
  ['demographie', /^evolution du solde migratoire$/, 'calcule', 'Taux annuel dû au solde migratoire apparent = solde / (population moyenne × k) × 100, comparé à la période précédente.'],
  ['demographie', /^impact du solde migratoire/, 'calcule', 'Part de la variation de population due au solde migratoire = solde migratoire apparent / (P(n) − P(n − k)) × 100.'],
  ['demographie', /^facteurs d attractivite/, 'calcule', 'Répartition des arrivants par origine (rp_migrations PREV_RES_AREA) et par âge, rapportée à la population de chaque tranche.'],
  ['demographie', /^taille des menages$/, 'calcule', 'Population des ménages / nombre de ménages = rp_serie_historique DWELLINGS_POPSIZE / DWELLINGS (OCS = DW_MAIN).'],
  ['demographie', /^evolution de la taille des menages$/, 'calcule', 'Taille moyenne(n) − taille moyenne(n − k).'],
  ['demographie', /^evolution des besoins en logement/, 'calcule', 'Point mort : besoins = (P(n + h) / taille des ménages projetée) − ménages actuels + renouvellement du parc + variation des logements vacants et secondaires.', ['rp_serie_historique', 'rp_menages_taille']],
  ['demographie', /^taille des menages projetee$/, 'calcule', 'Prolongement de la tendance de la taille moyenne des ménages (régression linéaire sur 1990-2023).'],

  // ---------------- Emploi : commerces et développement économique ----------------
  ['commerces', /^nb de commerces par types$/, 'direct', 'Établissements du commerce, transports, hébergement et restauration (side_stocks SIDE_MEASURE = UNIT_LOC, ACTIVITY = GI) ; détail par type : BPE domaine B (commerces, FACILITY_TYPE).', ['bpe']],
  ['commerces', /^evolution en nb$/, 'calcule', 'UNIT_LOC(n) − UNIT_LOC(n − 1) (side_stocks), pour le commerce (ACTIVITY = GI) ou l’ensemble hors commerce selon la rubrique.', ['side_stocks']],
  ['commerces', /^ecart a l echelle supra communale$/, 'calcule', 'Densité commerciale (établissements pour 1 000 hab.) d’Ivry − densité du Val-de-Marne ou du GOSB ; idem par type BPE.', ['side_stocks', 'bpe']],
  ['commerces', /^besoins en commerces$/, 'calcule', 'Population projetée × densité commerciale de référence (Val-de-Marne, par type BPE) − commerces existants.', ['bpe']],
  ['commerces', /^evolution en typologie$/, 'calcule', 'Répartition des commerces par type (BPE domaine B, FACILITY_TYPE) : part(n) − part(n − k), en points.', ['bpe']],
  ['commerces', /^taux de vacances des commerces$/, 'calcule', 'Locaux commerciaux vacants / locaux commerciaux × 100 (relevé terrain, fichier LOCOMVAC DGFiP, Fichiers fonciers).'],
  ['commerces', /^evolution du nombre de locaux commerciaux vacants$/, 'calcule', 'Locaux commerciaux vacants(n) − (n − 1) (relevé annuel ou LOCOMVAC).'],
  ['commerces', /^facteurs de vacance$/, 'calcule', 'Analyse des locaux vacants par durée de vacance, surface, loyer, linéaire et flux piétons ; part de chaque facteur parmi les locaux vacants.'],
  ['commerces', /^taux de vacance projete$/, 'calcule', 'Tendance du taux de vacance (régression sur les relevés annuels) corrigée des livraisons de surfaces commerciales (Sit@del locaux).'],
  ['commerces', /^nb d entreprises hors commerce par types$/, 'direct', 'Établissements par secteur A10 hors commerce (side_stocks UNIT_LOC, ACTIVITY ≠ GI) ; effectifs salariés par secteur : Flores.', ['flores']],
  ['commerces', /^potentiel d implantation$/, 'calcule', 'Taux de création par secteur = créations (side_creations UNIT_LOC_BURE) / stock (side_stocks UNIT_LOC) × 100, croisé avec le foncier d’activité disponible (MOS) ; secteurs dont le taux dépasse la moyenne départementale.', ['side_creations', 'side_stocks']],
  ['commerces', /^evolution en secteurs d activites$/, 'calcule', 'Part de chaque secteur A10 dans les établissements (side_stocks UNIT_LOC) : part(n) − part(n − k), en points.', ['side_stocks']],
  ['commerces', /^taux de vacances des locaux d activite$/, 'calcule', 'Locaux d’activité vacants / locaux d’activité × 100 (fichier LOCOMVAC DGFiP, Fichiers fonciers, observatoire de l’immobilier d’entreprise).'],
  ['commerces', /^evolution du nombre de locaux d activite vacants$/, 'calcule', 'Locaux d’activité vacants(n) − (n − 1).'],
  ['commerces', /^nb de structures de l ess$/, 'direct', 'Établissements de l’économie sociale et solidaire (jeu entreprises MESURE = ESS, stock du jour).'],
  ['commerces', /^evolution du nb \/ nb entreprises total$/, 'calcule', 'Établissements ESS (entreprises ESS) / établissements (side_stocks UNIT_LOC, ACTIVITY = _T) × 100, et évolution du nombre d’établissements ESS.', ['entreprises', 'side_stocks']],
  ['commerces', /^nb d emplois generes par les structures ess$/, 'calcule', 'Somme des milieux de tranche d’effectif salarié des établissements ESS (API Recherche d’entreprises) ; à défaut effectifs salariés de l’ESS publiés par ESS France (maille EPCI).'],
  ['commerces', /^opportunites de developpement de l ess$/, 'calcule', 'Part de l’ESS dans les établissements d’Ivry comparée au Val-de-Marne, par secteur ; secteurs sous-représentés = opportunités.'],
  ['commerces', /^dynamiques d implantation des activites$/, 'calcule', 'Taux de création = créations d’établissements (side_creations UNIT_LOC_BURE) / stock d’établissements (side_stocks UNIT_LOC) × 100.'],
  ['commerces', /^evolution du nombre d activites implantees\/departs$/, 'direct', 'Créations d’établissements de l’année (side_creations SIDE_MEASURE = UNIT_LOC_BURE) ; les fermetures ne sont pas publiées à la commune (solde approché par la variation du stock).'],

  // ---------------- Emploi et revenus ----------------
  ['emploi-revenus', /^taux d activite$/, 'calcule', 'Actifs de 15-64 ans (rp_activite_chomage EMPSTA_ENQ = 1T2) / population de 15-64 ans (EMPSTA_ENQ = _T) × 100.'],
  ['emploi-revenus', /^evolution du taux d activite$/, 'calcule', 'Taux d’activité(n) − taux d’activité(n − k), en points.'],
  ['emploi-revenus', /^part d emplois occupes par des habitants de la commune$/, 'calcule', 'Actifs occupés résidant et travaillant à Ivry (rp_navettes WORK_AREA = 10) / emplois au lieu de travail (rp_emploi_lt NBEMP) × 100.', ['rp_navettes']],
  ['emploi-revenus', /^projection du nombre d actifs$/, 'calcule', 'Population de 15-64 ans projetée × taux d’activité par âge actuel (rp_activite_chomage).'],
  ['emploi-revenus', /^taux de chomage$/, 'calcule', 'Chômeurs de 15-64 ans (rp_activite_chomage EMPSTA_ENQ = 2) / actifs de 15-64 ans (EMPSTA_ENQ = 1T2) × 100 (au sens du recensement).'],
  ['emploi-revenus', /^evolution du taux de chomage$/, 'calcule', 'Taux de chômage(n) − taux(n − k), en points ; suivi annuel : demandeurs d’emploi ABC (ft_defm) / population de 15-64 ans × 100.'],
  ['emploi-revenus', /^nombre de demandeurs d emploi inscrits/, 'direct', 'Demandeurs d’emploi inscrits en catégories A, B, C au 4ᵉ trimestre (ft_defm MESURE = DEFM_ABC).'],
  ['emploi-revenus', /^projection du nombre de chomeurs$/, 'calcule', 'Tendance linéaire sur 10 ans des demandeurs d’emploi ABC (ft_defm), prolongée à 1 et 5 ans.', ['ft_defm']],
  ['emploi-revenus', /^creations\/fermetures d etablissements$/, 'direct', 'Créations d’établissements (side_creations UNIT_LOC_BURE) et d’entreprises (BURE) par secteur A10.'],
  ['emploi-revenus', /^repartition par categorie socio professionnelle$/, 'calcule', 'Population de 15 ans ou plus de chaque PCS / population de 15 ans ou plus (rp_csp PCS = _T) × 100.'],
  ['emploi-revenus', /^evolution de la repartition des csp$/, 'calcule', 'Part de chaque PCS(n) − part(n − k), en points.'],
  ['emploi-revenus', /^part des csp en regression$/, 'calcule', 'Somme des parts des PCS dont l’effectif diminue entre deux recensements.'],
  ['emploi-revenus', /^besoins lies aux profils des actifs$/, 'calcule', 'Écart entre la structure par PCS des actifs résidents (rp_csp) et celle des emplois au lieu de travail ; part des actifs sans diplôme (rp_diplomes).', ['rp_diplomes']],
  ['emploi-revenus', /^revenu median$/, 'direct', 'Médiane du niveau de vie (Filosofi FILOSOFI_MEASURE = MED_SL, € par an et par unité de consommation).'],
  ['emploi-revenus', /^evolution des revenus medians$/, 'calcule', 'MED_SL(n) / MED_SL(n − k) − 1, en % (Filosofi) ; suivi annuel : revenu fiscal de référence moyen = ircom RFR / FOYERS_FISCAUX × 1 000.', ['filosofi', 'ircom']],
  ['emploi-revenus', /^ecart de revenu avec l echelle supra communale$/, 'calcule', 'MED_SL Ivry − MED_SL Val-de-Marne (ou Île-de-France), en € ; ou rapport MED_SL Ivry / MED_SL Val-de-Marne.'],
  ['emploi-revenus', /^projection du revenu median$/, 'calcule', 'Prolongement du taux d’évolution annuel moyen du revenu fiscal de référence moyen (ircom 2021-2024) appliqué au niveau de vie médian.'],
  ['emploi-revenus', /^part des bas revenus$/, 'calcule', 'Foyers fiscaux sous 10 000 € de revenu fiscal de référence (ircom TRANCHE = T1) / foyers fiscaux (_T) × 100 ; taux de pauvreté Filosofi (PR_MD60) en complément.'],
  ['emploi-revenus', /^taux de beneficiaires des minima sociaux$/, 'calcule', 'Foyers allocataires du RSA (caf_rsa FOYERS_RSA) / ménages (rp_serie_historique DWELLINGS, OCS = DW_MAIN) × 100 ; personnes couvertes / population.'],
  ['emploi-revenus', /^part de contrats precaires$/, 'calcule', 'Salariés en CDD, intérim, emplois aidés, apprentissage ou stage (rp_formes_emploi EMPFORM = 22T27) / salariés (EMPFORM = 211 + 22T27) × 100, 15 ans ou plus en emploi.', ['rp_formes_emploi']],
  ['emploi-revenus', /^projection des bas revenus$/, 'calcule', 'Tendance de la part des foyers sous 10 000 € (ircom 2021-2024) prolongée à 5 ans.'],
  ['emploi-revenus', /^revenus qpv$/, 'direct', 'Médiane du revenu disponible par unité de consommation et taux de pauvreté des QPV d’Ivry (INSEE, Filosofi QPV).'],
  ['emploi-revenus', /^densite d emplois sur la commune$/, 'calcule', 'Emplois au lieu de travail (rp_emploi_lt NBEMP) / superficie (rp_serie_historique SUP, km²) ; indicateur de concentration d’emploi = emplois / actifs occupés résidents × 100.', ['rp_serie_historique']],
  ['emploi-revenus', /^evolution du nombre d emplois$/, 'calcule', 'NBEMP(n) − NBEMP(n − k) et taux annuel moyen ((NBEMP(n) / NBEMP(n − k))^(1/k) − 1) × 100 (rp_emploi_lt) ; suivi annuel : effectifs salariés Flores.', ['flores']],
  ['emploi-revenus', /^adequation des emplois aux profils$/, 'calcule', 'Pour chaque PCS : emplois au lieu de travail / actifs occupés résidents ; un rapport < 1 signale un déficit d’emplois pour ce profil.'],
  ['emploi-revenus', /^identification des secteurs a potentiel/, 'calcule', 'Secteurs (Flores A88) dont les effectifs salariés progressent plus vite qu’en Val-de-Marne, croisés avec les métiers en tension (enquête BMO, bassin d’emploi).', ['flores']],

  // ---------------- Environnement ----------------
  ['environnement', /^qualite de l air$/, 'direct', 'Score de multi-exposition environnementale et classes (jeu multiexposition, Institut Paris Region / Airparif) ; concentrations moyennes annuelles NO₂ et PM2,5 (Airparif).'],
  ['environnement', /^evolution des jours de depassement/, 'calcule', 'Nombre de jours de l’année où l’indice ATMO de la commune est « mauvais » ou pire (≥ 4) ; évolution n / n − 1.'],
  ['environnement', /^emissions de gaz a effet de serre par habitant$/, 'calcule', 'Émissions de GES du territoire (tCO₂e, inventaire Airparif / ROSE, scopes 1 et 2) / population municipale.'],
  ['environnement', /^projection de reduction des emissions$/, 'calcule', 'Trajectoire linéaire entre les émissions de l’année de référence et l’objectif du PCAET (−50 % en 2030, neutralité 2050) ; écart = émissions observées − trajectoire.'],
  ['environnement', /^espaces verts par habitant/, 'calcule', 'Surface des postes MOS d’espaces verts urbains (parcs et jardins, autres espaces verts, berges…) en m² / population municipale (mos SURFACE_HA × 10 000).', [], 'cd94_espaces_verts'],
  ['environnement', /^evolution de la surface d espaces verts$/, 'calcule', 'Surface MOS des postes d’espaces verts(n) − (n − k), en ha (mos 2021 → 2025).'],
  ['environnement', /^accessibilite aux espaces verts$/, 'calcule', 'Part de la population à moins de 300 m d’un espace vert d’au moins 1 ha (carroyage) ; approximation : m² d’espaces verts accessibles au public par habitant.', [], 'cd94_espaces_verts'],
  ['environnement', /^projection du nombre d espaces verts$/, 'calcule', 'Surface d’espaces verts actuelle + projets programmés (OAP, ZAC) − consommation tendancielle (Evolumos).'],
  ['environnement', /^nombre d arbres plantes$/, 'direct', 'Arbres d’alignement de la couche départementale dont l’année de plantation est l’année n (lecture en direct, Val-de-Marne) ; à compléter par les plantations communales (service des espaces verts).', [], 'cd94_arbres'],
  ['environnement', /^ilots de chaleur identifies$/, 'direct', 'Surfaces en aléa fort de jour et de nuit (icu SURFACE_ALEA_JOUR_HA, SURFACE_ALEA_NUIT_HA, Institut Paris Region) ; îlots morphologiques urbains de la couche départementale.', [], 'cd94_icu'],
  ['environnement', /^evolution des surfaces concernees$/, 'calcule', 'Surfaces en aléa fort(n) − (n − k), en ha ; à défaut évolution des surfaces minérales (MOS).'],
  ['environnement', /^niveau d exposition aux ilots de chaleur$/, 'calcule', 'Surface en vulnérabilité forte (icu SURFACE_VULNERABILITE_JOUR_HA) / surface communale × 100 ; population exposée par carroyage.'],
  ['environnement', /^projection des surfaces impermeabilisees/, 'calcule', 'Surfaces artificialisées projetées (flux annuel moyen artificialisation FLUX_HA × h) situées en zones d’aléa fort ICU.'],
  ['environnement', /^consommation energetique residentielle et tertiaire$/, 'direct', 'Consommation d’électricité et de gaz des secteurs résidentiel et tertiaire (ore_conso CONSO_MWH, SECTEUR = RESIDENTIEL et TERTIAIRE, FILIERE = _T), en MWh.'],
  ['environnement', /^evolution des consommations d energie communale$/, 'calcule', 'CONSO_MWH(n) / CONSO_MWH(n − 1) − 1, en %, tous secteurs (ore_conso).'],
  ['environnement', /^part d energies renouvelables$/, 'calcule', '(Chaleur renouvelable livrée par les réseaux de chaleur × taux d’EnR&R + électricité renouvelable produite localement) / consommation finale × 100. Taux d’EnR&R des réseaux : couche départementale « réseau de chaleur » (en direct).', [], 'cd94_reseau_chaleur'],
  ['environnement', /^identification des batiments et secteurs avec un potentiel/, 'calcule', 'Logements classés F ou G (dpe DPE_F + DPE_G) et consommation résidentielle par logement (ore_conso / rp_logement DWELLINGS) ; secteurs au-dessus de la moyenne départementale.', ['dpe']],
  ['environnement', /^exposition aux nuisances sonores$/, 'direct', 'Classes de bruit et score de multi-exposition (multiexposition ; nuisances MAILLES_500M), données Bruitparif.'],
  ['environnement', /^evolution de la population exposee aux nuisances sonores$/, 'calcule', 'Population exposée au-delà de 68 dB(A) Lden (cartes de bruit stratégiques)(n) − (n − 5).'],
  ['environnement', /^niveau d exposition aux nuisances sonores$/, 'calcule', 'Mailles de 500 m en point noir environnemental (nuisances POINT_NOIR = 1) / mailles (POINT_NOIR = _T) × 100.'],
  ['environnement', /^projection des secteurs pouvant etre exposes a des nuisances sonores$/, 'calcule', 'Croisement des bandes du classement sonore des voies et des projets de logements (Sit@del, projets immobiliers).'],
  ['environnement', /^consommation des espaces naturels et agricoles$/, 'direct', 'Flux d’artificialisation des espaces naturels, agricoles et forestiers (artificialisation FLUX_HA, Cerema, en ha).'],
  ['environnement', /^evolutions des surfaces naturelles et agricoles consommees$/, 'calcule', 'Surface MOS des postes naturels et agricoles(n) − (n − k), en ha.'],
  ['environnement', /^rapidite d evolution de l etalement urbain$/, 'calcule', 'Flux annuel moyen d’artificialisation (FLUX_HA / nombre d’années) / surface communale × 100 ; ou ha artificialisés par nouveau ménage.'],
  ['environnement', /^identification des surfaces a preserver$/, 'calcule', 'Surfaces MOS des postes naturels, berges, espaces verts et jardins (ha), superposées aux protections (ENS, ZNIEFF, couche départementale).'],
  ['environnement', /^impermeabilite des sols$/, 'direct', 'Part de la surface communale artificialisée (artificialisation PART_ARTIF, en %). Artificialisé ≠ imperméabilisé : à compléter par la part de surfaces perméables des îlots (couche ICU).'],
  ['environnement', /^taux annuel de sol impermeabilise$/, 'calcule', 'Flux annuel d’artificialisation (FLUX_HA) / surface communale × 100.'],
  ['environnement', /^evolution de la part de sols impermeabilses$/, 'calcule', 'PART_ARTIF(n) − PART_ARTIF(n − k), en points.'],
  ['environnement', /^projection des surfaces pouvant etre desimpermeabilisees$/, 'calcule', 'Surfaces MOS de parkings, esplanades, cours d’école et emprises d’activités en friche (ha), pondérées par la perméabilité des îlots.'],
  ['environnement', /^evolution du tri des dechets$/, 'calcule', 'Part des collectes séparées = (emballages et papiers + verre + biodéchets et déchets verts) / déchets ménagers et assimilés × 100 (SINOE, EPT Grand-Orly Seine Bièvre), évolution n / n − 1.'],
  ['environnement', /^part de biodechets collectes$/, 'calcule', 'Tonnage de déchets verts et biodéchets / déchets ménagers et assimilés × 100 (SINOE, EPT GOSB).'],
  ['environnement', /^production de dechets par habitant$/, 'calcule', 'Déchets ménagers et assimilés collectés (t, SINOE, EPT GOSB) × 1 000 / population de l’EPT, en kg/hab ; quote-part communale sur les tonnages de collecte de la Ville si disponibles.'],
  ['environnement', /^projection de la production de dechet par habitant$/, 'calcule', 'Tendance de la production de DMA par habitant (2010-2023) comparée à l’objectif réglementaire (−15 % en 2030 par rapport à 2010).'],
  ['environnement', /^part de dechets tries$/, 'calcule', 'Tonnages collectés séparément (matériaux recyclables, verre, biodéchets, encombrants valorisés) / DMA × 100 (SINOE, EPT GOSB).'],

  // ---------------- Logement ----------------
  ['logement', /^parc de logements/, 'direct', 'Logements par catégorie (rp_logement DWELLINGS, OCS), type (TDW), période de construction (BUILD_END), statut d’occupation (TSH) ; logements sociaux (rpls).'],
  ['logement', /^nombre de logements commences\/acheves par an$/, 'direct', 'Logements commencés (sitadel LGT_COMMENCES) et achevés (LGT_ACHEVES) par année.'],
  ['logement', /^taux de logements indignes/, 'calcule', 'Parc privé potentiellement indigne (PPPI, Filocom) / résidences principales privées × 100.'],
  ['logement', /^projection de la production de logements$/, 'calcule', 'Logements autorisés des 3 dernières années (sitadel LGT_AUTORISES) × taux de réalisation moyen (commencés / autorisés à n + 2).'],
  ['logement', /^adequation du parc de logement aux besoins$/, 'calcule', 'Comparaison de la répartition des résidences principales par nombre de pièces (rp_logement NOR) et des ménages par taille (rp_menages_taille NOC) : part des ménages d’une personne − part des T1-T2, etc.', ['rp_menages_taille']],
  ['logement', /^part de logements sociaux$/, 'direct', 'Taux de logements sociaux au sens de la loi SRU au 1er janvier (sru MESURE = TAUX_SRU, en %).', [], 'cd94_rpls'],
  ['logement', /^evolution de la production de logement social$/, 'calcule', 'Logements sociaux autorisés par an (sitadel LGT_SOCIAUX_AUTORISES) ; variation du parc RPLS = LOGEMENTS_SOCIAUX(n) − (n − 1).'],
  ['logement', /^respect des objectifs sru$/, 'calcule', 'TAUX_SRU − TAUX_CIBLE (sru), en points ; logements manquants = TAUX_CIBLE × résidences principales − LLS.'],
  ['logement', /^projection de la production de logements sociaux$/, 'calcule', 'Logements sociaux autorisés (n − 2 … n) × taux de réalisation, ajoutés au parc RPLS ; taux SRU projeté = LLS projetés / RP projetées.'],
  ['logement', /^part des demandes actives et des attributions/, 'calcule', 'Attributions de l’année / demandes actives au 31/12 × 100 (SNE), par typologie et ancienneté de la demande.'],
  ['logement', /^vacance$/, 'calcule', 'Logements vacants du parc privé / parc privé × 100 (lovac PP_VACANT / PP_TOTAL) ; au recensement : DWELLINGS [OCS = DW_VAC] / DWELLINGS [OCS = _T] × 100.'],
  ['logement', /^evolution du nombre de logements vacants$/, 'calcule', 'PP_VACANT(n) − PP_VACANT(n − 1) (lovac) ; vacance de plus de 2 ans : PP_VACANT_2ANS.'],
  ['logement', /^projection des logements pouvant etre remis sur le marche$/, 'calcule', 'Logements vacants depuis plus de 2 ans (lovac PP_VACANT_2ANS) × taux de remise sur le marché visé (plan national de lutte contre les logements vacants).'],
  ['logement', /^prix\/m2 a la location et a l achat$/, 'direct', 'Prix médian au m² des appartements (dvf PRIX_M2_MEDIAN, médiane calculée à l’import sur les ventes d’un seul logement) ; loyer d’annonce prédit au m² (loyers LOYER_M2).'],
  ['logement', /^evolution des loyers\/prix$/, 'calcule', 'PRIX_M2_MEDIAN(n) / PRIX_M2_MEDIAN(n − 1) − 1 et LOYER_M2(n) / LOYER_M2(n − k) − 1, en %.'],
  ['logement', /^accessibilite du marche immobilier$/, 'calcule', 'Années de revenu nécessaires = prix médian au m² (dvf) × 65 m² / revenu disponible annuel médian d’un ménage (Filosofi MED_SL × 1,8 UC) ; taux d’effort locatif = loyer × 65 m² × 12 / revenu.', ['filosofi']],
  ['logement', /^projection de l evolution des prix$/, 'calcule', 'Prolongement du taux d’évolution annuel moyen du prix médian et du loyer d’annonce (régression sur les 5 dernières années).'],
  ['logement', /^evolution du nombre de dia$/, 'direct', 'Nombre de déclarations d’intention d’aliéner reçues par an (SI droit des sols de la Ville) ; mutations DVF en approximation.'],
  ['logement', /^foncier disponible$/, 'calcule', 'Surface des postes MOS mutables (chantiers, terrains vacants, entreposage à l’air libre, parkings de surface), en ha.'],
  ['logement', /^evolution du nombre permis de construire delivres$/, 'direct', 'Autorisations d’urbanisme créant des logements (sitadel NB_AUTORISATIONS, TYPE_DAU = PC) par année.'],
  ['logement', /^degres de mutabilite du foncier$/, 'calcule', 'Score par îlot : surfaces mutables MOS, faible densité bâtie (DensiMos), propriété publique (typologie foncière), desserte ; part de la surface communale en mutabilité forte.'],
  ['logement', /^projection du foncier mutable$/, 'calcule', 'Foncier mutable actuel − consommation tendancielle (Evolumos) + friches attendues (ZAC, OAP).'],
  ['logement', /^projets de construction$/, 'direct', 'Projets immobiliers en cours ou programmés (couche départementale, en direct) et autorisations de logements non commencées (sitadel LGT_AUTORISES − LGT_COMMENCES).', ['sitadel'], 'cd94_projets_immo'],
  ['logement', /^evolution du nombre de programmes livres par annee$/, 'direct', 'Logements achevés par année (sitadel LGT_ACHEVES).'],
  ['logement', /^densite nette des nouveaux quartiers$/, 'calcule', 'Logements livrés / surface des îlots résidentiels concernés (ha, MOS habitat), par opération (ZAC).', [], 'cd94_zac'],
  ['logement', /^livraisons prevues$/, 'calcule', 'Logements commencés non encore achevés = Σ LGT_COMMENCES − Σ LGT_ACHEVES sur 3 ans (sitadel), complétés des projets immobiliers en cours (couche départementale).', ['sitadel'], 'cd94_projets_immo'],

  // ---------------- Mobilité ----------------
  ['mobilite', /^part modale/, 'calcule', 'Actifs occupés allant travailler à pied (rp_navettes TRANS = 2) ou à vélo (TRANS = 3) / actifs occupés (TRANS = _T) × 100.'],
  ['mobilite', /^evolution des deplacements par type$/, 'calcule', 'Part de chaque mode (TRANS)(n) − part(n − k), en points.'],
  ['mobilite', /^nombre de stationnements velo$/, 'direct', 'Places de stationnement vélo (velo_stationnement CAPACITE, OpenStreetMap) ; stationnements IDFM / Véligo de la couche départementale (en direct).', [], 'cd94_stationnement_velo'],
  ['mobilite', /^projection de la part modale velo\/marche$/, 'calcule', 'Tendance de la part modale vélo + marche entre recensements, corrigée du linéaire d’aménagements cyclables programmé (SDIC).'],
  ['mobilite', /^taux de motorisation des menages$/, 'calcule', 'Résidences principales disposant d’au moins une voiture (rp_logement CARS = C_GE1) / résidences principales (CARS = _T) × 100 ; voitures immatriculées pour 1 000 hab. (ore_parc_auto VP).'],
  ['mobilite', /^trafic routier sur les axes principaux$/, 'direct', 'Trafic moyen journalier annuel (TMJA, véhicules par jour) aux postes de comptage des routes départementales et nationales.'],
  ['mobilite', /^emissions liees aux transports motorises$/, 'calcule', 'Émissions du transport routier (inventaire Airparif, tCO₂e) ; approximation : voitures thermiques (ore_parc_auto VP − VP_ELECTRIQUES) × kilométrage moyen × facteur d’émission (ADEME).'],
  ['mobilite', /^projection du taux de motorisation$/, 'calcule', 'Tendance du taux de motorisation entre recensements et de la part de véhicules électriques (VP_ELECTRIQUES / VP).'],
  ['mobilite', /^temps moyen domicile travail$/, 'calcule', 'Temps moyen = Σ (actifs par commune de travail × temps de trajet modélisé selon le mode) / actifs occupés (rp_navettes) ; le recensement ne fournit pas le temps de trajet.'],
  ['mobilite', /^evolution du temps de trajet moyen domicile travail$/, 'calcule', 'Temps moyen(n) − temps moyen(n − k), à méthode de modélisation constante.'],
  ['mobilite', /^accidents corporels de la circulation$/, 'direct', 'Accidents corporels de la circulation par année (baac MESURE = ACCIDENTS).'],
  ['mobilite', /^identification des secteurs necessitant/, 'calcule', 'IRIS dont le temps d’accès en transports en commun aux principaux bassins d’emploi dépasse la moyenne départementale (GTFS IDFM, emplois au lieu de travail).'],
  ['mobilite', /^accessibilite en transports en commun\/modes actifs/, 'calcule', 'Population à moins de 500 m d’un arrêt ferré ou 300 m d’un arrêt de bus / population × 100 ; arrêts ferrés (idfm_ferre NB_ARRETS) et gares de la couche départementale.', [], 'cd94_gares'],
  ['mobilite', /^frequentation des lignes de transport$/, 'direct', 'Validations dans les gares et stations ferrées de la commune (idfm_ferre VALIDATIONS).'],
  ['mobilite', /^accessibilite des habitants aux poles majeurs$/, 'calcule', 'Temps moyen en transports en commun depuis chaque IRIS vers les pôles majeurs (calcul d’itinéraires sur le GTFS IDFM), pondéré par la population.'],
  ['mobilite', /^besoins en nouvelles liaisons$/, 'calcule', 'Flux domicile-travail importants (rp_navettes, origine-destination) mal desservis : temps TC / temps voiture > 1,5.'],
];

// Sources identifiées pour les indicateurs sans données importées : [rubrique, libellé, texte, lien, faisabilité (2 = source ouverte identifiée, 3 = à produire)]
const DG = (q) => `https://www.data.gouv.fr/datasets/${q}`;
const S = [
  ['conditions-vie', /^indice de developpement social local$/, 'IDH-2 par commune (ORS / ARS Île-de-France, millésime 2021) téléchargeable ; composantes recalculables avec les jeux filosofi et rp_diplomes (diplômes, INSEE Melodi DS_RP_DIPLOMES_PRINC, intégré).', 'https://www.iledefrance.ars.sante.fr/indice-de-developpement-humain-regionalise-idh-2-observer-les-inegalites-sociales-et-territoriales', 2],
  ['conditions-vie', /^rapport entre les demandes et les attributions|^besoins en logements sociaux$/, 'SNE (système national d’enregistrement) : demandes actives et attributions par commune (communes d’au moins 10 demandes), statistiques publiques du portail de la demande de logement social ; bilans « socles » DRIHL Île-de-France.', 'https://www.demande-logement-social.gouv.fr/statistiques', 2],
  ['conditions-vie', /^signalements d impayes/, 'Donnée interne : CCAPEX (préfecture), FSL (Département du Val-de-Marne) et CCAS ; aucune diffusion ouverte à la commune.', null, 3],
  ['conditions-vie', /^taux de non recours/, 'Pas de donnée communale ouverte. Estimations nationales DREES (RSA, prime d’activité) ; la CAF du Val-de-Marne peut fournir une estimation par « datamining » sur convention.', 'https://drees.solidarites-sante.gouv.fr/', 3],
  ['sante', /^nb beneficiaires cmu et ame$|^evolution du nombre de beneficiaires cmu et ame$/, 'INSEE : bénéficiaires du régime général et de la C2S au 1er janvier 2025 dans les QPV et dans les communes qui en comptent (Ivry : oui). L’AME n’est pas diffusée à la commune (demande à la CPAM du Val-de-Marne).', 'https://www.insee.fr/fr/statistiques/8736902', 2],
  ['sante', /^part de la population concernee$/, 'Part C2S : base INSEE des QPV (communes avec QPV, 2025). Part ALD : Cnam (data.ameli.fr, maille départementale) ou ORS Île-de-France sur demande.', 'https://www.insee.fr/fr/statistiques/8736902', 2],
  ['sante', /^nb ald|^evolution du nombre d ald$/, 'Cnam, cartographie des pathologies (data.ameli.fr), jeu ameli_ald intégré : nombre de personnes en ALD (top ALD_CAT_CAT) par département et par an ; maille communale sur demande (ORS Île-de-France, CPAM 94).', 'https://data.ameli.fr/', 2],
  ['sante', /^rapport entre l offre et la demande en soins$|^identification des secteurs en deficit d offre$/, 'APL (accessibilité potentielle localisée) par commune, DREES, annuelle, pour les médecins généralistes, infirmiers, sages-femmes, kinésithérapeutes et dentistes ; zonage médecins de l’ARS Île-de-France.', 'https://drees.solidarites-sante.gouv.fr/sources-outils-et-enquetes/lindicateur-daccessibilite-potentielle-localisee-apl', 2],
  ['vie-associative', /^nb d adherents$|^nb benevoles impliques$/, 'API Entreprise (DJEPVA, Le Compte Asso), intégrée : adhérents, bénévoles et salariés déclarés (siège ; têtes de réseau nationales exclues) par les associations ayant leur siège à Ivry (jeu associations_api, DONNÉES NON PUBLIQUES, accès habilité). Valeurs minimales : seules les associations ayant déposé une demande via Le Compte Asso déclarent leurs ressources humaines. À compléter par les dossiers de subvention de la Ville.', 'https://entreprise.api.gouv.fr/catalogue/djepva/associations', 1],
  ['vie-associative', /^rayonnement|^impact local|^beneficiaires et publics touches$/, 'Donnée interne (bénéficiaires, origine des adhérents) : la répartition ivryens / non ivryens des adhérents n’existe dans aucune source nationale ; à demander dans les dossiers de subvention (Cerfa 12156) et bilans d’activité.', null, 3],
  ['vie-associative', /^nb de salaries$|^evolution du nombre de salaries$/, 'Flores (INSEE, Melodi DS_FLORES_A88) intégré : effectifs salariés de l’activité 94 « organisations associatives ». Complément : Urssaf open data (effectifs salariés par commune et APE).', 'https://api.insee.fr/melodi/catalog/DS_FLORES_A88', 1],
  ['demographie', /^besoins en matiere d acces aux droits/, 'Composantes disponibles (rp_nationalite, rp_logement, caf_prestations) ; lieux d’accès aux droits : couche départementale des équipements (CCAS, CAF, CPAM, permanences, en direct) et annuaire France Services.', 'https://geo.valdemarne.fr/explorer/fr/recherche?scope=dataset', 2],
  ['commerces', /^taux de vacances des commerces$|^evolution du nombre de locaux commerciaux vacants$|^facteurs de vacance$|^taux de vacance projete$|^taux de vacances des locaux d activite$|^evolution du nombre de locaux d activite vacants$/, 'Fichier LOCOMVAC (DGFiP) : locaux commerciaux et professionnels sans cotisation foncière des entreprises, transmis chaque année aux communes (portail PIGP) ; à fiabiliser par un relevé terrain (observatoire du commerce, CCI Paris Île-de-France 94).', 'https://www.collectivites-locales.gouv.fr/files/finances-locales/PIGP_Fiche_technique_locaux_vacants_CFE_2025.pdf', 2],
  ['commerces', /^besoins en commerces$|^potentiel d implantation$|^opportunites de developpement de l ess$/, 'Indicateur prospectif construit à partir des jeux importés (bpe, side_stocks, side_creations) et des projections de population.', null, 2],
  ['emploi-revenus', /^revenus qpv$/, 'INSEE : revenus, pauvreté et niveau de vie dans les quartiers de la politique de la ville (Filosofi QPV, géographie 2024) ; contours des QPV d’Ivry : couche départementale « QPV 2024 » (en direct).', 'https://www.insee.fr/fr/statistiques/8243026', 2],
  ['emploi-revenus', /^part de contrats precaires$/, 'INSEE Melodi DS_RP_TD_ACTIVITE_AGEEMPFORMD_COMP (ACT2B) intégré (jeu rp_formes_emploi). Par IRIS : indicateur Babord « part des salariés en emploi précaire » du géoportail départemental.', 'https://api.insee.fr/melodi/catalog/DS_RP_TD_ACTIVITE_AGEEMPFORMD_COMP', 1],
  ['environnement', /^evolution des jours de depassement/, 'Indices ATMO quotidiens par commune (Atmo France / Airparif, data.gouv.fr, API ArcGIS, mise à jour quotidienne, profondeur J−7 à J+1 : à historiser) ; bilans annuels Airparif.', DG('indices-atmo'), 2],
  ['environnement', /^emissions de gaz a effet de serre par habitant$|^projection de reduction des emissions$/, 'Inventaire des émissions Airparif / ROSE : consommations d’énergie et émissions de GES par commune et par secteur (téléchargement sur le site d’Airparif, millésime 2023 publié en décembre 2025).', 'https://www.airparif.fr/surveiller-la-pollution/les-emissions', 2],
  ['environnement', /^nombre d arbres plantes$/, 'Couche départementale « Arbo : arbres d’alignement » (année de plantation, essence) lue en direct sur le géoportail du Val-de-Marne ; plantations communales et du plan « 50 000 arbres » à ajouter (SI espaces verts).', 'https://geo.valdemarne.fr/explorer/fr/jeux-de-donnees/arbo-arbres-d-alignement-val-de-marne/donnees', 1],
  ['environnement', /^part d energies renouvelables$/, 'Couche départementale « réseau de chaleur » (taux d’EnR&R, contenu CO₂, gestionnaire) en direct ; production électrique renouvelable : Agence ORE / Enedis (installations par IRIS) ; consommations : ore_conso.', 'https://geo.valdemarne.fr/explorer/fr/recherche?scope=dataset', 2],
  ['environnement', /^evolution du tri des dechets$|^part de biodechets collectes$|^production de dechets par habitant$|^projection de la production de dechet par habitant$|^part de dechets tries$/, 'ADEME, SINOE « Indicateurs COLLECTE – Tonnage par type de déchet » (API Data Fair) : tonnages par type de déchet pour l’EPT T12 Grand-Orly Seine Bièvre (code acteur 56933), 2009-2023. La compétence déchets étant territoriale, la valeur est celle de l’EPT.', 'https://data.ademe.fr/datasets/indicateurs-collecte-tonnage-par-type-de-dechet', 2],
  ['logement', /^taux de logements indignes/, 'PPPI (Filocom, Anah / DGALN) : diffusé aux services de l’État, transmissible à la commune pour études (demande à la DRIHL 94) ; signalements et arrêtés d’insalubrité : SCHS de la Ville.', null, 3],
  ['logement', /^part des demandes actives et des attributions/, 'SNE : demandes et attributions par commune (portail de la demande de logement social, statistiques) ; bilans « socles » DRIHL.', 'https://www.demande-logement-social.gouv.fr/statistiques', 2],
  ['logement', /^evolution du nombre de dia$/, 'Donnée interne : DIA reçues (logiciel des autorisations du droit des sols) ; approximation par les mutations DVF (jeu dvf NB_MUTATIONS).', null, 2],
  ['logement', /^projets de construction$|^livraisons prevues$/, 'Couche départementale « Projets immobiliers » (état, type, échéance) en direct ; liste nationale des permis de construire Sit@del (SDES, data.gouv.fr) pour le détail par opération.', DG('689c42fa521ccf80ce954f83'), 1],
  ['mobilite', /^trafic routier sur les axes principaux$/, 'Comptages du Conseil départemental du Val-de-Marne (cartes de trafic 2013 et 2016 sur le géoportail, comptages récents sur demande) et TMJA du réseau national (DRIEAT).', 'https://geo.valdemarne.fr/explorer/fr/recherche?scope=dataset', 2],
  ['mobilite', /^identification des secteurs necessitant|^accessibilite des habitants aux poles majeurs$|^besoins en nouvelles liaisons$/, 'Horaires théoriques GTFS d’Île-de-France Mobilités (data.iledefrance-mobilites.fr / PRIM) pour calculer les temps d’accès ; gares de la couche départementale (en direct).', 'https://data.iledefrance-mobilites.fr/', 2],
];

function find(list, r) {
  const t = norm(r.libelle);
  return list.find(([g, re]) => g === r.groupe && re.test(t));
}

// Bloc « [Sources identifiées] » placé avant celui de propositions.js s'il existe
function withSources(cur, text) {
  let s = String(cur ?? '');
  const at = s.indexOf(MARK);
  if (at >= 0) {
    const end = s.indexOf(PROP_MARK, at);
    s = (s.slice(0, at).trimEnd() + (end >= 0 ? '\n\n' + s.slice(end) : '')).trim();
  }
  if (!text) return s || null;
  const block = `${MARK} ${text}`;
  const p = s.indexOf(PROP_MARK);
  if (p >= 0) return `${s.slice(0, p).trimEnd()}${p > 0 ? '\n\n' : ''}${block}\n\n${s.slice(p)}`.trim();
  return `${s}${s ? '\n\n' : ''}${block}`;
}

function apply() {
  const hist = (id, field, o, n) => run('INSERT INTO indicator_history (indicator_id, field, old_value, new_value) VALUES (?,?,?,?)', id, field, o ?? null, n ?? null);
  const rows = all('SELECT id, groupe, libelle, formule, mode_calcul, proposition, lien_donnees, faisabilite, couche_id FROM indicators');
  const known = new Set(all('SELECT id FROM datasets').map((d) => d.id));
  const once = !get("SELECT 1 FROM app_settings WHERE key = 'formules_links_v2'");
  const stats = { formules: 0, modes: 0, liens: 0, sources: 0 };
  let autoMap = {};
  try { autoMap = JSON.parse(get("SELECT value FROM app_settings WHERE key = 'formules_auto'")?.value || '{}'); } catch { autoMap = {}; }
  tx(() => {
    for (const r of rows) {
      const f = find(F, r);
      if (f) {
        const [, , mode, formule, ds = [], couche] = f;
        // formule vide, ou formule écrite automatiquement et jamais retouchée à la main : (re)mise à la règle courante
        // registre des formules écrites par l'application (premier passage : formule posée automatiquement, jamais modifiée depuis)
        const auto = r.formule && (autoMap[r.id] === r.formule
          || (!(r.id in autoMap) && get("SELECT 1 FROM indicator_history WHERE indicator_id = ? AND field = 'formule' AND old_value IS NULL AND new_value = ?", r.id, r.formule)
            && !get("SELECT 1 FROM indicator_history WHERE indicator_id = ? AND field = 'formule' AND old_value IS NOT NULL", r.id)));
        if (!r.formule || (auto && r.formule !== formule)) { run('UPDATE indicators SET formule = ? WHERE id = ?', formule, r.id); hist(r.id, 'formule', r.formule || null, formule); stats.formules++; }
        if (!r.formule || auto) autoMap[r.id] = formule;
        if (!r.mode_calcul || (auto && r.mode_calcul !== mode)) { run('UPDATE indicators SET mode_calcul = ? WHERE id = ?', mode, r.id); stats.modes++; }
        if (once) {
          for (const d of ds) if (known.has(d)) stats.liens += run('INSERT OR IGNORE INTO indicator_datasets (indicator_id, dataset_id) VALUES (?,?)', r.id, d).changes;
          if (couche && !r.couche_id) run('UPDATE indicators SET couche_id = ? WHERE id = ?', couche, r.id);
        }
      }
      const s = find(S, r);
      const next = withSources(r.proposition, s?.[2]);
      if ((next ?? null) !== (r.proposition ?? null)) {
        run('UPDATE indicators SET proposition = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', next, r.id);
        hist(r.id, 'proposition', r.proposition, next);
        stats.sources++;
      }
      if (s?.[3] && !r.lien_donnees) run('UPDATE indicators SET lien_donnees = ? WHERE id = ?', s[3], r.id);
      // faisabilité proposée (une seule fois, si elle n'a jamais été modifiée à la main)
      if (once && !get("SELECT 1 FROM indicator_history WHERE indicator_id = ? AND field = 'faisabilite'", r.id)) {
        const linked = get('SELECT 1 FROM indicator_datasets WHERE indicator_id = ? LIMIT 1', r.id) || (f && f[5]);
        const fa = linked ? 1 : s?.[4];
        if (fa && fa !== r.faisabilite) run('UPDATE indicators SET faisabilite = ? WHERE id = ?', fa, r.id);
      }
    }
    if (once) run("INSERT INTO app_settings (key, value) VALUES ('formules_links_v2', ?)", new Date().toISOString());
    run("INSERT INTO app_settings (key, value) VALUES ('formules_auto', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(autoMap));
  });
  return stats;
}

module.exports = { apply, F, S, norm };
