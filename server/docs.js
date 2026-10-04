// Documentation lisible d'un jeu de données : les métadonnées publiées par la source (catalogue Melodi de l'INSEE,
// data.gouv.fr, portails Opendatasoft, Data Fair, DiDo du SDES, géoportail du Val-de-Marne) sont lues en direct puis
// ramenées à une fiche commune (description, producteur, couverture, résolution, période, fréquence, licence,
// fichiers, liens, champs). Le JSON brut reste accessible par son lien. Cache de 24 h par jeu.
const { get } = require('./db');

const TTL = 24 * 3600 * 1000;
const cache = new Map();

const fr = (v) => (Array.isArray(v) ? (v.find((x) => x.lang === 'fr') || v[0])?.content || '' : typeof v === 'string' ? v : v?.content || '');
const labelFr = (o) => (o ? fr(o.label) || o.id || '' : '');
const day = (s) => (s ? String(s).slice(0, 10) : null);
const year = (s) => (s ? String(s).slice(0, 4) : null);

const FREQ = {
  annual: 'annuelle', annuel: 'annuelle', semiannual: 'semestrielle', quarterly: 'trimestrielle', monthly: 'mensuelle', weekly: 'hebdomadaire', daily: 'quotidienne',
  continuous: 'en continu', hourly: 'horaire', punctual: 'ponctuelle', irregular: 'irrégulière', unknown: 'inconnue', biennial: 'tous les deux ans', triennial: 'tous les trois ans',
};
const LICENCE = { lov2: 'Licence Ouverte v2.0 (Etalab)', 'fr-lo': 'Licence Ouverte (Etalab)', 'odc-odbl': 'ODbL (Open Database License)', 'odc-by': 'ODC-BY', 'cc-by': 'CC-BY', notspecified: 'Non précisée', 'other-at': 'Autre (attribution)' };
const GRANUL = { 'fr:commune': 'Commune', 'fr:departement': 'Département', 'fr:region': 'Région', 'fr:epci': 'Intercommunalité', 'fr:iris': 'IRIS', 'country': 'Pays', 'poi': 'Point d’intérêt', 'other': 'Autre', 'fr:canton': 'Canton' };
const freqFr = (f) => (f ? FREQ[String(f).toLowerCase()] || String(f) : null);
const size = (n) => (n == null ? null : n >= 1e9 ? `${(n / 1e9).toFixed(1)} Go` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`);

// HTML -> texte de type Markdown (listes, paragraphes, liens), sans balise : le client l'affiche ensuite échappé
function htmlToMd(html) {
  return String(html || '')
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => `[${txt.replace(/<[^>]+>/g, '')}](${href})`)
    .replace(/<\s*li[^>]*>/gi, '\n- ').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|h\d|ul|ol|table|tr)\s*>/gi, '\n\n')
    .replace(/<\s*(b|strong)\s*>/gi, '**').replace(/<\/\s*(b|strong)\s*>/gi, '**')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, '’').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${new URL(url).hostname}`);
  return r.json();
}

// ---------------- adaptateurs par portail ----------------
async function melodi(ds) {
  const url = `https://api.insee.fr/melodi/catalog/${ds}`;
  const o = await json(url);
  return {
    portail: 'Catalogue Melodi (INSEE)', titre: fr(o.title), sousTitre: fr(o.subtitle), producteur: labelFr(o.publisher) || o.creator,
    description: [fr(o.abstract), fr(o.description), fr(o.scopeNote)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n\n'),
    themes: (o.theme || []).map((t) => labelFr(t)), motsCles: [],
    couverture: labelFr(o.spatial), resolutions: (o.spatialResolution || []).map((r) => labelFr(r)),
    periode: o.temporal ? { debut: year(o.temporal.startPeriod), fin: year(o.temporal.endPeriod) } : null,
    frequence: labelFr(o.accrualPeriodicity) || (o.temporalResolution || []).map(labelFr).join(', '), publie: day(o.issued), modifie: day(o.modified),
    licence: fr(o.accessRights) ? `Accès ${fr(o.accessRights).toLowerCase()} · ${fr(o.confidentialityStatus) || ''}`.replace(/ · $/, '') : null,
    unite: (o.statisticalUnit || []).map(labelFr).join(', ') || null, volume: o.numObservations ? `${Number(o.numObservations).toLocaleString('fr-FR')} observations` : null,
    sourcesStat: (o.wasGeneratedBy || []).map(labelFr),
    telechargements: [...(o.product || []).map((p) => ({ label: p.title || p.id, format: p.format, taille: size(p.byteSize), url: p.accessURL })), ...(o.accessURLParquet ? [{ label: 'Fichier complet', format: 'Parquet', taille: size(o.tailleFichierParquetEnOctets), url: o.accessURLParquet }] : [])],
    liens: (o.relations || []).map((r) => ({ label: fr(r.titleComplement) || fr(r.title) || 'Documentation', url: fr(r.url) })).filter((l) => l.url),
    champs: null, url_brute: url,
  };
}

async function datagouv(id) {
  const url = `https://www.data.gouv.fr/api/1/datasets/${id}/`;
  const o = await json(url);
  return {
    portail: 'data.gouv.fr', titre: o.title, sousTitre: o.acronym || o.description_short || null, producteur: o.organization?.name || o.owner?.slug || null,
    description: o.description || '', descriptionFormat: 'markdown', themes: [], motsCles: o.tags || [],
    couverture: (o.spatial?.zones || []).map((z) => (z === 'country:fr' ? 'France' : z)).join(', ') || null,
    resolutions: o.spatial?.granularity ? [GRANUL[o.spatial.granularity] || o.spatial.granularity] : [],
    periode: o.temporal_coverage ? { debut: day(o.temporal_coverage.start), fin: day(o.temporal_coverage.end) } : null,
    frequence: freqFr(o.frequency), publie: day(o.created_at), modifie: day(o.last_update || o.last_modified), licence: LICENCE[o.license] || o.license,
    unite: null, volume: `${(o.resources || []).length} ressource(s)`,
    telechargements: (o.resources || []).slice(0, 25).map((r) => ({ label: r.title, format: (r.format || '').toUpperCase(), taille: size(r.filesize), url: r.url, date: day(r.last_modified) })),
    liens: [{ label: 'Page du jeu sur data.gouv.fr', url: o.page }], champs: null, url_brute: url,
  };
}

async function ods(domain, id) {
  const url = `https://${domain}/api/explore/v2.1/catalog/datasets/${id}`;
  const o = await json(url);
  const m = o.metas?.default || {};
  return {
    portail: m.source_domain_title || domain, titre: m.title, sousTitre: null, producteur: m.publisher || null,
    description: htmlToMd(m.description), descriptionFormat: 'markdown', themes: [].concat(m.theme || []), motsCles: [].concat(m.keyword || []),
    couverture: [].concat(m.territory || []).join(', ') || null, resolutions: [].concat(m.geographic_reference || []),
    periode: null, frequence: freqFr(m.update_frequency), publie: null, modifie: day(m.modified), licence: m.license || null,
    unite: null, volume: m.records_count != null ? `${Number(m.records_count).toLocaleString('fr-FR')} enregistrements` : null,
    telechargements: ['csv', 'json', 'geojson', 'xlsx'].map((f) => ({ label: `Export ${f.toUpperCase()}`, format: f.toUpperCase(), taille: null, url: `https://${domain}/api/explore/v2.1/catalog/datasets/${id}/exports/${f}` })),
    liens: [{ label: 'Page du jeu sur le portail', url: `https://${domain}/explore/dataset/${id}/information/` }, ...(m.references ? [{ label: 'Référence', url: m.references }] : [])],
    champs: (o.fields || []).map((f) => ({ code: f.name, label: f.label || f.name, type: f.type, description: f.description || null })), url_brute: url,
  };
}

async function datafair(base, id) {
  const url = `${base}/datasets/${id}`;
  const o = await json(url);
  return {
    portail: new URL(base).hostname, titre: o.title, sousTitre: null, producteur: o.owner?.name || null,
    description: o.description || '', descriptionFormat: 'markdown', themes: (o.topics || []).map((t) => t.title), motsCles: o.keywords || [],
    couverture: typeof o.spatial === 'string' ? o.spatial : null, resolutions: [], periode: o.temporal ? { debut: day(o.temporal.start), fin: day(o.temporal.end) } : null,
    frequence: freqFr(o.frequency), publie: day(o.createdAt), modifie: day(o.dataUpdatedAt || o.updatedAt), licence: o.license?.title || null,
    unite: null, volume: o.count != null ? `${Number(o.count).toLocaleString('fr-FR')} lignes` : null,
    telechargements: [{ label: 'Export CSV', format: 'CSV', taille: null, url: `${base}/datasets/${id}/lines?format=csv&size=10000` }, ...(o.originalFile ? [{ label: o.originalFile.name, format: (o.originalFile.mimetype || '').split('/').pop().toUpperCase(), taille: size(o.originalFile.size), url: `${base}/datasets/${id}/raw` }] : [])],
    liens: o.page ? [{ label: 'Page du jeu', url: o.page }] : [],
    champs: (o.schema || []).filter((f) => !f.key.startsWith('_')).map((f) => ({ code: f.key, label: f.title || f['x-originalName'] || f.key, type: f.type, description: f.description || null })), url_brute: url,
  };
}

async function dido(id) {
  const url = `https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datasets/${id}`;
  const o = await json(url);
  return {
    portail: 'DiDo (SDES)', titre: o.title, sousTitre: null, producteur: o.organization?.title || o.organization?.name || 'SDES',
    description: o.description || '', descriptionFormat: 'markdown', themes: [].concat(o.topic || []), motsCles: o.tags || [],
    couverture: [].concat(o.spatial?.zones || []).join(', ') || null, resolutions: o.spatial?.granularity ? [GRANUL[o.spatial.granularity] || o.spatial.granularity] : [],
    periode: o.temporal_coverage ? { debut: day(o.temporal_coverage.start), fin: day(o.temporal_coverage.end) } : null,
    frequence: freqFr(o.frequency), publie: day(o.created_at), modifie: day(o.last_update || o.last_modified), licence: LICENCE[o.license] || o.license,
    unite: null, volume: `${(o.datafiles || []).length} fichier(s) de données`,
    telechargements: (o.datafiles || []).slice(0, 15).map((f) => ({ label: f.title, format: 'CSV', taille: null, url: `https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles/${f.rid}/csv?millesime=${encodeURIComponent(f.millesimes?.[0]?.millesime || '')}` })),
    liens: o.weburl ? [{ label: 'Page du jeu (SDES)', url: o.weburl }] : [], champs: null, url_brute: url,
  };
}

async function geovdm(slug) {
  const r = await fetch('https://geo.valdemarne.fr/fr/indexer/elastic/_search/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ size: 1, query: { term: { 'slug.keyword': slug } }, _source: ['metadata-fr', 'slug'] }),
  });
  if (!r.ok) throw new Error(`géoportail du Val-de-Marne : HTTP ${r.status}`);
  const m = (await r.json()).hits?.hits?.[0]?._source?.['metadata-fr'];
  if (!m) throw new Error('fiche de métadonnées introuvable sur le géoportail');
  const party = (m.responsibleParty || [])[0];
  return {
    portail: 'Géoportail du Val-de-Marne', titre: m.title, sousTitre: (m.kind || []).join(' · '), producteur: party?.organisationName || null,
    description: m.abstract || '', descriptionFormat: 'markdown', themes: (m.topicCat || []).concat(m.category || []).map(String), motsCles: m.keyword || [],
    couverture: 'Val-de-Marne', resolutions: [m.spatialRepresentationType_text, m.denominator ? `échelle 1:${m.denominator}` : null, m.resolution].filter(Boolean),
    periode: null, frequence: m.maintenanceAndUpdateFrequency_text || null, publie: day(m.publicationDate), modifie: day(m.lastUpdateDate),
    licence: m.license || (m.legalConstraints || []).join(' ; ') || null, unite: null, volume: null,
    methode: m.lineage || null, usage: m.usageRecommandation || null,
    telechargements: [], liens: [{ label: 'Fiche sur le géoportail', url: `https://geo.valdemarne.fr/explorer/fr/jeux-de-donnees/${slug}/info` }, ...(m.href ? [{ label: 'Fiche ISO 19139 (GeoNetwork)', url: m.href }] : [])],
    champs: null, url_brute: `https://geo.valdemarne.fr/explorer/fr/jeux-de-donnees/${slug}/donnees`,
  };
}

const ENTREPRISES = {
  portail: 'API Recherche d’entreprises', titre: 'API Recherche d’entreprises (annuaire des entreprises)', sousTitre: 'Répertoire Sirene enrichi', producteur: 'DINUM (direction interministérielle du numérique)',
  description: 'API publique et gratuite de recherche des entreprises et établissements français (base Sirene de l’INSEE enrichie : labels, conventions collectives, appartenance à l’économie sociale et solidaire). L’observatoire y compte, pour chaque commune, les associations et établissements de l’ESS actifs (stock du jour).',
  descriptionFormat: 'markdown', themes: ['Entreprises'], motsCles: ['Sirene', 'ESS', 'associations'], couverture: 'France', resolutions: ['Établissement (adresse)'], periode: null, frequence: 'quotidienne',
  publie: null, modifie: null, licence: 'Licence Ouverte v2.0 (Etalab)', unite: 'Établissement', volume: null, telechargements: [],
  liens: [{ label: 'Documentation de l’API', url: 'https://recherche-entreprises.api.gouv.fr/docs/' }, { label: 'Annuaire des entreprises', url: 'https://annuaire-entreprises.data.gouv.fr/' }], champs: null, url_brute: 'https://recherche-entreprises.api.gouv.fr/docs/',
};

function adapter(docUrl, id) {
  if (!docUrl) return null;
  let u; try { u = new URL(docUrl); } catch { return null; }
  const h = u.hostname.replace(/^www\./, '');
  if (h === 'api.insee.fr' && /\/melodi\/catalog\//.test(u.pathname)) return () => melodi(u.pathname.split('/').pop());
  if (h === 'data.gouv.fr' && /\/datasets\/[^/?]+/.test(u.pathname)) return () => datagouv(u.pathname.match(/\/datasets\/([^/]+)/)[1]);
  if (/\/explore\/dataset\//.test(u.pathname)) return () => ods(h, u.pathname.match(/\/explore\/dataset\/([^/]+)/)[1]);
  if (/\/data-fair\/api\/v1\/datasets\//.test(u.pathname)) return () => datafair(`${u.origin}/data-fair/api/v1`, u.pathname.split('/').filter(Boolean).pop());
  if (h === 'statistiques.developpement-durable.gouv.fr' && u.searchParams.get('datasetId')) return () => dido(u.searchParams.get('datasetId'));
  if (h === 'geo.valdemarne.fr' && /jeux-de-donnees\//.test(u.pathname)) return () => geovdm(u.pathname.match(/jeux-de-donnees\/([^/]+)/)[1]);
  if (h === 'recherche-entreprises.api.gouv.fr' || id === 'entreprises') return async () => ENTREPRISES;
  return null;
}

/** Documentation d'un jeu importé (id de la table datasets) ou d'une couche en direct (id cd94_…). */
async function docOf(id) {
  const c = cache.get(id);
  if (c && Date.now() - c.at < TTL) return c.value;
  let docUrl = get('SELECT doc_url FROM datasets WHERE id = ?', id)?.doc_url;
  if (!docUrl) {
    const couche = require('./couches').list().couches.find((x) => x.id === id);
    if (!couche) throw Object.assign(new Error('jeu inconnu'), { status: 404 });
    docUrl = couche.doc_url;
  }
  const fn = adapter(docUrl, id);
  if (!fn) return { disponible: false, url_brute: docUrl, message: 'Ce portail ne publie pas de métadonnées lisibles automatiquement : consultez la page de la source.' };
  const value = { disponible: true, lu_le: new Date().toISOString(), ...(await fn()) };
  cache.set(id, { at: Date.now(), value });
  return value;
}

module.exports = { docOf, htmlToMd };
