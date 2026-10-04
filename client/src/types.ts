export type Niveau = 'contexte' | 'suivi' | 'evaluation' | 'prospective';

export const NIVEAUX: { key: Niveau; label: string }[] = [
  { key: 'contexte', label: 'Contexte' },
  { key: 'suivi', label: 'Suivi' },
  { key: 'evaluation', label: 'Évaluation' },
  { key: 'prospective', label: 'Prospective' },
];

export const NIVEAU_FILL: Record<Niveau, string> = {
  contexte: '#d6e8d4',
  suivi: '#ffe6cc',
  evaluation: '#e0d6e8',
  prospective: '#fff2cc',
};

// Couleurs de priorité de la carte mentale (P1 en gras)
export const PRIO_COLOR: Record<number, string> = { 1: '#cc0000', 2: '#ff6666', 3: '#66b2ff', 4: '#0066cc' };
export const PRIO_TEXT: Record<number, string> = { 1: '#cc0000', 2: '#e04848', 3: '#2f8ae0', 4: '#0066cc' }; // variante lisible sur fond clair

export interface Indicator {
  id: number;
  theme: string;
  theme_label: string | null;
  groupe: string | null;
  groupe_label: string | null;
  excel_sheet: string | null;
  excel_row: number | null;
  sous_ligne: number | null;
  ordre: number | null;
  niveau: Niveau;
  libelle: string;
  libelle_carte: string | null;
  priorite: number | null;
  source: string | null;
  lien_origine: string | null;
  lien_corrige: string | null;
  periodicite: string | null;
  proposition: string | null;
  lien_donnees: string | null;
  notes: string | null;
  definition: string | null;
  formule: string | null;
  unite: string | null;
  perimetre: string | null;
  porteur: string | null;
  cible: string | null;
  statut: Statut | null;
  decision: string | null;
  faisabilite: number | null;
  parent_id: number | null;
  origine: Origine | null;
  cartographie: Carto | null;
  mode_calcul: 'direct' | 'calcule' | null; // donnée lue telle quelle ou calculée (formule)
  couche_id: string | null; // couche géographique lue en direct (géoportail du Val-de-Marne)
  dataset_ids: string[];
  kpi_ids?: string[]; // KPI du tableau de bord correspondants
}

export type Origine = 'externe' | 'interne' | 'mixte';
export type Carto = 'oui' | 'possible' | 'non';
export const ORIGINES: { key: Origine; label: string; hint: string; color: string }[] = [
  { key: 'externe', label: 'Externe', hint: 'Produit hors de la collectivité (INSEE, État, opérateurs…)', color: '#2563eb' },
  { key: 'interne', label: 'Interne', hint: 'Uniquement disponible dans les SI de la collectivité', color: '#c2410c' },
  { key: 'mixte', label: 'Mixte', hint: 'Source externe à compléter par les SI de la collectivité', color: '#7c3aed' },
];
export const CARTOS: { key: Carto; label: string; hint: string; color: string }[] = [
  { key: 'oui', label: 'Cartographiable', hint: 'Donnée géolocalisée ou à maille fine : consultable sur une carte', color: '#15803d' },
  { key: 'possible', label: 'Possible', hint: 'Agrégeable à une maille infra-communale (IRIS, quartier) avec un travail de préparation', color: '#b45309' },
  { key: 'non', label: 'Non', hint: 'Indicateur communal ou global, sans représentation cartographique', color: '#6b7280' },
];

export type Statut = 'brouillon' | 'valide' | 'abandonne';
export const STATUTS: { key: Statut; label: string; color: string }[] = [
  { key: 'brouillon', label: 'Brouillon', color: '#9ca3af' },
  { key: 'valide', label: 'Validé', color: '#2e9d4f' },
  { key: 'abandonne', label: 'Abandonné', color: '#b91c1c' },
];
export const FAISABILITES: { key: number; label: string; short: string }[] = [
  { key: 1, label: 'Facile : données importables', short: 'Facile' },
  { key: 2, label: 'Moyenne : source identifiée, import à développer', short: 'Moyenne' },
  { key: 3, label: 'Difficile : source à définir ou à produire', short: 'Difficile' },
];

export interface HistoryEntry { id: number; at: string; field: string; old_value: string | null; new_value: string | null }
export interface CarteVersion { id: number; label: string; created_at: string }

export interface Dataset {
  id: string;
  label: string;
  provider: string;
  description: string | null;
  themes: string[];
  doc_url: string | null;
  last_import: string | null;
  nb_rows: number;
  status: string | null;
  nb_indicateurs: number;
  geo_counts: Record<string, number>;
  indicator_ids: number[];
  map_capable?: boolean; // le jeu peut fournir des données communales
  map_communes?: number; // communes d'Île-de-France disposant de données
}

export interface Geo {
  code: string;
  nom: string;
  dept: string | null;
  population: number | null;
  fixed: number;
  level: 'COM' | 'DEP' | 'EPCI' | 'REG' | 'EPT';
  pop_series?: Record<string, number>; // population par millésime du recensement
  bulk?: number; // 1 = commune d'Île-de-France chargée en masse pour la carte
}

export const LEVEL_LABEL: Record<string, string> = { COM: 'commune', DEP: 'département', EPCI: 'intercommunalité', REG: 'région', EPT: 'EPT' };

export interface DataRow {
  geo: string;
  period: string | null;
  dims: Record<string, string>;
  measure: string;
  value: number | null;
  status?: string | null;
}

export interface DatasetData {
  id: string;
  label: string;
  description: string | null;
  doc_url: string | null;
  last_import: string | null;
  nb_rows: number;
  labels: Record<string, { label: string; values: Record<string, string> }>;
  rows: DataRow[];
}

export interface Job {
  id: number;
  status: string;
  total: number;
  done: number;
  errors: number;
  log: string[];
  scope?: string;
  current?: { id: string; label: string; done: number; total: number; attempt: number; method: string } | null;
  deferred?: string[];
}

export interface CoucheStat { id: string; label: string; unit: string | null; formule: string }
export interface Couche {
  id: string; label: string; theme: string; kind: 'point' | 'line' | 'polygon'; color: string; choropleth: string | null; choroLabel: string | null; unit: string | null;
  source: string; layer: string; doc_url: string | null; live: true; stats: CoucheStat[];
}
