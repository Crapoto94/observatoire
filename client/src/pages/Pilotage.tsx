import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { CARTOS, FAISABILITES, Indicator, NIVEAUX, ORIGINES, STATUTS } from '../types';
import { KpiVal, LiveVal, POIDS, synthese } from '../fiabilite';
import { besoinInterne } from '../badges';

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'en', 'et', 'a', 'au', 'aux', 'par', 'sur', 'un', 'une']);
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokens = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t)));
const jaccard = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  a.forEach((t) => { if (b.has(t)) n++; });
  return n / (a.size + b.size - n || 1);
};

function Bar({ value, total, color = 'var(--accent)' }: { value: number; total: number; color?: string }) {
  const p = total ? Math.round((100 * value) / total) : 0;
  return (
    <div className="bar" title={`${value} / ${total}`}>
      <div className="bar-fill" style={{ width: `${p}%`, background: color }} />
      <span>{p} %</span>
    </div>
  );
}

export default function Pilotage() {
  const [items, setItems] = useState<Indicator[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api<Indicator[]>('/indicators').then(setItems).catch((e) => setError(e.message)); }, []);
  // valeurs calculées (KPI) : nombre de fiches renseignées et fiabilité estimée
  const [kpis, setKpis] = useState<Map<string, KpiVal> | null>(null);
  const [live, setLive] = useState<Record<string, LiveVal> | null>(null);
  useEffect(() => { api<Record<string, LiveVal>>('/couches/valeurs', { timeoutMs: 60000 }).then(setLive).catch(() => setLive({})); }, []);
  useEffect(() => { api<{ kpis: KpiVal[] }>('/kpi', { timeoutMs: 60000 }).then((r) => setKpis(new Map(r.kpis.map((k) => [k.id, k])))).catch(() => setKpis(new Map())); }, []);

  const actifs = useMemo(() => items.filter((i) => i.statut !== 'abandonne'), [items]);

  const couverture = useMemo(() => {
    const by = new Map<string, { label: string; list: Indicator[] }>();
    actifs.forEach((i) => (by.get(i.theme) || by.set(i.theme, { label: i.theme_label || i.theme, list: [] }).get(i.theme))!.list.push(i));
    const row = (label: string, list: Indicator[], theme?: string) => ({
      label, theme, n: list.length,
      source: list.filter((i) => i.source || i.lien_donnees).length,
      definition: list.filter((i) => i.definition).length,
      jeu: list.filter((i) => i.dataset_ids.length).length,
      porteur: list.filter((i) => i.porteur).length,
      valide: list.filter((i) => i.statut === 'valide').length,
      fiab: synthese(list, kpis, live),
    });
    return [...by.entries()].map(([k, v]) => row(v.label, v.list, k)).concat(row('Ensemble', actifs));
  }, [actifs, kpis, live]);
  const fiab = useMemo(() => synthese(actifs, kpis, live), [actifs, kpis, live]);
  // fiches approchées ou partielles regroupées par piste de fiabilisation (source qui donnerait la valeur exacte)
  const pistes = useMemo(() => {
    const by = new Map<string, { label: string; dossier: string | null; fiches: Indicator[] }>();
    for (const i of actifs) {
      const m = i.kpi_matches?.find((x) => kpis?.get(x.id)?.value != null);
      if (!m || m.fiabilite === 'fiable' || !m.piste) continue;
      const g = by.get(m.piste.label) || by.set(m.piste.label, { ...m.piste, fiches: [] }).get(m.piste.label)!;
      g.fiches.push(i);
    }
    return [...by.values()].sort((a, b) => b.fiches.length - a.fiches.length);
  }, [actifs, kpis]);
  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)} %`);

  const matrice = useMemo(() => {
    const prios: (number | 'none')[] = [1, 2, 3, 4, 'none'];
    const faisas: (number | 'none')[] = [1, 2, 3, 'none'];
    const count = (p: number | 'none', f: number | 'none') =>
      actifs.filter((i) => (p === 'none' ? !i.priorite : i.priorite === p) && (f === 'none' ? !i.faisabilite : i.faisabilite === f)).length;
    return { prios, faisas, count };
  }, [actifs]);

  const urgents = useMemo(
    () => actifs.filter((i) => i.priorite && i.priorite <= 2 && i.faisabilite === 3).sort((a, b) => (a.priorite! - b.priorite!)),
    [actifs]
  );

  const doublons = useMemo(() => {
    const tk = actifs.map((i) => tokens(i.libelle));
    const out: { a: Indicator; b: Indicator; s: number }[] = [];
    for (let x = 0; x < actifs.length; x++) {
      for (let y = x + 1; y < actifs.length; y++) {
        const a = actifs[x], b = actifs[y];
        if (a.niveau !== b.niveau && a.groupe === b.groupe) continue; // contexte / suivi d'un même sujet : normal
        const s = jaccard(tk[x], tk[y]);
        if (s >= 0.7 && a.niveau === b.niveau) out.push({ a, b, s });
      }
    }
    return out.sort((p, q) => q.s - p.s);
  }, [actifs]);

  const sansParent = useMemo(() => actifs.filter((i) => i.niveau !== 'contexte' && i.niveau !== 'prospective' && !i.parent_id), [actifs]);

  const byStatut = (k: string) => items.filter((i) => (i.statut || 'brouillon') === k).length;

  return (
    <section className="page">
      <div className="page-head"><h1>Pilotage de la conception</h1></div>
      {error && <div className="error">{error}</div>}

      <div className="cards">
        <div className="card"><div className="big">{items.length}</div>indicateurs</div>
        {STATUTS.map((s) => (
          <Link key={s.key} className="card" to={`/indicateurs?statut=${s.key}`}>
            <div className="big" style={{ color: s.color }}>{byStatut(s.key)}</div>{s.label.toLowerCase()}s
          </Link>
        ))}
        <Link className="card" to="/indicateurs?flag=sans-definition"><div className="big">{actifs.filter((i) => !i.definition).length}</div>sans définition</Link>
        {ORIGINES.map((o) => (
          <Link key={o.key} className="card" to={`/indicateurs?origine=${o.key}`} title={o.hint}>
            <div className="big" style={{ color: o.color }}>{actifs.filter((i) => i.origine === o.key).length}</div>{o.label.toLowerCase()}s
          </Link>
        ))}
        <Link className="card" to="/indicateurs?carto=carte" title={CARTOS[0].hint}>
          <div className="big" style={{ color: CARTOS[0].color }}>{actifs.filter((i) => i.cartographie === 'oui' || i.cartographie === 'possible').length}</div>sur une carte
        </Link>
        <Link className="card" to="/indicateurs?flag=sans-source"><div className="big">{actifs.filter((i) => !i.source && !i.lien_donnees).length}</div>sans source ni lien</Link>
        <Link className="card" to="/indicateurs?interne=oui" title="Fiches qui demandent des données internes à la collectivité (exclusivement ou en complément d’une source externe)">
          <div className="big" style={{ color: '#9a3412' }}>{actifs.filter((i) => besoinInterne(i)).length}</div>besoins internes
          <div className="muted small">dont {actifs.filter((i) => besoinInterne(i) === 'interne').length} exclusivement internes</div>
        </Link>
      </div>

      <h3>Valeurs calculées pour Ivry et fiabilité <span className="muted small">(hors abandonnés)</span></h3>
      {!kpis ? <div className="muted small">Calcul des valeurs en cours…</div> : (
        <div className="cards">
          <div className="card" title="Fiches ayant une valeur calculée pour Ivry (KPI rattaché)">
            <div className="big">{fiab.calcules}</div>indicateurs calculés <span className="muted small">sur {fiab.total} ({pct(fiab.couverture)})</span>
          </div>
          <div className="card" title={`Moyenne pondérée des valeurs calculées : fiable × ${POIDS.fiable}, partielle × ${POIDS.partielle}, approchée × ${POIDS.approchee}. Mesure la confiance à accorder aux valeurs affichées, pas leur exhaustivité.`}>
            <div className="big" style={{ color: fiab.score == null ? undefined : fiab.score >= 0.8 ? '#16a34a' : fiab.score >= 0.6 ? '#d97706' : '#dc2626' }}>{pct(fiab.score)}</div>fiabilité estimée
            <div className="muted small">soit {pct(fiab.score == null ? null : fiab.score * fiab.couverture)} de l’ensemble des fiches</div>
          </div>
          <Link className="card" to="/indicateurs?fiabilite=fiable"><div className="big" style={{ color: '#16a34a' }}>{fiab.fiable}</div>valeurs fiables</Link>
          <Link className="card" to="/indicateurs?fiabilite=approchee" title="Valeur voisine, base d’une projection ou d’une évaluation, unité différente, ou évolution non calculable"><div className="big" style={{ color: '#c2410c' }}>{fiab.approchee}</div>approchées</Link>
          <Link className="card" to="/indicateurs?fiabilite=partielle" title="Données déclaratives incomplètes (minimum)"><div className="big" style={{ color: '#a16207' }}>{fiab.partielle}</div>partielles</Link>
          <Link className="card" to="/indicateurs?fiabilite=aucune" title="Aucune valeur calculée : données manquantes ou calcul à définir"><div className="big" style={{ color: '#64748b' }}>{fiab.aucune}</div>sans valeur</Link>
          {fiab.live > 0 && <Link className="card" to="/indicateurs?acces=live"><div className="big" style={{ color: '#92400e' }}>{fiab.live}</div>en direct (couches)</Link>}
          <div className="card" title="Indicateurs calculables par plusieurs sources dont les valeurs divergent de plus de 2 % (orange) ou 20 % (rouge)">
            <div className="big"><span style={{ color: '#c2410c' }}>{fiab.multiEcart}</span> / <span style={{ color: '#b91c1c' }}>{fiab.multiIncoherent}</span></div>sources en écart / incohérentes
          </div>
        </div>
      )}

      {kpis && pistes.length > 0 && (
        <>
          <h3>Fiabiliser les valeurs approchées <span className="muted small">({pistes.reduce((n, p) => n + p.fiches.length, 0)} fiches, regroupées par source qui donnerait la valeur exacte)</span></h3>
          <div className="table-wrap short">
            <table className="grid compact pistes">
              <thead><tr><th>Piste de fiabilisation</th><th className="num">Fiches</th><th>Dossier de demande</th><th>Fiches concernées</th></tr></thead>
              <tbody>
                {pistes.map((p) => (
                  <tr key={p.label}>
                    <td>{p.label}</td>
                    <td className="num">{p.fiches.length}</td>
                    <td>{p.dossier ? <code title="Dossier dans docs/demandes-donnees du dépôt">{p.dossier}</code> : <span className="muted">—</span>}</td>
                    <td><details><summary className="small">voir</summary>{p.fiches.map((i) => <div key={i.id} className="small"><Link to={`/indicateurs/${i.id}`}>#{i.id} {i.libelle}</Link></div>)}</details></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Couverture par thème <span className="muted small">(hors abandonnés)</span></h3>
      <div className="table-wrap short">
        <table className="grid compact">
          <thead>
            <tr><th>Thème</th><th className="num">Indicateurs</th><th>Avec source ou lien</th><th>Avec jeu importé</th><th>Valeur calculée</th><th className="num" title="Moyenne pondérée des valeurs calculées (fiable 1, partielle 0,6, approchée 0,4)">Fiabilité estimée</th><th>Avec définition</th><th>Avec porteur</th><th>Validés</th></tr>
          </thead>
          <tbody>
            {couverture.map((c) => (
              <tr key={c.label} style={c.label === 'Ensemble' ? { fontWeight: 700 } : undefined}>
                <td>{c.theme ? <Link to={`/indicateurs?theme=${c.theme}`}>{c.label}</Link> : c.label}</td>
                <td className="num">{c.n}</td>
                <td><Bar value={c.source} total={c.n} /></td>
                <td><Bar value={c.jeu} total={c.n} color="#16a34a" /></td>
                <td><Bar value={c.fiab.calcules} total={c.n} color="#0891b2" /></td>
                <td className="num" title={`${c.fiab.fiable} fiables, ${c.fiab.partielle} partielles, ${c.fiab.approchee} approchées`} style={{ color: c.fiab.score == null ? undefined : c.fiab.score >= 0.8 ? '#16a34a' : c.fiab.score >= 0.6 ? '#d97706' : '#dc2626', fontWeight: 600 }}>{kpis ? pct(c.fiab.score) : '…'}</td>
                <td><Bar value={c.definition} total={c.n} color="#7c3aed" /></td>
                <td><Bar value={c.porteur} total={c.n} color="#d97706" /></td>
                <td><Bar value={c.valide} total={c.n} color="#2e9d4f" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Priorité × faisabilité</h3>
      <p className="muted small">Cliquez sur un nombre pour voir les indicateurs. Les priorités 1 et 2 difficiles à collecter sont à traiter en premier.</p>
      <div className="table-wrap short">
        <table className="grid compact matrix">
          <thead>
            <tr><th />{matrice.faisas.map((f) => <th key={f} className="num">{f === 'none' ? 'Non évaluée' : FAISABILITES.find((x) => x.key === f)?.short}</th>)}</tr>
          </thead>
          <tbody>
            {matrice.prios.map((p) => (
              <tr key={p}>
                <th>{p === 'none' ? 'Sans priorité' : `Priorité ${p}`}</th>
                {matrice.faisas.map((f) => {
                  const n = matrice.count(p, f);
                  const hot = n > 0 && typeof p === 'number' && p <= 2 && f === 3;
                  return (
                    <td key={f} className={`num ${hot ? 'hot' : ''}`}>
                      {n ? <Link to={`/indicateurs?prio=${p}&faisa=${f}`}>{n}</Link> : <span className="muted">0</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {urgents.length > 0 && (
        <>
          <h3>Priorité 1 ou 2 et difficiles à collecter ({urgents.length})</h3>
          <ul className="plain">
            {urgents.map((i) => (
              <li key={i.id}>
                <span className={`prio prio-${i.priorite}`}>P{i.priorite}</span>{' '}
                <Link to={`/indicateurs?edit=${i.id}`}>{i.libelle}</Link>
                <span className="muted small"> · {i.theme_label} · {NIVEAUX.find((n) => n.key === i.niveau)?.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Doublons possibles ({doublons.length})</h3>
      <p className="muted small">Indicateurs de même niveau aux libellés très proches (rubriques différentes ou répétition dans la même rubrique).</p>
      {doublons.length === 0 ? <div className="muted">Aucun doublon détecté.</div> : (
        <ul className="plain">
          {doublons.slice(0, 60).map((d) => (
            <li key={`${d.a.id}-${d.b.id}`}>
              <Link to={`/indicateurs?edit=${d.a.id}`}>{d.a.libelle}</Link> <span className="muted small">({d.a.groupe_label})</span>
              {' ≈ '}
              <Link to={`/indicateurs?edit=${d.b.id}`}>{d.b.libelle}</Link> <span className="muted small">({d.b.groupe_label}) · {Math.round(d.s * 100)} %</span>
            </li>
          ))}
        </ul>
      )}

      <h3>Suivi et évaluation sans indicateur de contexte associé ({sansParent.length})</h3>
      <p className="muted small">
        Reliez chaque indicateur de suivi ou d'évaluation à l'indicateur de contexte qu'il prolonge (fiche de l'indicateur, onglet « Fiche »).{' '}
        <Link to="/indicateurs?flag=sans-parent">Voir la liste filtrée</Link>
      </p>
    </section>
  );
}
