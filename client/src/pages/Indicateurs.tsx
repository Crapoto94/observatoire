import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDate } from '../api';
import { NatureBadge, SourceBadge } from '../badges';
import { CARTOS, Carto, Couche, Dataset, FAISABILITES, HistoryEntry, Indicator, NIVEAUX, NIVEAU_FILL, Niveau, ORIGINES, Origine, STATUTS, Statut } from '../types';

type SortKey = 'theme' | 'niveau' | 'libelle' | 'priorite' | 'source';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isUrl = (s?: string | null) => !!s && /^https?:\/\//i.test(s);

function LinkCell({ url }: { url?: string | null }) {
  if (!url) return <span className="muted">—</span>;
  if (!isUrl(url)) return <span title={url}>{url}</span>;
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* garde l'URL brute */ }
  return <a href={url} target="_blank" rel="noreferrer" title={url}>{host} ↗</a>;
}

function PrioPill({ p }: { p: number | null }) {
  return p ? <span className={`prio prio-${p}`}>P{p}</span> : <span className="muted">—</span>;
}

function OrigineChip({ o }: { o: Origine | null }) {
  const x = ORIGINES.find((v) => v.key === o);
  return x ? <span className="chip" style={{ background: x.color, color: '#fff' }} title={x.hint}>{x.label}</span> : <span className="muted">—</span>;
}

function CartoChip({ c }: { c: Carto | null }) {
  const x = CARTOS.find((v) => v.key === c);
  if (!x) return <span className="muted">—</span>;
  return <span className="chip" style={{ background: c === 'non' ? 'transparent' : x.color, color: c === 'non' ? x.color : '#fff', border: `1px solid ${x.color}` }} title={x.hint}>{c === 'non' ? '—' : '🗺'} {x.label}</span>;
}

export function StatutPill({ s }: { s: Statut | null }) {
  const st = STATUTS.find((x) => x.key === (s || 'brouillon'))!;
  return <span className="chip" style={{ background: st.color, color: '#fff' }}>{st.label}</span>;
}

interface KpiVal { id: string; label: string; unit: string; value: number | null; period: string | null; prev: { period: string; value: number } | null; dep: { value: number } | null; dataset: string }
const fmtVal = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2 }).replace(/\u202f/g, '\u00a0');

// Valeur d'Ivry : KPI calculé correspondant à la fiche (lien vers le tableau de bord), sinon couche en direct, sinon raison de l'absence
function ValeurCell({ i, kpis }: { i: Indicator; kpis: Map<string, KpiVal> | null }) {
  if (kpis === null && i.kpi_ids?.length) return <span className="muted small">…</span>;
  const k = i.kpi_ids?.map((id) => kpis?.get(id)).find((x) => x && x.value != null);
  if (k) {
    return (
      <Link className="val-link" to={`/tableau-de-bord?kpi=${k.id}`} title={`${k.label}${k.dep ? ` · Val-de-Marne : ${fmtVal(k.dep.value)}${k.unit ? ' ' + k.unit : ''}` : ''} · voir l’indicateur calculé`}>
        <strong>{fmtVal(k.value!)}</strong>{k.unit && <span className="muted"> {k.unit}</span>}
        <div className="muted small">{k.period}{(i.kpi_ids?.length ?? 0) > 1 ? ` · ${i.kpi_ids!.length} calculs` : ''} ↗</div>
        {/^[ée]volution/i.test(i.libelle) && k.prev && <Evolution k={k} />}
      </Link>
    );
  }
  if (i.couche_id) return <Link className="val-link small" to={`/couches?couche=${i.couche_id}`} title="Valeur calculée en direct sur la carte des couches du Val-de-Marne">⚡ en direct ↗</Link>;
  const why = i.dataset_ids.length
    ? (i.niveau === 'prospective' || i.niveau === 'evaluation' ? 'Projection ou analyse : pas de valeur automatique (formule documentée dans la fiche)' : 'Données rattachées, calcul automatique pas encore défini')
    : 'Aucune donnée rattachée';
  return <span className="muted small" title={why}>—</span>;
}

// fiches « évolution… » : variation par rapport à la valeur précédente (en points pour un pourcentage, en % sinon)
function Evolution({ k }: { k: KpiVal }) {
  const d = k.value! - k.prev!.value;
  const pts = k.unit === '%';
  const txt = pts ? `${d >= 0 ? '+' : ''}${fmtVal(d)} pt` : k.prev!.value ? `${d >= 0 ? '+' : ''}${fmtVal((d / Math.abs(k.prev!.value)) * 100)} %` : '';
  return <div className={`small ${d > 0 ? 'evo-up' : d < 0 ? 'evo-down' : ''}`} title={`Précédent : ${fmtVal(k.prev!.value)} (${k.prev!.period})`}>{d > 0 ? '▲' : d < 0 ? '▼' : '►'} {txt} vs {k.prev!.period}</div>;
}

export default function Indicateurs() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Indicator[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetsReady, setDatasetsReady] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState(params.get('theme') ?? '');
  const [groupe, setGroupe] = useState('');
  const [niveau, setNiveau] = useState(params.get('niveau') ?? '');
  const [prio, setPrio] = useState(params.get('prio') ?? '');
  const [flag, setFlag] = useState(params.get('flag') ?? '');
  const [statut, setStatut] = useState(params.get('statut') ?? '');
  const [faisa, setFaisa] = useState(params.get('faisa') ?? '');
  const [origine, setOrigine] = useState(params.get('origine') ?? '');
  const [carto, setCarto] = useState(params.get('carto') ?? '');
  const [nature, setNature] = useState(params.get('nature') ?? '');
  const [acces, setAcces] = useState(params.get('acces') ?? '');
  const [couches, setCouches] = useState<Couche[]>([]);
  const [kpis, setKpis] = useState<Map<string, KpiVal> | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [editing, setEditing] = useState<Partial<Indicator> | null>(null);

  const load = () => {
    // La liste est prioritaire : ne pas la bloquer sur le chargement du catalogue de jeux.
    api<Indicator[]>('/indicators').then(setItems).catch((e) => setError(e.message));
    setDatasetsReady(false);
    api<{ kpis: KpiVal[] }>('/kpi', { timeoutMs: 60000 }).then((r) => setKpis(new Map(r.kpis.map((k) => [k.id, k])))).catch(() => setKpis(new Map()));
    api<{ couches: Couche[] }>('/couches').then((r) => setCouches(r.couches)).catch(() => setCouches([]));
    api<Dataset[]>('/datasets').then(setDatasets).catch((e) => setError((current) => current || e.message)).finally(() => setDatasetsReady(true));
  };
  useEffect(() => { load(); }, []);

  // ouverture directe d'une fiche (?edit=ID) depuis la carte ou le pilotage
  const editId = params.get('edit');
  useEffect(() => {
    if (editId && items.length) {
      const it = items.find((i) => i.id === Number(editId));
      if (it) setEditing(it);
    }
  }, [editId, items]);

  const themes = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((i) => m.set(i.theme, i.theme_label || i.theme));
    return [...m.entries()];
  }, [items]);
  const groupes = useMemo(() => {
    const m = new Map<string, string>();
    items.filter((i) => !theme || i.theme === theme).forEach((i) => i.groupe && m.set(i.groupe, i.groupe_label || i.groupe));
    return [...m.entries()];
  }, [items, theme]);

  const rows = useMemo(() => {
    const nq = norm(q.trim());
    let r = items.filter((i) => {
      if (theme && i.theme !== theme) return false;
      if (groupe && i.groupe !== groupe) return false;
      if (niveau && i.niveau !== niveau) return false;
      if (prio === 'none' ? i.priorite : prio && i.priorite !== Number(prio)) return false;
      if (statut && (i.statut || 'brouillon') !== statut) return false;
      if (faisa === 'none' ? i.faisabilite : faisa && i.faisabilite !== Number(faisa)) return false;
      if (origine && i.origine !== origine) return false;
      if (carto === 'carte' ? i.cartographie !== 'oui' && i.cartographie !== 'possible' : carto && i.cartographie !== carto) return false;
      const fed = i.dataset_ids.length > 0 || !!i.couche_id;
      if (nature === 'direct' && (!fed || i.mode_calcul !== 'direct')) return false;
      if (nature === 'calcule' && (!fed || i.mode_calcul !== 'calcule')) return false;
      if (nature === 'sans-donnee' && fed) return false;
      if (nature === 'sans-formule' && i.formule) return false;
      if (acces === 'live' && !i.couche_id) return false;
      if (acces === 'import' && !i.dataset_ids.length) return false;
      if (flag === 'sans-source' && i.source) return false;
      if (flag === 'lien-corrige' && !i.lien_corrige) return false;
      if (flag === 'avec-jeu' && !i.dataset_ids.length) return false;
      if (flag === 'sans-jeu' && i.dataset_ids.length) return false;
      if (flag === 'incoherence' && !i.notes) return false;
      if (flag === 'sans-definition' && i.definition) return false;
      if (flag === 'sans-parent' && (i.niveau === 'contexte' || i.parent_id)) return false;
      if (nq) {
        const hay = norm([i.libelle, i.libelle_carte, i.source, i.proposition, i.notes, i.periodicite, i.theme_label, i.groupe_label,
          i.definition, i.formule, i.porteur, i.decision].join(' '));
        if (!nq.split(/\s+/).every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    if (sort) {
      const { key, dir } = sort;
      const val = (i: Indicator) => (key === 'priorite' ? i.priorite ?? 99 : String(i[key] ?? ''));
      r = [...r].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0));
    }
    return r;
  }, [items, q, theme, groupe, niveau, prio, flag, statut, faisa, origine, carto, nature, acces, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const arrow = (key: SortKey) => (sort?.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const dsLabel = (id: string) => datasets.find((d) => d.id === id)?.label || id;
  const coucheLabel = (id: string) => couches.find((c) => c.id === id)?.label || id;

  const exportCsv = () => {
    const cols: (keyof Indicator)[] = ['theme_label', 'groupe_label', 'niveau', 'libelle', 'priorite', 'statut', 'definition', 'mode_calcul', 'formule', 'unite', 'perimetre',
      'porteur', 'cible', 'decision', 'faisabilite', 'origine', 'cartographie', 'source', 'lien_origine', 'lien_corrige', 'periodicite', 'proposition', 'lien_donnees', 'couche_id', 'notes'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'indicateurs.csv';
    a.click();
  };

  const closeEditor = () => {
    setEditing(null);
    if (params.get('edit')) { params.delete('edit'); setParams(params, { replace: true }); }
  };

  return (
    <section className="page">
      <div className="page-head">
        <h1>Conception des indicateurs</h1>
        <div className="actions">
          <button onClick={() => setEditing({ niveau: 'contexte', theme: theme || themes[0]?.[0], groupe: groupe || undefined, statut: 'brouillon', dataset_ids: [] })}>+ Ajouter</button>
          <a className="btn secondary" href="/api/export.xlsx" download>Exporter Excel</a>
          <button className="secondary" onClick={exportCsv}>Exporter CSV</button>
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Rechercher (indicateur, définition, source, proposition…)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={theme} onChange={(e) => { setTheme(e.target.value); setGroupe(''); }}>
          <option value="">Tous les thèmes</option>
          {themes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={groupe} onChange={(e) => setGroupe(e.target.value)}>
          <option value="">Toutes les rubriques</option>
          {groupes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={niveau} onChange={(e) => setNiveau(e.target.value)}>
          <option value="">Tous les niveaux</option>
          {NIVEAUX.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
        </select>
        <select value={prio} onChange={(e) => setPrio(e.target.value)}>
          <option value="">Toutes priorités</option>
          {[1, 2, 3, 4].map((p) => <option key={p} value={p}>Priorité {p}</option>)}
          <option value="none">Sans priorité</option>
        </select>
        <select value={origine} onChange={(e) => setOrigine(e.target.value)} title="Origine de la donnée">
          <option value="">Toute origine</option>
          {ORIGINES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <select value={carto} onChange={(e) => setCarto(e.target.value)} title="Consultable sur une carte">
          <option value="">Carto : tous</option>
          <option value="carte">Consultables sur une carte (oui + possible)</option>
          {CARTOS.map((c) => <option key={c.key} value={c.key}>{c.key === 'oui' ? 'Cartographiables' : c.key === 'possible' ? 'Cartographie possible' : 'Non cartographiables'}</option>)}
        </select>
        <select value={nature} onChange={(e) => setNature(e.target.value)} title="Donnée directe ou calculée">
          <option value="">Toute nature</option>
          <option value="direct">Donnée directe</option>
          <option value="calcule">Calculé (formule)</option>
          <option value="sans-donnee">Sans donnée</option>
          <option value="sans-formule">Formule non documentée</option>
        </select>
        <select value={acces} onChange={(e) => setAcces(e.target.value)} title="Données importées ou lues en direct">
          <option value="">Tout accès</option>
          <option value="import">Données importées</option>
          <option value="live">Données en direct (live)</option>
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="">Tous statuts</option>
          {STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={faisa} onChange={(e) => setFaisa(e.target.value)}>
          <option value="">Toute faisabilité</option>
          {FAISABILITES.map((f) => <option key={f.key} value={f.key}>{f.short}</option>)}
          <option value="none">Non évaluée</option>
        </select>
        <select value={flag} onChange={(e) => setFlag(e.target.value)}>
          <option value="">Tous les états</option>
          <option value="sans-source">Sans source</option>
          <option value="lien-corrige">Avec lien corrigé</option>
          <option value="avec-jeu">Données importables</option>
          <option value="sans-jeu">Sans jeu de données</option>
          <option value="sans-definition">Sans définition</option>
          <option value="sans-parent">Suivi / évaluation sans indicateur de contexte</option>
          <option value="incoherence">Avec remarque / incohérence</option>
        </select>
        <span className="count">{rows.length} / {items.length}</span>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="table-wrap">
        <table className="grid ind-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('theme')} className="sortable">Thème{arrow('theme')}<span className="th-sub"> · niveau</span></th>
              <th onClick={() => toggleSort('libelle')} className="sortable">Indicateur{arrow('libelle')}</th>
              <th title="Dernière valeur calculée pour Ivry-sur-Seine ; cliquer pour ouvrir l’indicateur calculé">Valeur<span className="th-sub"> · Ivry</span></th>
              <th onClick={() => toggleSort('priorite')} className="sortable">Suivi{arrow('priorite')}<span className="th-sub"> · prio, statut, faisabilité</span></th>
              <th>Nature<span className="th-sub"> · calcul, accès, origine, carto</span></th>
              <th onClick={() => toggleSort('source')} className="sortable">Source{arrow('source')}<span className="th-sub"> · périodicité</span></th>
              <th>Liens</th>
              <th>Proposition</th>
              <th>Jeux, KPI</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className={i.notes ? 'flagged' : ''}>
                <td className="c-theme">
                  <div>{i.theme_label}</div>
                  <div className="muted small">{i.groupe_label !== i.theme_label ? i.groupe_label : ''}</div>
                  <span className="chip" style={{ background: NIVEAU_FILL[i.niveau] }}>{NIVEAUX.find((n) => n.key === i.niveau)?.label}</span>
                </td>
                <td className="lib">
                  <button className="indicator-open" onClick={() => setEditing(i)} title="Ouvrir la fiche de l’indicateur">
                    {i.libelle}
                  </button>
                  {i.libelle_carte && i.libelle_carte.toLowerCase() !== i.libelle.toLowerCase() && <div className="muted small">Carte : {i.libelle_carte}</div>}
                  {i.definition && <div className="small muted clamp2" title={i.definition}>{i.definition}</div>}
                  {i.formule && i.mode_calcul === 'calcule' && <div className="formule-line clamp2" title={i.formule}>ƒx {i.formule}</div>}
                  {i.notes && <div className="note small">⚠ {i.notes}</div>}
                </td>
                <td className="c-val"><ValeurCell i={i} kpis={kpis} /></td>
                <td className="c-stack">
                  <PrioPill p={i.priorite} />
                  <StatutPill s={i.statut} />
                  {i.faisabilite ? <span className={`faisa faisa-${i.faisabilite}`}>{FAISABILITES.find((f) => f.key === i.faisabilite)?.short}</span> : null}
                </td>
                <td className="c-stack">
                  <NatureBadge i={i} />
                  {i.dataset_ids.length > 0 && <SourceBadge kind="import" title={`Données importées : ${i.dataset_ids.map(dsLabel).join(', ')}`} />}
                  {i.couche_id && <SourceBadge kind="live" title={`Lu en direct : ${coucheLabel(i.couche_id)} (géoportail du Val-de-Marne)`} />}
                  <OrigineChip o={i.origine} /><CartoChip c={i.cartographie} />
                </td>
                <td className="clamp" title={i.source || ''}>
                  <div className="clamp2">{i.source || <span className="muted">—</span>}</div>
                  {i.periodicite && <div className="muted small">{i.periodicite}</div>}
                </td>
                <td className="c-links small">
                  {i.lien_origine && <div><span className="muted">origine </span><LinkCell url={i.lien_origine} /></div>}
                  {i.lien_corrige && <div><span className="muted">corrigé </span><LinkCell url={i.lien_corrige} /></div>}
                  {i.lien_donnees && <div><span className="muted">données </span><LinkCell url={i.lien_donnees} /></div>}
                  {!i.lien_origine && !i.lien_corrige && !i.lien_donnees && <span className="muted">—</span>}
                </td>
                <td className="prop" title={i.proposition || ''}>{i.proposition ? <div className="clamp3">{i.proposition}</div> : <span className="muted">—</span>}</td>
                <td className="c-chips">
                  {i.dataset_ids.map((d) => (
                    <Link key={d} className="chip ds" to={`/donnees?ds=${d}`} title="Voir les données">{dsLabel(d)}</Link>
                  ))}
                  {i.couche_id && <Link className="chip ds live" to={`/couches?couche=${i.couche_id}`} title="Voir la couche (lecture en direct)">⚡ {coucheLabel(i.couche_id)}</Link>}
                  {i.kpi_ids?.map((k) => <Link key={k} className="chip ds" to={`/tableau-de-bord?kpi=${k}`} title="Voir ce KPI dans le tableau de bord">KPI ▸ {k}</Link>)}
                  {!i.dataset_ids.length && !i.kpi_ids?.length && !i.couche_id && <span className="muted">—</span>}
                </td>
                <td><button className="icon" title="Modifier" onClick={() => setEditing(i)}>✎</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="empty">Aucun indicateur ne correspond aux filtres.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Editor
          value={editing}
          datasets={datasets}
          couches={couches}
          datasetsReady={datasetsReady}
          themes={themes}
          items={items}
          onClose={closeEditor}
          onSaved={() => { closeEditor(); load(); }}
        />
      )}
    </section>
  );
}

const FIELD_LABELS: Record<string, string> = {
  libelle: 'Indicateur', libelle_carte: 'Libellé carte', priorite: 'Priorité', source: 'Source', lien_origine: "Lien d'origine",
  lien_corrige: 'Lien corrigé', periodicite: 'Périodicité', proposition: 'Proposition', lien_donnees: 'Lien données', notes: 'Remarques',
  definition: 'Définition', formule: 'Formule', unite: 'Unité', perimetre: 'Périmètre', porteur: 'Porteur', cible: 'Cible',
  statut: 'Statut', decision: 'Décision', faisabilite: 'Faisabilité', parent_id: 'Indicateur parent', niveau: 'Niveau',
  origine: 'Origine', cartographie: 'Cartographie', mode_calcul: 'Nature du calcul', couche_id: 'Couche en direct',
  theme: 'Thème', groupe: 'Rubrique',
};

function Editor({ value, datasets, couches, datasetsReady, themes, items, onClose, onSaved }: {
  value: Partial<Indicator>;
  datasets: Dataset[];
  couches: Couche[];
  datasetsReady: boolean;
  themes: [string, string][];
  items: Indicator[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Indicator>>({ ...value, dataset_ids: value.dataset_ids ?? [] });
  const [applyRow, setApplyRow] = useState(false);
  const [dsFilter, setDsFilter] = useState('');
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tab, setTab] = useState<'fiche' | 'sources' | 'validation' | 'historique'>('fiche');
  const isNew = !value.id;
  const set = <K extends keyof Indicator>(k: K, v: Indicator[K] | null) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { if (value.id) api<HistoryEntry[]>(`/indicators/${value.id}/history`).then(setHistory).catch(() => setHistory([])); }, [value.id]);

  const groupsOfTheme = useMemo(() => {
    const m = new Map<string, string>();
    items.filter((i) => i.theme === f.theme).forEach((i) => i.groupe && m.set(i.groupe, i.groupe_label || i.groupe));
    return [...m.entries()];
  }, [items, f.theme]);
  const parents = useMemo(
    () => items.filter((i) => i.groupe === f.groupe && i.niveau === 'contexte' && i.id !== value.id),
    [items, f.groupe, value.id]
  );

  const save = async () => {
    try {
      if (!f.libelle?.trim()) throw new Error('Le libellé est obligatoire');
      const ref = items.find((i) => i.theme === f.theme && i.groupe === f.groupe);
      const body = {
        ...f,
        theme_label: f.theme_label ?? ref?.theme_label ?? themes.find(([k]) => k === f.theme)?.[1],
        groupe_label: f.groupe_label ?? ref?.groupe_label,
        apply_to_row: applyRow,
      };
      if (isNew) {
        const maxOrdre = Math.max(0, ...items.filter((i) => i.groupe === f.groupe).map((i) => i.ordre ?? 0));
        await api('/indicators', { body: { ...body, ordre: maxOrdre + 1, sous_ligne: 0 } });
      } else {
        await api(`/indicators/${value.id}`, { method: 'PUT', body });
      }
      onSaved();
    } catch (e) { setErr((e as Error).message); }
  };
  const remove = async () => {
    if (!confirm('Supprimer cet indicateur ?')) return;
    await api(`/indicators/${value.id}`, { method: 'DELETE' });
    onSaved();
  };
  const toggleDs = (id: string) =>
    set('dataset_ids', f.dataset_ids!.includes(id) ? f.dataset_ids!.filter((x) => x !== id) : [...f.dataset_ids!, id]);
  const text = (k: keyof Indicator, label: string, area = false, ph?: string) => (
    <label className="field">
      <span>{label}</span>
      {area
        ? <textarea rows={3} placeholder={ph} value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as never)} />
        : <input placeholder={ph} value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as never)} />}
    </label>
  );
  const histValue = (field: string, v: string | null) => {
    if (v == null) return '∅';
    if (field === 'parent_id') return items.find((i) => i.id === Number(v))?.libelle ?? `#${v}`;
    if (field === 'statut') return STATUTS.find((s) => s.key === v)?.label ?? v;
    if (field === 'faisabilite') return FAISABILITES.find((x) => x.key === Number(v))?.short ?? v;
    return v;
  };

  return (
    <div className="modal-back indicator-editor-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal indicator-editor" role="dialog" aria-modal="true" aria-labelledby="indicator-editor-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="indicator-editor-head">
          <div><span className="eyebrow">Fiche indicateur {isNew ? '· création' : `· #${value.id}`}</span>
            <h2 id="indicator-editor-title">{isNew ? 'Nouvel indicateur' : 'Modifier l’indicateur'}</h2>
            <p className="muted small">Définition, source, rattachements et validation</p></div>
          <button className="icon indicator-editor-close" aria-label="Fermer" onClick={onClose}>×</button>
        </div>
        <div className="tabs indicator-editor-tabs">
          {([['fiche', 'Fiche'], ['sources', 'Sources et données'], ['validation', 'Validation et faisabilité'], ['historique', `Historique (${history.length})`]] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} disabled={k === 'historique' && isNew}>{l}</button>
          ))}
        </div>

        {tab === 'fiche' && (
          <>
            <div className="grid2">
              <label className="field"><span>Thème</span>
                <select value={f.theme ?? ''} onChange={(e) => setF((p) => ({ ...p, theme: e.target.value, groupe: undefined, parent_id: null }))}>
                  {themes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="field"><span>Rubrique</span>
                <select value={f.groupe ?? ''} onChange={(e) => setF((p) => ({ ...p, groupe: e.target.value, parent_id: null }))}>
                  <option value="">—</option>
                  {groupsOfTheme.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="field"><span>Niveau</span>
                <select value={f.niveau} onChange={(e) => set('niveau', e.target.value as Niveau)}>
                  {NIVEAUX.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
                </select>
              </label>
              <label className="field"><span>Priorité</span>
                <select value={f.priorite ?? ''} onChange={(e) => set('priorite', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Non définie</option>
                  {[1, 2, 3, 4].map((p) => <option key={p} value={p}>Priorité {p}</option>)}
                </select>
              </label>
            </div>
            {text('libelle', 'Indicateur')}
            {text('libelle_carte', 'Libellé sur la carte mentale (si différent)')}
            {text('definition', 'Définition', true, 'Que mesure l\'indicateur, pourquoi, avec quelle lecture ?')}
            <label className="field"><span>Nature de l’indicateur</span>
              <select value={f.mode_calcul ?? ''} onChange={(e) => set('mode_calcul', (e.target.value || null) as Indicator['mode_calcul'])}>
                <option value="">Non renseignée</option>
                <option value="direct">Donnée directe : valeur lue telle quelle dans le jeu de données</option>
                <option value="calcule">Calculé : ratio, différence, projection ou agrégat (formule obligatoire)</option>
              </select>
            </label>
            {f.mode_calcul === 'calcule' && !f.formule?.trim() && <div className="note small">⚠ Indicateur calculé : documentez la formule de calcul.</div>}
            {text('formule', f.mode_calcul === 'direct' ? 'Mesure lue (jeu, dimension)' : 'Formule de calcul', true, 'ex. foyers RSA (caf_rsa FOYERS_RSA) / ménages × 100')}
            <div className="grid2">
              {text('unite', 'Unité', false, 'ex. %, habitants, €/m², jours')}
              {text('perimetre', 'Niveau géographique', false, 'ex. commune, IRIS, quartier prioritaire')}
              {text('porteur', 'Porteur (service)', false, 'ex. Direction de l\'urbanisme')}
            </div>
            {text('cible', 'Cible ou seuil d\'alerte', false, 'ex. 25 % de logements sociaux (loi SRU)')}
            <div className="grid2">
              <label className="field"><span>Origine de la donnée</span>
                <select value={f.origine ?? ''} onChange={(e) => set('origine', (e.target.value || null) as Origine | null)}>
                  <option value="">Non renseignée</option>
                  {ORIGINES.map((o) => <option key={o.key} value={o.key}>{o.label} : {o.hint}</option>)}
                </select>
              </label>
              <label className="field"><span>Consultable sur une carte</span>
                <select value={f.cartographie ?? ''} onChange={(e) => set('cartographie', (e.target.value || null) as Carto | null)}>
                  <option value="">Non renseigné</option>
                  {CARTOS.map((c) => <option key={c.key} value={c.key}>{c.label} : {c.hint}</option>)}
                </select>
              </label>
            </div>
            <label className="field"><span>Indicateur de contexte associé</span>
              <select value={f.parent_id ?? ''} onChange={(e) => set('parent_id', e.target.value ? Number(e.target.value) : null)} disabled={f.niveau === 'contexte'}>
                <option value="">{f.niveau === 'contexte' ? '— (indicateur de contexte)' : '— aucun —'}</option>
                {parents.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
              </select>
            </label>
          </>
        )}

        {tab === 'sources' && (
          <>
            {text('source', 'Source des données')}
            <div className="grid2">
              {text('lien_origine', 'Lien d\'origine (classeur)')}
              {text('lien_corrige', 'Lien corrigé')}
              {text('periodicite', 'Périodicité / date de mise à jour')}
              {text('lien_donnees', 'Lien vers les données')}
            </div>
            {text('proposition', 'Proposition', true)}
            <div className="field">
              <span>Jeux de données importés rattachés ({f.dataset_ids!.length})</span>
              <input placeholder="Filtrer…" value={dsFilter} onChange={(e) => setDsFilter(e.target.value)} />
              <div className="checks">
                {datasets.filter((d) => norm(d.label).includes(norm(dsFilter))).map((d) => (
                  <label key={d.id}><input type="checkbox" checked={f.dataset_ids!.includes(d.id)} onChange={() => toggleDs(d.id)} /> {d.label}</label>
                ))}
                {!datasetsReady && <span className="muted small">Chargement des jeux de données…</span>}
                {datasetsReady && datasets.length === 0 && <span className="muted small">Aucun jeu de données disponible.</span>}
              </div>
            </div>
            <label className="field"><span>Couche géographique lue en direct (géoportail du Val-de-Marne)</span>
              <select value={f.couche_id ?? ''} onChange={(e) => set('couche_id', e.target.value || null)}>
                <option value="">— aucune —</option>
                {couches.map((c) => <option key={c.id} value={c.id}>{c.theme} · {c.label}</option>)}
              </select>
            </label>
            {!isNew && value.excel_sheet != null && (
              <label className="inline">
                <input type="checkbox" checked={applyRow} onChange={(e) => setApplyRow(e.target.checked)} />
                Appliquer source, liens, périodicité et proposition à toute la ligne du classeur (onglet « {value.excel_sheet} », ligne {value.excel_row})
              </label>
            )}
          </>
        )}

        {tab === 'validation' && (
          <>
            <div className="grid2">
              <label className="field"><span>Statut</span>
                <select value={f.statut ?? 'brouillon'} onChange={(e) => set('statut', e.target.value as Statut)}>
                  {STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label className="field"><span>Faisabilité de la collecte</span>
                <select value={f.faisabilite ?? ''} onChange={(e) => set('faisabilite', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Non évaluée</option>
                  {FAISABILITES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
            </div>
            {text('decision', 'Décision / arbitrage (CODIR, groupe de travail…)', true, 'ex. CODIR du 06/10/2026 : retenu en priorité 2, à partir de 2027')}
            {text('notes', 'Remarques / incohérences', true)}
          </>
        )}

        {tab === 'historique' && (
          <div className="history">
            {history.length === 0 && <div className="empty">Aucune modification enregistrée.</div>}
            {history.map((h) => (
              <div key={h.id} className="h-row">
                <span className="muted small">{fmtDate(h.at.replace(' ', 'T') + 'Z')}</span>
                <strong>{FIELD_LABELS[h.field] ?? h.field}</strong>
                {h.field === 'création' ? <span>indicateur créé</span> : (
                  <span className="small"><s className="muted">{histValue(h.field, h.old_value)}</s> → {histValue(h.field, h.new_value)}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          {!isNew && <button className="danger" onClick={remove}>Supprimer</button>}
          <span className="spacer" />
          <button className="secondary" onClick={onClose}>Annuler</button>
          <button onClick={save}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
