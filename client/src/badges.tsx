import type { Indicator } from './types';

// Pastilles communes : nature d'un indicateur (donnée directe ou calculée) et mode d'accès à la donnée (importée ou lue en direct).

export function NatureBadge({ i }: { i: Pick<Indicator, 'mode_calcul' | 'formule' | 'dataset_ids' | 'couche_id'> }) {
  const fed = i.dataset_ids.length > 0 || !!i.couche_id;
  if (!fed) return <span className="nat nat-none" title={`Aucune donnée rattachée${i.formule ? ` · formule : ${i.formule}` : ''}`}>Sans donnée</span>;
  if (i.mode_calcul === 'calcule') return <span className="nat nat-calc" title={i.formule ? `Formule : ${i.formule}` : 'Indicateur calculé (formule à documenter)'}>ƒx Calculé</span>;
  if (i.mode_calcul === 'direct') return <span className="nat nat-direct" title={i.formule ? `Lecture : ${i.formule}` : 'Valeur lue directement dans le jeu de données'}>● Donnée directe</span>;
  return <span className="nat nat-none" title="Nature non renseignée">Nature ?</span>;
}

export function PriveBadge({ title }: { title?: string }) {
  return <span className="src src-prive" title={title || 'Données non publiques (accès habilité) : ne pas diffuser telles quelles'}>🔒 Non public</span>;
}

export function SourceBadge({ kind, title }: { kind: 'live' | 'import'; title?: string }) {
  return kind === 'live'
    ? <span className="src src-live" title={title || 'Lu en direct sur l’API de la source (aucun import)'}>⚡ Live</span>
    : <span className="src src-import" title={title || 'Données importées et stockées dans l’observatoire'}>⬇ Importé</span>;
}
