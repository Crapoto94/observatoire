import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDate } from '../api';
import { CARTOS, Carto, Dataset, FAISABILITES, HistoryEntry, Indicator, NIVEAUX, NIVEAU_FILL, Niveau, ORIGINES, Origine, STATUTS, Statut } from '../types';

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

export default function Indicateurs() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Indicator[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
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
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [editing, setEditing] = useState<Partial<Indicator> | null>(null);

  const load = () =>
    Promise.all([api<Indicator[]>('/indicators'), api<Dataset[]>('/datasets')])
      .then(([i, d]) => { setItems(i); setDatasets(d); })
      .catch((e) => setError(e.message));
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
      if (flag === 'sans-source' && i.source) return false;
      if (flag === 'lien-corrige' && !i.lien_corrige) return false;
      if (flag === 'avec-jeu' && !i.dataset_ids.length) return false;
      if (flag === 'sans-jeu' && i.dataset_ids.length) return false;
      if (flag === 'incoherence' && !i.notes) return false;
      if (flag === 'sans-definition' && i.definition) return false;
      if (flag === 'sans-parent' && (i.niveau === 'contexte' || i.parent_id)) return false;
      if (nq) {
        const hay = norm([i.libelle, i.libelle_carte, i.source, i.proposition, i.notes, i.periodicite, i.theme_label, i.groupe_label,
          i.definition, i.porteur, i.decision].join(' '));
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
  }, [items, q, theme, groupe, niveau, prio, flag, statut, faisa, origine, carto, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const arrow = (key: SortKey) => (sort?.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const dsLabel = (id: string) => datasets.find((d) => d.id === id)?.label || id;

  const exportCsv = () => {
    const cols: (keyof Indicator)[] = ['theme_label', 'groupe_label', 'niveau', 'libelle', 'priorite', 'statut', 'definition', 'formule', 'unite', 'perimetre',
      'porteur', 'cible', 'decision', 'faisabilite', 'origine', 'cartographie', 'source', 'lien_origine', 'lien_corrige', 'periodicite', 'proposition', 'lien_donnees', 'notes'];
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
        <table className="grid">
          <thead>
            <tr>
              <th onClick={() => toggleSort('theme')} className="sortable">Thème{arrow('theme')}</th>
              <th onClick={() => toggleSort('niveau')} className="sortable">Niveau{arrow('niveau')}</th>
              <th onClick={() => toggleSort('libelle')} className="sortable">Indicateur{arrow('libelle')}</th>
              <th onClick={() => toggleSort('priorite')} className="sortable">Prio{arrow('priorite')}</th>
              <th>Statut</th>
              <th>Faisabilité</th>
              <th>Origine</th>
              <th>Carto</th>
              <th onClick={() => toggleSort('source')} className="sortable">Source (classeur){arrow('source')}</th>
              <th>Lien d'origine</th>
              <th>Lien corrigé</th>
              <th>Périodicité</th>
              <th>Proposition</th>
              <th>Lien données</th>
              <th>Jeux importés</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className={i.notes ? 'flagged' : ''}>
                <td><div>{i.theme_label}</div><div className="muted small">{i.groupe_label !== i.theme_label ? i.groupe_label : ''}</div></td>
                <td><span className="chip" style={{ background: NIVEAU_FILL[i.niveau] }}>{NIVEAUX.find((n) => n.key === i.niveau)?.label}</span></td>
                <td className="lib">
                  <strong>{i.libelle}</strong>
                  {i.libelle_carte && i.libelle_carte.toLowerCase() !== i.libelle.toLowerCase() && <div className="muted small">Carte : {i.libelle_carte}</div>}
                  {i.definition && <div className="small muted clamp2" title={i.definition}>{i.definition}</div>}
                  {i.notes && <div className="note small">⚠ {i.notes}</div>}
                </td>
                <td><PrioPill p={i.priorite} /></td>
                <td><StatutPill s={i.statut} /></td>
                <td>{i.faisabilite ? <span className={`faisa faisa-${i.faisabilite}`}>{FAISABILITES.find((f) => f.key === i.faisabilite)?.short}</span> : <span className="muted">—</span>}</td>
                <td><OrigineChip o={i.origine} /></td>
                <td><CartoChip c={i.cartographie} /></td>
                <td className="clamp" title={i.source || ''}>{i.source || <span className="muted">—</span>}</td>
                <td><LinkCell url={i.lien_origine} /></td>
                <td><LinkCell url={i.lien_corrige} /></td>
                <td>{i.periodicite || <span className="muted">—</span>}</td>
                <td className="prop" title={i.proposition || ''}>{i.proposition || <span className="muted">—</span>}</td>
                <td><LinkCell url={i.lien_donnees} /></td>
                <td>
                  {i.dataset_ids.length ? i.dataset_ids.map((d) => (
                    <Link key={d} className="chip ds" to={`/donnees?ds=${d}`} title="Voir les données">{dsLabel(d)}</Link>
                  )) : <span className="muted">—</span>}
                </td>
                <td><button className="icon" title="Modifier" onClick={() => setEditing(i)}>✎</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={16} className="empty">Aucun indicateur ne correspond aux filtres.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Editor
          value={editing}
          datasets={datasets}
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
  origine: 'Origine', cartographie: 'Cartographie',
  theme: 'Thème', groupe: 'Rubrique',
};

function Editor({ value, datasets, themes, items, onClose, onSaved }: {
  value: Partial<Indicator>;
  datasets: Dataset[];
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
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Nouvel indicateur' : 'Modifier l\'indicateur'}</h2>
        <div className="tabs">
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
            <div className="grid2">
              {text('formule', 'Formule de calcul', false, 'ex. bénéficiaires / population totale × 100')}
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
              </div>
            </div>
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
