// Tableau de bord des indicateurs clés : valeur la plus récente, évolution, comparaison Val-de-Marne / Île-de-France,
// et état de validation des fiches indicateurs correspondantes.
const { all } = require('./db');
const { REF_GEO } = require('./seed');

// jeux NON PUBLICS (accès habilité) : les KPI qui en sont issus sont signalés dans l'interface
const PRIVES = new Set(require('./datasets').filter((d) => d.prive).map((d) => d.id));
const IGNORED = new Set(['UNIT_MEASURE', 'UNIT_MULT', 'OBS_STATUS']);
// Mailles de contexte (calculées à chaque compute) : la valeur d'un KPI départemental ou régional s'affiche avec un badge.
const GEOS_MAILLE = {};
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, ' ').toLowerCase();

// dir : sens favorable (up = une hausse est positive, down = une hausse est défavorable, none = neutre)
// where : modalités retenues ; les autres dimensions doivent valoir _T (total). ratio : num / den sur une dimension.
// cmp : comparaison pertinente avec le Val-de-Marne et l'Île-de-France (taux, prix, niveaux de vie ; pas les effectifs bruts)
// diff : différence num − den (ex. naissances − décès) au lieu d'un rapport
// cumul : série de flux annuels transformée en stock (somme cumulée ; les lignes sans date comptent dans le stock initial)
// sum : dimensions additionnées (toutes modalités) au lieu d'exiger leur total _T (jeux sans modalité totale, ex. Flores par activité)
// partial : la source ne couvre pas tout le territoire (true = aucun cumul, ou liste de clés 'dep'/'reg' à ne pas cumuler)
const KPIS = [
  { id: 'population', concept: 'population', label: 'Population (recensement)', theme: 'Démographie', dataset: 'rp_serie_historique', where: { RP_MEASURE: 'POP', OCS: '_T' }, dir: 'none', ind: /population/ },
  { id: 'naissances', perK: true, label: 'Naissances domiciliées', theme: 'Démographie', dataset: 'etat_civil_nais', where: { EC_MEASURE: 'LVB' }, dir: 'none', ind: /naissance/ },
  { id: 'niveau_vie', label: 'Niveau de vie médian', theme: 'Cohésion sociale', dataset: 'filosofi', datasets: ['filosofi', 'filosofi_fichier'], where: { FILOSOFI_MEASURE: 'MED_SL' }, unit: '€', cmp: true, dir: 'up', ind: /niveau de vie|revenu median/ },
  { id: 'pauvrete', label: 'Taux de pauvreté', theme: 'Cohésion sociale', dataset: 'filosofi', datasets: ['filosofi', 'filosofi_fichier'], where: { FILOSOFI_MEASURE: 'PR_MD60' }, unit: '%', cmp: true, dir: 'down', ind: /pauvrete/ },
  { id: 'rsa', concept: 'rsa', perK: true, label: 'Foyers au RSA (fichier RSA de la CAF)', theme: 'Cohésion sociale', dataset: 'caf_rsa', where: { MESURE: 'FOYERS_RSA', TYPE_RSA: '_T' }, dir: 'down', ind: /rsa|minima sociaux/ },
  { id: 'chomage', label: 'Taux de chômage (15-64 ans)', theme: 'Emploi', dataset: 'rp_activite_chomage', where: { SEX: '_T', EDUC: '_T', AGE: 'Y15T64', RP_MEASURE: 'POP' }, ratio: { dim: 'EMPSTA_ENQ', num: ['2'], den: ['1T2'] }, unit: '%', cmp: true, dir: 'down', ind: /chomage|demandeurs d emploi/ },
  { id: 'defm', label: "Demandeurs d'emploi inscrits (catégories A, B, C)", theme: 'Emploi', dataset: 'ft_defm', where: { MESURE: 'DEFM_ABC', SEXE: '_T', AGE: '_T' }, dir: 'down', ind: /demandeurs d emploi|france travail/ },
  { id: 'defm_1000', label: "Demandeurs d'emploi pour 1 000 habitants", theme: 'Emploi', dataset: 'ft_defm', where: { MESURE: 'DEFM_ABC', SEXE: '_T', AGE: '_T' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /demandeurs d emploi|france travail/ },
  { id: 'defm_jeunes', label: "Part des moins de 25 ans parmi les demandeurs d'emploi", theme: 'Emploi', dataset: 'ft_defm', where: { MESURE: 'DEFM_ABC', SEXE: '_T' }, ratio: { dim: 'AGE', num: ['Y_LT25'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /demandeurs d emploi|jeunes|france travail/ },
  { id: 'defm_50', label: "Part des 50 ans et plus parmi les demandeurs d'emploi", theme: 'Emploi', dataset: 'ft_defm', where: { MESURE: 'DEFM_ABC', SEXE: '_T' }, ratio: { dim: 'AGE', num: ['Y_GE50'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /demandeurs d emploi|seniors|france travail/ },
  { id: 'defm_femmes', label: "Part des femmes parmi les demandeurs d'emploi", theme: 'Emploi', dataset: 'ft_defm', where: { MESURE: 'DEFM_ABC', AGE: '_T' }, ratio: { dim: 'SEXE', num: ['F'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /demandeurs d emploi|france travail/ },
  { id: 'emploi_lt', label: "Emplois au lieu de travail", theme: 'Emploi', dataset: 'rp_emploi_lt', where: { RP_MEASURE: 'NBEMP', EMPSTA_ENQ: '1', SEX: '_T', EMPFORM: '_T', WKTIME: '_T', AGE: '_T' }, dir: 'up', ind: /nombre d emplois|evolution du nombre d emplois|densite d emplois/ },
  { id: 'cambriolages', label: 'Cambriolages de logement (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'CAMBRIOLAGES' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'violences', label: 'Violences physiques hors cadre familial (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'VIOL_HORS_FAMILLE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'violences_fam', label: 'Violences intrafamiliales (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'VIOL_FAMILIALES' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'vols_sans_violence', label: 'Vols sans violence (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'VOLS_SANS_VIOLENCE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'stupefiants', label: 'Trafic de stupéfiants (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'STUP_TRAFIC' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'degradations', label: 'Destructions et dégradations (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'DEGRADATIONS' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'dette_hab', label: 'Encours de la dette (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'DETTE_HAB' }, unit: '€', cmp: true, dir: 'down', ind: /^$/ },
  { id: 'personnel_hab', label: 'Charges de personnel (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'PERSONNEL_HAB' }, unit: '€', cmp: true, dir: 'none', ind: /^$/ },
  { id: 'equipement_hab', label: 'Dépenses d’équipement (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'EQUIPEMENT_HAB' }, unit: '€', cmp: true, dir: 'up', ind: /^$/ },
  { id: 'caf_hab', label: 'Capacité d’autofinancement (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'CAF_HAB' }, unit: '€', cmp: true, dir: 'up', ind: /^$/ },
  { id: 'impots_hab', label: 'Impôts locaux (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'IMPOTS_LOCAUX_HAB' }, unit: '€', cmp: true, dir: 'none', ind: /^$/ },
  { id: 'pharmacies', label: 'Pharmacies (pour 1 000 hab.)', theme: 'Santé', dataset: 'finess', where: { MESURE: 'ETABLISSEMENTS', CATEGORIE: 'PHARMACIE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'centres_sante', label: 'Centres de santé (pour 1 000 hab.)', theme: 'Santé', dataset: 'finess', where: { MESURE: 'ETABLISSEMENTS', CATEGORIE: 'CENTRE_SANTE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'ehpad', label: 'EHPAD (pour 1 000 hab.)', theme: 'Santé', dataset: 'finess', where: { MESURE: 'ETABLISSEMENTS', CATEGORIE: 'EHPAD' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'equip_sport', label: 'Équipements sportifs (pour 1 000 hab.)', theme: 'Sport', dataset: 'equipements_sportifs', where: { MESURE: 'EQUIPEMENTS', FAMILLE: '_T' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'passoires', label: 'Part de logements classés F ou G (DPE)', theme: 'Logement', dataset: 'dpe', where: {}, ratio: { dim: 'MESURE', num: ['DPE_F', 'DPE_G'], den: ['NB_DPE'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /passoire|dpe|etiquette energ/ },
  { id: 'dpe_ab', label: 'Part de logements classés A ou B (DPE)', theme: 'Logement', dataset: 'dpe', where: {}, ratio: { dim: 'MESURE', num: ['DPE_A', 'DPE_B'], den: ['NB_DPE'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'catnat', label: 'Arrêtés de catastrophe naturelle sur 10 ans', theme: 'Environnement', dataset: 'gaspar', where: { MESURE: 'ARRETES_10ANS', CATNAT_TYPE: '_T' }, dir: 'down', ind: /risque|catastrophe|inondation/ },
  { id: 'risques_recenses', label: 'Risques majeurs recensés dans la commune', theme: 'Environnement', dataset: 'gaspar', where: { MESURE: 'RISQUES_RECENSES', RISQUE_TYPE: '_T' }, dir: 'down', ind: /risques recenses|risques majeurs/ },
  { id: 'allocataires_caf', label: 'Foyers allocataires CAF (pour 1 000 hab.)', theme: 'Cohésion sociale', dataset: 'caf_prestations', where: { MESURE: 'FOYERS_ALLOCATAIRES' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /beneficiaires d aides sociales/ },
  { id: 'ppa', label: 'Foyers percevant la prime d’activité (pour 1 000 hab.)', theme: 'Cohésion sociale', dataset: 'caf_prestations', where: { MESURE: 'FOYERS_PPA' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'aides_logement', label: 'Foyers percevant l’APL (pour 1 000 hab.)', theme: 'Logement', dataset: 'caf_prestations', where: { MESURE: 'FOYERS_APL' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'ips_public', label: 'IPS moyen des écoles publiques', theme: 'Éducation', dataset: 'ips_ecoles', where: { MESURE: 'IPS_MOYEN', SECTEUR: 'public' }, cmp: true, dir: 'up', ind: /^$/ },
  { id: 'foyers_imposes', label: 'Part des foyers fiscaux imposés', theme: 'Cohésion sociale', dataset: 'ircom', where: { TRANCHE: '_T' }, ratio: { dim: 'MESURE', num: ['FOYERS_IMPOSES'], den: ['FOYERS_FISCAUX'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'rfr_moyen', label: 'Revenu fiscal de référence moyen par foyer', theme: 'Cohésion sociale', dataset: 'ircom', where: { TRANCHE: '_T' }, ratio: { dim: 'MESURE', num: ['RFR'], den: ['FOYERS_FISCAUX'] }, factor: 1000, unit: '€', cmp: true, fromCommunes: true, dir: 'up', ind: /revenu median|revenus medians/ },
  { id: 'bas_revenus', label: 'Part des foyers fiscaux sous 10 000 € de revenu fiscal de référence', theme: 'Cohésion sociale', dataset: 'ircom', where: { MESURE: 'FOYERS_FISCAUX' }, ratio: { dim: 'TRANCHE', num: ['T1'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /part des bas revenus|projection des bas revenus/ },
  { id: 'generalistes', label: 'Médecins généralistes libéraux (pour 1 000 hab.)', theme: 'Santé', dataset: 'sante_pro', where: { MESURE: 'PROFESSIONNELS', PROFESSION: 'GENERALISTE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /densite medicale|rapport entre l offre et la demande en soins/ },
  { id: 'dentistes', label: 'Chirurgiens-dentistes (pour 1 000 hab.)', theme: 'Santé', dataset: 'sante_pro', where: { MESURE: 'PROFESSIONNELS', PROFESSION: 'DENTISTE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'specialistes', label: 'Autres médecins spécialistes (pour 1 000 hab.)', theme: 'Santé', dataset: 'sante_pro', where: { MESURE: 'PROFESSIONNELS', PROFESSION: 'AUTRE_SPECIALISTE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  // Assurance Maladie (data.ameli.fr), maille départementale : contexte du Val-de-Marne et de l'Île-de-France
  { id: 'ald', label: 'Personnes en affection de longue durée (ALD) — Val-de-Marne', theme: 'Santé', dataset: 'ameli_ald', contexteDep: 'dep', where: { MESURE: 'ALD' }, dir: 'none', cmp: true, ind: /nb ald|evolution du nombre d ald/ },
  { id: 'ald_1000', label: 'Personnes en ALD pour 1 000 habitants — Val-de-Marne', theme: 'Santé', dataset: 'ameli_ald', contexteDep: 'dep', where: { MESURE: 'ALD' }, perK: true, kpiPerK: true, cmp: true, dir: 'none', ind: /^$/ },
  { id: 'ald_sans_mt', label: 'Part des patients en ALD sans médecin traitant — Val-de-Marne', theme: 'Santé', dataset: 'ameli_ald_sans_mt', contexteDep: 'dep', where: { MESURE: 'TAUX_ALD_SANS_MT' }, unit: '%', cmp: true, dir: 'down', ind: /^$/ },
  { id: 'couverture_sas', label: 'Population couverte par le service d’accès aux soins (SAS) — Val-de-Marne', theme: 'Santé', dataset: 'ameli_sas', contexteDep: 'dep', where: { MESURE: 'TAUX_SAS' }, unit: '%', cmp: true, dir: 'up', ind: /^$/ },
  { id: 'logements', label: 'Logements', theme: 'Logement', dataset: 'rp_logement', where: { RP_MEASURE: 'DWELLINGS', OCS: '_T' }, dir: 'none', ind: /^parc de logements|^nombre de logements$/ },
  { id: 'vacance', label: 'Part de logements vacants (parc privé)', theme: 'Logement', dataset: 'lovac', where: {}, ratio: { dim: 'MESURE', num: ['PP_VACANT'], den: ['PP_TOTAL'] }, unit: '%', cmp: true, dir: 'down', ind: /vacan/ },
  { id: 'sru', label: 'Taux de logements sociaux (SRU)', theme: 'Logement', dataset: 'sru', where: { MESURE: 'TAUX_SRU' }, unit: '%', cmp: true, dir: 'up', ind: /sru|logements sociaux/ },
  { id: 'rpls', concept: 'parc_social', perK: true, label: 'Logements locatifs sociaux (RPLS)', theme: 'Logement', dataset: 'rpls', where: { MESURE: 'LOGEMENTS_SOCIAUX', CRITERE: 'TOTAL', MODALITE: '_T' }, dir: 'up', ind: /logements sociaux|logement social/ },
  { id: 'autorises', perK: true, label: 'Logements autorisés', theme: 'Logement', dataset: 'sitadel', where: { MESURE: 'LGT_AUTORISES', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' }, skipCurrent: true, dir: 'up', ind: /permis|autorises|projets de construction/ },
  { id: 'commences', perK: true, label: 'Logements commencés', theme: 'Logement', dataset: 'sitadel', where: { MESURE: 'LGT_COMMENCES', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' }, skipCurrent: true, dir: 'up', ind: /commences/ },
  { id: 'prix', label: 'Prix médian des appartements (€/m²)', theme: 'Logement', dataset: 'dvf', where: { MESURE: 'PRIX_M2_MEDIAN', TYPE_LOCAL: 'Appartement' }, unit: '€/m²', cmp: true, dir: 'none', ind: /prix|evolution des prix/ },
  { id: 'loyer', label: 'Loyer médian des appartements (€/m²)', theme: 'Logement', dataset: 'loyers', where: { MESURE: 'LOYER_M2', TYPE_BIEN: 'APPARTEMENT' }, unit: '€/m²', cmp: true, dir: 'none', ind: /loyer/ },
  { id: 'conso', perK: true, label: "Consommation d'énergie résidentielle (MWh)", theme: 'Environnement', dataset: 'ore_conso', where: { MESURE: 'CONSO_MWH', FILIERE: '_T', SECTEUR: 'RESIDENTIEL' }, dir: 'down', ind: /consommation energetique|consommations d energie|renovation energetique/ },
  { id: 'accidents', perK: true, label: 'Accidents corporels', theme: 'Mobilité', dataset: 'baac', where: { MESURE: 'ACCIDENTS', LUMINOSITE: '_T', AGGLOMERATION: '_T' }, dir: 'down', ind: /accident/ },
  { id: 'associations', perK: true, label: 'Établissements d’associations présents dans la commune (sièges et antennes, stock du jour)', theme: 'Vie associative', dataset: 'entreprises', where: { MESURE: 'ASSOCIATIONS' }, dir: 'none', ind: /^$/ },
  // formes d'emploi, diplômes, effectifs salariés (jeux INSEE ajoutés pour nourrir la conception)
  { id: 'precaires', label: 'Part des salariés en contrat précaire (CDD, intérim, apprentissage…)', theme: 'Emploi', dataset: 'rp_formes_emploi', where: { EMPSTA_ENQ: '1', SEX: '_T', AGE: 'Y_GE15', WKTIME: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'EMPFORM', num: ['22T27'], den: ['211', '22T27'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /contrats precaires/ },
  { id: 'temps_partiel', label: 'Part des actifs occupés à temps partiel', theme: 'Emploi', dataset: 'rp_formes_emploi', where: { EMPSTA_ENQ: '1', SEX: '_T', AGE: 'Y_GE15', EMPFORM: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'WKTIME', num: ['PT'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'non_salaries', label: 'Part des non-salariés parmi les actifs occupés', theme: 'Emploi', dataset: 'rp_formes_emploi', where: { EMPSTA_ENQ: '1', SEX: '_T', AGE: 'Y_GE15', WKTIME: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'EMPFORM', num: ['1'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'sans_diplome', label: 'Part des 15 ans ou plus non scolarisés sans diplôme', theme: 'Éducation', dataset: 'rp_diplomes', where: { SEX: '_T', AGE: 'Y_GE15', RP_MEASURE: 'POP' }, ratio: { dim: 'EDUC', num: ['001T100_RP'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'diplomes_sup', label: 'Part des 15 ans ou plus non scolarisés diplômés du supérieur', theme: 'Éducation', dataset: 'rp_diplomes', where: { SEX: '_T', AGE: 'Y_GE15', RP_MEASURE: 'POP' }, ratio: { dim: 'EDUC', num: ['500T702_RP'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'salaries', label: 'Effectifs salariés des établissements (Flores)', theme: 'Emploi', dataset: 'flores', where: { FLORES_MEASURE: 'EMPL3112', LEGAL_FORM_WITH_PUBLIC: '1T9X7' }, sum: ['ACTIVITY'], dir: 'up', ind: /^$/ },
  { id: 'salaries_asso', perK: true, label: 'Salariés des organisations associatives (Flores)', theme: 'Vie associative', dataset: 'flores', where: { FLORES_MEASURE: 'EMPL3112', LEGAL_FORM_WITH_PUBLIC: '1T9X7', ACTIVITY: '94' }, dir: 'none', ind: /^$/ },
  // autres jeux importés encore peu exploités
  { id: 'immigres', label: 'Part des immigrés dans la population', theme: 'Démographie', dataset: 'rp_immigration', where: { SEX: '_T', AGE: '_T', EMPSTA_ENQ: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'IMMI', num: ['1'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'travail_commune', label: 'Part des actifs occupés travaillant dans leur commune de résidence', theme: 'Mobilité', dataset: 'rp_navettes', where: { EMPSTA_ENQ: '1', SEX: '_T', AGE: 'Y_GE15', TRANS: '_T', WORK_URBAN_AREA: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'WORK_AREA', num: ['10'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'modes_actifs', label: 'Part des actifs allant travailler à pied ou à vélo', theme: 'Mobilité', dataset: 'rp_navettes', where: { EMPSTA_ENQ: '1', SEX: '_T', AGE: 'Y_GE15', WORK_AREA: '_T', WORK_URBAN_AREA: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'TRANS', num: ['2', '3'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'up', ind: /^part modale|evolution des deplacements par type/ },
  { id: 'transports_commun', label: 'Part des actifs allant travailler en transports en commun', theme: 'Mobilité', dataset: 'rp_navettes', where: { EMPSTA_ENQ: '1', SEX: '_T', AGE: 'Y_GE15', WORK_AREA: '_T', WORK_URBAN_AREA: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'TRANS', num: ['6'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'voiture_travail', label: 'Part des actifs allant travailler en voiture', theme: 'Mobilité', dataset: 'rp_navettes', where: { EMPSTA_ENQ: '1', SEX: '_T', AGE: 'Y_GE15', WORK_AREA: '_T', WORK_URBAN_AREA: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'TRANS', num: ['5'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'vp_electriques', label: 'Part des voitures particulières électriques', theme: 'Mobilité', dataset: 'ore_parc_auto', where: {}, ratio: { dim: 'MESURE', num: ['VP_ELECTRIQUES'], den: ['VP'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'irve', label: 'Points de recharge en service pour véhicules électriques (pour 1 000 hab.)', theme: 'Mobilité', dataset: 'ore_irve', where: { MESURE: 'PDC_MIS_EN_SERVICE', IMPLANTATION: '_T' }, cumul: true, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'creations', label: 'Créations d’établissements (pour 1 000 hab.)', theme: 'Emploi', dataset: 'side_creations', where: { SIDE_MEASURE: 'UNIT_LOC_BURE', ACTIVITY: '_T', LEGAL_FORM: '_T' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /creations\/fermetures|dynamiques d implantation/ },
  { id: 'artificialisation', label: 'Part de la surface communale artificialisée', theme: 'Environnement', dataset: 'artificialisation', where: { MESURE: 'PART_ARTIF' }, unit: '%', cmp: true, dir: 'down', ind: /impermeabilite des sols/ },
  { id: 'viol_sexuelles', label: 'Violences sexuelles (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'VIOL_SEXUELLES' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'vols_violents', label: 'Vols violents sans arme (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'VOLS_VIOLENTS' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'escroqueries', label: 'Escroqueries (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'ESCROQUERIES' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'vols_vehicules', label: 'Vols de véhicules (pour 1 000 hab.)', theme: 'Sécurité', dataset: 'ssmsi', where: { MESURE: 'NOMBRE', INFRACTION: 'VOL_VEHICULE' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'dgf_hab', label: 'Dotation globale de fonctionnement (€/hab.)', theme: 'Finances locales', dataset: 'finances', where: { MESURE: 'DGF_HAB' }, unit: '€', cmp: true, dir: 'none', ind: /^$/ },
  // valeurs des fiches de contexte, de suivi et d'évaluation calculables à partir des jeux importés
  { id: 'moins18', label: 'Part des moins de 18 ans', theme: 'Démographie', dataset: 'rp_pop_agesex', where: { SEX: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'AGE', num: ['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13', 'Y14', 'Y15', 'Y16', 'Y17'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^part des moins de 18 ans$|^evolution du nombre et de la part des moins de 18 ans$/ },
  { id: 'plus65', label: 'Part des 65 ans ou plus', theme: 'Démographie', dataset: 'rp_pop_agesex', where: { SEX: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'AGE', num: ['Y65', 'Y66', 'Y67', 'Y68', 'Y69', 'Y70', 'Y71', 'Y72', 'Y73', 'Y74', 'Y75', 'Y76', 'Y77', 'Y78', 'Y79', 'Y80', 'Y81', 'Y82', 'Y83', 'Y84', 'Y85', 'Y86', 'Y87', 'Y88', 'Y89', 'Y90', 'Y91', 'Y92', 'Y93', 'Y94', 'Y95', 'Y96', 'Y97', 'Y98', 'Y99', 'Y_GE100'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^part des 65 ans et plus$|^evolution du nombre et de la part des \+ de 65 ans$|impact de la part des \+ de 65 ans/ },
  { id: 'vieillissement', label: 'Indice de vieillissement (65 ans ou plus pour 100 jeunes de moins de 20 ans)', theme: 'Démographie', dataset: 'rp_pop_agesex', where: { SEX: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'AGE', num: ['Y65', 'Y66', 'Y67', 'Y68', 'Y69', 'Y70', 'Y71', 'Y72', 'Y73', 'Y74', 'Y75', 'Y76', 'Y77', 'Y78', 'Y79', 'Y80', 'Y81', 'Y82', 'Y83', 'Y84', 'Y85', 'Y86', 'Y87', 'Y88', 'Y89', 'Y90', 'Y91', 'Y92', 'Y93', 'Y94', 'Y95', 'Y96', 'Y97', 'Y98', 'Y99', 'Y_GE100'], den: ['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13', 'Y14', 'Y15', 'Y16', 'Y17', 'Y18', 'Y19'] }, cmp: true, fromCommunes: true, dir: 'none', ind: /indicateur de vieillissement/ },
  { id: 'jeunesse', label: 'Indice de jeunesse (moins de 20 ans pour 100 personnes de 60 ans ou plus)', theme: 'Démographie', dataset: 'rp_pop_agesex', where: { SEX: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'AGE', num: ['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13', 'Y14', 'Y15', 'Y16', 'Y17', 'Y18', 'Y19'], den: ['Y60', 'Y61', 'Y62', 'Y63', 'Y64', 'Y65', 'Y66', 'Y67', 'Y68', 'Y69', 'Y70', 'Y71', 'Y72', 'Y73', 'Y74', 'Y75', 'Y76', 'Y77', 'Y78', 'Y79', 'Y80', 'Y81', 'Y82', 'Y83', 'Y84', 'Y85', 'Y86', 'Y87', 'Y88', 'Y89', 'Y90', 'Y91', 'Y92', 'Y93', 'Y94', 'Y95', 'Y96', 'Y97', 'Y98', 'Y99', 'Y_GE100'] }, cmp: true, fromCommunes: true, dir: 'none', ind: /^indice de jeunesse$/ },
  { id: 'dependance', label: 'Taux de dépendance démographique ((0-19 ans + 65 ans ou plus) / 20-64 ans)', theme: 'Démographie', dataset: 'rp_pop_agesex', where: { SEX: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'AGE', num: ['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13', 'Y14', 'Y15', 'Y16', 'Y17', 'Y18', 'Y19', 'Y65', 'Y66', 'Y67', 'Y68', 'Y69', 'Y70', 'Y71', 'Y72', 'Y73', 'Y74', 'Y75', 'Y76', 'Y77', 'Y78', 'Y79', 'Y80', 'Y81', 'Y82', 'Y83', 'Y84', 'Y85', 'Y86', 'Y87', 'Y88', 'Y89', 'Y90', 'Y91', 'Y92', 'Y93', 'Y94', 'Y95', 'Y96', 'Y97', 'Y98', 'Y99', 'Y_GE100'], den: ['Y20', 'Y21', 'Y22', 'Y23', 'Y24', 'Y25', 'Y26', 'Y27', 'Y28', 'Y29', 'Y30', 'Y31', 'Y32', 'Y33', 'Y34', 'Y35', 'Y36', 'Y37', 'Y38', 'Y39', 'Y40', 'Y41', 'Y42', 'Y43', 'Y44', 'Y45', 'Y46', 'Y47', 'Y48', 'Y49', 'Y50', 'Y51', 'Y52', 'Y53', 'Y54', 'Y55', 'Y56', 'Y57', 'Y58', 'Y59', 'Y60', 'Y61', 'Y62', 'Y63', 'Y64'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /dependance demographique/ },
  { id: 'natalite', label: 'Taux de natalité (naissances pour 1 000 hab.)', theme: 'Démographie', dataset: 'etat_civil_nais', where: { EC_MEASURE: 'LVB' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /taux de natalite/ },
  { id: 'mortalite', label: 'Taux de mortalité (décès pour 1 000 hab.)', theme: 'Démographie', dataset: 'etat_civil_deces', where: { EC_MEASURE: 'DTH' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /taux de mortalite/ },
  { id: 'solde_naturel', label: 'Solde naturel entre deux recensements (naissances − décès)', theme: 'Démographie', dataset: 'rp_serie_historique', where: { OCS: '_T' }, ratio: { dim: 'RP_MEASURE', num: ['BRTH'], den: ['DEATH'] }, diff: true, dir: 'up', ind: /solde naturel/ },
  { id: 'monoparentaux', label: 'Part des familles monoparentales parmi les ménages', theme: 'Démographie', dataset: 'rp_menages_type', where: { RP_MEASURE: 'DWELLINGS', OCS: 'DW_MAIN', AGE: '_T' }, ratio: { dim: 'TPH', num: ['MF21'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /menages monoparentaux|familles monoparentales/ },
  { id: 'etrangers', label: 'Part des étrangers dans la population', theme: 'Démographie', dataset: 'rp_nationalite', where: { SEX: '_T', AGE: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'NATIONALITY_TYPE', num: ['100'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /part d etrangers/ },
  { id: 'taille_menages', label: 'Taille moyenne des ménages (personnes par ménage)', theme: 'Démographie', dataset: 'rp_serie_historique', where: { OCS: 'DW_MAIN' }, ratio: { dim: 'RP_MEASURE', num: ['DWELLINGS_POPSIZE'], den: ['DWELLINGS'] }, factor: 1, cmp: true, dir: 'none', ind: /taille des menages|besoins en logement s et services/ },
  { id: 'arrivants', label: 'Part des habitants arrivés d’une autre commune dans l’année', theme: 'Démographie', dataset: 'rp_migrations', where: { RP_MEASURE: 'POP', AGE: 'Y_GE1' }, ratio: { dim: 'PREV_RES_AREA', num: ['20_30'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /attractivite residentielle|facteurs d attractivite|solde migratoire/ },
  { id: 'activite', label: 'Taux d’activité des 15-64 ans', theme: 'Emploi', dataset: 'rp_activite_chomage', where: { SEX: '_T', EDUC: '_T', AGE: 'Y15T64', RP_MEASURE: 'POP' }, ratio: { dim: 'EMPSTA_ENQ', num: ['1T2'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'up', ind: /taux d activite|projection du nombre d actifs/ },
  { id: 'cadres', label: 'Part des cadres et professions intellectuelles supérieures (15 ans ou plus)', theme: 'Emploi', dataset: 'rp_csp', where: { SEX: '_T', AGE: 'Y_GE15', RP_MEASURE: 'POP' }, ratio: { dim: 'PCS', num: ['3'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /categorie socio.professionnelle|repartition des csp|csp en regression|profils des actifs/ },
  { id: 'ouvriers_employes', label: 'Part des ouvriers et employés (15 ans ou plus)', theme: 'Emploi', dataset: 'rp_csp', where: { SEX: '_T', AGE: 'Y_GE15', RP_MEASURE: 'POP' }, ratio: { dim: 'PCS', num: ['5', '6'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'commerces', perK: true, label: 'Établissements du commerce, des transports et de l’hébergement-restauration', theme: 'Emploi', dataset: 'side_stocks', where: { SIDE_MEASURE: 'UNIT_LOC', ACTIVITY: 'GI' }, dir: 'up', ind: /nb de commerces|^ecart a l echelle supra/ },
  { id: 'etablissements', perK: true, label: 'Établissements (tous secteurs)', theme: 'Emploi', dataset: 'side_stocks', where: { SIDE_MEASURE: 'UNIT_LOC', ACTIVITY: '_T' }, dir: 'up', ind: /entreprises hors commerce|evolution en secteurs d activites/ },
  { id: 'ess', perK: true, label: 'Établissements de l’économie sociale et solidaire (stock du jour)', theme: 'Emploi', dataset: 'entreprises', where: { MESURE: 'ESS' }, dir: 'up', ind: /structures de l ess|evolution du nb \/ nb entreprises/ },
  { id: 'praticiens', perK: true, label: 'Professionnels de santé libéraux (toutes professions)', theme: 'Santé', dataset: 'sante_pro', where: { MESURE: 'PROFESSIONNELS', PROFESSION: '_T' }, dir: 'up', ind: /nb de praticiens|evolution du nombre de praticiens|^offre de soin$|evolution de l offre de soins/ },
  { id: 'personnes_piece', label: 'Personnes par pièce dans les résidences principales (sur-occupation)', theme: 'Logement', dataset: 'rp_logement', where: { OCS: 'DW_MAIN' }, ratio: { dim: 'RP_MEASURE', num: ['DWELLINGS_POPSIZE'], den: ['DWELLINGS_ROOMS'] }, factor: 1, cmp: true, fromCommunes: true, dir: 'down', ind: /sur.occup/ },
  { id: 'acheves', perK: true, label: 'Logements achevés', theme: 'Logement', dataset: 'sitadel', where: { MESURE: 'LGT_ACHEVES', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' }, skipCurrent: true, dir: 'up', ind: /programmes livres|commences\/acheves/ },
  { id: 'motorisation', label: 'Part des ménages disposant d’au moins une voiture', theme: 'Mobilité', dataset: 'rp_logement', where: { RP_MEASURE: 'DWELLINGS', OCS: 'DW_MAIN' }, ratio: { dim: 'CARS', num: ['C_GE1'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /taux de motorisation/ },
  { id: 'validations', perK: true, label: 'Validations dans les gares ferrées de la commune (trimestre)', theme: 'Mobilité', dataset: 'idfm_ferre', where: { MESURE: 'VALIDATIONS' }, dir: 'up', ind: /frequentation des lignes/ },
  { id: 'places_velo', perK: true, label: 'Places de stationnement vélo (OpenStreetMap)', theme: 'Mobilité', dataset: 'velo_stationnement', where: { MESURE: 'CAPACITE', MOBILIER: '_T' }, dir: 'up', ind: /stationnements velo/ },
  { id: 'icu_fort', label: 'Part de la surface en aléa fort d’îlot de chaleur la nuit', theme: 'Environnement', dataset: 'icu', where: { MESURE: 'SURFACE_ALEA_NUIT_HA', LCZ: '_T' }, ratio: { dim: 'CLASSE', num: ['3'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /ilots de chaleur identifies|exposition aux ilots de chaleur/ },
  { id: 'points_noirs', label: 'Part des mailles de 500 m en point noir environnemental (cumul de nuisances)', theme: 'Environnement', dataset: 'nuisances', where: { MESURE: 'MAILLES_500M', NB_NUISANCES: '_T' }, ratio: { dim: 'POINT_NOIR', num: ['1'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /exposition aux nuisances sonores|qualite de l air/ },
  { id: 'flux_artif', label: 'Surface nouvellement artificialisée (ha)', theme: 'Environnement', dataset: 'artificialisation', where: { MESURE: 'FLUX_HA' }, dir: 'down', ind: /taux annuel de sol|rapidite d evolution|consommation des espaces naturels/ },
  // vie associative (API Entreprise : données NON PUBLIQUES, Ivry uniquement ; ressources humaines et comptes = déclarations, donc minima)
  { id: 'asso_adherents_moy', declaratif: true, label: 'Adhérents par association (moyenne, associations ayant leur siège dans la commune et déclarant leurs effectifs)', theme: 'Vie associative', dataset: 'associations_api', where: { OBJET: '_T' }, ratio: { dim: 'MESURE', num: ['ADHERENTS'], den: ['NB_RH_DECLAREES'] }, factor: 1, dir: 'up', ind: /^nb d adherents$/ },
  { id: 'asso_salaries_moy', declaratif: true, label: 'Salariés par association (moyenne, associations ayant leur siège dans la commune et déclarant leurs effectifs)', theme: 'Vie associative', dataset: 'associations_api', where: { OBJET: '_T' }, ratio: { dim: 'MESURE', num: ['SALARIES'], den: ['NB_RH_DECLAREES'] }, factor: 1, dir: 'none', ind: /^nb de salaries$/ },
  { id: 'asso_benevoles_moy', declaratif: true, label: 'Bénévoles par association (moyenne, associations ayant leur siège dans la commune et déclarant leurs effectifs)', theme: 'Vie associative', dataset: 'associations_api', where: { OBJET: '_T' }, ratio: { dim: 'MESURE', num: ['BENEVOLES'], den: ['NB_RH_DECLAREES'] }, factor: 1, dir: 'up', ind: /^$/ },
  { id: 'asso_actives', perK: true, label: 'Associations actives ayant leur siège dans la commune', theme: 'Vie associative', dataset: 'associations_api', where: { MESURE: 'NB_ASSOCIATIONS', OBJET: '_T' }, dir: 'up', ind: /nb d associations par type/ },
  { id: 'asso_adherents', declaratif: true, label: 'Adhérents déclarés par les associations', theme: 'Vie associative', dataset: 'associations_api', where: { MESURE: 'ADHERENTS', OBJET: '_T' }, dir: 'up', ind: /^$/ },
  { id: 'asso_benevoles', declaratif: true, label: 'Bénévoles déclarés par les associations', theme: 'Vie associative', dataset: 'associations_api', where: { MESURE: 'BENEVOLES', OBJET: '_T' }, dir: 'up', ind: /benevoles/ },
  { id: 'asso_salaries', declaratif: true, label: 'Salariés déclarés par les associations', theme: 'Vie associative', dataset: 'associations_api', where: { MESURE: 'SALARIES', OBJET: '_T' }, dir: 'up', ind: /^evolution du nombre de salaries$/ },
  { id: 'asso_affiliees', label: 'Associations affiliées à une fédération ou un réseau', theme: 'Vie associative', dataset: 'associations_api', where: { MESURE: 'NB_AFFILIEES', OBJET: '_T' }, dir: 'up', ind: /^$/ },
  { id: 'asso_employeuses', label: 'Part des associations employeuses', theme: 'Vie associative', dataset: 'associations_api', where: { OBJET: '_T' }, ratio: { dim: 'MESURE', num: ['NB_EMPLOYEUSES'], den: ['NB_FICHES'] }, unit: '%', dir: 'none', ind: /^$/ },
  { id: 'asso_subventions', declaratif: true, label: 'Subventions perçues par les associations (€, comptes déclarés)', theme: 'Vie associative', dataset: 'associations_api', where: { MESURE: 'SUBVENTIONS', OBJET: '_T' }, unit: '€', dir: 'none', ind: /^$/ },
  { id: 'asso_volontaires', declaratif: true, label: 'Volontaires (service civique…) dans les associations', theme: 'Vie associative', dataset: 'associations_api', where: { MESURE: 'VOLONTAIRES', OBJET: '_T' }, dir: 'up', ind: /^$/ },
  { id: 'menages_hlm', label: 'Part des ménages locataires du parc social', theme: 'Logement', dataset: 'rp_logement', where: { RP_MEASURE: 'DWELLINGS', OCS: 'DW_MAIN' }, ratio: { dim: 'TSH', num: ['221'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /menages en logement social/ },
  // subventions publiques aux associations (API Entreprise, Data Subvention : NON PUBLIC ; séries annuelles, année en cours exclue)
  { id: 'subv_etat', declaratif: true, partielRaison: 'financeurs couverts : État et collectivités publiant leurs subventions (SCDL) ; associations ayant leur siège dans la commune, têtes de réseau exclues', label: 'Subventions de l’État versées aux associations ayant leur siège dans la commune (€)', theme: 'Vie associative', dataset: 'subventions_asso', where: { MESURE: 'MONTANT_VERSE', FINANCEUR: 'ETAT', DOMAINE: '_T' }, unit: '€', skipCurrent: true, dir: 'none', ind: /^$/ },
  { id: 'subv_etat_hab', declaratif: true, partielRaison: 'financeurs couverts : État et collectivités publiant leurs subventions (SCDL) ; associations ayant leur siège dans la commune, têtes de réseau exclues', label: 'Subventions de l’État versées aux associations, par habitant', theme: 'Vie associative', dataset: 'subventions_asso', where: { MESURE: 'MONTANT_VERSE', FINANCEUR: 'ETAT', DOMAINE: '_T' }, perHab: true, unit: '€/hab.', skipCurrent: true, dir: 'none', ind: /^$/ },
  { id: 'subv_pv_part', declaratif: true, partielRaison: 'financeurs couverts : État et collectivités publiant leurs subventions (SCDL) ; associations ayant leur siège dans la commune, têtes de réseau exclues', label: 'Part de la politique de la ville dans les subventions de l’État aux associations', theme: 'Vie associative', dataset: 'subventions_asso', where: { MESURE: 'MONTANT_VERSE', FINANCEUR: 'ETAT' }, ratio: { dim: 'DOMAINE', num: ['POLITIQUE_VILLE'], den: ['_T'] }, unit: '%', skipCurrent: true, dir: 'none', ind: /^$/ },
  { id: 'subv_accorde', declaratif: true, partielRaison: 'financeurs couverts : État et collectivités publiant leurs subventions (SCDL) ; associations ayant leur siège dans la commune, têtes de réseau exclues', label: 'Subventions accordées aux associations (État et collectivités publiant leurs données, €)', theme: 'Vie associative', dataset: 'subventions_asso', where: { MESURE: 'MONTANT_ACCORDE', FINANCEUR: '_T', DOMAINE: '_T' }, unit: '€', skipCurrent: true, dir: 'none', ind: /^$/ },
  { id: 'subv_assos', declaratif: true, partielRaison: 'financeurs couverts : État et collectivités publiant leurs subventions (SCDL) ; associations ayant leur siège dans la commune, têtes de réseau exclues', label: 'Associations soutenues (versement ou accord dans l’année)', theme: 'Vie associative', dataset: 'subventions_asso', where: { MESURE: 'NB_ASSOCIATIONS_SOUTENUES', FINANCEUR: '_T', DOMAINE: '_T' }, skipCurrent: true, dir: 'up', ind: /^$/ },
  { id: 'subv_taux_accord', declaratif: true, partielRaison: 'financeurs couverts : État et collectivités publiant leurs subventions (SCDL) ; associations ayant leur siège dans la commune, têtes de réseau exclues', label: 'Taux d’accord des demandes de subvention instruites', theme: 'Vie associative', dataset: 'subventions_asso', where: { FINANCEUR: '_T', DOMAINE: '_T' }, ratio: { dim: 'MESURE', num: ['NB_ACCORDEES'], den: ['NB_DECIDEES'] }, unit: '%', skipCurrent: true, dir: 'up', ind: /^$/ },
  { id: 'asso_creees', label: 'Associations créées dans l’année et toujours actives (siège dans la commune)', theme: 'Vie associative', dataset: 'associations_api', where: { MESURE: 'NB_CREEES', OBJET: '_T' }, skipCurrent: true, dir: 'up', ind: /^$/ },
  { id: 'asso_locales', declaratif: true, partielRaison: 'champ d’action renseigné par une minorité d’associations', label: 'Part des associations à champ d’action local (parmi celles qui le renseignent)', theme: 'Vie associative', dataset: 'associations_api', where: { MESURE: 'NB_FICHES', OBJET: '_T' }, ratio: { dim: 'CHAMP', num: ['local'], den: ['local', 'départemental', 'régional', 'national', 'international'] }, unit: '%', dir: 'none', ind: /^$/ },
  // sources alternatives d'un même concept (pastille « multi » et cohérence entre sources dans la conception)
  { id: 'population_pmun', concept: 'population', label: 'Population municipale (populations légales)', theme: 'Démographie', dataset: 'pop_hist', where: { POPREF_MEASURE: 'PMUN' }, dir: 'none', ind: /^population totale$|^evolution annuelle de la population$|^projection de population/ },
  { id: 'rsa_prest', concept: 'rsa', perK: true, label: 'Foyers au RSA (fichier des prestations de la CAF)', theme: 'Cohésion sociale', dataset: 'caf_prestations', where: { MESURE: 'FOYERS_RSA' }, dir: 'down', ind: /rsa|minima sociaux/ },
  { id: 'lls_sru', concept: 'parc_social', perK: true, label: 'Logements locatifs sociaux (inventaire SRU)', theme: 'Logement', dataset: 'sru', where: { MESURE: 'LLS' }, dir: 'up', ind: /logements sociaux|logement social/ },
  // Complémentaire santé solidaire (INSEE / Cnam) : communes comptant un QPV ; le GOSB est recalculé à partir de ses communes,
  // pas le Val-de-Marne ni l'Île-de-France (seules les communes avec QPV sont publiées : une somme serait trompeuse)
  { id: 'c2s_part', label: 'Part des bénéficiaires de la C2S (ex-CMU-C et ACS) dans la population couverte par le régime général', theme: 'Santé', dataset: 'c2s_cnam', where: {}, ratio: { dim: 'MESURE', num: ['C2S_NP', 'C2S_P'], den: ['BENEF_RG'] }, unit: '%', cmp: true, fromCommunes: true, partial: ['dep', 'reg'], dir: 'down', ind: /^$/, indCarte: /cmu/ },
  { id: 'c2s_benef', label: 'Bénéficiaires de la Complémentaire santé solidaire (C2S, ex-CMU-C et ACS)', theme: 'Santé', dataset: 'c2s_cnam', where: { MESURE: 'C2S_TOTAL' }, dir: 'down', ind: /^nb beneficiaires cmu et ame$|^evolution du nombre de beneficiaires cmu et ame$/ },
  { id: 'c2s_np_part', label: 'Part des bénéficiaires de la C2S non participative (ex-CMU-C) dans la population couverte', theme: 'Santé', dataset: 'c2s_cnam', where: {}, ratio: { dim: 'MESURE', num: ['C2S_NP'], den: ['BENEF_RG'] }, unit: '%', cmp: true, fromCommunes: true, partial: ['dep', 'reg'], dir: 'down', ind: /^$/ },
  // accessibilité potentielle localisée (DREES) : moyennes de territoire pondérées par la population standardisée
  { id: 'apl_mg', label: 'Accessibilité aux médecins généralistes (APL, consultations par an et par habitant)', theme: 'Santé', dataset: 'apl_drees', where: { PROFESSION: 'MEDECIN_GENERALISTE' }, ratio: { dim: 'MESURE', num: ['APL_POND'], den: ['POP_STD'] }, factor: 1, cmp: true, fromCommunes: true, unit: 'consult./hab.', dir: 'up', ind: /rapport entre l offre et la demande en soins|secteurs en deficit d offre/ },
  { id: 'apl_inf', label: 'Accessibilité aux infirmiers (APL, ETP pour 100 000 hab.)', theme: 'Santé', dataset: 'apl_drees', where: { PROFESSION: 'INFIRMIER' }, ratio: { dim: 'MESURE', num: ['APL_POND'], den: ['POP_STD'] }, factor: 1, cmp: true, fromCommunes: true, unit: 'ETP/100 000 hab.', dir: 'up', ind: /^$/ },
  { id: 'apl_kine', label: 'Accessibilité aux masseurs-kinésithérapeutes (APL, ETP pour 100 000 hab.)', theme: 'Santé', dataset: 'apl_drees', where: { PROFESSION: 'KINESITHERAPEUTE' }, ratio: { dim: 'MESURE', num: ['APL_POND'], den: ['POP_STD'] }, factor: 1, cmp: true, fromCommunes: true, unit: 'ETP/100 000 hab.', dir: 'up', ind: /^$/ },
  { id: 'apl_dent', label: 'Accessibilité aux chirurgiens-dentistes (APL, ETP pour 100 000 hab.)', theme: 'Santé', dataset: 'apl_drees', where: { PROFESSION: 'CHIRURGIEN_DENTISTE' }, ratio: { dim: 'MESURE', num: ['APL_POND'], den: ['POP_STD'] }, factor: 1, cmp: true, fromCommunes: true, unit: 'ETP/100 000 hab.', dir: 'up', ind: /^$/ },
  { id: 'apl_sf', label: 'Accessibilité aux sages-femmes (APL, ETP pour 100 000 femmes)', theme: 'Santé', dataset: 'apl_drees', where: { PROFESSION: 'SAGE_FEMME' }, ratio: { dim: 'MESURE', num: ['APL_POND'], den: ['POP_STD'] }, factor: 1, cmp: true, fromCommunes: true, unit: 'ETP/100 000', dir: 'up', ind: /^$/ },
  // Institut Paris Region : IDH-2 (1999, 2006, 2013) et mortalité 2019-2023 (ORS)
  { id: 'idh2', label: 'Indice de développement humain (IDH-2)', theme: 'Cohésion sociale', dataset: 'ipr_idh2', where: { MESURE: 'IDH2' }, unit: 'indice (0 à 1)', cmp: true, dir: 'up', ind: /developpement social local/ },
  { id: 'idh2_sante', label: 'IDH-2 : indice de santé', theme: 'Santé', dataset: 'ipr_idh2', where: { MESURE: 'IDH2_SANTE' }, unit: 'indice (0 à 1)', cmp: true, dir: 'up', ind: /^indice determinant de sante$|^evolution de l indice$/ },
  { id: 'espvie_h', label: 'Espérance de vie à la naissance des hommes (2019-2023)', theme: 'Santé', dataset: 'ipr_mortalite', where: { MESURE: 'ESPVIE0_H' }, unit: 'ans', cmp: true, dir: 'up', ind: /^$/ },
  { id: 'espvie_f', label: 'Espérance de vie à la naissance des femmes (2019-2023)', theme: 'Santé', dataset: 'ipr_mortalite', where: { MESURE: 'ESPVIE0_F' }, unit: 'ans', cmp: true, dir: 'up', ind: /^$/ },
  { id: 'mort_prema', label: 'Mortalité prématurée (avant 65 ans, pour 100 000 hab., 2019-2023)', theme: 'Santé', dataset: 'ipr_mortalite', where: { MESURE: 'MORT_PREMA' }, unit: 'pour 100 000 hab.', cmp: true, dir: 'down', ind: /^$/ },
  // minima sociaux : personnes couvertes par le RSA rapportées à la population
  { id: 'rsa_couverture', label: 'Part de la population couverte par le RSA (allocataires et ayants droit)', theme: 'Cohésion sociale', dataset: 'caf_rsa', where: { MESURE: 'PERSONNES_RSA', TYPE_RSA: '_T' }, perPct: true, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /taux de beneficiaires des minima sociaux/ },
  // projection : 65 ans ou plus dans 10 ans par vieillissement des générations (taux de survie à 10 ans approchés des tables
  // de mortalité nationales), sans les migrations — base d'une projection locale, à comparer au scénario OMPHALE de l'INSEE
  { id: 'proj_65plus', projection: true, label: 'Personnes de 65 ans ou plus dans 10 ans (vieillissement des générations, hors migrations)', theme: 'Démographie', dataset: 'rp_pop_agesex', where: { SEX: '_T', RP_MEASURE: 'POP' }, weights: { dim: 'AGE', w: { Y55: 0.93, Y56: 0.93, Y57: 0.93, Y58: 0.93, Y59: 0.93, Y60: 0.93, Y61: 0.93, Y62: 0.93, Y63: 0.93, Y64: 0.93, Y65: 0.85, Y66: 0.85, Y67: 0.85, Y68: 0.85, Y69: 0.85, Y70: 0.85, Y71: 0.85, Y72: 0.85, Y73: 0.85, Y74: 0.85, Y75: 0.6, Y76: 0.6, Y77: 0.6, Y78: 0.6, Y79: 0.6, Y80: 0.6, Y81: 0.6, Y82: 0.6, Y83: 0.6, Y84: 0.6, Y85: 0.22, Y86: 0.22, Y87: 0.22, Y88: 0.22, Y89: 0.22, Y90: 0.22, Y91: 0.22, Y92: 0.22, Y93: 0.22, Y94: 0.22, Y95: 0.03, Y96: 0.03, Y97: 0.03, Y98: 0.03, Y99: 0.03, Y_GE100: 0.01 } }, dir: 'none', ind: /personnes agees projetes/ },
  // ---------------- fiches sans valeur : séries 2012-2017-2023, maille EPT, valeurs dérivées et projections ----------------
  // démographie (recensement, dossiers complets : trois millésimes)
  { id: 'pop_lt20_nb', label: 'Personnes de moins de 20 ans (2012, 2017, 2023)', theme: 'Démographie', dataset: 'rp_pop_hist', where: { SEX: '_T', RP_MEASURE: 'POP', AGE: 'Y_LT20' }, cmp: true, fromCommunes: true, dir: 'none', ind: /evolution du nombre et de la part des moins de 18/ },
  { id: 'pop_lt20_part', label: 'Part des moins de 20 ans (2012, 2017, 2023)', theme: 'Démographie', dataset: 'rp_pop_hist', where: { SEX: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'AGE', num: ['Y_LT20'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^evolution par tranche d age$/ },
  { id: 'pop_65_nb', label: 'Personnes de 65 ans ou plus (2012, 2017, 2023)', theme: 'Démographie', dataset: 'rp_pop_hist', where: { SEX: '_T', RP_MEASURE: 'POP', AGE: 'Y_GE65' }, cmp: true, fromCommunes: true, dir: 'none', ind: /evolution du nombre et de la part des \+ de 65/ },
  { id: 'pop_65_part', label: 'Part des 65 ans ou plus (2012, 2017, 2023)', theme: 'Démographie', dataset: 'rp_pop_hist', where: { SEX: '_T', RP_MEASURE: 'POP' }, ratio: { dim: 'AGE', num: ['Y_GE65'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^evolution par tranche d age$/ },
  { id: 'age_somme', aux: true, label: 'Somme des âges (intermédiaire)', theme: 'Démographie', dataset: 'rp_pop_agesex', where: { SEX: '_T', RP_MEASURE: 'POP' }, weights: { dim: 'AGE', w: Object.fromEntries([...Array(100).keys()].map((a) => [`Y${a}`, a + 0.5]).concat([['Y_GE100', 101]])) }, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'age_pop', aux: true, label: 'Population par âge détaillé (intermédiaire)', theme: 'Démographie', dataset: 'rp_pop_agesex', where: { SEX: '_T', RP_MEASURE: 'POP' }, weights: { dim: 'AGE', w: Object.fromEntries([...Array(100).keys()].map((a) => [`Y${a}`, 1]).concat([['Y_GE100', 1]])) }, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'age_moyen', label: 'Âge moyen de la population', theme: 'Démographie', dataset: 'rp_pop_agesex', where: {}, derive: { from: ['age_somme', 'age_pop'], fn: ([a, b]) => combine(a, b, (x, y) => x / y, 0) }, formule: 'rp_pop_agesex : Σ (âge + 0,5) × population de l’âge / population (âges détaillés, 100 ans ou plus comptés 101)', unit: 'ans', cmp: true, dir: 'none', ind: /^pyramide des ages$/ },
  { id: 'enfants_0_5', projection: true, label: 'Enfants de 0 à 5 ans (élèves de l’élémentaire dans les 6 ans à venir)', theme: 'Démographie', dataset: 'rp_pop_agesex', where: { SEX: '_T', RP_MEASURE: 'POP' }, weights: { dim: 'AGE', w: { Y0: 1, Y1: 1, Y2: 1, Y3: 1, Y4: 1, Y5: 1 } }, cmp: true, fromCommunes: true, dir: 'none', ind: /^besoins scolaires$/ },
  { id: 'nonscol_num', aux: true, label: 'Non scolarisés de 6 à 17 ans (intermédiaire)', theme: 'Démographie', dataset: 'rp_educ_hist', where: { SEX: '_T', STUD: '0', RP_MEASURE: 'POP' }, weights: { dim: 'AGE', w: { Y6T10: 1, Y11T14: 1, Y15T17: 1 } }, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'nonscol_den', aux: true, label: 'Population de 6 à 17 ans (intermédiaire)', theme: 'Démographie', dataset: 'rp_educ_hist', where: { SEX: '_T', STUD: '_T', RP_MEASURE: 'POP' }, weights: { dim: 'AGE', w: { Y6T10: 1, Y11T14: 1, Y15T17: 1 } }, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'non_scolarises', label: 'Part des 6-17 ans non scolarisés', theme: 'Démographie', dataset: 'rp_educ_hist', where: {}, derive: { from: ['nonscol_num', 'nonscol_den'], fn: ([a, b]) => combine(a, b, (x, y) => (x / y) * 100, 0) }, formule: 'rp_educ_hist : non scolarisés de 6-10, 11-14 et 15-17 ans / population de ces âges × 100 (2012, 2017, 2023)', unit: '%', cmp: true, dir: 'down', ind: /moins de 18 ans non scolarises/ },
  { id: 'familles_mono_nb', label: 'Familles monoparentales (2012, 2017, 2023)', theme: 'Démographie', dataset: 'rp_famille', where: { NCH: '_T', RP_MEASURE: 'NBFAM', TFN: '1' }, cmp: true, fromCommunes: true, dir: 'none', ind: /evolution du nombre et de la part des menages monoparentaux/ },
  { id: 'familles_mono_part', label: 'Part des familles monoparentales parmi les familles (2012, 2017, 2023)', theme: 'Démographie', dataset: 'rp_famille', where: { NCH: '_T', RP_MEASURE: 'NBFAM' }, ratio: { dim: 'TFN', num: ['1'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /evolution du nombre et de la part des menages monoparentaux/ },
  { id: 'pop_proj', projection: true, label: 'Population municipale projetée à 10 ans (tendance des 6 derniers millésimes)', theme: 'Démographie', dataset: 'pop_hist', where: {}, derive: { from: ['population_pmun'], fn: ([s]) => trend(s, 10) }, formule: 'pop_hist : tendance linéaire (moindres carrés) de la population municipale sur les 6 derniers millésimes, prolongée de 10 ans', cmp: true, dir: 'none', ind: /^tendances demographiques projetees$/ },
  // emploi et revenus
  { id: 'actifs_commune', aux: true, label: 'Actifs occupés travaillant dans leur commune de résidence (intermédiaire)', theme: 'Emploi', dataset: 'rp_navettes_hist', where: { WORK_AREA: '10', TRANS: '_T', EMPSTA_ENQ: '1', RP_MEASURE: 'POP', AGE: 'Y_GE15' }, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
  { id: 'emplois_habitants', label: 'Part des emplois de la commune occupés par ses habitants', theme: 'Emploi', dataset: 'rp_navettes_hist', where: {}, derive: { from: ['actifs_commune', 'emploi_lt'], fn: ([a, b]) => combine(a, b, (x, y) => (x / y) * 100, 0) }, formule: 'rp_navettes_hist : actifs occupés résidant et travaillant dans la commune / rp_emploi_lt : emplois au lieu de travail × 100', unit: '%', dir: 'up', ind: /part d emplois occupes par des habitants/ },
  { id: 'defm_proj', projection: true, label: 'Demandeurs d’emploi (A, B, C) projetés à 5 ans (tendance des 6 dernières années)', theme: 'Emploi', dataset: 'ft_defm', where: {}, derive: { from: ['defm'], fn: ([s]) => trend(s, 5) }, formule: 'ft_defm : tendance linéaire des demandeurs d’emploi de catégories A, B, C au 4e trimestre des 6 dernières années, prolongée de 5 ans', dir: 'down', ind: /projection du nombre de chomeurs/ },
  { id: 'ecart_revenu', label: 'Écart du niveau de vie médian à celui du Val-de-Marne', theme: 'Cohésion sociale', dataset: 'filosofi', where: {}, derive: { from: ['niveau_vie'], fn: ([s], key, all) => (key === 'dep' ? [] : combine(s, all.niveau_vie?.dep, (x, y) => (x / y - 1) * 100, 0)) }, formule: 'filosofi : (niveau de vie médian de la commune / niveau de vie médian du Val-de-Marne − 1) × 100', unit: '%', cmp: true, dir: 'up', ind: /ecart de revenu avec l echelle supra/ },
  // commerces et activités : lignes de la grille distinguées (commerces / entreprises hors commerce)
  { id: 'commerces_evol', concept: 'commerces', label: 'Établissements du commerce, des transports et de l’hébergement-restauration (évolution)', theme: 'Emploi', dataset: 'side_stocks', where: { SIDE_MEASURE: 'UNIT_LOC', ACTIVITY: 'GI' }, dir: 'up', row: /nb de commerces par types/, ind: /^evolution en nb$/ },
  { id: 'etab_hors_commerce', label: 'Établissements hors commerce, transports et hébergement-restauration', theme: 'Emploi', dataset: 'side_stocks', where: { SIDE_MEASURE: 'UNIT_LOC' }, ratio: { dim: 'ACTIVITY', num: ['_T'], den: ['GI'] }, diff: true, cmp: true, fromCommunes: true, dir: 'up', row: /entreprises hors commerce/, ind: /^evolution en nb$/ },
  { id: 'part_commerce', label: 'Part du commerce, des transports et de l’hébergement-restauration parmi les établissements', theme: 'Emploi', dataset: 'side_stocks', where: { SIDE_MEASURE: 'UNIT_LOC' }, ratio: { dim: 'ACTIVITY', num: ['GI'], den: ['_T'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'none', ind: /^evolution en typologie$/ },
  { id: 'commerces_bpe_1000', label: 'Commerces de la base permanente des équipements (pour 1 000 hab.)', theme: 'Emploi', dataset: 'bpe', where: { BPE_MEASURE: 'FACILITIES', FACILITY_DOM: 'B' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /^besoins en commerces$/ },
  { id: 'creations_nb', aux: true, label: 'Créations d’établissements (intermédiaire)', theme: 'Emploi', dataset: 'side_creations', where: { SIDE_MEASURE: 'UNIT_LOC_BURE', ACTIVITY: '_T', LEGAL_FORM: '_T' }, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'etab_stock', aux: true, label: 'Établissements en stock (intermédiaire)', theme: 'Emploi', dataset: 'side_stocks', where: { SIDE_MEASURE: 'UNIT_LOC', ACTIVITY: '_T' }, cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'taux_creation', label: 'Taux de création d’établissements (créations de l’année / établissements en stock)', theme: 'Emploi', dataset: 'side_creations', where: {}, derive: { from: ['creations_nb', 'etab_stock'], fn: ([a, b]) => combine(a, b, (x, y) => (x / y) * 100, 1) }, formule: 'side_creations : créations d’établissements de l’année / side_stocks : établissements au 31 décembre précédent × 100', unit: '%', cmp: true, dir: 'up', ind: /^potentiel d implantation$/ },
  // logement et foncier
  { id: 'vacants_nb', label: 'Logements vacants du parc privé', theme: 'Logement', dataset: 'lovac', where: { MESURE: 'PP_VACANT' }, cmp: true, fromCommunes: true, dir: 'down', ind: /evolution du nombre de logements vacants/ },
  { id: 'vacants_longue', label: 'Logements vacants depuis plus de deux ans (parc privé)', theme: 'Logement', dataset: 'lovac', where: { MESURE: 'PP_VACANT_2ANS' }, cmp: true, fromCommunes: true, dir: 'down', ind: /logements pouvant etre remis sur le marche/ },
  { id: 'autorises_moy3', projection: true, label: 'Logements autorisés par an, moyenne des 3 dernières années (livraisons attendues à 2-3 ans)', theme: 'Logement', dataset: 'sitadel', where: {}, derive: { from: ['autorises'], fn: ([s]) => meanLast(s, 3) }, formule: 'sitadel : moyenne des logements autorisés des 3 dernières années complètes (délai usuel de 2 à 3 ans entre autorisation et livraison)', dir: 'up', ind: /projection de la production de logements$/ },
  { id: 'valeur_appart', aux: true, label: 'Valeur médiane d’un appartement (intermédiaire)', theme: 'Logement', dataset: 'dvf', where: { MESURE: 'VALEUR_MEDIANE', TYPE_LOCAL: 'Appartement' }, unit: '€', cmp: true, dir: 'none', ind: /^$/ },
  { id: 'accessibilite_immo', label: 'Prix d’un appartement médian en années de niveau de vie médian', theme: 'Logement', dataset: 'dvf', where: {}, derive: { from: ['valeur_appart', 'niveau_vie'], fn: ([a, b]) => combine(a, b, (x, y) => x / y, 2) }, formule: 'dvf : valeur médiane des ventes d’appartements / filosofi : niveau de vie médian annuel (millésime le plus proche, 2 ans au plus)', unit: 'années', cmp: true, dir: 'down', ind: /accessibilite du marche immobilier/ },
  { id: 'dvf_ventes', label: 'Mutations immobilières enregistrées (DVF)', theme: 'Logement', dataset: 'dvf', where: { MESURE: 'NB_MUTATIONS', TYPE_LOCAL: '_T' }, cmp: true, dir: 'none', ind: /nombre de dia/ },
  { id: 'foncier_dispo', label: 'Terrains vacants et chantiers (MOS, ha)', theme: 'Logement', dataset: 'mos', where: { MESURE: 'SURFACE_HA' }, weights: { dim: 'POSTE', w: { 'Terrains vacants': 1, Chantiers: 1 } }, unit: 'ha', dir: 'none', ind: /^foncier disponible$/ },
  { id: 'foncier_mutable', label: 'Foncier potentiellement mutable : terrains vacants, chantiers, parkings de surface, entreposage à l’air libre (MOS, ha)', theme: 'Logement', dataset: 'mos', where: { MESURE: 'SURFACE_HA' }, weights: { dim: 'POSTE', w: { 'Terrains vacants': 1, Chantiers: 1, 'Parkings de surface': 1, "Entreposage à l'air libre": 1 } }, unit: 'ha', dir: 'none', ind: /mutabilite du foncier|foncier mutable/ },
  // environnement : occupation du sol (MOS 2021, 2025), déchets (SINOE, EPT), émissions (Airparif, EPT)
  { id: 'espaces_ouverts', label: 'Espaces naturels, agricoles et verts (MOS, ha)', theme: 'Environnement', dataset: 'mos', where: { MESURE: 'SURFACE_HA' }, weights: { dim: 'POSTE', w: { 'Maraîchage, horticulture': 1, 'Parcs ou jardins publics': 1, 'Autres espaces verts': 1, 'Surfaces engazonnées avec ou sans arbustes entretenus': 1, 'Jardins familiaux': 1, 'Jardins de l\'habitat': 1, Berges: 1, "Cours d'eau": 1 } }, unit: 'ha', dir: 'up', ind: /surfaces naturelles et agricoles consommees|identification des surfaces a preserver/ },
  { id: 'surfaces_desimper', label: 'Surfaces minérales ouvertes : parkings de surface, places, entreposage à l’air libre (MOS, ha)', theme: 'Environnement', dataset: 'mos', where: { MESURE: 'SURFACE_HA' }, weights: { dim: 'POSTE', w: { 'Parkings de surface': 1, 'Esplanades et places': 1, "Entreposage à l'air libre": 1 } }, unit: 'ha', dir: 'down', ind: /desimpermeabilis/ },
  { id: 'artif_surface', aux: true, label: 'Surface artificialisée (intermédiaire)', theme: 'Environnement', dataset: 'artificialisation', where: { MESURE: 'SURFACE_ARTIF_HA' }, cmp: true, dir: 'none', ind: /^$/ },
  { id: 'artif_taux_annuel', label: 'Taux annuel d’artificialisation nette (2018-2021, % de la surface communale par an)', theme: 'Environnement', dataset: 'artificialisation', where: {}, derive: { from: ['flux_artif', 'artif_surface', 'artificialisation'], fn: ([f, a, p]) => combine(f, combine(a, p, (x, y) => (x * 100) / y, 0), (x, y) => (x / 3 / y) * 100, 0) }, formule: 'artificialisation : surface nouvellement artificialisée (ha, 2018-2021) / 3 ans / surface communale (surface artificialisée / part artificialisée) × 100', unit: '%', dir: 'down', ind: /taux annuel de sol impermeabilise/ },
  { id: 'dechets_hab', label: 'Déchets ménagers et assimilés collectés par habitant (EPT)', theme: 'Environnement', dataset: 'sinoe_dma', maille: 'ept', where: { MAILLE: 'EPT', MESURE: 'DMA_KG_HAB' }, unit: 'kg/hab.', dir: 'down', ind: /^production de dechets par habitant$/ },
  { id: 'dechets_proj', projection: true, label: 'Déchets ménagers et assimilés par habitant projetés en 2030 (tendance, EPT)', theme: 'Environnement', dataset: 'sinoe_dma', maille: 'ept', where: {}, derive: { from: ['dechets_hab'], fn: ([s]) => (s.length ? trend(s, 2030 - yearOf(s[s.length - 1].period)) : []) }, formule: 'sinoe_dma : tendance linéaire des DMA collectés par habitant (6 dernières années renseignées) prolongée jusqu’en 2030', unit: 'kg/hab.', dir: 'down', ind: /projection de la production de dechets? par habitant/ },
  { id: 'biodechets_part', label: 'Part des biodéchets dans les déchets ménagers collectés (EPT)', theme: 'Environnement', dataset: 'sinoe_dma', maille: 'ept', where: { MAILLE: 'EPT' }, ratio: { dim: 'MESURE', num: ['TONNAGE_BIO'], den: ['TONNAGE_DMA'] }, unit: '%', dir: 'up', ind: /part de biodechets/ },
  { id: 'valorisation_matiere', label: 'Part des déchets ménagers orientés vers la valorisation matière (EPT)', theme: 'Environnement', dataset: 'sinoe_dma', maille: 'ept', where: { MAILLE: 'EPT', MESURE: 'PCT_VALO_MAT' }, unit: '%', dir: 'up', ind: /part de dechets tries|evolution du tri des dechets/ },
  { id: 'ges_hab', label: 'Émissions de gaz à effet de serre par habitant (scopes 1 et 2, EPT)', theme: 'Environnement', dataset: 'airparif_ges', maille: 'ept', where: { POLLUANT: 'GES', SECTEUR: '_T', MESURE: 'EMISSIONS_T_HAB' }, unit: 't éq. CO2/hab.', cmp: true, dir: 'down', ind: /emissions? de gaz a effet de serre par habitant/ },
  { id: 'ges_proj', projection: true, label: 'Émissions de gaz à effet de serre par habitant projetées en 2030 (tendance 2005-2022, EPT)', theme: 'Environnement', dataset: 'airparif_ges', maille: 'ept', where: {}, derive: { from: ['ges_hab'], fn: ([s]) => (s.length ? trend(s, 2030 - yearOf(s[s.length - 1].period)) : []) }, formule: 'airparif_ges : tendance linéaire des émissions de GES par habitant (2005, 2010, 2015, 2019, 2022) prolongée jusqu’en 2030', unit: 't éq. CO2/hab.', cmp: true, dir: 'down', ind: /projection de reduction des emissions/ },
  { id: 'ges_transport_hab', label: 'Émissions de GES du transport routier par habitant (EPT)', theme: 'Mobilité', dataset: 'airparif_ges', maille: 'ept', where: { POLLUANT: 'GES', SECTEUR: 'TROUTE', MESURE: 'EMISSIONS_T_HAB' }, unit: 't éq. CO2/hab.', cmp: true, dir: 'down', ind: /emissions liees aux transports motorises/ },
  // mobilité : part modale active 2017-2023 (le vélo n'est pas distingué des deux-roues motorisés en 2012)
  { id: 'modes_actifs_hist', label: 'Part des actifs allant travailler à pied ou à vélo (2017, 2023)', theme: 'Mobilité', dataset: 'rp_navettes_hist', where: { WORK_AREA: '_T', EMPSTA_ENQ: '1', RP_MEASURE: 'POP', AGE: 'Y_GE15' }, ratio: { dim: 'TRANS', num: ['2', '3'], den: ['_T'] }, since: '2017', unit: '%', cmp: true, fromCommunes: true, dir: 'up', ind: /^$/ },
  { id: 'modes_actifs_proj', projection: true, label: 'Part des actifs allant travailler à pied ou à vélo projetée à 10 ans (tendance 2017-2023)', theme: 'Mobilité', dataset: 'rp_navettes_hist', where: {}, derive: { from: ['modes_actifs_hist'], fn: ([s]) => trend(s, 10) }, formule: 'rp_navettes_hist : tendance linéaire de la part de la marche et du vélo entre 2017 et 2023, prolongée de 10 ans', unit: '%', cmp: true, dir: 'up', ind: /projection de la part modale velo\/marche/ },
  // cohésion sociale, santé, équipements
  { id: 'rsa_proj', projection: true, label: 'Foyers au RSA projetés à 5 ans (tendance du fichier RSA de la CAF)', theme: 'Cohésion sociale', dataset: 'caf_rsa', where: {}, derive: { from: ['rsa'], fn: ([s]) => trend(s, 5) }, formule: 'caf_rsa : tendance linéaire des foyers au RSA (décembre de chaque année) prolongée de 5 ans', dir: 'down', ind: /projection des publics en difficulte/ },
  { id: 'ald_part', label: 'Part de la population en affection de longue durée (ALD) — Val-de-Marne', theme: 'Santé', dataset: 'ameli_ald', contexteDep: 'dep', where: { MESURE: 'ALD' }, perPct: true, unit: '%', cmp: true, dir: 'none', ind: /^$/, indCarte: /nb ald \/ pop|besoins specifiques ald/ },
  { id: 'emplois_ess_asso', label: 'Salariés déclarés par les associations ayant leur siège dans la commune (part associative de l’ESS)', theme: 'Emploi', dataset: 'associations_api', where: {}, derive: { from: ['asso_salaries'], fn: ([s]) => s }, formule: 'associations_api : somme des salariés déclarés par les associations actives ayant leur siège dans la commune (API Entreprise, données non publiques)', declaratif: true, partielRaison: 'associations seules (coopératives, mutuelles, fondations non comprises) ; effectifs déclarés par une partie des associations', dir: 'up', ind: /emplois generes par les structures ess/ },
  // CAF (quotient familial, commune et QPV) et URSSAF (emploi salarié privé par secteur)
  { id: 'qf_bas_part', label: 'Part des foyers allocataires CAF au quotient familial inférieur à 800 €', theme: 'Cohésion sociale', dataset: 'caf_qf', where: { MESURE: 'FOYERS' }, ratio: { dim: 'QF', num: ['QF_LT400', 'QF_400_799'], den: ['QF_LT400', 'QF_400_799', 'QF_800_1199', 'QF_1200_1599', 'QF_1600_1999', 'QF_2000_3999', 'QF_GE4000'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /^$/ },
  { id: 'qf_bas_qpv', label: 'Part des foyers allocataires CAF des QPV au quotient familial inférieur à 800 €', theme: 'Emploi', dataset: 'caf_qf_qpv', where: { MESURE: 'FOYERS', QPV: '_T' }, ratio: { dim: 'QF', num: ['QF_LT400', 'QF_400_799'], den: ['QF_LT400', 'QF_400_799', 'QF_800_1199', 'QF_1200_1599', 'QF_1600_1999', 'QF_2000_3999', 'QF_GE4000'] }, unit: '%', cmp: true, fromCommunes: true, dir: 'down', ind: /^revenus qpv$/ },
  { id: 'urssaf_salaries', label: 'Effectifs salariés du secteur privé (URSSAF, au 31 décembre)', theme: 'Emploi', dataset: 'urssaf_effectifs', where: { MESURE: 'EFFECTIFS', SECTEUR: '_T' }, cmp: true, dir: 'up', ind: /^$/ },
  { id: 'secteurs_croissance', label: 'Part des emplois salariés privés dans les secteurs en croissance sur 5 ans (URSSAF)', theme: 'Emploi', dataset: 'urssaf_effectifs', where: { SECTEUR: '_T' }, ratio: { dim: 'MESURE', num: ['EFFECTIFS_CROISSANCE'], den: ['EFFECTIFS'] }, unit: '%', cmp: true, dir: 'up', ind: /identification des secteurs a potentiel/ },
  { id: 'equip_bpe_1000', label: 'Équipements et services de la base permanente des équipements (pour 1 000 hab.)', theme: 'Cohésion sociale', dataset: 'bpe', where: { BPE_MEASURE: 'FACILITIES', FACILITY_DOM: '_T' }, perK: true, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /access+ibilite des habitants aux equipements|projection des besoins en equipements/ },
  { id: 'familles_af', perK: true, label: 'Foyers percevant les allocations familiales (pour 1 000 hab.)', theme: 'Cohésion sociale', dataset: 'caf_prestations', where: { MESURE: 'FOYERS_AF' }, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
{ id: 'licences_sport', perK: true, label: 'Licences sportives (pour 1 000 hab.)', theme: 'Sport', dataset: 'licences_sportives', where: { MESURE: 'LICENCES', FEDERATION: '_T' }, kpiPerK: true, cmp: true, fromCommunes: true, partial: ['reg'], dir: 'up', ind: /licences/ },
{ id: 'lieux_culturels', perK: true, label: 'Lieux et équipements culturels (pour 1 000 hab.)', theme: 'Cohésion sociale', dataset: 'equipements_culturels', where: { MESURE: 'NB_LIEUX', DOMAINE: '_T', TYPE: '_T' }, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /lieux et equipements culturels|equipements culturels/ },
{ id: 'lineaire_velo', label: 'Aménagements cyclables (km)', theme: 'Mobilité', dataset: 'velo_amenagements', where: { MESURE: 'LONGUEUR_M', TYPE: '_T' }, factor: 0.001, unit: 'km', cmp: true, fromCommunes: true, dir: 'up', ind: /amenagements cyclables|voies cyclables/ },
{ id: 'trame_verte', label: 'Surface de trame verte (ha)', theme: 'Environnement', dataset: 'trame_verte', where: { MESURE: 'SURFACE_HA', SOUS_TRAME: '_T', ROLE: '_T' }, unit: 'ha', cmp: true, fromCommunes: true, partial: true, dir: 'up', ind: /trame verte|espaces verts/ },
];

// ---------------- KPI dérivés : calculés à partir des séries d'autres KPI, territoire par territoire ----------------
// spec.derive = { from: [ids], fn: (séries, clé du territoire) => série } ; spec.aux : KPI intermédiaire, non publié.
const yearOf = (p) => Number(String(p).slice(0, 4));
// point de la série le plus proche dans le temps d'une période donnée
function nearest(s, period) {
  if (!s || !s.length) return null;
  const y = yearOf(period);
  return s.reduce((b, p) => (Math.abs(yearOf(p.period) - y) < Math.abs(yearOf(b.period) - y) ? p : b));
}
// combinaison de deux séries à la même période (ou à la plus proche, à `gap` ans près)
function combine(a, b, f, gap = 1) {
  return (a || []).map((p) => {
    const q = nearest(b, p.period);
    if (!q || Math.abs(yearOf(q.period) - yearOf(p.period)) > gap) return null;
    const v = f(p.value, q.value);
    return Number.isFinite(v) ? { period: p.period, value: v } : null;
  }).filter(Boolean);
}
// tendance linéaire (moindres carrés) des `window` dernières observations, prolongée de `years` ans :
// [dernière valeur observée, valeur projetée] (la valeur affichée est la projection, la précédente l'observation)
function trend(s, years, window = 6) {
  const pts = (s || []).filter((p) => Number.isFinite(yearOf(p.period))).slice(-window);
  if (pts.length < 2) return [];
  const n = pts.length, mx = pts.reduce((a, p) => a + yearOf(p.period), 0) / n, my = pts.reduce((a, p) => a + p.value, 0) / n;
  const sxx = pts.reduce((a, p) => a + (yearOf(p.period) - mx) ** 2, 0);
  if (!sxx) return [];
  const slope = pts.reduce((a, p) => a + (yearOf(p.period) - mx) * (p.value - my), 0) / sxx;
  const last = pts[n - 1], y = yearOf(last.period) + years;
  return [{ period: last.period, value: last.value }, { period: String(y), value: Math.max(0, my + slope * (y - mx)) }];
}
// moyenne des `k` dernières valeurs (rythme récent)
const meanLast = (s, k) => { const t = (s || []).slice(-k); return t.length ? [{ period: t[t.length - 1].period, value: t.reduce((a, p) => a + p.value, 0) / t.length }] : []; };

// rattachements supplémentaires de KPI existants (fiches couvertes par approximation)
for (const [id, re, carte] of [
  ['precaires', null, /part des contrats precaires/],
  ['salaries_asso', /emplois generes par les structures ess/],
  ['creations', /evolution du nombre d activites implantees/],
  ['personnes_piece', /evolution du nombre de logements\/menages en sur occupation|adequation du parc de logement/],
  ['passoires', /logements indignes/],
  ['artificialisation', /evolution de la part de sols impermeabil/],
  ['proj_65plus', /projections par tranche d age/],
  ['ess', /opportunites de developpement de l ess/],
  ['icu_fort', /surfaces impermeabilisees pouvant etre impactees|^evolution des surfaces concernees$/],
  ['points_noirs', /population exposee aux nuisances sonores|secteurs pouvant etre exposes a des nuisances sonores/],
]) {
  const k = KPIS.find((x) => x.id === id);
  if (!k) continue;
  if (re) k.ind = new RegExp(`${k.ind.source}|${re.source}`);
  if (carte) k.indCarte = k.indCarte ? new RegExp(`${k.indCarte.source}|${carte.source}`) : carte;
}

const matches = (r, where) => Object.entries(where).every(([d, v]) => r.dims[d] === v);
const totalOnly = (r, used) => Object.entries(r.dims).every(([d, v]) => used.has(d) || IGNORED.has(d) || v === '_T' || v === '_Z' || v == null);

function seriesOf(rows, spec) {
  const used = new Set([...Object.keys(spec.where), ...(spec.ratio ? [spec.ratio.dim] : []), ...(spec.sum || []), ...(spec.weights ? [spec.weights.dim] : [])]);
  const by = new Map();
  const slot = (p) => by.get(p) || by.set(p, { num: 0, den: 0, n: 0 }).get(p);
  for (const r of rows) {
    if (r.value == null || !matches(r, spec.where) || !totalOnly(r, used)) continue;
    const m = slot(r.period ?? '');
    if (spec.ratio) {
      const c = r.dims[spec.ratio.dim];
      if (spec.ratio.num.includes(c)) m.num += r.value;
      if (spec.ratio.den.includes(c)) m.den += r.value;
    } else { const w = spec.weights ? (spec.weights.w[r.dims[spec.weights.dim]] ?? 0) : 1; m.num += r.value * w; m.n++; } // weights : somme pondérée par modalité (projections)
  }
  const out = [];
  for (const [period, m] of by) {
    if (spec.ratio && spec.diff) { if (m.num || m.den) out.push({ period, value: m.num - m.den }); } else if (spec.ratio) { if (m.den) out.push({ period, value: (m.num / m.den) * (spec.factor ?? 100) }); } else if (m.n) out.push({ period, value: m.num * (spec.factor ?? 1) });
  }
  // année en cours : données encore incomplètes pour certaines sources (déclarations tardives)
  const thisYear = new Date().getFullYear();
  if (spec.cumul) {
    out.sort((a, b) => (a.period < b.period ? -1 : 1));
    let acc = 0;
    for (const p of out) { acc += p.value; p.value = acc; }
    return out.filter((p) => p.period !== '');
  }
  return out.filter((p) => !spec.since || String(p.period) >= spec.since).filter((p) => !spec.skipCurrent || Number(String(p.period).slice(0, 4)) < thisYear).sort((a, b) => (a.period < b.period ? -1 : 1));
}

function compute() {
  const geos = [[REF_GEO.code, 'ref'], ['GOSB', 'ept'], ['94', 'dep'], ['11', 'reg']];
  // libellé de la maille d'un territoire de contexte (badge affiché à côté de la valeur : commune, 94, IDF)
  const nomOf = (code) => all('SELECT nom FROM geos WHERE code = ?', code)[0]?.nom || code;
  GEOS_MAILLE.dep = { code: '94', label: '94', nom: nomOf('94'), level: 'DEP' };
  GEOS_MAILLE.reg = { code: '11', label: 'IDF', nom: nomOf('11'), level: 'REG' };
  GEOS_MAILLE.ept = { code: 'GOSB', label: 'EPT', nom: nomOf('GOSB'), level: 'EPT' }; // données publiées à la maille de l'EPT compétent (déchets, émissions)
  const indicators = all('SELECT id, libelle, libelle_carte, statut, priorite, theme, theme_label, niveau FROM indicators');
  const dsInfo = Object.fromEntries(all('SELECT id, label, last_import FROM datasets').map((d) => [d.id, d]));
  const withData = new Set(all('SELECT DISTINCT indicator_id FROM indicator_datasets').map((r) => r.indicator_id));

  const cache = new Map();
  const rowsOf = (ds, geo) => {
    const k = `${ds}|${geo}`;
    if (!cache.has(k)) cache.set(k, all('SELECT period, dims, value FROM data_rows WHERE dataset_id = ? AND geo = ?', ds, geo).map((r) => ({ ...r, dims: JSON.parse(r.dims || '{}') })));
    return cache.get(k);
  };
  // Un KPI peut s'appuyer sur plusieurs jeux (ex. Filosofi : API Melodi + fichiers INSEE) pour reconstituer une série.
  const datasetsOf = (spec) => spec.datasets || [spec.dataset];
  const rowsOfAll = (spec, geo) => datasetsOf(spec).flatMap((ds) => rowsOf(ds, geo));

  const carto = require('./cartographie'); // chargé ici pour éviter la dépendance circulaire au démarrage
  const pops = require('./importer').populationSeries();
  const communesOf = (key) => (key === 'dep' ? all("SELECT s.code FROM geo_shapes s JOIN geos g ON g.code = s.code WHERE g.dept = '94'") : all('SELECT code FROM geo_shapes')).map((r) => r.code);
  const resById = {}; // séries par KPI et territoire, pour les KPI dérivés
  const kpis = KPIS.map((spec) => {
    const res = {};
    if (spec.derive) {
      for (const [, key] of geos) {
        if (key !== 'ref' && !spec.cmp) continue;
        res[key] = spec.derive.fn(spec.derive.from.map((id) => resById[id]?.[key] || []), key, resById) || [];
      }
    }
    for (const [geo, key] of spec.derive ? [] : geos) {
      if (key !== 'ref' && !spec.cmp) continue;
      let s = seriesOf(rowsOfAll(spec, geo), spec);
      // jeux communaux : le Val-de-Marne et l'Île-de-France sont recalculés à partir des communes (effectifs ou ratios de sommes)
      const partial = spec.partial === true || (Array.isArray(spec.partial) && spec.partial.includes(key));
      if (!s.length && !partial && spec.fromCommunes && (key === 'dep' || key === 'reg')) {
        const codes = communesOf(key);
        const byGeo = carto.rowsFor(spec, codes);
        // jeu encore peu chargé pour ce périmètre : une somme partielle serait trompeuse
        const imported = all("SELECT 1 FROM import_runs WHERE dataset_id = ? AND scope = 'idf' AND status IN ('ok', 'partiel') LIMIT 1", spec.dataset).length > 0; // jeu importé pour toute l'Île-de-France : l'absence de ligne signifie « aucun »
        if (imported || byGeo.size >= codes.length * 0.6) s = seriesOf([...byGeo.values()].flat(), spec);
      }
      // rapporté à la population : pour 1 000 habitants (kpiPerK) ou par habitant (perHab)
      if (spec.kpiPerK || spec.perHab || spec.perPct) { const f = spec.perHab ? 1 : spec.perPct ? 100 : 1000; s = s.map((p) => { const pop = carto.popAt(pops[geo], p.period); return pop ? { period: p.period, value: (p.value / pop) * f } : null; }).filter(Boolean); }
      res[key] = s;
    }
    resById[spec.id] = res;
    // jeux sans donnée communale (ex. Assurance Maladie, maille départementale) : la valeur de contexte
    // (département ou région) tient lieu de valeur principale, à condition de la déclarer (spec.contexteDep).
    // maille de la valeur affichée : la commune de référence par défaut, sinon le territoire de contexte (94 ou 11)
    const maille = spec.maille === 'ept' ? GEOS_MAILLE.ept : res.ref?.length ? null : spec.contexteDep ? (spec.contexteDep === 'dep' ? GEOS_MAILLE.dep : GEOS_MAILLE.reg) : null;
    const s = res.ref?.length ? res.ref : (spec.contexteDep && res[spec.contexteDep]?.length ? res[spec.contexteDep] : []);
    const last = s[s.length - 1] || null, prev = s.length > 1 ? s[s.length - 2] : null;
    const at = (list, period) => (list || []).find((p) => p.period === period) || null;
    const cands = indicators.filter((i) => matchOne(spec, i));
    const states = { valide: 0, brouillon: 0, abandonne: 0 };
    cands.forEach((i) => { states[i.statut || 'brouillon']++; });
    const statut = states.valide ? 'valide' : states.brouillon ? 'brouillon' : cands.length ? 'abandonne' : 'sans_fiche';
    const year = spec.projection && spec.derive && prev ? yearOf(prev.period) : last ? Number(String(last.period).slice(0, 4)) : null; // projection : âge de la dernière observation
    return {
      aux: !!spec.aux, projection: !!spec.projection,
      prive: PRIVES.has(spec.dataset), // jeu à accès habilité : valeur non publique
      concept: spec.concept || spec.id, // KPI de même concept : sources comparables entre elles
      id: spec.id, label: spec.label, theme: spec.theme, unit: spec.unit || (spec.kpiPerK ? 'pour 1 000 hab.' : ''), dir: spec.dir, dataset: spec.dataset, datasetLabel: dsInfo[spec.dataset]?.label || spec.dataset,
      last_import: dsInfo[spec.dataset]?.last_import || null,
      maille, // maille de la valeur affichée (null = commune de référence ; { code, label, nom, level } sinon)
      value: last?.value ?? null, period: last?.period ?? null, prev, series: s.slice(-8),
      ept: spec.maille === 'ept' ? null : last && res.ept ? at(res.ept, last.period) : null,
      dep: spec.contexteDep === 'dep' ? null : last && res.dep ? at(res.dep, last.period) : null,
      reg: spec.contexteDep === 'reg' ? null : last && res.reg ? at(res.reg, last.period) : null,
      age: year == null || Number.isNaN(year) ? null : new Date().getFullYear() - year,
      indicators: cands.slice(0, 8).map((i) => ({ id: i.id, libelle: i.libelle, statut: i.statut || 'brouillon', priorite: i.priorite })),
      statut, states,
    };
  });

  // cohérence entre sources d'un même concept : comparaison à la dernière période commune (sinon dernières valeurs)
  // écart relatif |a − b| / max(|a|, |b|) : ≤ 2 % cohérent, ≤ 20 % écart, au-delà incohérent
  for (let i = kpis.length - 1; i >= 0; i--) if (kpis[i].aux) kpis.splice(i, 1); // KPI intermédiaires : non publiés
  const byConcept = new Map();
  for (const k of kpis) if (k.value != null) (byConcept.get(k.concept) || byConcept.set(k.concept, []).get(k.concept)).push(k);
  for (const k of kpis) {
    const peers = (byConcept.get(k.concept) || []).filter((p) => p.id !== k.id);
    if (k.value == null || !peers.length) continue;
    let worst = 0;
    const sources = [k, ...peers].map((p) => ({ id: p.id, label: p.label, value: p.value, period: p.period, dataset: p.datasetLabel }));
    const comparaisons = peers.map((p) => {
      const common = (k.series || []).map((x) => x.period).filter((per) => (p.series || []).some((y) => y.period === per)).sort().pop();
      const a = common ? k.series.find((x) => x.period === common).value : k.value;
      const b = common ? p.series.find((x) => x.period === common).value : p.value;
      const ecart = Math.max(Math.abs(a), Math.abs(b)) ? Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) : 0;
      worst = Math.max(worst, ecart);
      return { id: p.id, periode: common || null, a, b, ecart };
    });
    k.multi = { n: peers.length + 1, ecart: worst, niveau: worst <= 0.02 ? 'coherent' : worst <= 0.2 ? 'ecart' : 'incoherent', sources, comparaisons };
  }

  const byStatut = { brouillon: 0, valide: 0, abandonne: 0 };
  indicators.forEach((i) => { byStatut[i.statut || 'brouillon']++; });
  const priority = indicators.filter((i) => i.priorite && i.priorite <= 2 && i.statut !== 'abandonne')
    .map((i) => ({ id: i.id, libelle: i.libelle, theme: i.theme_label, statut: i.statut || 'brouillon', priorite: i.priorite, data: withData.has(i.id) }));
  return {
    generated: new Date().toISOString(),
    summary: { total: indicators.length, ...byStatut, priority: priority.length, priorityWithData: priority.filter((p) => p.data).length, priorityValid: priority.filter((p) => p.statut === 'valide').length },
    kpis, priority,
  };
}

// Nature et formule lisible d'un KPI, déduites de sa définition (pour les fiches créées depuis « Autres »)
function formulaOf(spec) {
  if (spec.formule) return { mode: 'calcule', formule: spec.formule };
  const filt = Object.entries(spec.where || {}).filter(([, v]) => v !== '_T').map(([d, v]) => `${d} = ${v}`).join(', ');
  const base = `${spec.dataset}${filt ? ` [${filt}]` : ''}`;
  let f, mode = 'direct';
  const list = (c) => (c.length > 6 ? `${c[0]} … ${c[c.length - 1]} (${c.length} modalités)` : c.join(', '));
  if (spec.ratio) { mode = 'calcule'; f = spec.diff ? `${base} : ${spec.ratio.dim} = ${list(spec.ratio.num)} − ${spec.ratio.dim} = ${list(spec.ratio.den)}` : `${base} : ${spec.ratio.dim} ∈ {${list(spec.ratio.num)}} / ${spec.ratio.dim} ∈ {${list(spec.ratio.den)}} × ${spec.factor ?? 100}`; }
  else f = spec.sum ? `${base}, somme sur ${spec.sum.join(', ')}` : base;
  if (spec.sum) mode = 'calcule';
  if (spec.cumul) { mode = 'calcule'; f += ' ; cumul des mises en service (stock)'; }
  if (spec.kpiPerK) { mode = 'calcule'; f += ' × 1 000 / population municipale'; }
  if (spec.fromCommunes) f += ' (Val-de-Marne et Île-de-France recalculés à partir des communes)';
  return { mode, formule: f };
}

// ---------------- rapprochement fiche de conception <-> KPI calculé, et fiabilité de la valeur ----------------
// 1. mots-clés du KPI (ind) ; 2. thème compatible ; 3. unité compatible (une « part » ou un « taux » attend un pourcentage
// ou un taux, un « nombre » attend un effectif) ; 4. fiabilité : fiable, approchée (valeur voisine, base d'une projection
// ou d'une évaluation, unité différente) ou partielle (données déclaratives incomplètes).
const THEMES = {
  demographie: ['Démographie'], emploi: ['Emploi', 'Cohésion sociale'], logement: ['Logement'], environnement: ['Environnement'], mobilite: ['Mobilité'],
  cohesion: ['Cohésion sociale', 'Santé', 'Vie associative', 'Sécurité', 'Éducation', 'Sport', 'Finances locales', 'Logement'],
};
const ficheKind = (t) => (/^indice|^indicateur de vieillissement/.test(t) ? 'ratio' : /^(part|taux|pourcentage|proportion)\b|^evolution (du taux|de la part)/.test(t) ? 'pct'
  : /^(nb|nombre)\b|^evolution du nombre|^signalements|^projets de construction/.test(t) ? 'count' : null);
const kpiKind = (k) => (k.unit === '%' ? 'pct' : /indice/.test(k.unit || '') ? 'ratio' : k.kpiPerK ? 'rate' : k.ratio && !k.unit ? 'ratio' : /€/.test(k.unit || '') ? 'money' : 'count');
// valeurs voisines : le KPI renseigne la fiche sans mesurer exactement ce qu'elle demande
const PROXY = [
  [/^arrivants$/, /solde migratoire|facteurs d attractivite|attractivite residentielle/, 'arrivées seules : les départs ne sont pas publiés à la commune'],
  [/^cadres$/, /repartition|regression|besoins|profils/, 'une seule catégorie (cadres) : la fiche demande toute la répartition'],
  [/^ess$/, /evolution du nb \/ nb entreprises/, 'nombre d’établissements de l’ESS, pas leur part'],
  [/^rsa$/, /taux de beneficiaires/, 'nombre de foyers allocataires, pas un taux'],
  [/^emploi_lt$/, /densite d emplois/, 'nombre d’emplois, pas une densité'],
  [/^allocataires_caf$/, /nombre de beneficiaires/, 'foyers allocataires pour 1 000 habitants, pas un effectif de bénéficiaires'],
  [/^sru$|^rpls$/, /besoins en logements sociaux/, 'taux et parc actuels, pas les besoins'],
  [/^flux_artif$/, /taux annuel/, 'surface artificialisée (ha), pas un taux'],
  [/^vacance$/, /evolution du nombre de logements vacants/, 'part de logements vacants, pas leur nombre'],
  [/^solde_naturel$/, /impact/, 'solde brut : l’impact rapporte ce solde à la variation de population'],
  [/^plus65$/, /impact/, 'part actuelle : l’impact suppose une décomposition de la croissance'],
  [/^taille_menages$/, /besoins en logement/, 'taille des ménages seulement : les besoins demandent un calcul de point mort'],
  [/^trame_verte$/, /./, 'composantes de la trame verte (MGP), pas la surface d’espaces verts par habitant'],
  [/^commerces$/, /ecart a l echelle/, 'nombre d’établissements : l’écart se lit par comparaison avec le Val-de-Marne'],
  [/^rpls$/, /menages/, 'logements sociaux (RPLS), pas des ménages'],
  [/^c2s_/, /\bame\b/, 'C2S seule : l’AME n’est pas publiée à la commune ; régime général uniquement'],
  [/^points_noirs$/, /qualite de l air/, 'cumul de nuisances (air, bruit, sols…), pas la qualité de l’air seule'],
  [/^points_noirs$/, /nuisances sonores/, 'cumul de nuisances, pas le bruit seul'],
  [/^artificialisation$/, /impermeabil/, 'surface artificialisée : artificialisé ne veut pas dire imperméabilisé'],
  [/^apl_mg$/, /secteurs en deficit/, 'APL de la commune : l’identification des secteurs demande la maille infra-communale ou le zonage ARS'],
  [/^idh2_sante$/, /indice determinant/, 'composante santé de l’IDH-2 (espérance de vie), pas un indice composite des déterminants de santé'],
  [/^idh2/, /./, 'dernière édition de l’IDH-2 : 2013'],
  [/^rsa_couverture$/, /minima sociaux/, 'RSA seul : AAH, ASS et minimum vieillesse non compris'],
  [/^proj_65plus$/, /./, 'projection simplifiée : survie moyenne nationale, sans les migrations'],
  [/^pop_lt20/, /moins de 18/, 'moins de 20 ans : seule tranche publiée aux trois millésimes'],
  [/^pop_lt20_part$|^pop_65_part$/, /tranche d age/, 'une tranche d’âge : voir aussi les autres KPI de la série 2012-2023'],
  [/^familles_mono/, /menages/, 'familles monoparentales (dossier complet), pas ménages'],
  [/^non_scolarises$/, /moins de 18/, '6-17 ans : les moins de 6 ans ne relèvent pas tous de la scolarisation'],
  [/^enfants_0_5$/, /besoins scolaires/, 'effectif des futurs élèves, sans les flux migratoires ni les constructions nouvelles'],
  [/^pop_proj$|^defm_proj$|^rsa_proj$|^modes_actifs_proj$|^dechets_proj$|^ges_proj$/, /./, 'prolongation de la tendance récente, sans hypothèse de rupture'],
  [/^emplois_habitants$/, /./, 'actifs occupés travaillant dans la commune / emplois au lieu de travail (recensement)'],
  [/^ecart_revenu$/, /./, 'écart au Val-de-Marne ; l’écart à l’EPT se lit dans la comparaison GOSB'],
  [/^commerces_bpe_1000$/, /./, 'densité commerciale actuelle comparée au Val-de-Marne, base d’une estimation des besoins'],
  [/^taux_creation$/, /./, 'taux de création global : le potentiel par secteur demande une étude dédiée'],
  [/^part_commerce$/, /./, 'part d’un grand secteur : la typologie fine des commerces (BPE) n’a qu’un millésime'],
  [/^vacants_longue$/, /./, 'vacance de plus de deux ans (parc privé) : gisement mobilisable, pas une projection'],
  [/^autorises_moy3$/, /./, 'rythme récent des autorisations, pas un programme de logements'],
  [/^accessibilite_immo$/, /./, 'prix d’un appartement médian rapporté au niveau de vie médian d’une personne'],
  [/^dvf_ventes$/, /dia/, 'mutations enregistrées (DVF) : chaque vente en zone de préemption suit une DIA, mais toutes les DIA n’aboutissent pas', true],
  [/^foncier_/, /./, 'occupation du sol (MOS) : surfaces potentiellement mobilisables, sans analyse de propriété ni de constructibilité'],
  [/^espaces_ouverts$/, /consommees/, 'surfaces 2021 et 2025 : l’évolution se lit entre les deux millésimes'],
  [/^espaces_ouverts$/, /preserver/, 'surfaces ouvertes actuelles, sans hiérarchie écologique'],
  [/^surfaces_desimper$/, /./, 'surfaces minérales ouvertes (MOS), sans diagnostic de faisabilité'],
  [/^artif_taux_annuel$/, /./, 'artificialisation nette (occupation du sol), pas l’imperméabilisation'],
  [/^valorisation_matiere$/, /./, 'valorisation matière (recyclage) des déchets ménagers : approche de la part triée'],
  [/^biodechets_part$/, /./, 'biodéchets collectés séparément rapportés à l’ensemble des déchets ménagers et assimilés'],
  [/^ges_transport_hab$/, /./, 'transport routier seul (aérien et ferroviaire à part)'],
  [/^ald_part$/, /besoins/, 'part de la population en ALD : mesure du besoin, pas des besoins d’accompagnement'],
  [/^equip_bpe_1000$/, /./, 'densité d’équipements, pas les temps d’accès'],
  [/^salaries_asso$/, /ess/, 'salariés des associations seulement (coopératives, mutuelles et fondations non comprises)'],
  [/^creations$/, /implantees/, 'créations seules : les départs (radiations) ne sont pas publiés à la commune'],
  [/^personnes_piece$/, /sur.occupation|adequation/, 'personnes par pièce : indice de peuplement, pas le nombre de logements suroccupés', true],
  [/^passoires$/, /indignes/, 'logements classés F ou G au DPE : précarité énergétique, pas l’indignité (le PPPI n’est pas diffusé en open data)'],
  [/^precaires$/, /adequation/, 'part des contrats précaires : un seul aspect de l’adéquation des emplois aux profils'],
  [/^proj_65plus$/, /tranche d age/, 'une seule tranche (65 ans ou plus) : les autres demandent les naissances et les migrations'],
  [/^icu_fort$/, /evolution/, 'un seul millésime (2021) : pas d’évolution mesurable'],
  [/^icu_fort$/, /projection/, 'surface actuellement en aléa fort, base d’une projection'],
  [/^ess$/, /opportunites/, 'établissements de l’ESS actuels, base d’une analyse des opportunités'],
  [/^qf_bas_qpv$/, /./, 'quotient familial des allocataires CAF des QPV (décembre 2024), pas le revenu disponible de l’ensemble des habitants ; comparer à la commune (KPI qf_bas_part)'],
  [/^secteurs_croissance$/, /./, 'part des emplois dans les secteurs en croissance ; le détail par secteur (NA17) figure dans le jeu URSSAF'],
  [/^generalistes$/, /rapport entre l offre et la demande/, 'densité de généralistes, pas l’accessibilité potentielle localisée (APL)'],
];

// libellés de la ligne de la grille (contexte, suivi, évaluation, prospective) : distingue deux fiches de même libellé
// (« évolution en nb » des commerces et des entreprises hors commerce)
let gridRows = null;
function rowText(id) {
  if (!gridRows || Date.now() - gridRows.at > 60000) {
    const list = all('SELECT id, groupe, excel_row, libelle FROM indicators');
    const by = new Map();
    for (const i of list) { const k = `${i.groupe}|${i.excel_row}`; by.set(k, `${by.get(k) || ''} ${norm(i.libelle)}`); }
    gridRows = { at: Date.now(), map: new Map(list.map((i) => [i.id, i.excel_row == null ? norm(i.libelle) : by.get(`${i.groupe}|${i.excel_row}`)])) };
  }
  return gridRows.map.get(id) || '';
}

function matchOne(k, fiche) {
  const t = norm(fiche.libelle);
  if (k.row && !(fiche.id != null && k.row.test(rowText(fiche.id)))) return null;
  const carte0 = norm(fiche.libelle_carte || '');
  if (!k.ind.test(t) && !(k.indCarte && k.indCarte.test(carte0))) return null;
  if (fiche.theme && THEMES[fiche.theme] && !THEMES[fiche.theme].includes(k.theme)) return null; // thème incompatible
  const carte = norm(fiche.libelle_carte || '');
  const fk = /par (association|assiociation|asso)\b/.test(carte) || /par association/.test(t) ? 'ratio' : ficheKind(t), kk = kpiKind(k);
  const proxy = PROXY.find(([idRe, ficheRe]) => idRe.test(k.id) && (ficheRe.test(t) || ficheRe.test(carte0)));
  const force = proxy && proxy[3] === true; // approximation assumée : l'unité diffère de celle de la fiche
  if (!force && (fk === 'pct' || fk === 'ratio') && (kk === 'count' || kk === 'money')) return null; // une part ou un indice ne peut pas être un effectif
  if (!force && fk === 'count' && (kk === 'pct' || kk === 'money' || kk === 'ratio')) return null; // un nombre ne peut pas être un pourcentage
  const why = [];
  if (proxy) why.push(proxy[2]);
  if (fk === 'count' && kk === 'rate') why.push('taux pour 1 000 habitants, la fiche demande un nombre');
  if (fk === 'pct' && kk === 'ratio') why.push('rapport ou indice, pas un pourcentage');
  if (k.maille === 'ept') why.push('valeur de l’EPT Grand-Orly Seine Bièvre (collectivité compétente), pas de la commune');
  if (fiche.niveau === 'prospective' && !k.projection) why.push('valeur actuelle : base de la projection, pas la projection elle-même');
  else if (fiche.niveau === 'evaluation' && !/^(densite|taux|part|indice|indicateur|rapport|attractivite|respect|accidents|nombre de|nb d emplois)/.test(t)) why.push('valeur de contexte : l’évaluation demande une analyse');
  // effectifs et comptes des associations : déclarations partielles (seules certaines associations les renseignent)
  if (k.declaratif) return { id: k.id, fiabilite: why.length ? 'approchee' : 'partielle', raison: [...why, k.partielRaison || 'données déclaratives, connues pour une partie des associations seulement'].join(' ; ') };
  return { id: k.id, fiabilite: why.length ? 'approchee' : 'fiable', raison: why.join(' ; ') || null };
}

// KPI d'une fiche, du plus fiable au moins fiable
const RANK = { fiable: 0, partielle: 1, approchee: 2 };
function kpiMatches(fiche) {
  return KPIS.map((k) => matchOne(k, fiche)).filter(Boolean).sort((a, b) => RANK[a.fiabilite] - RANK[b.fiabilite]);
}
const kpiIdsFor = (libelle, fiche = {}) => kpiMatches({ ...fiche, libelle }).map((m) => m.id);

// Le calcul complet parcourt de nombreuses séries (plus de 100 KPI × 4 territoires, agrégats recalculés à partir des
// 1 266 communes) : il tourne dans un thread séparé pour ne pas figer le serveur, et le résultat est mis en cache 5 minutes.
// Au-delà, la valeur précédente reste servie pendant le recalcul en arrière-plan. Seul le tout premier appel, avant le
// préchauffage du démarrage, calcule de façon synchrone.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
let memo = null, running = null;
function computeAsync() {
  if (running) return running;
  running = new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: { kpiCompute: true } });
    w.once('message', (m) => (m && m.__error ? reject(new Error(m.__error)) : resolve(m)));
    w.once('error', reject);
    w.once('exit', (code) => { if (code) reject(new Error(`calcul des KPI interrompu (code ${code})`)); });
  }).then((value) => { memo = { at: Date.now(), value }; return value; }).finally(() => { running = null; });
  return running;
}
function build({ fresh = false } = {}) {
  if (fresh || !memo) { memo = { at: Date.now(), value: compute() }; return memo.value; }
  if (Date.now() - memo.at > 5 * 60 * 1000) computeAsync().catch((e) => console.warn('[kpi]', e.message));
  return memo.value;
}
if (!isMainThread && workerData && workerData.kpiCompute) {
  // différé : les exports du module doivent exister avant que cartographie.js (dépendance circulaire) ne les lise
  setImmediate(() => { try { parentPort.postMessage(compute()); } catch (e) { parentPort.postMessage({ __error: e.message }); } });
}

module.exports = { build, computeAsync, KPIS, kpiIdsFor, kpiMatches, seriesOf, matches, totalOnly, formulaOf };
