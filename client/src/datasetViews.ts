// Présentation par défaut de chaque jeu de données dans l'explorateur de la page Données.
// x       : '@PERIOD' (évolution dans le temps) ou le code d'une dimension (répartition)
// series  : dimension déclinée en séries (couleurs)
// pins    : valeur retenue pour chaque autre dimension (sinon '_T' = total, sinon la modalité la plus complète)
// measure : valeur de la dimension « mesure » à afficher (ex. TAUX_SRU)
// hier    : dimensions emboîtées (domaine > sous-domaine > type) : l'explorateur propose un niveau de détail
// keyfigures : ouvre d'abord la synthèse « chiffres clés » (une ligne par mesure)
// note    : avertissement de lecture affiché au-dessus du graphique
export interface View {
  x?: string;
  series?: string;
  pins?: Record<string, string>;
  measure?: string;
  hier?: string[];
  keyfigures?: boolean;
  note?: string;
}

const OVERLAP = 'Les modalités peuvent s\'emboîter (une catégorie peut en contenir d\'autres) : ne pas les additionner.';

export const VIEWS: Record<string, View> = {
  rp_serie_historique: { x: '@PERIOD', pins: { RP_MEASURE: 'POP', OCS: '_T' }, note: 'Les millésimes sont ceux des recensements (1968, 1975, 1982, 1990, 1999, 2007, 2012, 2017, 2023). Cette série fournit les populations utilisées pour le calcul « pour 1 000 habitants » de tous les territoires.' },
  pop_hist: { x: '@PERIOD', pins: { POPREF_MEASURE: 'PMUN' } },
  rp_pop_agesex: { x: 'AGE', series: 'SEX', note: 'Âge par année : la somme des barres donne la population totale (recensement).' },
  etat_civil_nais: { x: '@PERIOD' },
  etat_civil_deces: { x: '@PERIOD' },
  rp_menages_taille: { x: 'NOC', pins: { SEX: '_T', AGE: '_T' } },
  rp_menages_type: { x: 'TPH', pins: { RP_MEASURE: 'DWELLINGS', AGE: '_T' }, note: OVERLAP + ' Ex. « Ménage à une personne » contient « Homme seul » et « Femme seule » ; « Famille principale monoparentale » contient ses variantes homme / femme.' },
  rp_nationalite: { x: 'NATIONALITY_TYPE', pins: { SEX: '_T', AGE: '_T' } },
  rp_immigration: { x: 'IMMI', pins: { SEX: '_T', EMPSTA_ENQ: '_T', AGE: '_T' } },
  rp_migrations: { x: 'PREV_RES_AREA', pins: { AGE: 'Y_GE1' }, note: OVERLAP + ' Ex. « Dans une autre commune » (20_30) regroupe les modalités 21, 22, 23…' },
  rp_scolarisation: { x: 'AGE', pins: { SEX: '_T', STUD_AREA: '_T' } },
  rp_activite_chomage: { x: 'EMPSTA_ENQ', pins: { SEX: '_T', EDUC: '_T', AGE: 'Y15T64' }, note: OVERLAP + ' Ex. « Actif » = actif occupé + chômeur ; « Inactif » regroupe retraités, étudiants, au foyer… Taux de chômage = chômeurs / actifs.' },
  rp_csp: { x: 'PCS', pins: { SEX: '_T', AGE: 'Y_GE15' } },
  rp_emploi_lt: { x: '@PERIOD', pins: { SEX: '_T', EMPFORM: '_T', WKTIME: '_T', AGE: '_T' } },
  filosofi: { keyfigures: true, pins: { FILOSOFI_MEASURE: 'MED_SL' }, note: 'Les valeurs non diffusées (statut O : valeur manquante, secret statistique) sont affichées « n.d. ». Millésime 2023 : seuls le niveau de vie médian et le taux de pauvreté sont diffusés pour Ivry.' },
  side_stocks: { x: '@PERIOD', series: 'ACTIVITY', pins: { SIDE_MEASURE: 'UNIT_LOC' } },
  side_creations: { x: '@PERIOD', series: 'ACTIVITY', pins: { SIDE_MEASURE: 'UNIT_LOC_BURE', LEGAL_FORM: '_T' } },
  bpe: { x: '@HIER', hier: ['FACILITY_DOM', 'FACILITY_SDOM', 'FACILITY_TYPE'], note: 'Trois niveaux de classification emboîtés : choisissez le niveau de détail (domaine, sous-domaine, type d\'équipement) et, au besoin, restreignez à un domaine. Les niveaux ne s\'additionnent pas.' },
  rp_logement: { x: 'OCS', pins: { RP_MEASURE: 'DWELLINGS' } },
  rp_navettes: { x: 'TRANS', pins: { SEX: '_T', WORK_AREA: '_T', WORK_URBAN_AREA: '_T' } },
  sru: { x: '@PERIOD', pins: { MESURE: 'TAUX_SRU' }, note: 'Seuil légal : 25 % de logements sociaux (20 % pour certaines communes) ; le taux cible est fixé à la commune.' },
  loyers: { x: '@PERIOD', series: 'TYPE_BIEN', pins: { MESURE: 'LOYER_M2' }, note: 'Loyers d\'annonce (charges comprises) prédits par modèle statistique, pas des loyers constatés.' },
  dvf: { x: '@PERIOD', series: 'TYPE_LOCAL', pins: { MESURE: 'PRIX_M2_MEDIAN' }, note: 'Calculé à l\'import à partir des mutations à titre onéreux d\'un seul logement ; la dernière année est partielle.' },
  artificialisation: { x: '@PERIOD', pins: { MESURE: 'PART_ARTIF' }, note: 'La part artificialisée des départements et des régions est illisible dans le fichier source (des dates apparaissent à la place des pourcentages) : pour ces niveaux, seules les surfaces sont disponibles (choisir la mesure « Surface artificialisée »).' },
  mos: { x: 'POSTE', pins: { MESURE: 'SURFACE_HA' } },
  multiexposition: { keyfigures: true },
  education_annuaire: { x: 'TYPE', series: 'STATUT', pins: { MESURE: 'NB_ETABLISSEMENTS' } },
  education_effectifs: { x: '@PERIOD', series: 'SECTEUR', pins: { MESURE: 'ELEVES' } },
  caf_rsa: { x: '@PERIOD', series: 'TYPE_RSA', pins: { MESURE: 'FOYERS_RSA' } },
  baac: { x: '@PERIOD', pins: { LUMINOSITE: '_T', AGGLOMERATION: '_T' } },
  entreprises: { keyfigures: true, note: 'Stock à la date de l\'import : réimportez régulièrement pour suivre l\'évolution.' },
};
