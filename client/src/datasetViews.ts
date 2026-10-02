// Présentation de chaque jeu de données dans l'explorateur de la page Données.
// Un jeu est un « cube » (période × dimensions) dont les modalités s'emboîtent souvent (total, sous-totaux, détail).
// Chaque préréglage fixe une lecture pertinente : axe horizontal, séries, modalités retenues (keep, jamais d'additions de niveaux emboîtés),
// valeur figée pour les autres dimensions (pins) et, au besoin, un ratio (ex. chômeurs / actifs).
import type { Mode, Ratio } from './explorer';

export interface Preset {
  label: string;
  x?: string; // '@PERIOD' (évolution), '@GEO' (comparaison de territoires), '@HIER' (niveaux emboîtés) ou une dimension
  series?: string; // dimension déclinée en séries, ou '@PERIOD'
  pins?: Record<string, string>;
  keep?: Record<string, string[]>; // modalités affichées (dans cet ordre) pour une dimension
  ratio?: Ratio;
  band5?: boolean; // âges regroupés par tranches de 5 ans
  mode?: Mode;
  level?: number; // niveau de détail pour '@HIER'
  period?: string;
  note?: string;
  partial?: boolean; // affiche seulement une partie des catégories (la somme n'est pas censée égaler le total)
}

export interface View extends Omit<Preset, 'label'> {
  presets?: Preset[];
  hier?: string[]; // dimensions emboîtées (domaine > sous-domaine > type)
  keyfigures?: boolean; // ouvre d'abord la synthèse « chiffres clés »
  note?: string;
}

const OVERLAP = "Les modalités peuvent s'emboîter (une catégorie peut en contenir d'autres) : l'affichage retient un niveau de détail qui ne se recoupe pas.";
const ages = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => `Y${a + k}`);
const ratio = (dim: string, num: string[], den: string[], label: string, factor = 100): Ratio => ({ dim, num, den, label, factor });
const ABOVE65 = [...ages(65, 99), 'Y_GE100'];
const FOR_SEX = { SEX: ['M', 'F'] };
const BUILD = ['Y_LT1919', 'Y1919T1945', 'Y1946T1970', 'Y1971T1990', 'Y1991T2005', 'Y2006TAAAA'];
const ACT_PINS = { SEX: '_T', EDUC: '_T', AGE: 'Y15T64' };
const ACT_KEEP = ['1', '2', '31', '33', '35', '36'];
const RP = { RP_MEASURE: 'DWELLINGS' };
const RP_MAIN = { RP_MEASURE: 'DWELLINGS', OCS: 'DW_MAIN' };
const NAV = { SEX: '_T', WORK_AREA: '_T', WORK_URBAN_AREA: '_T' };
const MAISON_APPART = { TYPE_LOCAL: ['Appartement', 'Maison'] };
const RSA_KEEP = { TYPE_RSA: ['RSA non majoré', 'RSA majoré', 'Inconnu'] };

export const VIEWS: Record<string, View> = {
  // ---------------- démographie ----------------
  rp_serie_historique: {
    note: 'Les millésimes sont ceux des recensements (1968, 1975, 1982, 1990, 1999, 2007, 2012, 2017, 2023). Cette série fournit les populations utilisées pour le calcul « pour 1 000 habitants ».',
    presets: [
      { label: 'Population', x: '@PERIOD', pins: { RP_MEASURE: 'POP', OCS: '_T' } },
      { label: 'Évolution (base 100 en 1968)', x: '@PERIOD', pins: { RP_MEASURE: 'POP', OCS: '_T' }, mode: 'idx' },
      { label: 'Naissances et décès entre deux recensements', x: '@PERIOD', series: 'RP_MEASURE', keep: { RP_MEASURE: ['BRTH', 'DEATH'] }, pins: { OCS: '_T' } },
      { label: 'Logements par catégorie', x: '@PERIOD', series: 'OCS', keep: { OCS: ['DW_MAIN', 'DW_SEC_DW_OCC', 'DW_VAC'] }, pins: RP },
    ],
  },
  pop_hist: {
    presets: [
      { label: 'Population municipale', x: '@PERIOD', pins: { POPREF_MEASURE: 'PMUN' } },
      { label: 'Évolution (base 100 en 1968)', x: '@PERIOD', pins: { POPREF_MEASURE: 'PMUN' }, mode: 'idx' },
      { label: 'Population municipale et sans double compte', x: '@PERIOD', series: 'POPREF_MEASURE' },
    ],
  },
  rp_pop_agesex: {
    presets: [
      { label: 'Pyramide des âges (tranches de 5 ans)', x: 'AGE', series: 'SEX', band5: true, keep: FOR_SEX, note: 'Population par sexe et tranche d\'âge de 5 ans (recensement).' },
      { label: 'Âge par année', x: 'AGE', series: 'SEX', keep: FOR_SEX },
      { label: 'Femmes et hommes', x: 'SEX', pins: { AGE: '_T' }, keep: FOR_SEX },
      { label: 'Part des moins de 20 ans', x: '@GEO', pins: { SEX: '_T' }, ratio: ratio('AGE', ages(0, 19), ['_T'], 'Moins de 20 ans / population totale') },
      { label: 'Part des moins de 18 ans', x: '@GEO', pins: { SEX: '_T' }, ratio: ratio('AGE', ages(0, 17), ['_T'], 'Moins de 18 ans / population totale') },
      { label: 'Part des 65 ans et plus', x: '@GEO', pins: { SEX: '_T' }, ratio: ratio('AGE', ABOVE65, ['_T'], '65 ans et plus / population totale') },
      { label: 'Indice de vieillissement (65 ans et + / moins de 20 ans)', x: '@GEO', pins: { SEX: '_T' }, ratio: ratio('AGE', ABOVE65, ages(0, 19), '65 ans et plus pour 100 jeunes de moins de 20 ans') },
      { label: 'Taux de dépendance démographique', x: '@GEO', pins: { SEX: '_T' }, ratio: ratio('AGE', [...ages(0, 19), ...ABOVE65], ages(20, 64), '(moins de 20 ans + 65 ans et plus) / 20-64 ans') },
    ],
  },
  etat_civil_nais: { presets: [{ label: 'Naissances par an', x: '@PERIOD' }, { label: 'Évolution (base 100)', x: '@PERIOD', mode: 'idx' }, { label: 'Naissances pour 1 000 habitants', x: '@PERIOD', mode: 'pop' }] },
  etat_civil_deces: { presets: [{ label: 'Décès par an', x: '@PERIOD' }, { label: 'Évolution (base 100)', x: '@PERIOD', mode: 'idx' }, { label: 'Décès pour 1 000 habitants', x: '@PERIOD', mode: 'pop' }] },
  rp_menages_taille: {
    presets: [
      { label: 'Taille des ménages', x: 'NOC', pins: { SEX: '_T', AGE: '_T' } },
      { label: 'Part des ménages d\'une personne', x: '@GEO', pins: { SEX: '_T', AGE: '_T' }, ratio: ratio('NOC', ['P1'], ['_T'], 'Ménages d\'une personne / ménages') },
      { label: 'Part des ménages de 4 personnes et plus', x: '@GEO', pins: { SEX: '_T', AGE: '_T' }, ratio: ratio('NOC', ['P4', 'P5', 'P_GE6'], ['_T'], 'Ménages de 4 personnes et plus / ménages') },
    ],
  },
  rp_menages_type: {
    presets: [
      { label: 'Types de ménages', x: 'TPH', keep: { TPH: ['11', '12', 'MF21', 'MF22'] }, pins: { RP_MEASURE: 'DWELLINGS', AGE: '_T' }, note: 'Ménage d\'une personne, ménage sans famille, famille monoparentale, famille avec couple.' },
      { label: 'Types de ménages (détail)', x: 'TPH', keep: { TPH: ['110', '111', '12', 'MF211', 'MF212', 'A211', 'A221', 'A231', 'A24'] }, pins: { RP_MEASURE: 'DWELLINGS', AGE: '_T' } },
      { label: 'Part des familles monoparentales', x: '@GEO', pins: { RP_MEASURE: 'DWELLINGS', AGE: '_T' }, ratio: ratio('TPH', ['MF21'], ['_T'], 'Familles monoparentales / ménages') },
      { label: 'Part des personnes seules', x: '@GEO', pins: { RP_MEASURE: 'DWELLINGS', AGE: '_T' }, ratio: ratio('TPH', ['11'], ['_T'], 'Ménages d\'une personne / ménages') },
      { label: 'Taille moyenne des ménages', x: '@GEO', pins: { TPH: '_T', AGE: '_T' }, ratio: ratio('RP_MEASURE', ['DWELLINGS_POPSIZE'], ['DWELLINGS'], 'Personnes des ménages / ménages (personnes par ménage)', 1) },
    ],
  },
  rp_nationalite: {
    presets: [
      { label: 'Nationalité', x: 'NATIONALITY_TYPE', pins: { SEX: '_T', AGE: '_T' } },
      { label: 'Part d\'étrangers', x: '@GEO', pins: { SEX: '_T', AGE: '_T' }, ratio: ratio('NATIONALITY_TYPE', ['100'], ['_T'], 'Étrangers / population') },
      { label: 'Part d\'étrangers par âge', x: 'AGE', pins: { SEX: '_T' }, keep: { AGE: ['Y_LT15', 'Y15T24', 'Y25T54', 'Y_GE55'] }, ratio: ratio('NATIONALITY_TYPE', ['100'], ['_T'], 'Étrangers / population de la tranche d\'âge') },
    ],
  },
  rp_immigration: {
    note: 'Les immigrés (nés étrangers à l\'étranger) ne sont pas les étrangers (nationalité) : voir le jeu « Nationalité ».',
    presets: [
      { label: 'Statut d\'immigration', x: 'IMMI', pins: { SEX: '_T', EMPSTA_ENQ: '_T', AGE: '_T' } },
      { label: 'Part d\'immigrés', x: '@GEO', pins: { SEX: '_T', EMPSTA_ENQ: '_T', AGE: '_T' }, ratio: ratio('IMMI', ['1'], ['_T'], 'Immigrés / population') },
      { label: 'Part d\'immigrés par âge', x: 'AGE', pins: { SEX: '_T', EMPSTA_ENQ: '_T' }, keep: { AGE: ['Y_LT15', 'Y15T24', 'Y25T54', 'Y_GE55'] }, ratio: ratio('IMMI', ['1'], ['_T'], 'Immigrés / population de la tranche d\'âge') },
    ],
  },
  rp_migrations: {
    note: 'Lieu de résidence un an avant le recensement (population d\'un an ou plus).',
    presets: [
      { label: 'Lieu de résidence un an auparavant', x: 'PREV_RES_AREA', keep: { PREV_RES_AREA: ['11', '12', '21', '22', '23', '24', '25T32'] }, pins: { AGE: 'Y_GE1' } },
      { label: 'Part des habitants arrivés d\'une autre commune', x: '@PERIOD', pins: { AGE: 'Y_GE1' }, ratio: ratio('PREV_RES_AREA', ['20_30'], ['11', '12', '20_30'], 'Habitants venus d\'une autre commune / habitants') },
      { label: 'Part des habitants ayant déménagé dans la commune', x: '@PERIOD', pins: { AGE: 'Y_GE1' }, ratio: ratio('PREV_RES_AREA', ['12'], ['11', '12', '20_30'], 'Habitants ayant changé de logement dans la commune / habitants') },
    ],
  },
  rp_scolarisation: {
    note: 'Population scolarisée au recensement (tous niveaux, de la maternelle à l\'enseignement supérieur).',
    presets: [
      { label: 'Scolarisés par âge', x: 'AGE', pins: { SEX: '_T', STUD_AREA: '_T' } },
      { label: 'Scolarisés par âge et sexe', x: 'AGE', series: 'SEX', keep: FOR_SEX, pins: { STUD_AREA: '_T' } },
      { label: 'Lieu d\'études', x: 'STUD_AREA', keep: { STUD_AREA: ['10', '21', '22', '23', '24_30'] }, pins: { SEX: '_T', AGE: 'Y_GE2' } },
    ],
  },
  education_effectifs: {
    presets: [
      { label: 'Élèves par rentrée', x: '@PERIOD', series: 'SECTEUR', pins: { MESURE: 'ELEVES' } },
      { label: 'Classes par rentrée', x: '@PERIOD', series: 'SECTEUR', pins: { MESURE: 'CLASSES' } },
      { label: 'Élèves par classe', x: '@PERIOD', ratio: ratio('MESURE', ['ELEVES'], ['CLASSES'], 'Élèves / classes', 1) },
    ],
  },
  education_annuaire: {
    presets: [
      { label: 'Établissements par type et secteur', x: 'TYPE', series: 'STATUT', pins: { MESURE: 'NB_ETABLISSEMENTS' } },
      { label: 'Établissements par type', x: 'TYPE', pins: { MESURE: 'NB_ETABLISSEMENTS', STATUT: '_T' } },
    ],
  },

  // ---------------- emploi, revenus, économie ----------------
  rp_activite_chomage: {
    note: 'Population de 15 à 64 ans au recensement. ' + OVERLAP,
    presets: [
      { label: 'Statut d\'activité (15-64 ans)', x: 'EMPSTA_ENQ', keep: { EMPSTA_ENQ: ACT_KEEP }, pins: ACT_PINS },
      { label: 'Taux de chômage (15-64 ans)', x: '@PERIOD', pins: ACT_PINS, ratio: ratio('EMPSTA_ENQ', ['2'], ['1T2'], 'Chômeurs / actifs (15-64 ans)') },
      { label: 'Taux d\'activité (15-64 ans)', x: '@PERIOD', pins: ACT_PINS, ratio: ratio('EMPSTA_ENQ', ['1T2'], ['_T'], 'Actifs / population de 15 à 64 ans') },
      { label: 'Taux d\'emploi (15-64 ans)', x: '@PERIOD', pins: ACT_PINS, ratio: ratio('EMPSTA_ENQ', ['1'], ['_T'], 'Actifs occupés / population de 15 à 64 ans') },
      { label: 'Taux de chômage par âge', x: 'AGE', keep: { AGE: ['Y15T24', 'Y25T54', 'Y55T64'] }, pins: { SEX: '_T', EDUC: '_T' }, ratio: ratio('EMPSTA_ENQ', ['2'], ['1T2'], 'Chômeurs / actifs de la tranche d\'âge') },
      { label: 'Taux de chômage selon le diplôme', x: 'EDUC', keep: { EDUC: ['001T100_RP', '200_RP', '300_RP', '350T351_RP', '500_RP', '600_RP', '700_RP'] }, pins: { SEX: '_T', AGE: 'Y15T64' }, ratio: ratio('EMPSTA_ENQ', ['2'], ['1T2'], 'Chômeurs / actifs selon le diplôme') },
      { label: 'Taux de chômage des femmes et des hommes', x: '@PERIOD', series: 'SEX', keep: FOR_SEX, pins: { EDUC: '_T', AGE: 'Y15T64' }, ratio: ratio('EMPSTA_ENQ', ['2'], ['1T2'], 'Chômeurs / actifs') },
    ],
  },
  rp_csp: {
    presets: [
      { label: 'Répartition par catégorie socioprofessionnelle', x: 'PCS', pins: { SEX: '_T', AGE: 'Y_GE15' }, note: 'Population de 15 ans ou plus, y compris retraités et autres inactifs.' },
      { label: 'Part des cadres', x: '@GEO', pins: { SEX: '_T', AGE: 'Y_GE15' }, ratio: ratio('PCS', ['3'], ['_T'], 'Cadres et professions intellectuelles supérieures / population de 15 ans et plus') },
      { label: 'Part des employés et ouvriers', x: '@GEO', pins: { SEX: '_T', AGE: 'Y_GE15' }, ratio: ratio('PCS', ['5', '6'], ['_T'], 'Employés et ouvriers / population de 15 ans et plus') },
      { label: 'Part des retraités', x: '@GEO', pins: { SEX: '_T', AGE: 'Y_GE15' }, ratio: ratio('PCS', ['7'], ['_T'], 'Retraités / population de 15 ans et plus') },
    ],
  },
  rp_emploi_lt: {
    presets: [
      { label: 'Emplois au lieu de travail', x: '@PERIOD', pins: { SEX: '_T', EMPFORM: '_T', WKTIME: '_T', AGE: '_T' } },
      { label: 'Part des emplois à temps partiel', x: '@PERIOD', pins: { SEX: '_T', EMPFORM: '_T', AGE: '_T' }, ratio: ratio('WKTIME', ['PT'], ['_T'], 'Emplois à temps partiel / emplois') },
      { label: 'Part des emplois salariés', x: '@PERIOD', pins: { SEX: '_T', WKTIME: '_T', AGE: '_T' }, ratio: ratio('EMPFORM', ['2'], ['_T'], 'Emplois salariés / emplois') },
      { label: 'Part des femmes dans les emplois', x: '@PERIOD', pins: { EMPFORM: '_T', WKTIME: '_T', AGE: '_T' }, ratio: ratio('SEX', ['F'], ['_T'], 'Emplois occupés par des femmes / emplois') },
    ],
  },
  filosofi: {
    keyfigures: true,
    note: 'Les valeurs non diffusées (statut O : valeur manquante, secret statistique) sont affichées « n.d. ». Millésime 2023 : seuls le niveau de vie médian et le taux de pauvreté sont diffusés pour Ivry.',
    presets: [
      { label: 'Niveau de vie médian', x: '@GEO', pins: { FILOSOFI_MEASURE: 'MED_SL' } },
      { label: 'Taux de pauvreté (seuil à 60 %)', x: '@GEO', pins: { FILOSOFI_MEASURE: 'PR_MD60' } },
    ],
  },
  side_stocks: {
    presets: [
      { label: 'Établissements (total)', x: '@PERIOD', pins: { SIDE_MEASURE: 'UNIT_LOC', ACTIVITY: '_T' } },
      { label: 'Établissements par secteur', x: '@PERIOD', series: 'ACTIVITY', pins: { SIDE_MEASURE: 'UNIT_LOC' } },
      { label: 'Structure par secteur (dernière année)', x: 'ACTIVITY', mode: 'part', pins: { SIDE_MEASURE: 'UNIT_LOC' } },
      { label: 'Unités légales (total)', x: '@PERIOD', pins: { SIDE_MEASURE: 'LEGAL_UNIT', ACTIVITY: '_T' } },
    ],
  },
  side_creations: {
    presets: [
      { label: 'Créations d\'établissements', x: '@PERIOD', pins: { SIDE_MEASURE: 'UNIT_LOC_BURE', ACTIVITY: '_T', LEGAL_FORM: '_T' } },
      { label: 'Créations d\'établissements par secteur', x: '@PERIOD', series: 'ACTIVITY', pins: { SIDE_MEASURE: 'UNIT_LOC_BURE', LEGAL_FORM: '_T' } },
      { label: 'Créations d\'entreprises par forme légale', x: '@PERIOD', series: 'LEGAL_FORM', pins: { SIDE_MEASURE: 'BURE', ACTIVITY: '_T' } },
    ],
  },
  caf_rsa: {
    presets: [
      { label: 'Foyers allocataires du RSA', x: '@PERIOD', series: 'TYPE_RSA', keep: RSA_KEEP, pins: { MESURE: 'FOYERS_RSA' } },
      { label: 'Personnes couvertes par le RSA', x: '@PERIOD', series: 'TYPE_RSA', keep: RSA_KEEP, pins: { MESURE: 'PERSONNES_RSA' } },
      { label: 'Foyers au RSA pour 1 000 habitants', x: '@PERIOD', mode: 'pop', series: 'TYPE_RSA', keep: { TYPE_RSA: ['RSA non majoré', 'RSA majoré'] }, pins: { MESURE: 'FOYERS_RSA' } },
    ],
  },
  entreprises: {
    keyfigures: true,
    note: 'Stock à la date de l\'import : réimportez régulièrement pour suivre l\'évolution.',
    presets: [{ label: 'Associations et ESS', x: 'MESURE', keep: { MESURE: ['ASSOCIATIONS', 'ESS'] } }],
  },

  // ---------------- équipements ----------------
  bpe: {
    hier: ['FACILITY_DOM', 'FACILITY_SDOM', 'FACILITY_TYPE'],
    note: 'Trois niveaux de classification emboîtés : choisissez le niveau de détail (domaine, sous-domaine, type d\'équipement) et, au besoin, restreignez à un domaine. Les niveaux ne s\'additionnent pas.',
    presets: [
      { label: 'Équipements par domaine', x: '@HIER', level: 0 },
      { label: 'Équipements par sous-domaine', x: '@HIER', level: 1 },
      { label: 'Équipements par type', x: '@HIER', level: 2 },
      { label: 'Équipements par domaine pour 1 000 habitants', x: '@HIER', level: 0, mode: 'pop' },
    ],
  },

  // ---------------- logement ----------------
  rp_logement: {
    presets: [
      { label: 'Catégories de logements', x: 'OCS', keep: { OCS: ['DW_MAIN', 'DW_SEC_DW_OCC', 'DW_VAC'] }, pins: RP },
      { label: 'Statut d\'occupation (résidences principales)', x: 'TSH', keep: { TSH: ['100', '211', '221', '212_222', '300'] }, pins: RP_MAIN },
      { label: 'Type de logement', x: 'TDW', keep: { TDW: ['1', '2', '3T6'] }, pins: RP_MAIN },
      { label: 'Nombre de pièces', x: 'NOR', pins: RP_MAIN },
      { label: 'Époque de construction', x: 'BUILD_END', keep: { BUILD_END: BUILD }, pins: RP_MAIN, partial: true, note: 'Les logements achevés depuis 2021 (environ 5 % du parc en 2023) ne sont pas ventilés par époque dans le jeu : la somme des barres est inférieure au total.' },
      { label: 'Ancienneté d\'emménagement', x: 'L_STAY', pins: RP_MAIN },
      { label: 'Équipement automobile des ménages', x: 'CARS', keep: { CARS: ['C0', 'C1', 'C_GE2'] }, pins: RP_MAIN },
      { label: 'Énergie de chauffage', x: 'NRG_SRC', keep: { NRG_SRC: ['ELC', 'TOWN_GAS', 'BOT_GAS', 'OIL', 'OTH'] }, pins: RP_MAIN },
      { label: 'Part de logements vacants', x: '@PERIOD', pins: RP, ratio: ratio('OCS', ['DW_VAC'], ['_T'], 'Logements vacants / logements') },
      { label: 'Part de résidences secondaires', x: '@PERIOD', pins: RP, ratio: ratio('OCS', ['DW_SEC_DW_OCC'], ['_T'], 'Résidences secondaires et logements occasionnels / logements') },
      { label: 'Part de locataires du parc social', x: '@PERIOD', pins: RP_MAIN, ratio: ratio('TSH', ['221'], ['_T'], 'Ménages locataires du parc social / résidences principales') },
      { label: 'Part de propriétaires occupants', x: '@PERIOD', pins: RP_MAIN, ratio: ratio('TSH', ['100'], ['_T'], 'Ménages propriétaires / résidences principales') },
      { label: 'Taux de motorisation des ménages', x: '@PERIOD', pins: RP_MAIN, ratio: ratio('CARS', ['C_GE1'], ['_T'], 'Ménages avec au moins une voiture / ménages') },
      { label: 'Part de logements construits avant 1946', x: '@PERIOD', pins: RP_MAIN, ratio: ratio('BUILD_END', ['Y_LT1946', 'Y_LT1919', 'Y1919T1945'], ['_T'], 'Résidences principales d\'avant 1946 / résidences principales') },
    ],
  },
  sru: {
    note: 'Seuil légal : 25 % de logements sociaux (20 % pour certaines communes) ; le taux cible est fixé à la commune.',
    presets: [
      { label: 'Taux SRU et objectif', x: '@PERIOD', series: 'MESURE', keep: { MESURE: ['TAUX_SRU', 'TAUX_CIBLE'] } },
      { label: 'Logements sociaux inventoriés', x: '@PERIOD', pins: { MESURE: 'LLS' } },
    ],
  },
  loyers: {
    note: 'Loyers d\'annonce (charges comprises) prédits par modèle statistique, pas des loyers constatés.',
    presets: [
      { label: 'Loyer d\'annonce au m²', x: '@PERIOD', series: 'TYPE_BIEN', pins: { MESURE: 'LOYER_M2' } },
      { label: 'Fourchette de loyers (dernier millésime)', x: 'TYPE_BIEN', series: 'MESURE', keep: { MESURE: ['LOYER_M2_BAS', 'LOYER_M2', 'LOYER_M2_HAUT'] } },
      { label: 'Évolution des loyers (base 100)', x: '@PERIOD', series: 'TYPE_BIEN', pins: { MESURE: 'LOYER_M2' }, mode: 'idx' },
    ],
  },
  dvf: {
    note: 'Calculé à l\'import à partir des mutations à titre onéreux d\'un seul logement ; la dernière année est partielle.',
    presets: [
      { label: 'Prix médian au m²', x: '@PERIOD', series: 'TYPE_LOCAL', keep: MAISON_APPART, pins: { MESURE: 'PRIX_M2_MEDIAN' } },
      { label: 'Évolution des prix (base 100)', x: '@PERIOD', series: 'TYPE_LOCAL', keep: MAISON_APPART, pins: { MESURE: 'PRIX_M2_MEDIAN' }, mode: 'idx' },
      { label: 'Nombre de ventes de logements', x: '@PERIOD', series: 'TYPE_LOCAL', keep: MAISON_APPART, pins: { MESURE: 'NB_VENTES' } },
      { label: 'Surface médiane', x: '@PERIOD', series: 'TYPE_LOCAL', keep: MAISON_APPART, pins: { MESURE: 'SURFACE_MEDIANE' } },
      { label: 'Prix de vente médian', x: '@PERIOD', series: 'TYPE_LOCAL', keep: MAISON_APPART, pins: { MESURE: 'VALEUR_MEDIANE' } },
      { label: 'Mutations (toutes natures de biens)', x: '@PERIOD', pins: { MESURE: 'NB_MUTATIONS', TYPE_LOCAL: '_T' } },
    ],
  },

  // ---------------- mobilité ----------------
  rp_navettes: {
    note: 'Actifs occupés de 15 ans et plus, selon le moyen de transport habituel pour aller travailler.',
    presets: [
      { label: 'Mode de transport domicile-travail', x: 'TRANS', keep: { TRANS: ['1', '2', '3', '4', '5', '6'] }, pins: NAV },
      { label: 'Part modale vélo et marche', x: '@GEO', pins: NAV, ratio: ratio('TRANS', ['2', '3'], ['_T'], 'Actifs allant travailler à pied ou à vélo / actifs occupés') },
      { label: 'Part des transports en commun', x: '@GEO', pins: NAV, ratio: ratio('TRANS', ['6'], ['_T'], 'Actifs utilisant les transports en commun / actifs occupés') },
      { label: 'Part de la voiture', x: '@GEO', pins: NAV, ratio: ratio('TRANS', ['5'], ['_T'], 'Actifs utilisant la voiture / actifs occupés') },
      { label: 'Lieu de travail', x: 'WORK_AREA', keep: { WORK_AREA: ['10', '21', '22', '23', '24T30'] }, pins: { SEX: '_T', TRANS: '_T', WORK_URBAN_AREA: '_T' } },
    ],
  },
  baac: {
    presets: [
      { label: 'Accidents corporels par an', x: '@PERIOD', pins: { MESURE: 'ACCIDENTS', LUMINOSITE: '_T', AGGLOMERATION: '_T' } },
      { label: 'Accidents selon l\'éclairage', x: 'LUMINOSITE', series: '@PERIOD', keep: { LUMINOSITE: ['1', '2', '3', '4', '5'] }, pins: { AGGLOMERATION: '_T' } },
      { label: 'Accidents pour 1 000 habitants', x: '@PERIOD', mode: 'pop', pins: { MESURE: 'ACCIDENTS', LUMINOSITE: '_T', AGGLOMERATION: '_T' } },
    ],
  },

  // ---------------- environnement ----------------
  artificialisation: {
    note: 'La part artificialisée des départements et des régions est illisible dans le fichier source (des dates apparaissent à la place des pourcentages) : pour ces niveaux, seules les surfaces sont disponibles (choisir « Surface artificialisée »).',
    presets: [
      { label: 'Part du territoire artificialisée', x: '@PERIOD', pins: { MESURE: 'PART_ARTIF' } },
      { label: 'Surface artificialisée', x: '@PERIOD', pins: { MESURE: 'SURFACE_ARTIF_HA' } },
      { label: 'Variation de surface artificialisée', x: '@PERIOD', pins: { MESURE: 'FLUX_HA' } },
    ],
  },
  mos: {
    presets: [
      { label: 'Occupation du sol 2025 (30 principaux postes)', partial: true, x: 'POSTE', pins: { MESURE: 'SURFACE_HA' }, period: '2025' },
      { label: 'Évolution 2021-2025 par poste', x: 'POSTE', series: '@PERIOD', pins: { MESURE: 'SURFACE_HA' } },
      {
        label: 'Espaces verts et jardins (2025)', partial: true, x: 'POSTE', period: '2025', pins: { MESURE: 'SURFACE_HA' },
        keep: { POSTE: ['Parcs ou jardins publics', 'Autres espaces verts', 'Surfaces engazonnées avec ou sans arbustes entretenus', 'Jardins familiaux', "Jardins de l'habitat", 'Maraîchage, horticulture', 'Berges'] },
      },
    ],
  },
  multiexposition: {
    note: 'Classes de 1 à 6 définies par l\'Institut Paris Région : se reporter à la documentation du jeu pour leur signification.',
    presets: [
      { label: 'Population par classe de multi-exposition', x: 'MESURE', keep: { MESURE: ['CLASSE_1', 'CLASSE_2', 'CLASSE_3', 'CLASSE_4', 'CLASSE_5', 'CLASSE_6'] } },
      { label: 'Population vulnérable par classe', x: 'MESURE', keep: { MESURE: ['CLASSE_VULN_1', 'CLASSE_VULN_2', 'CLASSE_VULN_3', 'CLASSE_VULN_4', 'CLASSE_VULN_5', 'CLASSE_VULN_6'] } },
    ],
  },

  // ---------------- construction, énergie, mobilité, environnement (nouveaux jeux) ----------------
  sitadel: {
    note: "Base Sit@del2 du SDES : autorisations d'urbanisme créant des logements. Les logements sont comptés l'année de chaque étape (autorisation, ouverture de chantier, achèvement) ; l'année en cours est partielle.",
    presets: [
      { label: 'Logements autorisés, commencés et achevés', x: '@PERIOD', series: 'MESURE', keep: { MESURE: ['LGT_AUTORISES', 'LGT_COMMENCES', 'LGT_ACHEVES'] }, pins: { TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' } },
      { label: 'Logements commencés par type', x: '@PERIOD', series: 'TYPE_LOGEMENT', keep: { TYPE_LOGEMENT: ['INDIVIDUEL', 'COLLECTIF'] }, pins: { MESURE: 'LGT_COMMENCES', TYPE_DAU: '_T' } },
      { label: 'Logements achevés', x: '@PERIOD', pins: { MESURE: 'LGT_ACHEVES', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' } },
      { label: 'Logements autorisés pour 1 000 habitants', x: '@PERIOD', mode: 'pop', pins: { MESURE: 'LGT_AUTORISES', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' } },
      { label: 'Logements sociaux autorisés', x: '@PERIOD', pins: { MESURE: 'LGT_SOCIAUX_AUTORISES', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' } },
      { label: 'Part des logements sociaux dans les logements autorisés', x: '@PERIOD', pins: { TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' }, ratio: ratio('MESURE', ['LGT_SOCIAUX_AUTORISES'], ['LGT_AUTORISES'], 'Logements sociaux autorisés / logements autorisés') },
      { label: 'Autorisations délivrées par type', x: '@PERIOD', series: 'TYPE_DAU', keep: { TYPE_DAU: ['PC', 'DP'] }, pins: { MESURE: 'NB_AUTORISATIONS', TYPE_LOGEMENT: '_T' } },
      { label: 'Logements démolis', x: '@PERIOD', pins: { MESURE: 'LGT_DEMOLIS', TYPE_LOGEMENT: '_T', TYPE_DAU: '_T' } },
    ],
  },
  ore_conso: {
    note: "Consommations d'électricité et de gaz distribuées (Enedis, GRDF, distributeurs locaux), en MWh, hors énergies non réseau (fioul, bois). Données soumises au secret statistique.",
    presets: [
      { label: 'Consommation par secteur', x: '@PERIOD', series: 'SECTEUR', keep: { SECTEUR: ['RESIDENTIEL', 'TERTIAIRE', 'INDUSTRIE', 'AGRICULTURE'] }, pins: { MESURE: 'CONSO_MWH', FILIERE: '_T' } },
      { label: 'Électricité et gaz', x: '@PERIOD', series: 'FILIERE', keep: { FILIERE: ['Electricité', 'Gaz'] }, pins: { MESURE: 'CONSO_MWH', SECTEUR: '_T' } },
      { label: 'Consommation résidentielle pour 1 000 habitants', x: '@PERIOD', mode: 'pop', pins: { MESURE: 'CONSO_MWH', SECTEUR: 'RESIDENTIEL', FILIERE: '_T' } },
      { label: 'Consommation tertiaire pour 1 000 habitants', x: '@PERIOD', mode: 'pop', pins: { MESURE: 'CONSO_MWH', SECTEUR: 'TERTIAIRE', FILIERE: '_T' } },
      { label: 'Part du gaz dans la consommation résidentielle', x: '@PERIOD', pins: { MESURE: 'CONSO_MWH', SECTEUR: 'RESIDENTIEL' }, ratio: ratio('FILIERE', ['Gaz'], ['_T'], 'Gaz / électricité et gaz (résidentiel)') },
      { label: 'Structure de la consommation par secteur (dernière année)', x: 'SECTEUR', mode: 'part', keep: { SECTEUR: ['RESIDENTIEL', 'TERTIAIRE', 'INDUSTRIE', 'AGRICULTURE'] }, pins: { MESURE: 'CONSO_MWH', FILIERE: '_T' } },
    ],
  },
  ore_parc_auto: {
    presets: [
      { label: 'Voitures particulières immatriculées', x: '@PERIOD', pins: { MESURE: 'VP' } },
      { label: 'Voitures pour 1 000 habitants', x: '@PERIOD', mode: 'pop', pins: { MESURE: 'VP' } },
      { label: 'Voitures rechargeables électriques', x: '@PERIOD', pins: { MESURE: 'VP_ELECTRIQUES' } },
      { label: 'Part de voitures rechargeables électriques', x: '@PERIOD', ratio: ratio('MESURE', ['VP_ELECTRIQUES'], ['VP'], 'Voitures rechargeables électriques / voitures') },
    ],
  },
  ore_irve: {
    note: "Points de recharge pour véhicules électriques recensés dans le fichier consolidé national, par année de mise en service.",
    presets: [
      { label: 'Points de recharge mis en service par an', x: '@PERIOD', pins: { MESURE: 'PDC_MIS_EN_SERVICE', IMPLANTATION: '_T' } },
      { label: 'Points de recharge par type d\'implantation', x: 'IMPLANTATION', pins: { MESURE: 'PDC_MIS_EN_SERVICE' }, period: '' },
      { label: 'Points de recharge pour 1 000 habitants', x: '@PERIOD', mode: 'pop', pins: { MESURE: 'PDC_MIS_EN_SERVICE', IMPLANTATION: '_T' } },
    ],
  },
  lovac: {
    note: "Fichier LOVAC (parc privé) : le parc de référence et la méthode évoluent d'un millésime à l'autre ; lire les évolutions avec prudence.",
    presets: [
      { label: 'Logements vacants du parc privé', x: '@PERIOD', pins: { MESURE: 'PP_VACANT' } },
      { label: 'Vacants depuis plus de 2 ans', x: '@PERIOD', pins: { MESURE: 'PP_VACANT_2ANS' } },
      { label: 'Part de logements vacants (parc privé)', x: '@PERIOD', ratio: ratio('MESURE', ['PP_VACANT'], ['PP_TOTAL'], 'Logements vacants / logements du parc privé') },
      { label: 'Part des vacants de longue durée', x: '@PERIOD', ratio: ratio('MESURE', ['PP_VACANT_2ANS'], ['PP_VACANT'], 'Vacants depuis plus de 2 ans / vacants') },
    ],
  },
  velo_stationnement: {
    note: "Données contributives (OpenStreetMap) : la couverture varie selon les communes, ne pas comparer des communes sans vérifier leur exhaustivité.",
    presets: [
      { label: 'Capacité de stationnement vélo', x: '@GEO', pins: { MESURE: 'CAPACITE', MOBILIER: '_T' } },
      { label: 'Capacité pour 1 000 habitants', x: '@GEO', mode: 'pop', pins: { MESURE: 'CAPACITE', MOBILIER: '_T' } },
      { label: 'Emplacements par type de mobilier', x: 'MOBILIER', pins: { MESURE: 'NB_STATIONNEMENTS' } },
    ],
  },
  nuisances: {
    presets: [
      { label: 'Mailles selon le nombre de nuisances cumulées', x: 'NB_NUISANCES', pins: { MESURE: 'MAILLES_500M', POINT_NOIR: '_T' } },
      { label: 'Part des mailles avec point noir environnemental', x: '@GEO', pins: { MESURE: 'MAILLES_500M', NB_NUISANCES: '_T' }, ratio: ratio('POINT_NOIR', ['1'], ['_T'], 'Mailles avec point noir / mailles de la commune') },
      { label: 'Part des mailles cumulant 3 nuisances ou plus', x: '@GEO', pins: { MESURE: 'MAILLES_500M', POINT_NOIR: '_T' }, ratio: ratio('NB_NUISANCES', ['3', '4', '5', '6', '7', '8'], ['_T'], 'Mailles à 3 nuisances ou plus / mailles de la commune') },
    ],
  },
  rpls: {
    note: "Répertoire des logements locatifs des bailleurs sociaux (SDES), situation au 1er janvier. Le nombre peut différer de l'inventaire SRU (périmètre et date différents).",
    presets: [
      { label: 'Logements locatifs sociaux', x: '@PERIOD', pins: { CRITERE: 'TOTAL', MODALITE: '_T' } },
      { label: 'Logements sociaux pour 1 000 habitants', x: '@PERIOD', mode: 'pop', pins: { CRITERE: 'TOTAL', MODALITE: '_T' } },
      { label: 'Nombre de pièces', x: 'MODALITE', keep: { MODALITE: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] }, pins: { CRITERE: 'NB_PIECES' } },
      { label: 'Étiquette énergétique (DPE)', x: 'MODALITE', keep: { MODALITE: ['DPE_A', 'DPE_B', 'DPE_C', 'DPE_D', 'DPE_E', 'DPE_F', 'DPE_G', 'DPE_ND'] }, pins: { CRITERE: 'DPE' } },
      { label: 'Période de construction', x: 'MODALITE', keep: { MODALITE: ['EP_AV1946', 'EP_1946_1970', 'EP_1971_1990', 'EP_1991_2005', 'EP_2006_PLUS'] }, pins: { CRITERE: 'EPOQUE' } },
      { label: 'Financement initial', x: 'MODALITE', pins: { CRITERE: 'FINANCEMENT' } },
      { label: 'Part des logements sociaux en quartier prioritaire', x: '@PERIOD', pins: { CRITERE: 'QPV' }, ratio: ratio('MODALITE', ['QPV_OUI'], ['QPV_OUI', 'QPV_NON'], 'Logements sociaux en QPV / logements sociaux') },
      { label: 'Part des logements classés E, F ou G', x: '@PERIOD', pins: { CRITERE: 'DPE' }, ratio: ratio('MODALITE', ['DPE_E', 'DPE_F', 'DPE_G'], ['DPE_A', 'DPE_B', 'DPE_C', 'DPE_D', 'DPE_E', 'DPE_F', 'DPE_G'], 'Logements classés E, F, G / logements avec étiquette') },
      { label: 'Part des logements construits avant 1971', x: '@PERIOD', pins: { CRITERE: 'EPOQUE' }, ratio: ratio('MODALITE', ['EP_AV1946', 'EP_1946_1970'], ['EP_AV1946', 'EP_1946_1970', 'EP_1971_1990', 'EP_1991_2005', 'EP_2006_PLUS'], 'Logements construits avant 1971 / logements') },
    ],
  },
  ssmsi: {
    note: "Faits enregistrés par la police et la gendarmerie (SSMSI). Un fait enregistré n'est pas un fait commis : les dépôts de plainte varient selon les territoires. Les valeurs soumises au secret statistique ne sont pas diffusées.",
    presets: [
      { label: 'Cambriolages de logement (pour 1 000 hab.)', x: '@PERIOD', pins: { MESURE: 'TAUX_MILLE', INFRACTION: 'CAMBRIOLAGES' } },
      { label: 'Violences physiques hors cadre familial (pour 1 000 hab.)', x: '@PERIOD', pins: { MESURE: 'TAUX_MILLE', INFRACTION: 'VIOL_HORS_FAMILLE' } },
      { label: 'Violences intrafamiliales (pour 1 000 hab.)', x: '@PERIOD', pins: { MESURE: 'TAUX_MILLE', INFRACTION: 'VIOL_FAMILIALES' } },
      { label: 'Violences sexuelles (pour 1 000 hab.)', x: '@PERIOD', pins: { MESURE: 'TAUX_MILLE', INFRACTION: 'VIOL_SEXUELLES' } },
      { label: 'Vols sans violence (pour 1 000 hab.)', x: '@PERIOD', pins: { MESURE: 'TAUX_MILLE', INFRACTION: 'VOLS_SANS_VIOLENCE' } },
      { label: 'Trafic de stupéfiants (pour 1 000 hab.)', x: '@PERIOD', pins: { MESURE: 'TAUX_MILLE', INFRACTION: 'STUP_TRAFIC' } },
      { label: 'Dégradations volontaires (pour 1 000 hab.)', x: '@PERIOD', pins: { MESURE: 'TAUX_MILLE', INFRACTION: 'DEGRADATIONS' } },
      { label: 'Faits par catégorie (nombre)', x: 'INFRACTION', pins: { MESURE: 'NOMBRE' } },
      { label: 'Faits par catégorie (pour 1 000 hab.)', x: 'INFRACTION', pins: { MESURE: 'TAUX_MILLE' } },
    ],
  },
  finances: {
    note: "Comptes individuels des communes (DGFiP) en euros par habitant. La « strate » est la moyenne des communes de même taille : elle sert de repère, pas d'objectif.",
    presets: [
      { label: 'Encours de la dette (€/hab.) et strate', x: '@PERIOD', series: 'MESURE', keep: { MESURE: ['DETTE_HAB', 'DETTE_HAB_STRATE'] } },
      { label: 'Charges de personnel (€/hab.) et strate', x: '@PERIOD', series: 'MESURE', keep: { MESURE: ['PERSONNEL_HAB', 'PERSONNEL_HAB_STRATE'] } },
      { label: "Dépenses d'équipement (€/hab.) et strate", x: '@PERIOD', series: 'MESURE', keep: { MESURE: ['EQUIPEMENT_HAB', 'EQUIPEMENT_HAB_STRATE'] } },
      { label: "Capacité d'autofinancement (€/hab.) et strate", x: '@PERIOD', series: 'MESURE', keep: { MESURE: ['CAF_HAB', 'CAF_HAB_STRATE'] } },
      { label: 'Produits et charges de fonctionnement (€/hab.)', x: '@PERIOD', series: 'MESURE', keep: { MESURE: ['PRODUITS_HAB', 'CHARGES_HAB'] } },
      { label: 'Impôts locaux (€/hab.) et strate', x: '@PERIOD', series: 'MESURE', keep: { MESURE: ['IMPOTS_LOCAUX_HAB', 'IMPOTS_LOCAUX_HAB_STRATE'] } },
      { label: 'Dette / produits de fonctionnement (%)', x: '@PERIOD', pins: { MESURE: 'DETTE_PCT_PRODUITS' } },
    ],
  },
  ft_defm: {
    note: "Demandeurs d'emploi inscrits à France Travail (catégories A, B, C) au 4ᵉ trimestre de chaque année, par commune. Chiffres bruts arrondis à 5 : de petits écarts sont normaux entre le total et la somme des détails.",
    presets: [
      { label: "Demandeurs d'emploi (évolution)", x: '@PERIOD', pins: { MESURE: 'DEFM_ABC', SEXE: '_T', AGE: '_T' } },
      { label: "Demandeurs d'emploi pour 1 000 habitants", x: '@PERIOD', mode: 'pop', pins: { MESURE: 'DEFM_ABC', SEXE: '_T', AGE: '_T' } },
      { label: "Indice base 100 (évolution depuis le début)", x: '@PERIOD', mode: 'idx', pins: { MESURE: 'DEFM_ABC', SEXE: '_T', AGE: '_T' } },
      { label: "Par tranche d'âge", x: 'AGE', keep: { AGE: ['Y_LT25', 'Y25T49', 'Y_GE50'] }, pins: { MESURE: 'DEFM_ABC', SEXE: '_T' } },
      { label: 'Par sexe', x: 'SEXE', keep: { SEXE: ['H', 'F'] }, pins: { MESURE: 'DEFM_ABC', AGE: '_T' } },
      { label: 'Part des femmes', x: '@PERIOD', pins: { MESURE: 'DEFM_ABC', AGE: '_T' }, ratio: ratio('SEXE', ['F'], ['_T'], 'Femmes / demandeurs d’emploi') },
      { label: 'Part des moins de 25 ans', x: '@PERIOD', pins: { MESURE: 'DEFM_ABC', SEXE: '_T' }, ratio: ratio('AGE', ['Y_LT25'], ['_T'], 'Moins de 25 ans / demandeurs d’emploi') },
      { label: 'Part des 50 ans et plus', x: '@PERIOD', pins: { MESURE: 'DEFM_ABC', SEXE: '_T' }, ratio: ratio('AGE', ['Y_GE50'], ['_T'], '50 ans et plus / demandeurs d’emploi') },
    ],
  },
  idfm_ferre: {
    note: "Validations du 1er trimestre 2026 aux stations ferrées de la commune (métro, RER, train, tramway), y compris les voyageurs qui ne résident pas dans la commune. Une commune sans station n'a pas de valeur.",
    presets: [
      { label: 'Validations du trimestre', x: '@GEO', pins: { MESURE: 'VALIDATIONS' } },
      { label: 'Validations pour 1 000 habitants', x: '@GEO', mode: 'pop', pins: { MESURE: 'VALIDATIONS' } },
      { label: 'Lieux d\'arrêt du réseau ferré', x: '@GEO', pins: { MESURE: 'NB_ARRETS' } },
    ],
  },
  icu: {
    note: "Aléa de chaleur : classes 1 (faible) à 3 (fort), -1 non évalué. Vulnérabilité : notes de 1 à 9. Surfaces en hectares, agrégées par commune.",
    presets: [
      { label: 'Surface par zone climatique locale', x: 'LCZ', pins: { MESURE: 'SURFACE_LCZ_HA', CLASSE: '_T' } },
      { label: 'Aléa de chaleur de jour (surfaces)', x: 'CLASSE', keep: { CLASSE: ['1', '2', '3'] }, pins: { MESURE: 'SURFACE_ALEA_JOUR_HA', LCZ: '_T' } },
      { label: 'Part de la surface en aléa fort de jour', x: '@GEO', pins: { MESURE: 'SURFACE_ALEA_JOUR_HA', LCZ: '_T' }, ratio: ratio('CLASSE', ['3'], ['1', '2', '3'], 'Surface en aléa fort / surface évaluée') },
      { label: 'Part de la surface en aléa fort de nuit', x: '@GEO', pins: { MESURE: 'SURFACE_ALEA_NUIT_HA', LCZ: '_T' }, ratio: ratio('CLASSE', ['3'], ['1', '2', '3'], 'Surface en aléa fort de nuit / surface évaluée') },
      { label: 'Part de la surface très vulnérable de jour (notes 7 à 9)', x: '@GEO', pins: { MESURE: 'SURFACE_VULNERABILITE_JOUR_HA', LCZ: '_T' }, ratio: ratio('CLASSE', ['7', '8', '9'], ['1', '2', '3', '4', '5', '6', '7', '8', '9'], 'Surface de vulnérabilité forte / surface évaluée') },
    ],
  },
};
