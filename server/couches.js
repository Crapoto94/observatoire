// Couches géographiques du géoportail du Conseil départemental du Val-de-Marne (geo.valdemarne.fr, GeoServer WFS),
// lues EN DIRECT (aucun import) : objets d'une commune du Val-de-Marne pour la carte, et indicateurs calculés à la volée
// (nombre d'objets, nombre pour 1 000 habitants, sommes de champs, comparaison avec le département).
// Un cache mémoire court (10 minutes) évite de solliciter le service à chaque affichage.

const WFS = 'https://geo.valdemarne.fr/geoserver/ows';
const NS = 'conseil-departemental-du-val-de-marne:';
const PORTAIL = 'https://geo.valdemarne.fr/explorer/fr/jeux-de-donnees/';
const TTL = 10 * 60 * 1000;
const MAX = 20000; // objets lus au plus par requête

// kind : point | line | polygon ; label : champ affiché ; info : champs de l'infobulle ;
// stats : { id, label, field, agg: sum | mean | count_if | length_km, test?, unit? } ; choropleth : champ de valeur (indicateurs par IRIS)
const C = (o) => ({ info: [], stats: [], ...o });
const COUCHES = [
  // Équipements
  C({ id: 'cd94_ecoles', theme: 'Équipements', label: 'Écoles maternelles et élémentaires', layer: 'equipements.v_eq_ecole_mat_elem', kind: 'polygon', color: '#2563eb', label_field: 'nom_equipement', info: ['lib_type_ecole_mat_elem', 'lib_statut_ecole_mat_elem', 'effectif', 'adresse_equipement'], slug: 'equipements-publics-ecoles-maternelles-et-elementaires-val-de-marne', stats: [{ id: 'eleves', label: 'Élèves', field: 'effectif', agg: 'sum' }] }),
  C({ id: 'cd94_colleges', theme: 'Équipements', label: 'Collèges publics', layer: 'equipements.v_eq_college_public', kind: 'polygon', color: '#1d4ed8', label_field: 'nom_college', info: ['dispo_education_prio', 'nb_total_classes_banales'], slug: 'equipements-publics-colleges-publics-val-de-marne', stats: [{ id: 'classes', label: 'Classes', field: 'nb_total_classes_banales', agg: 'sum' }] }),
  C({ id: 'cd94_petite_enfance', theme: 'Équipements', label: 'Accueil de la petite enfance (hors Département)', layer: 'equipements.v_eq_ape_non_dept', kind: 'polygon', color: '#db2777', label_field: 'nom_equipement', info: ['lib_type_ape', 'lib_gestion_ape', 'accueil_total', 'adresse_equipement'], slug: 'equipements-publics-accueil-petite-enfance-non-departemental-val-de-marne', stats: [{ id: 'places', label: 'Places d’accueil', field: 'accueil_total', agg: 'sum' }] }),
  C({ id: 'cd94_creches_dept', theme: 'Équipements', label: 'Crèches départementales', layer: 'equipements.v_eq_creche_coll_dept', kind: 'polygon', color: '#be185d', label_field: 'nom_equipement', info: ['effectif', 'adresse_equipement'], slug: 'equipements-publics-creches-departementales-val-de-marne', stats: [{ id: 'places', label: 'Effectif accueilli', field: 'effectif', agg: 'sum' }] }),
  C({ id: 'cd94_centres_sante', theme: 'Équipements', label: 'Centres de santé', layer: 'equipements.v_eq_centre_sante', kind: 'point', color: '#dc2626', label_field: 'nom_equipement', info: ['lib_nature_centre_sante', 'gestionnaire', 'adresse_equipement'], slug: 'equipements-publics-centres-sante-val-de-marne' }),
  C({ id: 'cd94_personnes_agees', theme: 'Équipements', label: 'Établissements pour personnes âgées', layer: 'equipements.v_eq_etab_pa', kind: 'point', color: '#9333ea', label_field: 'nom_etab', info: ['lib_type_pa', 'lib_statut_pa', 'nb_calc_reel_total', 'adresse_etab'], slug: 'equipements-publics---etablissements-pour-personnes-agees---val-de-marne', stats: [{ id: 'places', label: 'Places installées', field: 'nb_calc_reel_total', agg: 'sum' }] }),
  C({ id: 'cd94_sport', theme: 'Équipements', label: 'Équipements sportifs', layer: 'equipements.v_eq_sport', kind: 'point', color: '#16a34a', label_field: 'nom_equipement', info: ['lib_type', 'gestionnaire'], slug: 'equipements-publics---equipements-sportifs---val-de-marne' }),
  C({ id: 'cd94_bibliotheques', theme: 'Équipements', label: 'Bibliothèques et médiathèques', layer: 'equipements.v_eq_biblio_media', kind: 'point', color: '#0891b2', label_field: 'nom_equipement', info: ['gestionnaire', 'adresse_equipement'], slug: 'equipements-publics---bibliotheques---val-de-marne' }),
  C({ id: 'cd94_centres_sociaux', theme: 'Équipements', label: 'Centres sociaux', layer: 'equipements.v_eq_centre_social', kind: 'point', color: '#ea580c', label_field: 'nom_equipement', info: ['adresse_equipement'], slug: 'equipements-publics-centres-sociaux-val-de-marne' }),
  C({ id: 'cd94_emploi_solidarite', theme: 'Équipements', label: 'Emploi et solidarité (CAF, CPAM, CCAS, missions locales…)', layer: 'equipements.v_eqc_emploi_solidarite', kind: 'point', color: '#a16207', label_field: 'nom_equipement', info: ['lib_type', 'adresse_equipement'], slug: 'equipements-publics-par-categorie-emploi-et-solidarite-val-de-marne' }),
  // Environnement
  C({ id: 'cd94_arbres', theme: 'Environnement', label: 'Arbres d’alignement', layer: 'trame_verte.v_arbo_arbre', kind: 'point', color: '#15803d', label_field: 'nom_commun_essence', info: ['annee_plantation', 'conduite_arbre'], slug: 'arbo-arbres-d-alignement-val-de-marne', stats: [{ id: 'plantes_10ans', label: 'Plantés depuis 10 ans', field: 'annee_plantation', agg: 'count_if', test: (v) => v >= new Date().getFullYear() - 10 }, { id: 'plantes_annee', label: 'Plantés l’an dernier', field: 'annee_plantation', agg: 'count_if', test: (v) => v === new Date().getFullYear() - 1 }] }),
  C({ id: 'cd94_espaces_verts', theme: 'Environnement', label: 'Espaces verts communaux', layer: 'trame_verte.v_espace_vert_communal', kind: 'polygon', color: '#4ade80', label_field: 'nom_evc', info: ['lib_type_evc', 'surface_ha_evc', 'lib_gestionnaire_tv'], slug: 'espaces-verts-communaux-val-de-marne', stats: [{ id: 'surface', label: 'Surface (ha)', field: 'surface_ha_evc', agg: 'sum', unit: 'ha' }] }),
  C({ id: 'cd94_espaces_verts_tous', theme: 'Environnement', label: 'Espaces verts (tous gestionnaires, ENS)', layer: 'espaces-verts-globaux', kind: 'polygon', color: '#86efac', label_field: 'nom_espace_vert', info: ['type_espace_vert', 'surface_m2'], slug: 'espaces-verts---val-de-marne', stats: [{ id: 'surface', label: 'Surface (ha)', field: 'surface_m2', agg: 'sum', factor: 1e-4, unit: 'ha' }] }),
  C({ id: 'cd94_icu', theme: 'Environnement', label: 'Îlots de chaleur urbains (îlots morphologiques)', layer: 'v_ilot_chaleur', kind: 'polygon', color: '#f97316', label_field: 'lib_lcz_1', info: ['permeable', 'bati', 'hauteur_mo'], slug: 'ilots-chaleur-urbains-icu-val-de-marne', choropleth: 'bati', choroLabel: 'Part bâtie (%)', stats: [{ id: 'permeable', label: 'Part perméable moyenne (%)', field: 'permeable', agg: 'mean' }] }),
  C({ id: 'cd94_reseau_chaleur', theme: 'Environnement', label: 'Réseaux de chaleur', layer: 'environnement.v_reseau_de_chaleur', kind: 'line', color: '#b91c1c', label_field: 'nom_reseau', info: ['maitre_ouvrage', 'pourcent_enr', 'co2'], slug: 'reseau-de-chaleur---val-de-marne--copie', stats: [{ id: 'enr', label: 'Taux d’EnR&R moyen (%)', field: 'pourcent_enr', agg: 'mean' }] }),
  C({ id: 'cd94_icpe', theme: 'Environnement', label: 'Installations classées (ICPE)', layer: 'environnement.v_icpe', kind: 'point', color: '#7c2d12', label_field: 'nom_icpe', info: ['procedure_icpe', 'lib_type_icpe', 'adresse_icpe'], slug: 'installations-classees-pour-environnement-icpe-val-de-marne' }),
  C({ id: 'cd94_basias', theme: 'Environnement', label: 'Anciens sites industriels (BASIAS)', layer: 'environnement.v_basias', kind: 'point', color: '#78716c', label_field: 'raison_sociale', info: ['nom_usuel', 'lib_etat_occupation', 'adresse'], slug: 'ancien-sites-pollues-basias-val-de-marne' }),
  C({ id: 'cd94_basol', theme: 'Environnement', label: 'Sites et sols pollués (BASOL)', layer: 'environnement.v_basol', kind: 'point', color: '#57534e', label_field: 'nom_usuel', info: ['lib_situation_technique', 'adresse'], slug: 'sites-et-sols-pollues-basol-val-de-marne' }),
  C({ id: 'cd94_ppri', theme: 'Environnement', label: 'PPRI : zonage réglementaire', layer: 'environnement.v_ppri_zonage', kind: 'polygon', color: '#0284c7', label_field: 'lib_type_zone_ppri', info: ['definition_type_zone_ppri'], slug: 'ppri-zonages-reglementaires-val-de-marne' }),
  // Urbanisme et logement
  C({ id: 'cd94_projets_immo', theme: 'Urbanisme et logement', label: 'Projets immobiliers', layer: 'projet-immobilier', kind: 'polygon', color: '#c026d3', label_field: 'pro_nom_projet', info: ['pro_lib_type_projet', 'pro_lib_etat_projet', 'pro_lib_trimestre_debut', 'pro_lib_echeance_projet'], slug: 'projets-immobiliers---val-de-marne', stats: [{ id: 'en_cours', label: 'Projets en cours', field: 'pro_lib_etat_projet', agg: 'count_if', test: (v) => /cours/i.test(v || '') }, { id: 'habitat', label: 'Projets d’habitat', field: 'pro_lib_type_projet', agg: 'count_if', test: (v) => /habitat/i.test(v || '') }] }),
  C({ id: 'cd94_zac', theme: 'Urbanisme et logement', label: 'Zones d’aménagement concerté (ZAC)', layer: 'foncier_amenagement.v_zac', kind: 'polygon', color: '#a855f7', label_field: 'nom_zac', info: ['lib_type_zac', 'amenageur', 'nb_logement', 'shon_globale'], slug: 'zones-d-amenagement-concerte-val-de-marne', stats: [{ id: 'logements', label: 'Logements programmés', field: 'nb_logement', agg: 'sum' }] }),
  C({ id: 'cd94_rpls', theme: 'Urbanisme et logement', label: 'Bâtiments du parc locatif social (RPLS)', layer: 'batiments-du-rpls', kind: 'polygon', color: '#e11d48', label_field: 'adresse', info: ['nb_logts', 'annee_moyenne_construction', 'lib_qpv_red'], slug: 'rpls---repertoire-du-parc-locatif-social---batiments---val-de-marne', stats: [{ id: 'logements', label: 'Logements sociaux', field: 'nb_logts', agg: 'sum' }] }),
  C({ id: 'cd94_qpv', theme: 'Urbanisme et logement', label: 'Quartiers prioritaires (QPV 2024)', layer: 'politique_ville.v_qpv_2024', kind: 'polygon', color: '#f59e0b', label_field: 'lib_qpv', info: ['code_qpv'], slug: 'quartiers-politique-de-la-ville--2024----val-de-marne' }),
  C({ id: 'cd94_npnru', theme: 'Urbanisme et logement', label: 'Sites de renouvellement urbain (NPNRU)', layer: 'politique_ville.v_npnru', kind: 'polygon', color: '#d97706', label_field: 'nom_npnru', info: ['lib_site_interet', 'nom_qp'], slug: 'sites-npnru-val-de-marne' }),
  // Mobilité
  C({ id: 'cd94_cyclable', theme: 'Mobilité', label: 'Aménagements cyclables', layer: 'amenagements-cyclables', kind: 'line', color: '#059669', label_field: 'lib_osm_type_amenagement', info: ['lib_avancee_travaux', 'lib_domanialite', 'longueur'], slug: 'amenagements-cyclables---val-de-marne', stats: [{ id: 'km', label: 'Linéaire (km)', field: 'longueur', agg: 'sum', factor: 1e-3, unit: 'km' }] }),
  C({ id: 'cd94_stationnement_velo', theme: 'Mobilité', label: 'Stationnements vélo (IDFM)', layer: 'espace_pub_mobilite.v_idfm_stationnement_velo', kind: 'point', color: '#10b981', label_field: 'nom_stationnement', info: ['lib_type_stationnement', 'capacite', 'couvert'], slug: 'idfm-stationnement-velo-val-de-marne', stats: [{ id: 'places', label: 'Places', field: 'capacite', agg: 'sum' }] }),
  C({ id: 'cd94_gares', theme: 'Mobilité', label: 'Gares et stations ferrées', layer: 'espace_pub_mobilite.v_stif_gare_ligne', kind: 'point', color: '#1e3a8a', label_field: 'nomlong', info: ['mode'], slug: 'idfm-gares-et-stations-detaillees-reseau-ferre-ile-de-france' }),
  // Indicateurs par IRIS (Babord, INSEE RP 2018)
  ...[
    ['12', 'Taux de chômage par IRIS', 'indicateurs-babord-taux-chomage-par-iris-val-de-marne'],
    ['14', 'Part des salariés en emploi précaire par IRIS', 'indicateurs-babord-part-des-salaries-emploi-precaire-par-iris-val-de-marne'],
    ['24', 'Part des locataires du parc social par IRIS', 'indicateurs-babord-part-des-locataires-parc-social-par-iris-val-de-marne'],
    ['09', 'Part des familles monoparentales par IRIS', 'indicateurs-babord-part-des-familles-monoparentales-par-iris-val-de-marne'],
    ['20', 'Part des 15-24 ans sans emploi, formation ni diplôme par IRIS', 'indicateurs-babord-part-des-jeunes-15-24-ans-ni-emploi-ni-formation-et-sans-diplome-par-iris-val-d'],
    ['07', 'Part des plus de 60 ans par IRIS', 'indicateurs-babord-part-des-plus-60-ans-par-iris-val-de-marne'],
  ].map(([n, label, slug]) => C({ id: `cd94_iris_${n}`, theme: 'Indicateurs par IRIS (Babord)', label, layer: `socio_demo.vd_babord_iris94_${n}`, kind: 'polygon', color: '#6366f1', label_field: 'lib_iris', info: ['valeur_pourcent', 'valeur_dept_pourcent', 'source'], slug, choropleth: 'valeur_pourcent', choroLabel: '%', unit: '%', stats: [{ id: 'min', label: 'IRIS le plus bas (%)', field: 'valeur_pourcent', agg: 'min' }, { id: 'max', label: 'IRIS le plus haut (%)', field: 'valeur_pourcent', agg: 'max' }], noCount: true })),
];

// ---------------- accès WFS ----------------
const cache = new Map();
async function cached(key, ttl, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ttl) return c.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const wfsUrl = (params) => `${WFS}?${new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', ...params })}`;
async function wfs(params) {
  const r = await fetch(wfsUrl({ outputFormat: 'application/json', srsName: 'EPSG:4326', count: String(MAX), ...params }), { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`géoportail du Val-de-Marne : HTTP ${r.status}`);
  const text = await r.text();
  if (!text.startsWith('{')) throw new Error('géoportail du Val-de-Marne : réponse inattendue (' + text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) + ')');
  return JSON.parse(text);
}
async function hits(typeName) {
  const r = await fetch(wfsUrl({ resultType: 'hits', typeNames: typeName }), { signal: AbortSignal.timeout(60000) });
  const m = (await r.text()).match(/numberMatched="(\d+)"/);
  return m ? Number(m[1]) : null;
}

// ---------------- géométrie ----------------
const ringsOf = (g) => (g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []);
function inRing(ring, x, y) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inside = (rings, [x, y]) => rings.reduce((c, r) => (inRing(r, x, y) ? !c : c), false);
function vertices(g) {
  if (!g) return [];
  if (g.type === 'Point') return [g.coordinates];
  if (g.type === 'MultiPoint' || g.type === 'LineString') return g.coordinates;
  if (g.type === 'MultiLineString' || g.type === 'Polygon') return g.coordinates.flat();
  if (g.type === 'MultiPolygon') return g.coordinates.flat(2);
  return [];
}
function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
const round = (g) => JSON.parse(JSON.stringify(g, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)));
function lengthKm(g) {
  const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  let m = 0;
  for (const l of lines) for (let i = 1; i < l.length; i++) {
    const [x0, y0] = l[i - 1], [x1, y1] = l[i];
    const dx = (x1 - x0) * 111320 * Math.cos(((y0 + y1) / 2) * Math.PI / 180), dy = (y1 - y0) * 110540;
    m += Math.hypot(dx, dy);
  }
  return m / 1000;
}

// ---------------- communes du Val-de-Marne ----------------
function communes() {
  return cached('communes', 24 * 3600 * 1000, async () => {
    const j = await wfs({ typeNames: `${NS}geo_admin.v_commune_94` });
    return j.features.map((f) => {
      const rings = ringsOf(f.geometry);
      return { code: f.properties.code_insee_commune_att, nom: f.properties.lib_commune, population: f.properties.nb_habitants_insee, superficie: f.properties.superficie_insee_commune, rings, bbox: bboxOf(rings.flat()) };
    }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  });
}

function stat(s, feats) {
  const vals = feats.map((f) => f.properties?.[s.field]).filter((v) => v != null && v !== '');
  if (s.agg === 'count_if') return feats.filter((f) => s.test(f.properties?.[s.field])).length;
  if (s.agg === 'length_km') return feats.reduce((t, f) => t + lengthKm(f.geometry), 0);
  const nums = vals.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  if (s.agg === 'sum') return nums.reduce((t, v) => t + v, 0) * (s.factor ?? 1);
  if (s.agg === 'mean') return nums.reduce((t, v) => t + v, 0) / nums.length;
  if (s.agg === 'min') return Math.min(...nums);
  if (s.agg === 'max') return Math.max(...nums);
  return null;
}

/** Objets d'une couche situés dans une commune du Val-de-Marne. */
async function featuresIn(c, code) {
  const all = await communes();
  const com = all.find((x) => x.code === code);
  if (!com) throw new Error(`commune ${code} absente du Val-de-Marne`);
  return cached(`${c.id}|${code}`, TTL, async () => {
    const [x0, y0, x1, y1] = com.bbox;
    const j = await wfs({ typeNames: NS + c.layer, bbox: `${y0},${x0},${y1},${x1},urn:ogc:def:crs:EPSG::4326` });
    const centre = [(x0 + x1) / 2, (y0 + y1) / 2];
    const feats = (j.features || []).filter((f) => {
      const v = vertices(f.geometry);
      if (v.some((p) => inside(com.rings, p))) return true;
      return c.kind === 'polygon' && inside(ringsOf(f.geometry), centre); // grande emprise qui englobe la commune
    });
    return { feats, fetched_at: new Date().toISOString(), truncated: (j.features || []).length >= MAX };
  });
}

const publicCouche = (c) => ({
  id: c.id, label: c.label, theme: c.theme, kind: c.kind, color: c.color, choropleth: c.choropleth || null, choroLabel: c.choroLabel || null, unit: c.unit || null,
  source: 'Géoportail du Val-de-Marne (WFS)', layer: NS + c.layer, doc_url: c.slug ? PORTAIL + c.slug + '/donnees' : null, live: true,
  stats: [
    ...(c.noCount ? [] : [
      { id: 'count', label: 'Nombre d’objets', unit: null, formule: `Nombre d’objets de la couche « ${c.label} » situés dans la commune (intersection avec le contour communal), lu en direct par WFS.` },
      { id: 'perK', label: 'Pour 1 000 habitants', unit: 'pour 1 000 hab.', formule: `Nombre d’objets de la couche « ${c.label} » dans la commune × 1 000 / population municipale (INSEE, couche communale du géoportail).` },
    ]),
    ...c.stats.map((s) => ({ id: s.id, label: s.label, unit: s.unit || null, formule: formuleOf(c, s) })),
  ],
});

function formuleOf(c, s) {
  const of = `des objets de la couche « ${c.label} » situés dans la commune`;
  if (s.agg === 'sum') return `Somme du champ ${s.field}${s.factor && s.factor !== 1 ? ` × ${s.factor}` : ''} ${of}.`;
  if (s.agg === 'mean') return `Moyenne du champ ${s.field} ${of}.`;
  if (s.agg === 'min') return `Valeur minimale du champ ${s.field} ${of}.`;
  if (s.agg === 'max') return `Valeur maximale du champ ${s.field} ${of}.`;
  if (s.agg === 'count_if') return `Nombre ${of} vérifiant : ${s.label.toLowerCase()} (champ ${s.field}).`;
  return s.label;
}

const list = () => ({ source: 'https://geo.valdemarne.fr', mode: 'live', couches: COUCHES.map(publicCouche) });

/** Indicateurs d'une couche pour une commune et pour le Val-de-Marne (nombre via resultType=hits, sommes si la couche est petite). */
async function indicators(c, code) {
  const all = await communes();
  const com = all.find((x) => x.code === code);
  const { feats, fetched_at, truncated } = await featuresIn(c, code);
  const pop94 = all.reduce((t, x) => t + (x.population || 0), 0);
  const commune = { count: feats.length, perK: com.population ? (feats.length / com.population) * 1000 : null };
  for (const s of c.stats) commune[s.id] = stat(s, feats);
  const dept = await cached(`${c.id}|94`, TTL, async () => {
    const n = await hits(NS + c.layer);
    const out = { count: n, perK: n != null && pop94 ? (n / pop94) * 1000 : null };
    if (c.stats.length && n != null && n <= 5000) {
      const j = await wfs({ typeNames: NS + c.layer });
      for (const s of c.stats) out[s.id] = stat(s, j.features || []);
    }
    return out;
  });
  return { commune, dept, fetched_at, truncated, population: com.population, population94: pop94 };
}

async function layer(id, code) {
  const c = COUCHES.find((x) => x.id === id);
  if (!c) throw Object.assign(new Error('couche inconnue'), { status: 404 });
  const all = await communes();
  const com = all.find((x) => x.code === code);
  if (!com) throw Object.assign(new Error('commune inconnue'), { status: 404 });
  const [{ feats }, ind] = await Promise.all([featuresIn(c, code), indicators(c, code)]);
  const keep = [c.label_field, ...c.info, c.choropleth].filter(Boolean);
  return {
    couche: publicCouche(c), commune: { code: com.code, nom: com.nom, population: com.population }, indicators: ind,
    features: feats.map((f) => ({ g: round(f.geometry), p: Object.fromEntries(keep.map((k) => [k, f.properties?.[k] ?? null])) })),
    label_field: c.label_field, info: c.info,
  };
}

async function outline(code) {
  const com = (await communes()).find((x) => x.code === code);
  if (!com) throw Object.assign(new Error('commune inconnue'), { status: 404 });
  return { code: com.code, nom: com.nom, population: com.population, rings: round(com.rings), bbox: com.bbox };
}

async function communeList() {
  return (await communes()).map(({ code, nom, population, superficie }) => ({ code, nom, population, superficie }));
}

module.exports = { list, layer, outline, communeList, indicators, COUCHES };
