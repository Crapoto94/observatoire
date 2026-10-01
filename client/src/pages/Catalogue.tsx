import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';

// Page « Catalogue » : affiche le document CATALOGUE_DONNEES_OUVERTES.md servi par l'API.
const renderer = new marked.Renderer();
renderer.link = ({ href, title, tokens }) =>
  `<a href="${href}"${title ? ` title="${title}"` : ''} target="_blank" rel="noreferrer">${renderer.parser.parseInline(tokens)}</a>`;

export default function Catalogue() {
  const [md, setMd] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/catalogue')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Erreur ${r.status}`))))
      .then(setMd)
      .catch((e) => setError(e.message));
  }, []);

  const html = useMemo(() => marked.parse(md, { renderer, gfm: true, async: false }) as string, [md]);

  return (
    <section className="page">
      <div className="page-head"><h1>Catalogue des données ouvertes</h1></div>
      {error && <div className="error">{error}</div>}
      <article className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
