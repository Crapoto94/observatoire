// Tableau de bord des indicateurs clés : valeur la plus récente, évolution, comparaison Val-de-Marne / Île-de-France,
// et état de validation des fiches indicateurs correspondantes.
const { all } = require('./db');
const { REF_GEO } = require('./seed');

// jeux NON PUBLICS (accès habilité) : les KPI qui en sont issus sont signalés dans l'interface
const PRIVES = new Set(require('./datasets').filter((d) => d.prive).map((d) => d.id));
const IGNORED = new Set(['UNIT_MEASURE', 'UNIT_MULT', 'OBS_STATUS']);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, ' ').toLowerCase();

// dir : sens favorable (up = une hausse est positive, down = une hausse est défavorable, none = neutre)
// where : modalités retenues ; les autres dimensions doivent valoir _T (total). ratio : num / den sur une dimension.
// cmp : comparaison pertinente avec le Val-de-Marne et l'Île-de-France (taux, prix, niveaux de vie ; pas les effectifs bruts)
// diff : différence num − den (ex. naissances − décès) au lieu d'un rapport
// cumul : série de flux annuels transformée en stock (somme cumulée ; les lignes sans date comptent dans le stock initial)
// sum : dimensions additionnées (toutes modalités) au lieu d'exiger leur total _T (jeux sans modalité totale, ex. Flores par activité)
// partial : la source ne couvre pas tout le territoire (true = aucun cumul, ou liste de clés 'dep'/'reg' à ne pas cumuler)
const KPIS = [
  { id: 'population', label: 'Population', theme: 'Démographie', dataset: 'rp_serie_historique', where: { RP_MEASURE: 'POP', OCS: '_T' }, dir: 'none', ind: /population/ },
  { id: 'naissances', perK: true, label: 'Naissances domiciliées', theme: 'Démographie', dataset: 'etat_civil_nais', where: { EC_MEASURE: 'LVB' }, dir: 'none', ind: /naissance/ },
  { id: 'niveau_vie', label: 'Niveau de vie médian', theme: 'Cohésion sociale', dataset: 'filosofi', datasets: ['filosofi', 'filosofi_fichier'], where: { FILOSOFI_MEASURE: 'MED_SL' }, unit: '€', cmp: true, dir: 'up', ind: /niveau de vie|revenu median/ },
  { id: 'pauvrete', label: 'Taux de pauvreté', theme: 'Cohésion sociale', dataset: 'filosofi', datasets: ['filosofi', 'filosofi_fichier'], where: { FILOSOFI_MEASURE: 'PR_MD60' }, unit: '%', cmp: true, dir: 'down', ind: /pauvrete/ },
  { id: 'rsa', perK: true, label: 'Foyers au RSA', theme: 'Cohésion sociale', dataset: 'caf_rsa', where: { MESURE: 'FOYERS_RSA', TYPE_RSA: '_T' }, dir: 'down', ind: /rsa|minima sociaux/ },
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
  { id: 'ald', label: 'Personnes en affection de longue durée (ALD)', theme: 'Santé', dataset: 'ameli_ald', where: { MESURE: 'ALD' }, dir: 'none', cmp: true, ind: /nb ald|evolution du nombre d ald/ },
  { id: 'ald_1000', label: 'Personnes en ALD pour 1 000 habitants', theme: 'Santé', dataset: 'ameli_ald', where: { MESURE: 'ALD' }, perK: true, kpiPerK: true, cmp: true, dir: 'none', ind: /^$/ },
  { id: 'ald_sans_mt', label: 'Part des patients en ALD sans médecin traitant', theme: 'Santé', dataset: 'ameli_ald_sans_mt', where: { MESURE: 'TAUX_ALD_SANS_MT' }, unit: '%', cmp: true, dir: 'down', ind: /^$/ },
  { id: 'couverture_sas', label: 'Population couverte par le service d’accès aux soins (SAS)', theme: 'Santé', dataset: 'ameli_sas', where: { MESURE: 'TAUX_SAS' }, unit: '%', cmp: true, dir: 'up', ind: /^$/ },
  { id: 'logements', label: 'Logements', theme: 'Logement', dataset: 'rp_logement', where: { RP_MEASURE: 'DWELLINGS', OCS: '_T' }, dir: 'none', ind: /^parc de logements|^nombre de logements$/ },
  { id: 'vacance', label: 'Part de logements vacants (parc privé)', theme: 'Logement', dataset: 'lovac', where: {}, ratio: { dim: 'MESURE', num: ['PP_VACANT'], den: ['PP_TOTAL'] }, unit: '%', cmp: true, dir: 'down', ind: /vacan/ },
  { id: 'sru', label: 'Taux de logements sociaux (SRU)', theme: 'Logement', dataset: 'sru', where: { MESURE: 'TAUX_SRU' }, unit: '%', cmp: true, dir: 'up', ind: /sru|logements sociaux/ },
  { id: 'rpls', perK: true, label: 'Logements locatifs sociaux (RPLS)', theme: 'Logement', dataset: 'rpls', where: { MESURE: 'LOGEMENTS_SOCIAUX', CRITERE: 'TOTAL', MODALITE: '_T' }, dir: 'up', ind: /logements sociaux|logement social/ },
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
  { id: 'familles_af', perK: true, label: 'Foyers percevant les allocations familiales (pour 1 000 hab.)', theme: 'Cohésion sociale', dataset: 'caf_prestations', where: { MESURE: 'FOYERS_AF' }, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'none', ind: /^$/ },
{ id: 'licences_sport', perK: true, label: 'Licences sportives (pour 1 000 hab.)', theme: 'Sport', dataset: 'licences_sportives', where: { MESURE: 'LICENCES', FEDERATION: '_T' }, kpiPerK: true, cmp: true, fromCommunes: true, partial: ['reg'], dir: 'up', ind: /licences/ },
{ id: 'lieux_culturels', perK: true, label: 'Lieux et équipements culturels (pour 1 000 hab.)', theme: 'Cohésion sociale', dataset: 'equipements_culturels', where: { MESURE: 'NB_LIEUX', DOMAINE: '_T', TYPE: '_T' }, kpiPerK: true, cmp: true, fromCommunes: true, dir: 'up', ind: /lieux et equipements culturels|equipements culturels/ },
{ id: 'lineaire_velo', label: 'Aménagements cyclables (km)', theme: 'Mobilité', dataset: 'velo_amenagements', where: { MESURE: 'LONGUEUR_M', TYPE: '_T' }, factor: 0.001, unit: 'km', cmp: true, fromCommunes: true, dir: 'up', ind: /amenagements cyclables|voies cyclables/ },
{ id: 'trame_verte', label: 'Surface de trame verte (ha)', theme: 'Environnement', dataset: 'trame_verte', where: { MESURE: 'SURFACE_HA', SOUS_TRAME: '_T', ROLE: '_T' }, unit: 'ha', cmp: true, fromCommunes: true, partial: true, dir: 'up', ind: /trame verte|espaces verts/ },
];

const matches = (r, where) => Object.entries(where).every(([d, v]) => r.dims[d] === v);
const totalOnly = (r, used) => Object.entries(r.dims).every(([d, v]) => used.has(d) || IGNORED.has(d) || v === '_T' || v === '_Z' || v == null);

function seriesOf(rows, spec) {
  const used = new Set([...Object.keys(spec.where), ...(spec.ratio ? [spec.ratio.dim] : []), ...(spec.sum || [])]);
  const by = new Map();
  const slot = (p) => by.get(p) || by.set(p, { num: 0, den: 0, n: 0 }).get(p);
  for (const r of rows) {
    if (r.value == null || !matches(r, spec.where) || !totalOnly(r, used)) continue;
    const m = slot(r.period ?? '');
    if (spec.ratio) {
      const c = r.dims[spec.ratio.dim];
      if (spec.ratio.num.includes(c)) m.num += r.value;
      if (spec.ratio.den.includes(c)) m.den += r.value;
    } else { m.num += r.value; m.n++; }
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
  return out.filter((p) => !spec.skipCurrent || Number(String(p.period).slice(0, 4)) < thisYear).sort((a, b) => (a.period < b.period ? -1 : 1));
}

function compute() {
  const geos = [[REF_GEO.code, 'ref'], ['GOSB', 'ept'], ['94', 'dep'], ['11', 'reg']];
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
  const kpis = KPIS.map((spec) => {
    const res = {};
    for (const [geo, key] of geos) {
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
      if (spec.kpiPerK) s = s.map((p) => { const pop = carto.popAt(pops[geo], p.period); return pop ? { period: p.period, value: (p.value / pop) * 1000 } : null; }).filter(Boolean);
      res[key] = s;
    }
    const s = res.ref || [];
    const last = s[s.length - 1] || null, prev = s.length > 1 ? s[s.length - 2] : null;
    const at = (list, period) => (list || []).find((p) => p.period === period) || null;
    const cands = indicators.filter((i) => matchOne(spec, i));
    const states = { valide: 0, brouillon: 0, abandonne: 0 };
    cands.forEach((i) => { states[i.statut || 'brouillon']++; });
    const statut = states.valide ? 'valide' : states.brouillon ? 'brouillon' : cands.length ? 'abandonne' : 'sans_fiche';
    const year = last ? Number(String(last.period).slice(0, 4)) : null;
    return {
      prive: PRIVES.has(spec.dataset), // jeu à accès habilité : valeur non publique
      id: spec.id, label: spec.label, theme: spec.theme, unit: spec.unit || (spec.kpiPerK ? 'pour 1 000 hab.' : ''), dir: spec.dir, dataset: spec.dataset, datasetLabel: dsInfo[spec.dataset]?.label || spec.dataset,
      last_import: dsInfo[spec.dataset]?.last_import || null,
      value: last?.value ?? null, period: last?.period ?? null, prev, series: s.slice(-8),
      ept: last && res.ept ? at(res.ept, last.period) : null, dep: last && res.dep ? at(res.dep, last.period) : null, reg: last && res.reg ? at(res.reg, last.period) : null,
      age: year == null || Number.isNaN(year) ? null : new Date().getFullYear() - year,
      indicators: cands.slice(0, 8).map((i) => ({ id: i.id, libelle: i.libelle, statut: i.statut || 'brouillon', priorite: i.priorite })),
      statut, states,
    };
  });

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
  const filt = Object.entries(spec.where).filter(([, v]) => v !== '_T').map(([d, v]) => `${d} = ${v}`).join(', ');
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
const kpiKind = (k) => (k.unit === '%' ? 'pct' : k.kpiPerK ? 'rate' : k.ratio && !k.unit ? 'ratio' : /€/.test(k.unit || '') ? 'money' : 'count');
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
  [/^points_noirs$/, /qualite de l air/, 'cumul de nuisances (air, bruit, sols…), pas la qualité de l’air seule'],
  [/^points_noirs$/, /nuisances sonores/, 'cumul de nuisances, pas le bruit seul'],
  [/^artificialisation$/, /impermeabilite/, 'surface artificialisée : artificialisé ne veut pas dire imperméabilisé'],
  [/^generalistes$/, /rapport entre l offre et la demande/, 'densité de généralistes, pas l’accessibilité potentielle localisée (APL)'],
];

function matchOne(k, fiche) {
  const t = norm(fiche.libelle);
  if (!k.ind.test(t)) return null;
  if (fiche.theme && THEMES[fiche.theme] && !THEMES[fiche.theme].includes(k.theme)) return null; // thème incompatible
  const carte = norm(fiche.libelle_carte || '');
  const fk = /par (association|assiociation|asso)\b/.test(carte) || /par association/.test(t) ? 'ratio' : ficheKind(t), kk = kpiKind(k);
  if ((fk === 'pct' || fk === 'ratio') && (kk === 'count' || kk === 'money')) return null; // une part ou un indice ne peut pas être un effectif
  if (fk === 'count' && (kk === 'pct' || kk === 'money' || kk === 'ratio')) return null; // un nombre ne peut pas être un pourcentage
  const why = [];
  const proxy = PROXY.find(([idRe, ficheRe]) => idRe.test(k.id) && ficheRe.test(t));
  if (proxy) why.push(proxy[2]);
  if (fk === 'count' && kk === 'rate') why.push('taux pour 1 000 habitants, la fiche demande un nombre');
  if (fk === 'pct' && kk === 'ratio') why.push('rapport ou indice, pas un pourcentage');
  if (fiche.niveau === 'prospective') why.push('valeur actuelle : base de la projection, pas la projection elle-même');
  else if (fiche.niveau === 'evaluation' && !/^(densite|taux|part|indice|indicateur|rapport|attractivite|respect|accidents|nombre de|nb d emplois)/.test(t)) why.push('valeur de contexte : l’évaluation demande une analyse');
  // effectifs et comptes des associations : déclarations partielles (seules certaines associations les renseignent)
  if (k.declaratif) return { id: k.id, fiabilite: why.length ? 'approchee' : 'partielle', raison: [...why, 'données déclaratives, connues pour une partie des associations seulement'].join(' ; ') };
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
