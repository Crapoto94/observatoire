import type { Indicator } from './types';

// Pastilles communes : nature d'un indicateur (donnée directe ou calculée) et mode d'accès à la donnée (importée ou lue en direct).

export function NatureBadge({ i }: { i: Pick<Indicator, 'mode_calcul' | 'formule' | 'dataset_ids' | 'couche_id'> }) {
  const fed = i.dataset_ids.length > 0 || !!i.couche_id;
  if (!fed) return <span className="nat nat-none" title={`Aucune donnée rattachée${i.formule ? ` · formule : ${i.formule}` : ''}`}>Sans donnée</span>;
  if (i.mode_calcul === 'calcule') return <span className="nat nat-calc" title={i.formule ? `Formule : ${i.formule}` : 'Indicateur calculé (formule à documenter)'}>ƒx Calculé</span>;
  if (i.mode_calcul === 'direct') return <span className="nat nat-direct" title={i.formule ? `Lecture : ${i.formule}` : 'Valeur lue directement dans le jeu de données'}>● Donnée directe</span>;
  return <span className="nat nat-none" title="Nature non renseignée">Nature ?</span>;
}

export interface Multi {
  n: number; ecart: number; niveau: 'coherent' | 'ecart' | 'incoherent';
  sources: { id: string; label: string; value: number; period: string | null; dataset: string }[];
  comparaisons: { id: string; periode: string | null; a: number; b: number; ecart: number }[];
}
const fmtN = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 }).replace(/ /g, ' ');

// Indicateur calculable par plusieurs sources : pastille « multi » colorée selon l'écart entre elles
// (≤ 2 % cohérent, ≤ 20 % écart, au-delà incohérent), détail des sources en infobulle
export function MultiBadge({ m }: { m: Multi }) {
  const pct = `${fmtN(m.ecart * 100)} %`;
  const lib = m.niveau === 'coherent' ? 'sources cohérentes' : m.niveau === 'ecart' ? 'écart entre sources' : 'sources incohérentes';
  const detail = m.sources.map((s) => `• ${s.label} : ${fmtN(s.value)} (${s.period ?? '?'}, ${s.dataset})`).join('\n');
  const comp = m.comparaisons.map((c) => `comparaison ${c.periode ? `sur ${c.periode}` : 'sur les dernières valeurs (périodes différentes)'} : écart ${fmtN(c.ecart * 100)} %`).join('\n');
  return <span className={`multi multi-${m.niveau}`} title={`${m.n} sources (${lib}, écart maximal ${pct})\n${detail}\n${comp}`}>multi ×{m.n} · {pct}</span>;
}

// Besoin de données internes à la collectivité (SI des services, dossiers de subvention, relevés terrain…)
const INTERNE_RE = /donn[ée]e interne|SI de la collectivit|SI des services|dossiers? de subvention|SI de la Ville|logiciel des autorisations|relev[ée] terrain|CCAPEX/i;
export function besoinInterne(i: { origine: string | null; proposition: string | null; formule: string | null }): 'interne' | 'mixte' | null {
  if (i.origine === 'interne') return 'interne';
  if (i.origine === 'mixte') return 'mixte';
  return INTERNE_RE.test(`${i.proposition || ''} ${i.formule || ''}`) ? 'mixte' : null;
}
export function InterneBadge({ kind }: { kind: 'interne' | 'mixte' }) {
  return kind === 'interne'
    ? <span className="src src-interne" title="Donnée disponible uniquement dans les systèmes d’information de la collectivité : à collecter auprès des services">🏢 Besoin interne</span>
    : <span className="src src-interne-mixte" title="Source externe à compléter par des données internes de la collectivité (services, dossiers, relevés)">🏢 Complément interne</span>;
}

export function PriveBadge({ title }: { title?: string }) {
  return <span className="src src-prive" title={title || 'Données non publiques (accès habilité) : ne pas diffuser telles quelles'}>🔒 Non public</span>;
}

export function SourceBadge({ kind, title }: { kind: 'live' | 'import'; title?: string }) {
  return kind === 'live'
    ? <span className="src src-live" title={title || 'Lu en direct sur l’API de la source (aucun import)'}>⚡ Live</span>
    : <span className="src src-import" title={title || 'Données importées et stockées dans l’observatoire'}>⬇ Importé</span>;
}
