import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDate } from '../api';
import { SourceBadge } from '../badges';
import DocSource from './DocSource';

// Liste des jeux de données (vue du menu Catalogue, accessible à tous) : catalogue des jeux importés et des couches lues en direct,
// avec source (icône par producteur), périmètre, granularité, champs disponibles et indicateurs qui y font référence.

interface Source { key: string; label: string; icon: string; color: string; count?: number }
interface Field { code: string; label: string; measure?: boolean; type?: string; values: { code: string; label: string }[] }
interface Ref { id: number; libelle: string; theme_label: string | null; niveau: string; statut: string | null; mode_calcul: string | null }
interface Jeu {
  id: string; label: string; description: string | null; mode: 'import' | 'live'; themes: string[];
  source: Source; portail: string | null; doc_url: string | null; connecteur: string;
  perimetre: { couverture: string; stocke: string };
  granularite: { geo: string; maille: string | null; temps: string | null; periodes: string | null };
  fields: Field[] | null; nb_rows?: number; last_import?: string | null; etat: string;
  indicators: Ref[]; kpis: { id: string; label: string }[]; indicators_live?: { id: string; label: string; formule: string }[]; link: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function SourceIcon({ s, withLabel = false }: { s: Source; withLabel?: boolean }) {
  return (
    <span className="src-icon" style={{ borderColor: s.color, color: s.color }} title={s.label}>
      <span className="src-emoji" style={{ background: `${s.color}1a` }}>{s.icon}</span>{withLabel && <span className="src-name">{s.label}</span>}
    </span>
  );
}

export default function JeuxDonnees({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Jeu[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [src, setSrc] = useState(params.get('source') || '');
  const [mode, setMode] = useState(params.get('mode') || '');
  const [open, setOpen] = useState<string | null>(params.get('jeu'));
  const [live, setLive] = useState<Record<string, Field[] | string>>({});

  useEffect(() => {
    api<{ items: Jeu[]; sources: Source[] }>('/jeux', { timeoutMs: 30000 }).then((r) => { setItems(r.items); setSources(r.sources); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(params); // conserve les autres paramètres (vue du catalogue)
    for (const [k, v] of [['source', src], ['mode', mode], ['jeu', open]] as const) { if (v) p.set(k, v); else p.delete(k); }
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, mode, open]);
  // champs d'une couche en direct : lus à l'ouverture
  useEffect(() => {
    const j = items.find((x) => x.id === open);
    if (!j || j.mode !== 'live' || live[j.id]) return;
    api<Field[]>(`/jeux/${j.id}/champs`).then((f) => setLive((m) => ({ ...m, [j.id]: f }))).catch((e) => setLive((m) => ({ ...m, [j.id]: e.message })));
  }, [open, items, live]);

  const rows = useMemo(() => {
    const t = norm(q.trim());
    return items.filter((j) => {
      if (src && j.source.key !== src) return false;
      if (mode && j.mode !== mode) return false;
      if (!t) return true;
      const hay = norm([j.label, j.id, j.description, j.source.label, j.themes.join(' '), ...(j.fields || []).map((f) => `${f.label} ${f.values.map((v) => v.label).join(' ')}`), ...j.indicators.map((i) => i.libelle)].join(' '));
      return t.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [items, q, src, mode]);

  const nImport = items.filter((j) => j.mode === 'import').length, nLive = items.length - nImport;

  return (
    <section className={embedded ? 'jeux-page' : 'page jeux-page'}>
      <div className={embedded ? 'jeux-subhead' : 'page-head'}>
        {!embedded && <h1>Jeux de données</h1>}
        <span className="muted">{nImport} jeux importés · {nLive} couches en direct · {sources.length} sources</span>
      </div>

      <div className="jeux-sources">
        <button className={!src ? 'on' : ''} onClick={() => setSrc('')}>Toutes les sources</button>
        {sources.map((s) => (
          <button key={s.key} className={src === s.key ? 'on' : ''} onClick={() => setSrc(src === s.key ? '' : s.key)} title={s.label}>
            <span className="src-emoji" style={{ background: `${s.color}1a` }}>{s.icon}</span> {s.label.replace(/\s*\(.*\)$/, '')} <span className="muted">{s.count}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Rechercher un jeu, un champ, une modalité ou un indicateur…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">Importés et en direct</option>
          <option value="import">Importés</option>
          <option value="live">En direct (live)</option>
        </select>
        <span className="count">{rows.length} / {items.length}</span>
      </div>
      {error && <div className="error">{error}</div>}
      {!items.length && !error && <div className="empty">Chargement du catalogue…</div>}

      <div className="jeux-list">
        {rows.map((j) => {
          const isOpen = open === j.id;
          const fields = j.mode === 'live' ? live[j.id] : j.fields;
          return (
            <div key={j.id} className={`jeu ${isOpen ? 'open' : ''}`}>
              <button className="jeu-head" onClick={() => setOpen(isOpen ? null : j.id)} aria-expanded={isOpen}>
                <SourceIcon s={j.source} />
                <span className="jeu-title">
                  <strong>{j.label}</strong>
                  <span className="muted small"> · {j.source.label}{j.portail ? ` · via ${j.portail}` : ''}</span>
                </span>
                <SourceBadge kind={j.mode} title={j.mode === 'live' ? 'Lu en direct à chaque affichage (aucun import)' : j.last_import ? `Importé le ${fmtDate(j.last_import)}` : 'Pas encore importé'} />
                {j.mode === 'import' && j.etat === 'vide' && <span className="al-attention small">vide</span>}
                <span className="jeu-meta small"><span title="Périmètre">🌍 {j.perimetre.couverture}</span><span title="Granularité géographique">▦ {j.granularite.geo}</span>{j.granularite.periodes && <span title="Périodes disponibles">🗓 {j.granularite.periodes}</span>}</span>
                <span className="jeu-count small" title="Indicateurs de la conception qui font référence à ce jeu">{j.indicators.length} indic.</span>
                <span className="jeu-caret">{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div className="jeu-body">
                  {j.description && <p>{j.description}</p>}
                  <div className="jeu-grid">
                    <dl>
                      <dt>Source</dt><dd><SourceIcon s={j.source} withLabel /> {j.doc_url && <a href="#doc-source" onClick={(e) => { e.preventDefault(); document.getElementById(`doc-${j.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>documentation ↓</a>}</dd>
                      <dt>Accès</dt><dd>{j.mode === 'live' ? 'Lecture en direct' : 'Import'} · connecteur {j.connecteur}{j.portail ? ` · ${j.portail}` : ''}</dd>
                      <dt>Périmètre</dt><dd>{j.perimetre.couverture}<div className="muted small">{j.perimetre.stocke}</div></dd>
                      <dt>Granularité</dt><dd>{j.granularite.geo}{j.granularite.maille && <div className="muted small">{j.granularite.maille}</div>}</dd>
                      <dt>Temporalité</dt><dd>{j.granularite.temps || '—'}{j.granularite.periodes && <div className="muted small">{j.granularite.periodes}</div>}</dd>
                      {j.mode === 'import' && <><dt>Volume</dt><dd>{(j.nb_rows || 0).toLocaleString('fr-FR')} observations · {fmtDate(j.last_import ?? null)}</dd></>}
                      {j.themes.length > 0 && <><dt>Thèmes</dt><dd>{j.themes.join(', ')}</dd></>}
                    </dl>
                    <div className="jeu-actions"><Link className="btn secondary" to={j.link}>{j.mode === 'live' ? 'Voir sur la carte' : 'Explorer les données'} →</Link></div>
                  </div>

                  <h3 id={`doc-${j.id}`}>Documentation de la source</h3>
                  <DocSource id={j.id} />

                  <h3>Champs disponibles</h3>
                  {typeof fields === 'string' && <div className="error small">Champs indisponibles : {fields}</div>}
                  {fields == null && <div className="muted small">{j.mode === 'live' ? 'Lecture des champs sur le géoportail…' : 'Champs connus après le premier import.'}</div>}
                  {Array.isArray(fields) && (
                    <div className="jeu-fields">
                      {fields.map((f) => (
                        <details key={f.code} className="jeu-field">
                          <summary>
                            <code>{f.code}</code> {f.label !== f.code && <span>{f.label}</span>}
                            {f.measure && <span className="nat nat-direct">mesure</span>}
                            {f.type && <span className="muted small"> · {f.type}</span>}
                            <span className="muted small"> · {f.values.length}{j.mode === 'live' ? ' exemple(s)' : ' modalité(s)'}</span>
                          </summary>
                          {f.values.length ? <ul className="jeu-values">{f.values.map((v) => <li key={v.code}><code>{v.code}</code>{v.label !== v.code && ` ${v.label}`}</li>)}</ul> : <div className="muted small">Valeur numérique ou libre.</div>}
                        </details>
                      ))}
                      {!fields.length && <div className="muted small">Aucun champ décrit.</div>}
                    </div>
                  )}

                  {j.indicators_live && j.indicators_live.length > 0 && (
                    <>
                      <h3>Indicateurs calculés en direct</h3>
                      <ul className="jeu-refs">{j.indicators_live.map((s) => <li key={s.id} title={s.formule}>ƒx {s.label}<span className="muted small"> : {s.formule}</span></li>)}</ul>
                    </>
                  )}

                  <h3>Indicateurs qui y font référence ({j.indicators.length}{j.kpis.length ? ` + ${j.kpis.length} KPI` : ''})</h3>
                  {!j.indicators.length && !j.kpis.length && <div className="muted small">Aucun indicateur de la conception n’est rattaché à ce jeu.</div>}
                  <ul className="jeu-refs">
                    {j.indicators.map((i) => (
                      <li key={i.id}>
                        <Link to={`/indicateurs?edit=${i.id}`}>{i.libelle}</Link>
                        <span className="muted small"> · {i.theme_label} · {i.niveau}</span>
                        {i.mode_calcul === 'calcule' ? <span className="nat nat-calc">ƒx Calculé</span> : i.mode_calcul === 'direct' ? <span className="nat nat-direct">● Directe</span> : null}
                      </li>
                    ))}
                    {j.kpis.map((k) => <li key={k.id}><Link to={`/tableau-de-bord?kpi=${k.id}`}>KPI ▸ {k.label}</Link></li>)}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
