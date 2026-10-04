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

export function PriveBadge({ title }: { title?: string }) {
  return <span className="src src-prive" title={title || 'Données non publiques (accès habilité) : ne pas diffuser telles quelles'}>🔒 Non public</span>;
}

export function SourceBadge({ kind, title }: { kind: 'live' | 'import'; title?: string }) {
  return kind === 'live'
    ? <span className="src src-live" title={title || 'Lu en direct sur l’API de la source (aucun import)'}>⚡ Live</span>
    : <span className="src src-import" title={title || 'Données importées et stockées dans l’observatoire'}>⬇ Importé</span>;
}
