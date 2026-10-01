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
};
