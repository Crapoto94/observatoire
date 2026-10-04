import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { api } from '../api';

// Fiche lisible de la documentation publiée par la source d'un jeu (catalogue Melodi, data.gouv.fr, Opendatasoft,
// Data Fair, DiDo, géoportail du Val-de-Marne), à la place du JSON brut. Les textes externes sont échappés avant
// la mise en forme Markdown : aucun HTML de la source n'est injecté dans la page.

export interface Doc {
  disponible: boolean; message?: string; url_brute: string; lu_le?: string;
  portail?: string; titre?: string; sousTitre?: string | null; producteur?: string | null;
  description?: string; themes?: string[]; motsCles?: string[]; couverture?: string | null; resolutions?: string[];
  periode?: { debut: string | null; fin: string | null } | null; frequence?: string | null; publie?: string | null; modifie?: string | null;
  licence?: string | null; unite?: string | null; volume?: string | null; sourcesStat?: string[]; methode?: string | null; usage?: string | null;
  telechargements?: { label: string; format: string; taille: string | null; url: string; date?: string | null }[];
  liens?: { label: string; url: string }[];
  champs?: { code: string; label: string; type: string; description: string | null }[] | null;
}

const renderer = new marked.Renderer();
renderer.link = ({ href, title, tokens }) => {
  const safe = /^https?:\/\//i.test(href) ? href : '#';
  return `<a href="${safe}"${title ? ` title="${title}"` : ''} target="_blank" rel="noreferrer noopener">${renderer.parser.parseInline(tokens)}</a>`;
};
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = (s: string) => marked.parse(escape(s), { renderer, gfm: true, breaks: true, async: false }) as string;
const dateFr = (d?: string | null) => (d ? new Date(d.length === 4 ? `${d}-01-01` : d).toLocaleDateString('fr-FR', d.length === 4 ? { year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' }) : null);

export default function DocSource({ id }: { id: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);
  useEffect(() => { setDoc(null); setError(''); api<Doc>(`/jeux/${id}/doc`, { timeoutMs: 40000 }).then(setDoc).catch((e) => setError(e.message)); }, [id]);
  const html = useMemo(() => (doc?.description ? md(doc.description) : ''), [doc]);

  if (error) return <div className="error small">Documentation de la source indisponible : {error}</div>;
  if (!doc) return <div className="muted small">Lecture de la documentation publiée par la source…</div>;
  if (!doc.disponible) return <div className="muted small">{doc.message} <a href={doc.url_brute} target="_blank" rel="noreferrer">Ouvrir la page de la source ↗</a></div>;

  const periode = doc.periode && (doc.periode.debut || doc.periode.fin) ? `${dateFr(doc.periode.debut) ?? '…'} → ${dateFr(doc.periode.fin) ?? '…'}` : null;
  const facts: [string, React.ReactNode][] = [
    ['Producteur', doc.producteur], ['Portail', doc.portail], ['Couverture', doc.couverture], ['Résolution', doc.resolutions?.join(', ')],
    ['Période couverte', periode], ['Fréquence', doc.frequence], ['Unité statistique', doc.unite], ['Volume', doc.volume],
    ['Publié le', dateFr(doc.publie)], ['Mis à jour le', dateFr(doc.modifie)], ['Licence / accès', doc.licence],
    ['Production', doc.sourcesStat?.length ? doc.sourcesStat.join(' · ') : null],
  ];
  const long = (doc.description || '').length > 900;

  return (
    <div className="doc-source">
      <div className="doc-title">
        <strong>{doc.titre}</strong>
        {doc.sousTitre && <div className="muted small">{doc.sousTitre}</div>}
      </div>
      <dl className="doc-facts">
        {facts.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {html && (
        <div className={`doc-desc markdown ${long && !full ? 'clamped' : ''}`}>
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {long && <button className="link small" onClick={() => setFull(!full)}>{full ? 'Réduire' : 'Lire la suite'}</button>}
        </div>
      )}
      {doc.methode && <details className="doc-block"><summary>Méthode et généalogie</summary><div className="markdown small" dangerouslySetInnerHTML={{ __html: md(doc.methode) }} /></details>}
      {doc.usage && <details className="doc-block"><summary>Recommandations d’usage</summary><div className="markdown small" dangerouslySetInnerHTML={{ __html: md(doc.usage) }} /></details>}
      {(doc.themes?.length || doc.motsCles?.length) ? (
        <div className="doc-tags">{[...(doc.themes || []), ...(doc.motsCles || [])].filter(Boolean).slice(0, 18).map((t) => <span key={t} className="chip">{t}</span>)}</div>
      ) : null}
      {doc.champs && doc.champs.length > 0 && (
        <details className="doc-block">
          <summary>Champs de la source ({doc.champs.length})</summary>
          <table className="doc-table">
            <thead><tr><th>Champ</th><th>Libellé</th><th>Type</th></tr></thead>
            <tbody>{doc.champs.map((c) => <tr key={c.code}><td><code>{c.code}</code></td><td>{c.label}{c.description && <div className="muted small">{c.description}</div>}</td><td className="muted">{c.type}</td></tr>)}</tbody>
          </table>
        </details>
      )}
      {doc.telechargements && doc.telechargements.length > 0 && (
        <details className="doc-block">
          <summary>Fichiers et exports ({doc.telechargements.length})</summary>
          <ul className="doc-files">
            {doc.telechargements.map((t, k) => (
              <li key={k}><a href={t.url} target="_blank" rel="noreferrer noopener">{t.label || t.url}</a> {t.format && <span className="chip">{t.format}</span>} {t.taille && <span className="muted small">{t.taille}</span>} {t.date && <span className="muted small">· {dateFr(t.date)}</span>}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="doc-links small">
        {doc.liens?.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener">{l.label} ↗</a>)}
        <a className="muted" href={doc.url_brute} target="_blank" rel="noreferrer noopener" title="Métadonnées brutes telles que publiées par la source">métadonnées brutes ↗</a>
      </div>
    </div>
  );
}
