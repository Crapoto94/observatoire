import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { marked } from 'marked';
import JeuxDonnees from './JeuxDonnees';

// Page « Catalogue » : document de référence CATALOGUE_DONNEES_OUVERTES.md servi par l'API, et liste des jeux de données
// (jeux importés et couches lues en direct : source, périmètre, granularité, champs, indicateurs liés), au choix par un bouton.
const renderer = new marked.Renderer();
renderer.link = ({ href, title, tokens }) =>
  `<a href="${href}"${title ? ` title="${title}"` : ''} target="_blank" rel="noreferrer">${renderer.parser.parseInline(tokens)}</a>`;

export default function Catalogue() {
  const [params, setParams] = useSearchParams();
  const vue = params.get('vue') === 'jeux' ? 'jeux' : 'document';
  const [md, setMd] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (vue !== 'document' || md) return;
    fetch('/api/catalogue')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Erreur ${r.status}`))))
      .then(setMd)
      .catch((e) => setError(e.message));
  }, [vue, md]);

  const html = useMemo(() => marked.parse(md, { renderer, gfm: true, async: false }) as string, [md]);
  const show = (v: 'jeux' | 'document') => setParams(v === 'jeux' ? { vue: 'jeux' } : {}, { replace: false });

  return (
    <section className="page">
      <div className="page-head">
        <h1>Catalogue des données</h1>
        <div className="actions seg">
          <button className={vue === 'jeux' ? '' : 'secondary'} onClick={() => show('jeux')} title="Jeux importés et couches en direct : source, périmètre, granularité, champs, indicateurs liés">☰ Liste des jeux de données</button>
          <button className={vue === 'document' ? '' : 'secondary'} onClick={() => show('document')} title="Document de référence des données ouvertes">📄 Document de référence</button>
        </div>
      </div>
      {vue === 'jeux' ? <JeuxDonnees embedded /> : (
        <>
          {error && <div className="error">{error}</div>}
          <article className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
        </>
      )}
    </section>
  );
}
